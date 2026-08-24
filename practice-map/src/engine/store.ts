import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CHAPTER_BY_ID,
  type ChapterId,
  type TopicId,
  topicsOfChapter,
} from "@/engine/curriculum";

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

      select(selection) {
        set({ selection });
      },

      setSettings(patch) {
        const next = { ...get().settings, ...patch };
        set({
          settings: {
            timerEnabled: next.timerEnabled,
            timerMinutes: clamp(next.timerMinutes, 1, 180),
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
    },
  ),
);

/**
 * Pull saved state in, once, after the first client render.
 *
 * Safe to call more than once — persist's `rehydrate` is idempotent — so a
 * remount or a fast-refresh does not need to guard against it.
 */
export function hydratePracticeStore(): void {
  void usePracticeStore.persist.rehydrate();
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
