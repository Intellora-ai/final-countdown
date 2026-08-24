"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  CHAPTER_BY_ID,
  SUBJECT_BY_ID,
  SUBJECT_OF_CHAPTER,
  TOPIC_BY_ID,
  CHAPTER_OF_TOPIC,
} from "@/engine/curriculum";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  TIMER_CHOICES,
  chapterCoverageOf,
  chapterLastPracticed,
  usePracticeStore,
} from "@/engine/store";
import { cn } from "@/lib/cn";

/**
 * What opens when a node is clicked.
 *
 * ONE PANEL FOR BOTH KINDS OF NODE
 * --------------------------------
 * A chapter and a topic are different sizes of the same request — "set me some
 * questions on this" — so they get one panel rather than two that drift apart.
 * The only difference is the subtitle and how many topics the session can draw
 * from, both derived below.
 *
 * THE 15 CAP IS NOT ENFORCED HERE
 * -------------------------------
 * The input's `max` is a courtesy to the pointer; the real clamp is in the
 * store, so no route into it can launch a 200-question session. This is the
 * kind of rule that must not live only in the control that happens to be on
 * screen today.
 */

export function PracticePanel() {
  const selection = usePracticeStore((state) => state.selection);
  const select = usePracticeStore((state) => state.select);
  const settings = usePracticeStore((state) => state.settings);
  const setSettings = usePracticeStore((state) => state.setSettings);
  const launch = usePracticeStore((state) => state.launch);

  const lastPracticed = usePracticeStore((state) => {
    if (!state.selection) return 0;
    if (state.selection.kind === "chapter") return chapterLastPracticed(state, state.selection.id);
    return state.progress[state.selection.id]?.lastPracticedAt ?? 0;
  });

  /* Derived, not selected — see the note in usePracticeStore about why a
     selector must never build an object. */
  const progress = usePracticeStore((state) => state.progress);
  const coverage = useMemo(
    () =>
      selection?.kind === "chapter" ? chapterCoverageOf(progress, selection.id) : null,
    [progress, selection],
  );

  const closeRef = useRef<HTMLButtonElement | null>(null);
  const open = selection !== null;

  /* Escape closes. Bound on the panel's own subtree would miss it whenever
     focus is still out on the map, which is the common case right after a
     click. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, select]);

  const title = selection ? titleOf(selection) : "";
  const subtitle = selection ? subtitleOf(selection) : "";

  return (
    <aside
      aria-label="Practice setup"
      aria-hidden={!open}
      className={cn(
        "absolute top-6 right-6 bottom-6 z-20 flex w-[312px] flex-col",
        "rounded-xl border border-line bg-void-lift/95 backdrop-blur-md",
        "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0",
      )}
    >
      {!selection ? null : (
        <>
          <header className="border-b border-line px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] tracking-[0.14em] text-ink-faint uppercase">
                  {subtitle}
                </p>
                <h2 className="mt-1.5 text-[17px] leading-snug text-ink">{title}</h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close practice setup"
                onClick={() => select(null)}
                className="-mt-1 shrink-0 cursor-pointer rounded-md p-1.5 text-ink-faint transition-colors hover:bg-panel-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" strokeWidth={1.6} stroke="currentColor" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <p className="mt-3 text-[12px] text-ink-muted">
              Last practised{" "}
              <span className="text-ink">{relativeTime(lastPracticed)}</span>
              {coverage && coverage.total > 0 && (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {coverage.done}/{coverage.total}
                  </span>{" "}
                  topics
                </>
              )}
            </p>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {/* -- Timer ----------------------------------------------------- */}
            <Field label="Timer">
              <button
                type="button"
                role="switch"
                aria-checked={settings.timerEnabled}
                aria-label="Use a timer"
                onClick={() => setSettings({ timerEnabled: !settings.timerEnabled })}
                className={cn(
                  "relative h-[22px] w-[38px] cursor-pointer rounded-full transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  settings.timerEnabled ? "bg-accent/80" : "bg-panel-hover",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[3px] size-4 rounded-full bg-void transition-[left] duration-200 ease-out motion-reduce:transition-none",
                    settings.timerEnabled ? "left-[19px]" : "left-[3px]",
                  )}
                />
              </button>
            </Field>

            {/* Durations only exist once the timer is on. Showing them greyed
                out would invite clicking something that does nothing. */}
            {/*
              * `opacity-0` + `max-h-0` hides it from the eye but NOT from the
              * pointer or a screen reader: the collapsed row still hit-tests,
              * so a click just under the toggle silently set a duration on a
              * timer that was off, and the five buttons were still announced.
              * `invisible` removes it from hit-testing, `pointer-events-none`
              * belts it, and `aria-hidden` takes it out of the tree — all three
              * released together by the same flag, so they cannot drift apart.
              */}
            <div
              aria-hidden={!settings.timerEnabled}
              className={cn(
                "grid grid-cols-5 gap-1.5 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none",
                settings.timerEnabled
                  ? "mt-3 max-h-16 opacity-100"
                  : "pointer-events-none invisible max-h-0 opacity-0",
              )}
            >
              {TIMER_CHOICES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  tabIndex={settings.timerEnabled ? 0 : -1}
                  aria-pressed={settings.timerMinutes === minutes}
                  onClick={() => setSettings({ timerMinutes: minutes })}
                  className={cn(
                    "cursor-pointer rounded-md border py-1.5 text-[12px] tabular-nums transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    settings.timerMinutes === minutes
                      ? "border-accent/60 bg-accent/12 text-accent-soft"
                      : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {minutes}m
                </button>
              ))}
            </div>

            {/* -- Questions ------------------------------------------------- */}
            <div className="mt-7">
              <Field label="Questions">
                <span className="text-[15px] tabular-nums text-ink">
                  {settings.questionCount}
                </span>
              </Field>

              <input
                type="range"
                min={MIN_QUESTIONS}
                max={MAX_QUESTIONS}
                step={1}
                value={settings.questionCount}
                aria-label={`Number of questions, ${settings.questionCount} of a maximum ${MAX_QUESTIONS}`}
                onChange={(event) => setSettings({ questionCount: Number(event.target.value) })}
                className="mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-panel-hover accent-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              />
              <div className="mt-2 flex justify-between text-[10px] tabular-nums text-ink-faint">
                <span>{MIN_QUESTIONS}</span>
                <span>{MAX_QUESTIONS} max</span>
              </div>
            </div>
          </div>

          <footer className="border-t border-line p-5">
            <button
              type="button"
              onClick={launch}
              className="w-full cursor-pointer rounded-lg bg-accent py-3 text-[13px] font-medium tracking-[0.02em] text-void transition-[background-color,transform] duration-150 hover:bg-accent-soft active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Start practice
            </button>
            <p className="mt-2.5 text-center text-[11px] text-ink-faint">
              {settings.questionCount} question{settings.questionCount === 1 ? "" : "s"}
              {settings.timerEnabled ? ` · ${settings.timerMinutes} minutes` : " · untimed"}
            </p>
          </footer>
        </>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                     */
/* -------------------------------------------------------------------------- */

function titleOf(selection: NonNullable<ReturnType<typeof usePracticeStore.getState>["selection"]>) {
  if (selection.kind === "chapter") return CHAPTER_BY_ID.get(selection.id)?.name ?? "Chapter";
  return TOPIC_BY_ID.get(selection.id)?.name ?? "Topic";
}

/** Breadcrumb: which subject, and for a topic, which chapter it came from. */
function subtitleOf(
  selection: NonNullable<ReturnType<typeof usePracticeStore.getState>["selection"]>,
) {
  if (selection.kind === "chapter") {
    const chapter = CHAPTER_BY_ID.get(selection.id);
    const subject = SUBJECT_BY_ID.get(SUBJECT_OF_CHAPTER.get(selection.id) ?? "");
    return [subject?.name, chapter ? `Chapter ${chapter.number}` : null]
      .filter(Boolean)
      .join(" · ");
  }

  const chapterId = CHAPTER_OF_TOPIC.get(selection.id);
  const chapter = chapterId ? CHAPTER_BY_ID.get(chapterId) : undefined;
  const subject = SUBJECT_BY_ID.get(chapterId ? (SUBJECT_OF_CHAPTER.get(chapterId) ?? "") : "");
  return [subject?.name, chapter ? `Chapter ${chapter.number}` : null].filter(Boolean).join(" · ");
}

/**
 * "3 days ago", or "Never".
 *
 * Deliberately coarse. A learner does not need "2 days, 4 hours"; they need to
 * know whether this is stale. Coarse buckets also mean the string does not
 * change between a server render and a client hydration for anything but the
 * most recent minute.
 */
export function relativeTime(epochMillis: number, now: number = Date.now()): string {
  if (!epochMillis) return "never";

  const seconds = Math.max(0, Math.round((now - epochMillis) / 1000));
  if (seconds < 90) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}
