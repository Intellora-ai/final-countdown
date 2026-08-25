// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import PracticeView from './PracticeView';
import { CURRICULUM } from './curriculum';
import { usePracticeStore } from './store';
import { DEFAULT_VIEWPORT, useViewportStore } from './viewport';

/**
 * COMMIT, THEN SEE. AND FOUR WAYS TO ASK FOR THE NEXT ONE.
 *
 * The screen used to reveal the answer the instant an option was touched. That
 * is not how practice works: a student who mis-clicks has already been told, and
 * a student who wants to change their mind cannot. There is no moment where they
 * have decided but not yet been graded, which is exactly the moment learning
 * happens.
 *
 * So selecting is now separate from committing, and `Confirm` is the commit.
 *
 * THE FOUR CONTROLS
 * -----------------
 *     More Like This    Different    Harder    Easier
 *
 * `engine/steer.ts` already decides what each one asks for and is fully tested.
 * It had no caller. These tests are the wire, and they assert the DOM contract a
 * student actually touches -- that the buttons exist, are reachable by keyboard,
 * and are not offered before there is anything to steer from.
 */

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`test fixture missing: ${what}`);
  return value;
}

const subject = must(CURRICULUM[0], 'the first subject');
const chapter = must(subject.chapters[0], 'chapter 1');
const topic = must(chapter.topics[0], 'topic 0');

class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  Reflect.set(globalThis, 'ResizeObserver', StubResizeObserver);
  usePracticeStore.setState({
    pinnedChapterIds: [],
    hoveredChapterId: null,
    selection: { kind: 'topic', id: topic.id },
    progress: {},
    settings: { timerEnabled: false, timerMinutes: 10, questionCount: 5 },
    launchedFrom: { kind: 'topic', id: topic.id },
  });
  useViewportStore.setState({ viewport: DEFAULT_VIEWPORT });
});

afterEach(cleanup);

/*
 * Queried by CLASS, not by label text. Matching on the accessible name would
 * tie every test here to the exact separator used in the label, a change that
 * has nothing to do with what these tests are about -- and `aria-pressed` alone
 * is not selective enough, because the map's chapter and topic nodes carry it
 * too (twelve elements, not four).
 */
const options = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button.pm-q-option'));
const confirm = () => screen.queryByRole('button', { name: /^Confirm$/ });

async function startedSession() {
  render(<PracticeView />);
  /*
   * `generateSet` is async and runs against a wall-clock budget, so the first
   * question is not in the DOM on the render that starts it. Waiting for the
   * option buttons is the honest signal that a real set arrived -- a fixed tick
   * would pass or fail on machine speed.
   */
  /*
   * A real wait inside `act`, not a fake timer. `generateSet` runs against a
   * wall-clock budget and awaits real promises; advancing a fake clock does not
   * make those resolve, and a `waitFor` alone never flushes React's queue here.
   */
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  });
  expect(options()).toHaveLength(4);
}

describe('selecting is not the same as answering', () => {
  it('offers no Confirm until something is selected', async () => {
    await startedSession();
    expect(confirm()).toBeNull();
  });

  it('shows Confirm once an option is selected, and reveals nothing yet', async () => {
    await startedSession();
    const first = must(options()[0], 'the first option');

    fireEvent.click(first);

    expect(confirm()).toBeInTheDocument();
    /*
     * The verdict must NOT be on screen. This is the whole point of the change:
     * there is now a moment where the student has decided and has not been
     * graded, and it is the moment they can still change their mind.
     */
    expect(screen.queryByText(/Correct\.|Not quite/)).toBeNull();
  });

  it('lets the student change their mind before committing', async () => {
    await startedSession();
    const [first, second] = options();

    fireEvent.click(must(first, 'option A'));
    fireEvent.click(must(second, 'option B'));

    expect(must(second, 'option B')).toHaveAttribute('aria-pressed', 'true');
    expect(must(first, 'option A')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Correct\.|Not quite/)).toBeNull();
  });

  it('reveals only when Confirm is pressed', async () => {
    await startedSession();
    fireEvent.click(must(options()[0], 'the first option'));

    fireEvent.click(must(confirm(), 'the Confirm button'));

    expect(screen.getByText(/Correct\.|Not quite/)).toBeInTheDocument();
  });

  it('takes Confirm away once the answer is out, so it cannot be pressed twice', async () => {
    await startedSession();
    fireEvent.click(must(options()[0], 'the first option'));
    fireEvent.click(must(confirm(), 'the Confirm button'));

    expect(confirm()).toBeNull();
  });
});

describe('the four steering controls', () => {
  const names = [/More like this/i, /Different/i, /Harder/i, /Easier/i];

  it('are absent until the answer has been seen', async () => {
    await startedSession();
    /*
     * Steering means "give me another one LIKE that". Before the student has
     * seen how they did, there is nothing to steer from -- and offering it
     * would let them skip the question by asking for a different one.
     */
    for (const name of names) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('all four appear once the answer is out', async () => {
    await startedSession();
    fireEvent.click(must(options()[0], 'the first option'));
    fireEvent.click(must(confirm(), 'the Confirm button'));

    for (const name of names) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('every control is reachable by keyboard', async () => {
    await startedSession();
    fireEvent.click(must(options()[0], 'the first option'));
    fireEvent.click(must(confirm(), 'the Confirm button'));

    for (const name of names) {
      const button = screen.getByRole('button', { name });
      act(() => button.focus());
      expect(document.activeElement).toBe(button);
    }
  });
});
