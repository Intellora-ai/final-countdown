import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CHAPTER_BY_ID,
  type ChapterId,
  type TopicId,
  topicsOfChapter,
} from "./curriculum";

/**
 * What the learner has done, and what they currently have open.
 *
 * TWO KINDS OF OPEN, AND THEY ARE NOT THE SAME THING
 * --------------------------------------------------
 * Hovering a chapter opens it; so does clicking it. They must not share state.
 * If hover wrote to the persisted set, merely dragging the pointer across the
 * map on the way to somewhere else would silently rewrite what the learner
 * finds open tomorrow. So `hoveredChapterId` is transient and never saved, and
 * `pinnedChapterIds` is deliberate and always saved. `isChapterOpen` is the
 * union — the only thing rendering asks.
 *
 * PROGRESS IS PER TOPIC; CHAPTER PROGRESS IS DERIVED
 * --------------------------------------------------
 * A chapter's "last practised" is the newest of its topics'. Storing it
 * separately would create a second place that claims to know, and the moment a
 * topic is practised without the chapter's copy being bumped, the map and the
 * panel disagree with no error anywhere.
 */

export interface TopicProgress {
  /** Epoch millis of the most recent session. */
  lastPracticedAt: number;
  attempts: number;
  correct: number;
}

export type Selection =
  | { kind: "chapter"; id: ChapterId }
  | { kind: "topic"; id: TopicId }
  | null;

/** What the panel is configured to launch. Max questions is capped at 15. */
export interface SessionSettings {
  timerEnabled: boolean;
  /** Minutes. Only meaningful while `timerEnabled`. */
  timerMinutes: number;
  questionCount: number;
}

/**
 * `localStorage`, or nothing, without throwing.
 *
 * Three environments do not have it: the server, a test runner on Node, and
 * Safari in private mode (where the property exists but every write throws
 * QuotaExceededError). Referencing it bare made an ordinary `setState` throw
 * `Cannot read properties of undefined (reading 'setItem')` — which turns
 * "progress is not saved" into "the whole map is dead".
 *
 * `createJSONStorage` accepts `undefined` and simply skips persistence, so
 * returning nothing degrades to an in-memory store: the session still works,
 * it just does not outlive the tab. That is the right failure for this feature.
 */
function safeLocalStorage(): Storage | undefined {
  try {
    if (typeof window === "undefined" || !window.localStorage) return undefined;
    // A write probe: private mode fails here, not on the property access.
    const probe = "__practice_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The persisted storage, or nothing at all.
 *
 * It must be *nothing* rather than a `createJSONStorage` wrapping nothing.
 * `createJSONStorage` builds its `setItem` unconditionally, closing over
 * whatever the getter returned — so handing it `undefined` produces an object
 * that looks like storage and throws on the first write. Passing `undefined`
 * for the whole option instead hits the branch in zustand's `persistImpl`
 * that warns once and continues as a plain in-memory store.
 */
function practiceStorage() {
  const raw = safeLocalStorage();
  return raw ? createJSONStorage(() => raw) : undefined;
}

export const MAX_QUESTIONS = 15;
export const MIN_QUESTIONS = 1;

/**
 * The timer bound the product promises: no shorter than 5 minutes, no longer
 * than 30.
 *
 * THESE ARE THE RULE. `TIMER_CHOICES` IS ONLY A MENU.
 * --------------------------------------------------
 * The clamps below used to read `1, 180` while the menu offered 5 through 30,
 * and because every button press lands on a menu value, nothing ever exercised
 * the gap. Restored `localStorage` does not press buttons: a saved
 * `{"timerMinutes":9999}` came back as a 166-hour "practice session" with the
 * bound never consulted. The rule now lives in one place and both clamps read
 * it, so the menu cannot drift away from the rule without the test below
 * noticing.
 */
export const TIMER_MIN_MINUTES = 5;
export const TIMER_MAX_MINUTES = 30;

export const TIMER_CHOICES = [5, 10, 15, 20, 30] as const;

const DEFAULT_SETTINGS: SessionSettings = {
  timerEnabled: false,
  timerMinutes: 10,
  questionCount: 10,
};

export interface PracticeState {
  /** Persisted. Chapters the learner deliberately left open. */
  pinnedChapterIds: readonly ChapterId[];
  /** Transient. Never persisted — see the note above. */
  hoveredChapterId: ChapterId | null;
  selection: Selection;
  progress: Record<TopicId, TopicProgress>;
  settings: SessionSettings;
  /** Set once "Start practice" is pressed. The session screen is not built yet. */
  launchedFrom: Selection;

  hoverChapter(id: ChapterId | null): void;
  toggleChapterPinned(id: ChapterId): void;
  /** Open a chapter and leave it open. Idempotent, unlike the toggle. */
  pinChapter(id: ChapterId): void;
  /** A click on a chapter node. Moves the map and the panel together. */
  activateChapter(id: ChapterId): void;
  select(selection: Selection): void;
  setSettings(patch: Partial<SessionSettings>): void;
  recordPractice(topicId: TopicId, attempts: number, correct: number): void;
  launch(): void;
  dismissLaunch(): void;
  resetProgress(): void;
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      pinnedChapterIds: [],
      hoveredChapterId: null,
      selection: null,
      progress: {},
      settings: DEFAULT_SETTINGS,
      launchedFrom: null,

      hoverChapter(id) {
        if (get().hoveredChapterId === id) return;
        set({ hoveredChapterId: id });
      },

      toggleChapterPinned(id) {
        if (!CHAPTER_BY_ID.has(id)) return;
        const pinned = get().pinnedChapterIds;
        set({
          pinnedChapterIds: pinned.includes(id)
            ? pinned.filter((each) => each !== id)
            : [...pinned, id],
        });
      },

      pinChapter(id) {
        if (!CHAPTER_BY_ID.has(id)) return;
        const pinned = get().pinnedChapterIds;
        if (pinned.includes(id)) return;
        set({ pinnedChapterIds: [...pinned, id] });
      },

      /*
       * ONE CLICK, ONE STATE — THE MAP AND THE PANEL CANNOT DISAGREE.
       *
       * This used to be `toggleChapterPinned(id)` followed by `select(chapter)`
       * at the call site, and those two say opposite things about a chapter
       * that is already open: the toggle collapses it, the select keeps a panel
       * open describing it. The result was a panel titled "Cash Flow Statement"
       * next to a map on which that chapter had just shut — no error, no way
       * for the learner to tell which half was lying.
       *
       * Both fields move here, together, or not at all. Clicking a chapter the
       * panel is already describing means "I am done with this": it collapses
       * AND closes. Every other click means "show me this": it opens AND selects.
       */
      activateChapter(id) {
        if (!CHAPTER_BY_ID.has(id)) return;
        const { pinnedChapterIds, selection } = get();
        const showing = selection?.kind === "chapter" && selection.id === id;
        const pinned = pinnedChapterIds.includes(id);

        if (showing && pinned) {
          set({
            pinnedChapterIds: pinnedChapterIds.filter((each) => each !== id),
            selection: null,
          });
          return;
        }

        set({
          pinnedChapterIds: pinned ? pinnedChapterIds : [...pinnedChapterIds, id],
          selection: { kind: "chapter", id },
        });
      },

      select(selection) {
        set({ selection });
      },

      setSettings(patch) {
        const next = { ...get().settings, ...patch };
        set({
          settings: {
            timerEnabled: next.timerEnabled,
            timerMinutes: clamp(next.timerMinutes, TIMER_MIN_MINUTES, TIMER_MAX_MINUTES),
            // The cap lives here rather than in the input, so a session cannot
            // be launched with 200 questions by any route into the store.
            questionCount: clamp(Math.round(next.questionCount), MIN_QUESTIONS, MAX_QUESTIONS),
          },
        });
      },

      recordPractice(topicId, attempts, correct) {
        const previous = get().progress[topicId];
        set({
          progress: {
            ...get().progress,
            [topicId]: {
              lastPracticedAt: Date.now(),
              attempts: (previous?.attempts ?? 0) + Math.max(0, attempts),
              correct: (previous?.correct ?? 0) + Math.max(0, correct),
            },
          },
        });
      },

      launch() {
        set({ launchedFrom: get().selection });
      },

      dismissLaunch() {
        set({ launchedFrom: null });
      },

      resetProgress() {
        set({ progress: {}, selection: null, launchedFrom: null });
      },
    }),
    {
      name: "practice-canvas",
      storage: practiceStorage(),
      version: 1,
      /*
       * HYDRATE AFTER MOUNT, NOT DURING
       * -------------------------------
       * Left to itself, persist reads localStorage while the module is being
       * evaluated. The server rendered this page with an empty store, so the
       * client's first render would already have the learner's saved chapters
       * open — different markup than the server sent, which React reports as a
       * hydration mismatch and then refuses to patch up, leaving the DOM in
       * whichever state it happened to land in.
       *
       * So the read is deferred: the first client render matches the server's
       * exactly, and `hydratePracticeStore()` (called from an effect) pulls the
       * saved state in immediately afterwards. One extra frame, no mismatch.
       */
      skipHydration: true,
      /*
       * Only the durable things. `hoveredChapterId`, `selection` and
       * `launchedFrom` are all "where the pointer happens to be right now" —
       * restoring them would reopen a panel the learner closed before leaving.
       */
      partialize: (state) => ({
        pinnedChapterIds: state.pinnedChapterIds,
        progress: state.progress,
        settings: state.settings,
      }),

      /*
       * SAVED SETTINGS GO THROUGH THE SAME CLAMP AS TYPED ONES.
       *
       * `setSettings` clamps, and the comment above it claimed a session
       * "cannot be launched with 200 questions by any route into the store".
       * That was false, and provably so: the default merge assigns persisted
       * state wholesale, so hand-editing localStorage to
       * `{"questionCount":200,"timerMinutes":9999}` produced exactly that —
       * a 200-question session and a 166-hour timer, with the clamp never
       * running.
       *
       * The lesson generalises past this bug: a rule enforced only in a setter
       * is a rule with a back door, because deserialised state never calls the
       * setter. The bound is re-applied here so there is genuinely one way in.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PracticeState>
        const settings = saved.settings ?? current.settings
        return {
          ...current,
          ...saved,
          settings: {
            timerEnabled: Boolean(settings.timerEnabled),
            timerMinutes: clamp(settings.timerMinutes, TIMER_MIN_MINUTES, TIMER_MAX_MINUTES),
            questionCount: clamp(Math.round(settings.questionCount), MIN_QUESTIONS, MAX_QUESTIONS),
          },
        }
      },
    },
  ),
);

/**
 * Pull saved state in, once, after the first client render.
 *
 * Safe to call more than once — persist's `rehydrate` is idempotent — so a
 * remount or a fast-refresh does not need to guard against it.
 *
 * THE `?.` IS NOT DEFENSIVE PADDING.
 *
 * `practiceStorage()` returns `undefined` on purpose where there is no usable
 * `localStorage`, and the note above it explains that this reaches the branch
 * in zustand's `persistImpl` which "warns once and continues as a plain
 * in-memory store". What that branch also does is return BEFORE attaching
 * `api.persist` — so in exactly the environments the storage probe exists to
 * survive, this line read `.rehydrate` off `undefined` and threw inside a mount
 * effect. The graceful degradation the store advertises took the whole map down
 * with it. Found by rendering the map in a test runner with no `localStorage`,
 * which is the same shape as Safari's private mode.
 */
export function hydratePracticeStore(): void {
  void usePracticeStore.persist?.rehydrate();
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

export type ProgressMap = Readonly<Record<TopicId, TopicProgress>>;

/*
 * WHY THESE TAKE `progress` AND NOT `state`
 * -----------------------------------------
 * Anything that builds an object or an array must not be used as a zustand
 * selector: zustand compares a selector's result by reference, so a fresh
 * `{done, total}` on every call reads as "changed" on every store update and
 * the component re-renders forever. React surfaces this as
 * "getServerSnapshot should be cached to avoid an infinite loop" — which names
 * the symptom, not the cause, and cost a real debugging session here.
 *
 * So the composite ones take the progress map directly. Components select
 * `state.progress` (one stable reference) and derive through `useMemo`. The
 * ones below that return a primitive are safe as selectors and stay that way.
 */

/** Open means pinned OR hovered. Returns a boolean — safe as a selector. */
export function isChapterOpen(state: PracticeState, id: ChapterId): boolean {
  return state.hoveredChapterId === id || state.pinnedChapterIds.includes(id);
}

/**
 * A chapter's last practice: the newest of its topics'.
 *
 * Returns 0 for "never", which sorts before every real timestamp and lets
 * callers use a plain falsy check. A number, so safe as a selector.
 */
export function chapterLastPracticed(state: PracticeState, id: ChapterId): number {
  let newest = 0;
  for (const topic of topicsOfChapter(id)) {
    const at = state.progress[topic.id]?.lastPracticedAt ?? 0;
    if (at > newest) newest = at;
  }
  return newest;
}

/** How many of a chapter's topics have ever been practised, and out of how many. */
export function chapterCoverageOf(
  progress: ProgressMap,
  id: ChapterId,
): { done: number; total: number } {
  const topics = topicsOfChapter(id);
  let done = 0;
  for (const topic of topics) {
    if (progress[topic.id]?.lastPracticedAt) done += 1;
  }
  return { done, total: topics.length };
}

/** Accuracy as a fraction, or null when the topic has never been attempted. */
export function topicAccuracy(progress: ProgressMap, id: TopicId): number | null {
  const entry = progress[id];
  if (!entry || entry.attempts <= 0) return null;
  return entry.correct / entry.attempts;
}

/** The most recently practised topics, newest first — feeds "Continue practising". */
export function recentTopicsOf(progress: ProgressMap, limit = 4): readonly TopicId[] {
  return Object.entries(progress)
    .filter(([, entry]) => entry.lastPracticedAt > 0)
    .sort(([, a], [, b]) => b.lastPracticedAt - a.lastPracticedAt)
    .slice(0, limit)
    .map(([id]) => id);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
