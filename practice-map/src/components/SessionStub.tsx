"use client";

import { useEffect } from "react";

import {
  CHAPTER_BY_ID,
  TOPIC_BY_ID,
  topicsOfChapter,
} from "@/engine/curriculum";
import { usePracticeStore } from "@/engine/store";

/**
 * Where "Start practice" lands, until the question screen exists.
 *
 * DELIBERATELY A STUB, AND IT SAYS SO
 * -----------------------------------
 * The session screen is a separate design that has not been done yet. The
 * honest placeholder states what it *would* have launched — the exact scope,
 * count and timer — so the setup panel above it can be tested and judged now
 * without anyone mistaking this for a finished feature. A stub that pretended
 * to be a quiz would be worse than no stub.
 */

export function SessionStub() {
  const launchedFrom = usePracticeStore((state) => state.launchedFrom);
  const settings = usePracticeStore((state) => state.settings);
  const dismiss = usePracticeStore((state) => state.dismissLaunch);

  const open = launchedFrom !== null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  if (!launchedFrom) return null;

  const scope =
    launchedFrom.kind === "chapter"
      ? (CHAPTER_BY_ID.get(launchedFrom.id)?.name ?? "this chapter")
      : (TOPIC_BY_ID.get(launchedFrom.id)?.name ?? "this topic");

  const drawnFrom =
    launchedFrom.kind === "chapter" ? topicsOfChapter(launchedFrom.id).length : 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Practice session"
      className="absolute inset-0 z-30 grid place-items-center bg-void/85 backdrop-blur-sm"
    >
      <div className="w-[420px] rounded-xl border border-line bg-void-lift p-7 text-center">
        <p className="text-[10.5px] tracking-[0.14em] text-accent uppercase">
          Session ready
        </p>
        <h2 className="mt-3 text-[19px] leading-snug text-ink">{scope}</h2>

        <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-line py-5 text-left">
          <Stat label="Questions" value={String(settings.questionCount)} />
          <Stat
            label="Timer"
            value={settings.timerEnabled ? `${settings.timerMinutes} min` : "Off"}
          />
          <Stat
            label="Drawn from"
            value={`${drawnFrom} topic${drawnFrom === 1 ? "" : "s"}`}
          />
        </dl>

        <p className="mt-5 text-[12.5px] leading-relaxed text-ink-muted">
          The question screen is the next thing to design. Everything above is
          real and saved — this is where it will open.
        </p>

        <button
          type="button"
          onClick={dismiss}
          autoFocus
          className="mt-6 w-full cursor-pointer rounded-lg border border-line py-2.5 text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to the map
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-[0.1em] text-ink-faint uppercase">{label}</dt>
      <dd className="mt-1 text-[14px] tabular-nums text-ink">{value}</dd>
    </div>
  );
}
