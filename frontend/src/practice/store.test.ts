import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRICULUM } from "./curriculum";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  TIMER_CHOICES,
  TIMER_MAX_MINUTES,
  chapterCoverageOf,
  chapterLastPracticed,
  isChapterOpen,
  recentTopicsOf,
  topicAccuracy,
  usePracticeStore,
} from "./store";

/**
 * The store's rules.
 *
 * The clamp tests matter most: the question cap is a product rule the learner
 * was promised ("maximum 15"), and the `<input max>` that enforces it visually
 * is only a courtesy to the pointer. These assert the rule at the layer no UI
 * can route around.
 */

/**
 * Fixtures, resolved loudly.
 *
 * `noUncheckedIndexedAccess` is on, so every index into the curriculum is
 * `T | undefined`. Asserting with `!` would silence that and then fail deep
 * inside an expectation with "cannot read property of undefined". This names
 * the missing fixture instead — which is what you want when someone reorders
 * a chapter and half the suite goes red.
 */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test fixture missing: ${what}`);
  return value;
}

const firstSubject = must(CURRICULUM[0], "the first subject");
const firstChapter = must(firstSubject.chapters[0], "the first subject's chapter 1");
const secondChapter = must(firstSubject.chapters[1], "the first subject's chapter 2");

/** The nth topic of `firstChapter`. */
const topic = (index: number) =>
  must(firstChapter.topics[index], `${firstChapter.id} topic ${index}`);

beforeEach(() => {
  usePracticeStore.setState({
    pinnedChapterIds: [],
    hoveredChapterId: null,
    selection: null,
    progress: {},
    settings: { timerEnabled: false, timerMinutes: 10, questionCount: 10 },
    launchedFrom: null,
  });
});

describe("question count", () => {
  it("caps at the promised maximum however it is set", () => {
    usePracticeStore.getState().setSettings({ questionCount: 200 });
    expect(usePracticeStore.getState().settings.questionCount).toBe(MAX_QUESTIONS);
  });

  it("floors at the minimum", () => {
    usePracticeStore.getState().setSettings({ questionCount: -5 });
    expect(usePracticeStore.getState().settings.questionCount).toBe(MIN_QUESTIONS);
  });

  it("rounds fractional values", () => {
    usePracticeStore.getState().setSettings({ questionCount: 7.6 });
    expect(usePracticeStore.getState().settings.questionCount).toBe(8);
  });

  it("falls back to the minimum rather than storing NaN", () => {
    usePracticeStore.getState().setSettings({ questionCount: Number.NaN });
    expect(usePracticeStore.getState().settings.questionCount).toBe(MIN_QUESTIONS);
  });
});

describe("timer", () => {
  it("toggles without disturbing the chosen duration", () => {
    usePracticeStore.getState().setSettings({ timerMinutes: 30 });
    usePracticeStore.getState().setSettings({ timerEnabled: true });

    const { settings } = usePracticeStore.getState();
    expect(settings.timerEnabled).toBe(true);
    expect(settings.timerMinutes).toBe(30);
  });

  /*
   * This asserted `180` until the block below was written, and it PASSED — it
   * was pinning the bug in place rather than catching it. A test can only
   * check that the code does what it does; whether that is what was promised
   * is a separate question, and this one never asked it. Corrected to the
   * promised bound, not relaxed to fit the code.
   */
  it("clamps absurd durations", () => {
    usePracticeStore.getState().setSettings({ timerMinutes: 9999 });
    expect(usePracticeStore.getState().settings.timerMinutes).toBe(TIMER_MAX_MINUTES);
  });
});

/**
 * The timer bound is a PRODUCT RULE, and the store is the only place it holds.
 *
 * THE HOLE THESE TESTS OPEN ON
 * ----------------------------
 * A practice session is specified to run for no less than 5 minutes and no more
 * than 30. `TIMER_CHOICES` is the list of buttons the panel draws, and it obeys
 * that range — which is exactly why nobody noticed the store does not. Both
 * clamps say `1, 180`, so every route that is not a button press could write a
 * three-hour "practice session": a hand-edited `localStorage`, a restored save
 * from an older build, any future caller passing a number.
 *
 * This is the SAME back door the block at the bottom of this file was written
 * to close for `questionCount`, and its own comment states the general lesson —
 * "a rule enforced only in a setter is a rule with a back door". The lesson was
 * applied to the count and not to the timer beside it.
 *
 * The bounds are written here as the literals the product promises rather than
 * imported from the store, deliberately. A test that imports the number it is
 * checking cannot fail when that number is wrong; it only fails when the store
 * disagrees with itself. These have to disagree with the STORE.
 */
const PROMISED_MIN_MINUTES = 5;
const PROMISED_MAX_MINUTES = 30;

describe("timer duration is bounded by the product rule, not by the UI", () => {
  it("floors at the promised minimum however it is set", () => {
    usePracticeStore.getState().setSettings({ timerMinutes: 1 });
    expect(usePracticeStore.getState().settings.timerMinutes).toBe(PROMISED_MIN_MINUTES);
  });

  it("caps at the promised maximum however it is set", () => {
    usePracticeStore.getState().setSettings({ timerMinutes: 9999 });
    expect(usePracticeStore.getState().settings.timerMinutes).toBe(PROMISED_MAX_MINUTES);
  });

  it("offers no choice the rule would refuse", () => {
    // If these two ever disagree, one of them is lying to the learner.
    for (const minutes of TIMER_CHOICES) {
      expect(minutes).toBeGreaterThanOrEqual(PROMISED_MIN_MINUTES);
      expect(minutes).toBeLessThanOrEqual(PROMISED_MAX_MINUTES);
    }
  });

  it("falls back to the minimum rather than storing NaN", () => {
    usePracticeStore.getState().setSettings({ timerMinutes: Number.NaN });
    expect(usePracticeStore.getState().settings.timerMinutes).toBe(PROMISED_MIN_MINUTES);
  });

  /*
   * THE PERSISTED ROUTE IS COVERED AT THE BOTTOM OF THIS FILE, NOT HERE.
   *
   * That route is the one that made this a real bug rather than a theoretical
   * one, so it is genuinely worth a test — but it already has one, and that
   * test now asserts the timer bound alongside the question cap it was written
   * for. A second copy here was measurably worse than no copy.
   *
   * Faking `localStorage` requires replacing the global `window` and calling
   * `vi.resetModules()`, because the storage decision is made once at module
   * import. Doing that TWICE in one file pushed a latent echarts/jsdom crash in
   * `src/canvas/render/FigureView.test.tsx` — `zrender` reading `matrix[0]` off
   * null — from never firing to firing about half the time. Measured, not
   * guessed: 0 failures in 5 baseline runs, 2 in 3 with the duplicate present.
   * The suite still reported "973 passed" on the failing runs; only the exit
   * code disagreed, which is the whole reason it is worth writing down.
   */
});

describe("chapter pinning", () => {
  it("toggles on and off", () => {
    const { toggleChapterPinned } = usePracticeStore.getState();

    toggleChapterPinned(firstChapter.id);
    expect(usePracticeStore.getState().pinnedChapterIds).toContain(firstChapter.id);

    toggleChapterPinned(firstChapter.id);
    expect(usePracticeStore.getState().pinnedChapterIds).not.toContain(firstChapter.id);
  });

  it("ignores an id no chapter has", () => {
    usePracticeStore.getState().toggleChapterPinned("not-a-chapter");
    expect(usePracticeStore.getState().pinnedChapterIds).toHaveLength(0);
  });

  it("keeps several chapters open at once", () => {
    const { toggleChapterPinned } = usePracticeStore.getState();
    toggleChapterPinned(firstChapter.id);
    toggleChapterPinned(secondChapter.id);
    expect(usePracticeStore.getState().pinnedChapterIds).toHaveLength(2);
  });
});

describe("activating a chapter", () => {
  /*
   * The map and the panel are two fields, and a click used to write them from
   * two places: `toggleChapterPinned` then `select`. On an already-open chapter
   * those say opposite things — the toggle collapses it, the select keeps a
   * panel describing it — and the learner got a panel titled after a chapter
   * the map had just shut. Both fields move here or neither does.
   */
  it("opens and selects on the way in", () => {
    usePracticeStore.getState().activateChapter(firstChapter.id);

    const state = usePracticeStore.getState();
    expect(state.pinnedChapterIds).toContain(firstChapter.id);
    expect(state.selection).toEqual({ kind: "chapter", id: firstChapter.id });
  });

  it("collapses and deselects on the way out", () => {
    usePracticeStore.getState().activateChapter(firstChapter.id);
    usePracticeStore.getState().activateChapter(firstChapter.id);

    const state = usePracticeStore.getState();
    expect(state.pinnedChapterIds).not.toContain(firstChapter.id);
    expect(state.selection).toBeNull();
  });

  it("re-selects rather than collapsing when the panel is showing something else", () => {
    usePracticeStore.getState().activateChapter(firstChapter.id);
    usePracticeStore.getState().select({ kind: "topic", id: topic(0).id });
    usePracticeStore.getState().activateChapter(firstChapter.id);

    const state = usePracticeStore.getState();
    expect(state.pinnedChapterIds).toContain(firstChapter.id);
    expect(state.selection).toEqual({ kind: "chapter", id: firstChapter.id });
  });

  it("ignores an id no chapter has", () => {
    usePracticeStore.getState().activateChapter("not-a-chapter");

    const state = usePracticeStore.getState();
    expect(state.pinnedChapterIds).toHaveLength(0);
    expect(state.selection).toBeNull();
  });
});

describe("pinChapter", () => {
  it("opens a chapter without closing one that is already open", () => {
    const { pinChapter } = usePracticeStore.getState();
    pinChapter(firstChapter.id);
    pinChapter(firstChapter.id);

    expect(usePracticeStore.getState().pinnedChapterIds).toEqual([firstChapter.id]);
  });

  it("does not write hover", () => {
    usePracticeStore.getState().pinChapter(firstChapter.id);
    expect(usePracticeStore.getState().hoveredChapterId).toBeNull();
  });
});

describe("isChapterOpen", () => {
  it("is true when pinned, when hovered, and false otherwise", () => {
    expect(isChapterOpen(usePracticeStore.getState(), firstChapter.id)).toBe(false);

    usePracticeStore.getState().hoverChapter(firstChapter.id);
    expect(isChapterOpen(usePracticeStore.getState(), firstChapter.id)).toBe(true);

    usePracticeStore.getState().hoverChapter(null);
    usePracticeStore.getState().toggleChapterPinned(firstChapter.id);
    expect(isChapterOpen(usePracticeStore.getState(), firstChapter.id)).toBe(true);
  });

  it("does not let a hover survive as a pin", () => {
    /*
     * Hover must never write to the persisted set, or merely dragging the
     * pointer across the map on the way somewhere else would rewrite what the
     * learner finds open tomorrow.
     */
    usePracticeStore.getState().hoverChapter(firstChapter.id);
    expect(usePracticeStore.getState().pinnedChapterIds).toHaveLength(0);
  });
});

describe("progress", () => {
  it("accumulates attempts and correct answers across sessions", () => {
    const topicId = topic(0).id;
    const { recordPractice } = usePracticeStore.getState();

    recordPractice(topicId, 10, 7);
    recordPractice(topicId, 5, 4);

    const entry = must(usePracticeStore.getState().progress[topicId], "recorded progress");
    expect(entry.attempts).toBe(15);
    expect(entry.correct).toBe(11);
    expect(entry.lastPracticedAt).toBeGreaterThan(0);
  });

  it("reports accuracy, and null before any attempt", () => {
    const topicId = topic(0).id;
    expect(topicAccuracy(usePracticeStore.getState().progress, topicId)).toBeNull();

    usePracticeStore.getState().recordPractice(topicId, 4, 3);
    expect(topicAccuracy(usePracticeStore.getState().progress, topicId)).toBe(0.75);
  });

  it("counts a chapter's coverage out of its own topic total", () => {
    const { recordPractice } = usePracticeStore.getState();
    recordPractice(topic(0).id, 1, 1);
    recordPractice(topic(1).id, 1, 0);

    const coverage = chapterCoverageOf(usePracticeStore.getState().progress, firstChapter.id);
    expect(coverage).toEqual({ done: 2, total: firstChapter.topics.length });
  });

  it("reports a chapter's last practice as the newest of its topics", () => {
    const progress = {
      [topic(0).id]: { lastPracticedAt: 1000, attempts: 1, correct: 1 },
      [topic(1).id]: { lastPracticedAt: 5000, attempts: 1, correct: 1 },
    };
    usePracticeStore.setState({ progress });

    expect(chapterLastPracticed(usePracticeStore.getState(), firstChapter.id)).toBe(5000);
  });

  it("reports 0 — never — for a chapter with no practice", () => {
    expect(chapterLastPracticed(usePracticeStore.getState(), firstChapter.id)).toBe(0);
  });
});

describe("recentTopicsOf", () => {
  it("returns the newest first and honours the limit", () => {
    const a = topic(0);
    const b = topic(1);
    const c = topic(2);
    usePracticeStore.setState({
      progress: {
        [a.id]: { lastPracticedAt: 100, attempts: 1, correct: 1 },
        [b.id]: { lastPracticedAt: 300, attempts: 1, correct: 1 },
        [c.id]: { lastPracticedAt: 200, attempts: 1, correct: 1 },
      },
    });

    const progress = usePracticeStore.getState().progress;
    expect(recentTopicsOf(progress, 2)).toEqual([b.id, c.id]);
    expect(recentTopicsOf(progress, 10)).toEqual([b.id, c.id, a.id]);
  });

  it("omits topics that were recorded but never actually practised", () => {
    const a = topic(0);
    usePracticeStore.setState({
      progress: { [a.id]: { lastPracticedAt: 0, attempts: 0, correct: 0 } },
    });
    expect(recentTopicsOf(usePracticeStore.getState().progress)).toHaveLength(0);
  });
});

describe("launching", () => {
  it("carries the current selection into the session, and clears on dismiss", () => {
    const store = usePracticeStore.getState();
    store.select({ kind: "chapter", id: firstChapter.id });
    store.launch();

    expect(usePracticeStore.getState().launchedFrom).toEqual({
      kind: "chapter",
      id: firstChapter.id,
    });

    usePracticeStore.getState().dismissLaunch();
    expect(usePracticeStore.getState().launchedFrom).toBeNull();
  });
});

describe("the cap survives the route the setter cannot see", () => {
  /*
   * REGRESSION GUARD - this shipped broken, and the file's own comment
   * asserted otherwise.
   *
   * `setSettings` clamps, so every test that went through it passed.
   * Persisted state never calls the setter: zustand's default merge assigns
   * it wholesale. Hand-editing localStorage produced a 200-question session
   * and a 166-hour timer with the clamp never running. A rule enforced only
   * in a setter is a rule with a back door.
   *
   * The storage decision is made once, when the module is first imported, so
   * the fake has to be in place BEFORE the import - hence resetModules and a
   * dynamic import rather than the top-level one. Setting it afterwards was
   * how the first version of this test failed for the wrong reason.
   */
  it("re-clamps settings restored from saved data", async () => {
    const saved = {
      state: {
        pinnedChapterIds: [],
        progress: {},
        settings: { timerEnabled: true, timerMinutes: 9999, questionCount: 200 },
      },
      version: 1,
    };

    const store: Record<string, string> = {
      "practice-canvas": JSON.stringify(saved),
    };
    const fake = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;

    vi.stubGlobal("localStorage", fake);
    vi.stubGlobal("window", { ...globalThis, localStorage: fake });
    vi.resetModules();

    const fresh = await import("./store");
    fresh.hydratePracticeStore();

    const settings = fresh.usePracticeStore.getState().settings;
    expect(settings.questionCount).toBe(fresh.MAX_QUESTIONS);
    // Was `180`. This test closed the back door for the count and walked past
    // the timer standing open right beside it — see the timer block above.
    expect(settings.timerMinutes).toBe(fresh.TIMER_MAX_MINUTES);

    vi.unstubAllGlobals();
  });
});
