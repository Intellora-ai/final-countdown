/* Learning OS — data layer
 * ---------------------------------------------------------------------------
 * The UI never holds learner data. It reads from LEARNING_STORE and writes
 * through it. The store talks to ONE adapter. Swap the adapter, keep the UI.
 *
 * SCHEMA (written in Firebase RTDB tree shape; see REQUIREMENTS.md for the
 * relational and Sheets equivalents)
 *
 *   students/{studentId}
 *     id, name, avatarHue
 *     cls            "Class 10"
 *     stream         "Science" | null
 *     subjects       [subjectId]
 *     minutes        90 | 120 | 150 | 180      total daily capacity
 *     deadlines      { [subjectId]: "YYYY-MM-DD" }
 *     createdAt, lastActiveAt
 *
 *   progress/{studentId}/{chapterId}/{conceptId}
 *     state          "notStarted" | "inProgress" | "completed" | "mastered"
 *     source         "system" | "declared"     evidence provenance, never merged
 *     attempts       int    observed
 *     hints          int    observed
 *     revisits       int    observed  (reopened after completed)
 *     secondsSpent   int    observed
 *     firstSeenAt, lastTouchedAt, completedAt, declaredAt
 *     prevState      restore target for Undo mastery
 *
 *   activity/{studentId}/{eventId}
 *     at, type, chapterId, conceptId, from, to
 *
 * WEAKNESS IS NOT STORED. The raw signals above are stored; whether they add
 * up to "weak" is a policy decision, so it lives in one replaceable hook
 * (store.weaknessHook) and returns null until someone defines it. Nothing in
 * the UI may display a number this file did not observe.
 * ------------------------------------------------------------------------- */
(function () {
  if (window.LEARNING_STORE) return;
  var KEY = "learning-os/v2";
  var CHAN = "learning-os-sync";
  var now = function () { return Date.now(); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* =========================================================================
   * ADAPTER CONTRACT — implement these five methods against any backend.
   *   load()            -> Promise<db>        full tree, once
   *   subscribe(cb)      -> unsubscribe        cb(db) on EVERY remote change
   *   commit(db)         -> Promise            persist the whole tree
   *   close()            -> void
   * A real adapter should replace commit(db) with path writes; the store also
   * calls commitPath(path, value) when the adapter provides it.
   * ======================================================================= */

  function LocalAdapter() {
    this.chan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHAN) : null;
    this.subs = [];
    var self = this;
    if (this.chan) {
      this.chan.onmessage = function (e) {
        if (!e.data || e.data.k !== KEY) return;
        self.subs.forEach(function (cb) { cb(e.data.db); });
      };
    }
    window.addEventListener("storage", function (e) {
      if (e.key !== KEY || !e.newValue) return;
      try { var db = JSON.parse(e.newValue); self.subs.forEach(function (cb) { cb(db); }); } catch (err) {}
    });
  }
  LocalAdapter.prototype.load = function () {
    try {
      var raw = localStorage.getItem(KEY);
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) { return Promise.resolve(null); }
  };
  LocalAdapter.prototype.subscribe = function (cb) {
    this.subs.push(cb);
    var self = this;
    return function () { self.subs = self.subs.filter(function (f) { return f !== cb; }); };
  };
  LocalAdapter.prototype.commit = function (db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
    if (this.chan) { try { this.chan.postMessage({ k: KEY, db: db }); } catch (e) {} }
    return Promise.resolve();
  };
  LocalAdapter.prototype.close = function () { if (this.chan) this.chan.close(); };

  /* Firebase Realtime Database — drop-in. Uncomment, supply config, and pass
   * new FirebaseAdapter(cfg) to LEARNING_STORE.init(). No UI change required.
   *
   * function FirebaseAdapter(app) {
   *   this.db = firebase.database(app);
   * }
   * FirebaseAdapter.prototype.load = function () {
   *   return this.db.ref("/").once("value").then(function (s) { return s.val(); });
   * };
   * FirebaseAdapter.prototype.subscribe = function (cb) {
   *   var ref = this.db.ref("/");
   *   var h = ref.on("value", function (s) { cb(s.val()); });
   *   return function () { ref.off("value", h); };
   * };
   * FirebaseAdapter.prototype.commitPath = function (path, value) {
   *   return this.db.ref(path).set(value);          // granular write
   * };
   * FirebaseAdapter.prototype.commit = function (db) {
   *   return this.db.ref("/").update(db);
   * };
   * FirebaseAdapter.prototype.close = function () {};
   *
   * Supabase equivalent: load() -> select(), subscribe() -> channel()
   * .on('postgres_changes', …), commitPath() -> upsert on the row the path
   * addresses. See REQUIREMENTS.md for the table definitions.
   */

  /* ===================== derivation: today's plan ========================= */

  function planFor(store, student) {
    var C = window.CURRICULUM;
    if (!C || !student) return { items: [], allocated: 0, capacity: 0 };
    var subs = C.subjectsFor(student.cls, student.stream).filter(function (s) {
      return student.subjects.indexOf(s.id) >= 0;
    });
    if (!subs.length) return { items: [], allocated: 0, capacity: student.minutes || 0 };

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var daysLeft = function (sid) {
      var d = student.deadlines && student.deadlines[sid];
      if (!d) return 999;
      return Math.max(0, Math.round((new Date(d) - today) / 86400000));
    };

    // HARD RULE: every selected subject gets at least one concept.
    var picks = [];
    subs.forEach(function (sb) {
      var found = null;
      for (var ci = 0; ci < sb.chapters.length && !found; ci++) {
        var ch = sb.chapters[ci];
        for (var i = 0; i < ch.concepts.length && !found; i++) {
          var c = ch.concepts[i];
          var st = store.stateOf(ch.id, c.id);
          if (st === "completed" || st === "mastered") continue;
          if (!store.prereqsMet(ch, c)) continue;               // adaptive: respect the graph
          found = { subject: sb, chapter: ch, concept: c };
        }
      }
      if (!found) {                                             // subject finished — offer review
        var last = sb.chapters[sb.chapters.length - 1];
        found = { subject: sb, chapter: last, concept: last.concepts[last.concepts.length - 1], review: true };
      }
      found.daysLeft = daysLeft(sb.id);
      found.resume = store.stateOf(found.chapter.id, found.concept.id) === "inProgress";
      picks.push(found);
    });

    // adaptive ordering: in-progress first, then nearest deadline
    picks.sort(function (a, b) {
      if (a.resume !== b.resume) return a.resume ? -1 : 1;
      return a.daysLeft - b.daysLeft;
    });

    /* Allocate within the student's TOTAL daily capacity, never over. The
     * reserve for misconception practice is held here so capacity arithmetic
     * lives in exactly one place. */
    var cap = student.minutes || 120;
    var reserve = 10;
    var usable = Math.max(10, cap - reserve);
    var base = Math.floor(usable / picks.length);
    var alloc = 0;
    picks.forEach(function (p, i) {
      var want = Math.min(p.concept.minutes, base);
      if (i === picks.length - 1) want = Math.min(p.concept.minutes, usable - alloc);
      p.minutes = Math.max(10, want);
      alloc += p.minutes;
    });
    if (alloc > usable) { picks[picks.length - 1].minutes -= (alloc - usable); alloc = usable; }

    /* Then fill the remaining capacity with the next eligible concepts, round
     * robin so no subject monopolises the spare time. Concept durations are
     * intrinsic — spare capacity buys MORE concepts, never longer ones. */
    var taken = {};
    picks.forEach(function (p) { taken[p.chapter.id + "/" + p.concept.id] = true; });
    var nextFor = function (sb) {
      for (var ci = 0; ci < sb.chapters.length; ci++) {
        var ch = sb.chapters[ci];
        for (var i = 0; i < ch.concepts.length; i++) {
          var c = ch.concepts[i], k = ch.id + "/" + c.id;
          if (taken[k]) continue;
          var s2 = store.stateOf(ch.id, c.id);
          if (s2 === "completed" || s2 === "mastered") continue;
          if (!store.prereqsMet(ch, c)) continue;
          return { subject: sb, chapter: ch, concept: c };
        }
      }
      return null;
    };
    var order = picks.map(function (p) { return p.subject; });
    var added = true, guard = 0;
    while (added && alloc < usable && guard++ < 200) {
      added = false;
      for (var oi = 0; oi < order.length; oi++) {
        if (alloc >= usable) break;
        var cand = nextFor(order[oi]);
        if (!cand) continue;
        var mins = Math.min(cand.concept.minutes, usable - alloc);
        if (mins < 10) continue;                        // too small a slice to be useful
        cand.minutes = mins;
        cand.daysLeft = daysLeft(cand.subject.id);
        cand.resume = store.stateOf(cand.chapter.id, cand.concept.id) === "inProgress";
        cand.fill = true;                               // scheduled from spare capacity
        taken[cand.chapter.id + "/" + cand.concept.id] = true;
        picks.push(cand);
        alloc += mins;
        added = true;
      }
    }

    return { items: picks, allocated: alloc, capacity: cap, reserve: reserve, usable: usable };
  }

  /* ============================== the store =============================== */

  function Store() {
    this.db = null;
    this.adapter = null;
    this.subs = [];
    this.currentId = null;
    /* Monotonic write counter. Every memo below keys off it, so it must be a
     * real number from the start — undefined++ is NaN, and NaN||0 reads as 0,
     * which silently freezes every cache. */
    this.rev = 0;
    /* Replace to define "weak". Receives the observed record; must return
     * null or { reason, since }. Returning a number here would put an
     * unverifiable metric on screen — don't. */
    this.weaknessHook = function (/* rec, concept */) { return null; };
  }

  Store.prototype.init = function (adapter) {
    var self = this;
    this.adapter = adapter || new LocalAdapter();
    return this.adapter.load().then(function (db) {
      self.db = db && db.students ? db : self.seed();
      self.currentId = self.db.currentId || Object.keys(self.db.students)[0];
      self.unsub = self.adapter.subscribe(function (remote) {
        if (!remote || !remote.students) return;
        self.db = remote;                          // remote wins; UI re-renders
        self.bump();
        if (!self.db.students[self.currentId]) self.currentId = Object.keys(self.db.students)[0];
        self.emit("remote");
      });
      self.emit("ready");
      return self;
    });
  };

  Store.prototype.emit = function (reason) {
    /* A throwing subscriber must not take the store down, but it must also not
     * vanish: logging the bare object printed "{}" and would have masked the
     * next real failure. */
    this.subs.forEach(function (cb) {
      try { cb(reason); }
      catch (e) {
        console.error("[store] subscriber threw on emit(" + reason + "): " +
          ((e && (e.message || e.toString())) || "unknown"), e && e.stack ? e.stack.split("\n")[1] : "");
      }
    });
  };
  Store.prototype.subscribe = function (cb) {
    this.subs.push(cb);
    var self = this;
    return function () { self.subs = self.subs.filter(function (f) { return f !== cb; }); };
  };

  Store.prototype.save = function (path, value) {
    var self = this;
    this.bump();                             // invalidates every memo below
    this.db.currentId = this.currentId;
    if (this.adapter.commitPath && path) this.adapter.commitPath(path, value);
    else this.adapter.commit(this.db);
    if (this.adapter.commitPath && path) this.adapter.commit(this.db);
    this.emit("local");
    return self;
  };

  /* ------------------------------- students ------------------------------ */
  Store.prototype.students = function () {
    var db = this.db, ids = Object.keys(db.students);
    var self = this;
    return ids.map(function (id) {
      var s = db.students[id];
      return {
        id: id, name: s.name, hue: s.avatarHue, cls: s.cls,
        initials: s.name.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2),
        current: id === self.currentId,
        subjectCount: (s.subjects || []).length,
        done: self.countDone(id)
      };
    });
  };
  Store.prototype.student = function () { return this.db.students[this.currentId] || null; };
  Store.prototype.switchStudent = function (id) {
    if (!this.db.students[id]) return;
    this.currentId = id;
    this.bump();
    this.db.students[id].lastActiveAt = now();
    this.save("students/" + id + "/lastActiveAt", this.db.students[id].lastActiveAt);
  };
  Store.prototype.hasPlan = function () {
    var s = this.student();
    return !!(s && s.cls && s.subjects && s.subjects.length && s.minutes);
  };
  Store.prototype.savePlan = function (plan) {
    var id = this.currentId, s = this.db.students[id];
    s.cls = plan.cls; s.stream = plan.stream || null;
    s.subjects = plan.subjects.slice(); s.minutes = plan.minutes;
    s.deadlines = clone(plan.deadlines || {});
    s.lastActiveAt = now();
    this.save("students/" + id, s);
  };
  Store.prototype.newStudent = function (name) {
    var id = "stu_" + Math.random().toString(36).slice(2, 8);
    this.db.students[id] = {
      id: id, name: name || "New learner", avatarHue: Math.floor(Math.random() * 360),
      cls: null, stream: null, subjects: [], minutes: null, deadlines: {},
      createdAt: now(), lastActiveAt: now()
    };
    this.db.progress[id] = {};
    this.db.activity[id] = [];
    this.currentId = id;
    this.save(null);
    return id;
  };

  /* ------------------------------- progress ------------------------------ */
  Store.prototype.rec = function (chId, cId, sid) {
    var p = this.db.progress[sid || this.currentId];
    return (p && p[chId] && p[chId][cId]) || null;
  };
  Store.prototype.stateOf = function (chId, cId) {
    var r = this.rec(chId, cId);
    return r ? r.state : "notStarted";
  };
  Store.prototype.sourceOf = function (chId, cId) {
    var r = this.rec(chId, cId);
    return r ? r.source : null;
  };
  Store.prototype.observed = function (chId, cId) {
    var r = this.rec(chId, cId);
    return {
      attempts: r ? r.attempts || 0 : 0,
      hints: r ? r.hints || 0 : 0,
      revisits: r ? r.revisits || 0 : 0,
      seconds: r ? r.secondsSpent || 0 : 0,
      firstSeenAt: r ? r.firstSeenAt : null,
      lastTouchedAt: r ? r.lastTouchedAt : null
    };
  };
  Store.prototype.weakness = function (chId, cId, concept) {
    return this.weaknessHook(this.observed(chId, cId), concept) || null;
  };

  Store.prototype.ensure = function (chId, cId) {
    var id = this.currentId;
    if (!this.db.progress[id]) this.db.progress[id] = {};
    if (!this.db.progress[id][chId]) this.db.progress[id][chId] = {};
    var m = this.db.progress[id][chId];
    if (!m[cId]) {
      m[cId] = {
        state: "notStarted", source: null, attempts: 0, hints: 0, revisits: 0,
        secondsSpent: 0, firstSeenAt: now(), lastTouchedAt: now(),
        completedAt: null, declaredAt: null, prevState: null
      };
    }
    return m[cId];
  };

  Store.prototype.setState = function (chId, cId, state, source) {
    var r = this.ensure(chId, cId), from = r.state;
    if (from === "completed" && state === "inProgress") r.revisits = (r.revisits || 0) + 1;
    r.prevState = from;
    r.state = state;
    r.source = source || "system";
    r.lastTouchedAt = now();
    if (state === "completed" || state === "mastered") r.completedAt = now();
    this.log({ type: "state", chapterId: chId, conceptId: cId, from: from, to: state });
    this.save("progress/" + this.currentId + "/" + chId + "/" + cId, r);
  };
  Store.prototype.touch = function (chId, cId, d) {
    var r = this.ensure(chId, cId);
    if (d.attempts) r.attempts += d.attempts;
    if (d.hints) r.hints += d.hints;
    if (d.seconds) r.secondsSpent += d.seconds;
    if (r.state === "notStarted") { r.prevState = "notStarted"; r.state = "inProgress"; r.source = "system"; }
    r.lastTouchedAt = now();
    this.save("progress/" + this.currentId + "/" + chId + "/" + cId, r);
  };
  Store.prototype.declare = function (chId, cId) {
    var r = this.ensure(chId, cId);
    r.prevState = r.state;
    r.state = "mastered";
    r.source = "declared";              // never conflated with observed evidence
    r.declaredAt = now();
    r.lastTouchedAt = now();
    this.log({ type: "declare", chapterId: chId, conceptId: cId, from: r.prevState, to: "mastered" });
    this.save("progress/" + this.currentId + "/" + chId + "/" + cId, r);
  };
  Store.prototype.undeclare = function (chId, cId) {
    var r = this.rec(chId, cId);
    if (!r) return;
    var back = r.prevState || "notStarted";
    r.state = back;
    r.source = back === "notStarted" ? null : "system";
    r.declaredAt = null;
    r.lastTouchedAt = now();
    this.log({ type: "undeclare", chapterId: chId, conceptId: cId, from: "mastered", to: back });
    this.save("progress/" + this.currentId + "/" + chId + "/" + cId, r);
  };

  Store.prototype.log = function (e) {
    var id = this.currentId;
    if (!this.db.activity[id]) this.db.activity[id] = [];
    e.at = now();
    this.db.activity[id].unshift(e);
    this.db.activity[id] = this.db.activity[id].slice(0, 60);
  };
  Store.prototype.activity = function (n) {
    return (this.db.activity[this.currentId] || []).slice(0, n || 8);
  };
  Store.prototype.lastTouched = function () {
    var id = this.currentId, p = this.db.progress[id] || {}, best = null;
    Object.keys(p).forEach(function (chId) {
      Object.keys(p[chId]).forEach(function (cId) {
        var r = p[chId][cId];
        if (!r.lastTouchedAt) return;
        if (!best || r.lastTouchedAt > best.at) best = { at: r.lastTouchedAt, chapterId: chId, conceptId: cId, state: r.state };
      });
    });
    return best;
  };

  /* ------------------------------ derivations ---------------------------- */
  Store.prototype.prereqsMet = function (chapter, concept) {
    var self = this, deps = concept.deps || [];
    return deps.every(function (d) {
      var st = self.stateOf(chapter.id, d);
      return st === "completed" || st === "mastered";
    });
  };
  Store.prototype.blockingDeps = function (chapter, concept) {
    var self = this;
    return (concept.deps || []).filter(function (d) {
      var st = self.stateOf(chapter.id, d);
      return st !== "completed" && st !== "mastered";
    });
  };
  Store.prototype.countDone = function (sid) {
    var p = this.db.progress[sid || this.currentId] || {}, n = 0;
    Object.keys(p).forEach(function (ch) {
      Object.keys(p[ch]).forEach(function (c) {
        var st = p[ch][c].state;
        if (st === "completed" || st === "mastered") n++;
      });
    });
    return n;
  };
  Store.prototype.chapterProgress = function (chapter) {
    var self = this, done = 0, inProg = 0;
    chapter.concepts.forEach(function (c) {
      var st = self.stateOf(chapter.id, c.id);
      if (st === "completed" || st === "mastered") done++;
      else if (st === "inProgress") inProg++;
    });
    return { done: done, total: chapter.concepts.length, inProgress: inProg, complete: done === chapter.concepts.length };
  };
  Store.prototype.bump = function () {
    this.rev = (typeof this.rev === "number" && isFinite(this.rev) ? this.rev : 0) + 1;
    return this.rev;
  };

  Store.prototype.plan = function () {
    var key = this.currentId + "@" + this.rev;
    if (this.__planKey !== key) { this.__planKey = key; this.__plan = planFor(this, this.student()); }
    return this.__plan;
  };

  /* One pass over the whole curriculum produces every chapter and subject
   * count the sidebar needs. Previously each chapter recomputed its own
   * counts on every render (measured ~190 stateOf calls per interaction);
   * this is one walk, cached until the next write. */
  Store.prototype.rollups = function () {
    var key = this.currentId + "@" + this.rev;
    if (this.__rollKey === key) return this.__roll;
    var C = window.CURRICULUM, s = this.student(), out = { chapters: {}, subjects: {} };
    if (C && s && s.cls) {
      var prog = this.db.progress[this.currentId] || {};
      C.subjectsFor(s.cls, s.stream).forEach(function (sb) {
        var sDone = 0, sTot = 0;
        sb.chapters.forEach(function (ch) {
          var m = prog[ch.id] || {}, done = 0, inProg = 0;
          ch.concepts.forEach(function (c) {
            var r = m[c.id], st = r ? r.state : "notStarted";
            if (st === "completed" || st === "mastered") done++;
            else if (st === "inProgress") inProg++;
          });
          out.chapters[ch.id] = { done: done, total: ch.concepts.length, inProgress: inProg, complete: done === ch.concepts.length };
          sDone += done; sTot += ch.concepts.length;
        });
        out.subjects[sb.id] = { done: sDone, total: sTot };
      });
    }
    this.__rollKey = key; this.__roll = out;
    return out;
  };

  /* Headline the dashboard is allowed to say — built only from stored state. */
  Store.prototype.headline = function () {
    var C = window.CURRICULUM, s = this.student();
    if (!C || !s) return null;
    var self = this, mastered = [], working = [], next = null;
    C.subjectsFor(s.cls, s.stream).filter(function (x) { return s.subjects.indexOf(x.id) >= 0; })
      .forEach(function (sb) {
        sb.chapters.forEach(function (ch) {
          ch.concepts.forEach(function (c) {
            var st = self.stateOf(ch.id, c.id);
            var row = { subject: sb.name, chapter: ch.name, concept: c.name, chapterId: ch.id, conceptId: c.id, subjectId: sb.id };
            if (st === "mastered") mastered.push(row);
            else if (st === "inProgress") working.push(row);
            else if (!next && self.prereqsMet(ch, c)) next = row;
          });
        });
      });
    return { mastered: mastered, working: working, next: next };
  };

  /* --------------------------------- seed -------------------------------- */
  Store.prototype.seed = function () {
    var C = window.CURRICULUM;
    var db = { students: {}, progress: {}, activity: {}, currentId: null };
    var people = [
      { id: "stu_arya", name: "Arya Menon", hue: 168, cls: "Class 10", subjects: ["mathematics", "physics"], minutes: 120, depth: 0.55 },
      { id: "stu_ishan", name: "Ishan Rao", hue: 232, cls: "Class 10", subjects: ["mathematics", "physics", "chemistry"], minutes: 150, depth: 0.18 },
      { id: "stu_new", name: "New learner", hue: 40, cls: null, subjects: [], minutes: null, depth: 0 }
    ];
    var t = now();
    people.forEach(function (p, pi) {
      db.students[p.id] = {
        id: p.id, name: p.name, avatarHue: p.hue, cls: p.cls, stream: null,
        subjects: p.subjects.slice(), minutes: p.minutes,
        deadlines: p.cls ? { mathematics: "2027-02-20", physics: "2027-01-15", chemistry: "2027-03-05" } : {},
        createdAt: t - 86400000 * 40, lastActiveAt: t - pi * 3600000
      };
      db.progress[p.id] = {};
      db.activity[p.id] = [];
      if (!C || !p.depth) return;
      // fill forward through the graph so prerequisites always hold
      C.subjectsFor(p.cls, null).filter(function (s) { return p.subjects.indexOf(s.id) >= 0; })
        .forEach(function (sb) {
          var quota = Math.round(sb.chapters.reduce(function (n, c) { return n + c.concepts.length; }, 0) * p.depth);
          sb.chapters.forEach(function (ch) {
            db.progress[p.id][ch.id] = db.progress[p.id][ch.id] || {};
            ch.concepts.forEach(function (c) {
              if (quota <= 0) return;
              quota--;
              var mastered = quota % 3 === 0;
              db.progress[p.id][ch.id][c.id] = {
                state: quota === 0 ? "inProgress" : (mastered ? "mastered" : "completed"),
                source: "system",
                attempts: 1 + (c.name.length % 3), hints: c.name.length % 2, revisits: 0,
                secondsSpent: c.minutes * 60 - 240,
                firstSeenAt: t - 86400000 * 12, lastTouchedAt: t - 3600000 * (quota + 1),
                completedAt: quota === 0 ? null : t - 3600000 * (quota + 1),
                declaredAt: null, prevState: "inProgress"
              };
            });
          });
        });
    });
    db.currentId = people[0].id;
    return db;
  };

  /* Idempotent: a second evaluation of this file (helmet remount, hot reload)
   * must not replace a live store with an empty one. */
  if (!window.LEARNING_STORE) window.LEARNING_STORE = new Store();
  window.LEARNING_ADAPTERS = window.LEARNING_ADAPTERS || { LocalAdapter: LocalAdapter };
})();
