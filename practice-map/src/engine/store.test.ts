import { beforeEach, describe, expect, it } from "vitest";

import { CURRICULUM } from "@/engine/curriculum";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  chapterCoverageOf,
  chapterLastPracticed,
  isChapterOpen,
  recentTopicsOf,
  topicAccuracy,
  usePracticeStore,
} from "@/engine/store";

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

  it("clamps absurd durations", () => {
    usePracticeStore.getState().setSettings({ timerMinutes: 9999 });
    expect(usePracticeStore.getState().settings.timerMinutes).toBe(180);
  });
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
