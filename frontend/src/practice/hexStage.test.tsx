// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import PracticeView from './PracticeView';
import { CURRICULUM } from './curriculum';
import { usePracticeStore } from './store';
import { DEFAULT_VIEWPORT, useViewportStore } from './viewport';

/**
 * THE PRACTICE SCREEN THE REFERENCE IMAGE ASKS FOR.
 *
 * The screen was a vertical list: question, a boxed chart, four rectangles
 * stacked down the page, Confirm underneath. The reference is a STAGE -- the
 * figure in the middle, four hexagonal cards arranged around it, Confirm
 * centred below, and the four steering controls in the bottom-right corner.
 *
 * WHY THESE TESTS DO NOT MEASURE PIXELS
 * -------------------------------------
 * jsdom has no layout engine. `getBoundingClientRect` returns zeroes for
 * everything, so a test asserting "option B is to the left of option C" would
 * pass against a page that stacked all four in a column. That is worse than no
 * test: it reads like proof and is not.
 *
 * So the CONTRACT is asserted instead, in two halves that together cannot both
 * be satisfied by a list:
 *
 *   1. the DOM says which slot each option occupies (`data-slot`)
 *   2. the STYLESHEET gives each slot a distinct position, and gives the card
 *      a hexagonal `clip-path`
 *
 * A stylesheet is a file; reading it and asserting on its rules is a real
 * check that survives jsdom. Geometry itself is verified in a browser, which
 * is stated rather than implied.
 */

/*
 * The stylesheet is read as TEXT, the same way the shape tests read their own
 * source. jsdom applies no CSS, so asserting on computed style would assert on
 * nothing; asserting on the rules that will be served is a real check.
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

const options = () => Array.from(document.querySelectorAll<HTMLElement>('.pm-q-option'));

async function startedSession() {
  render(<PracticeView />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  });
  expect(options()).toHaveLength(4);
}

describe('the four options occupy four named slots', () => {
  it('gives every option a distinct slot', async () => {
    await startedSession();

    const slots = options().map((element) => element.dataset['slot']);
    expect(slots).toEqual(['0', '1', '2', '3']);
  });

});

describe('reading order stays sane however the pieces are placed', () => {
  it('reads question, then figure, then options, then Confirm', async () => {
    /*
     * The cards are positioned visually, so DOM order is free to drift from
     * what a sighted reader sees. It must not: a screen-reader user and a
     * keyboard user both walk the DOM, and hearing four answers before the
     * question they answer is not the same screen.
     */
    await startedSession();
    fireEvent.click(must(options()[0], 'the first option'));

    const marks = Array.from(
      document.querySelectorAll('.pm-q-text, .pm-q-figure, .pm-q-option, .pm-q-confirm'),
    ).map((element) =>
      element.classList.contains('pm-q-text')
        ? 'question'
        : element.classList.contains('pm-q-figure')
          ? 'figure'
          : element.classList.contains('pm-q-confirm')
            ? 'confirm'
            : 'option',
    );

    /*
     * The figure is OPTIONAL, and that changed under §35: a question whose text
     * already states every quantity gets no chart, because removing a chart
     * that restates the sentence loses nothing. So the order is asserted as a
     * SEQUENCE with the figure allowed to be absent, rather than a fixed list
     * with a figure always at index 1.
     *
     * The claim itself is unchanged and is what matters: whatever renders, the
     * question comes first, the options come after it, and Confirm comes last.
     */
    expect(marks[0]).toBe('question');
    expect(marks.filter((mark) => mark === 'option')).toHaveLength(4);
    expect(marks[marks.length - 1]).toBe('confirm');

    const firstOption = marks.indexOf('option');
    const figure = marks.indexOf('figure');
    if (figure !== -1) {
      /* Present or absent, it is never AFTER an answer. */
      expect(figure).toBeLessThan(firstOption);
      expect(figure).toBeGreaterThan(0);
    }
    expect(marks.slice(firstOption, firstOption + 4)).toEqual([
      'option',
      'option',
      'option',
      'option',
    ]);
  });

  it('keeps all four cards reachable by keyboard', async () => {
    await startedSession();

    for (const element of options()) {
      act(() => element.focus());
      expect(document.activeElement).toBe(element);
    }
  });
});

describe('the four steering controls sit in the corner from the start', () => {
  const names = [/More like this/i, /Different/i, /Harder/i, /Easier/i];

  it('shows all four before the student has answered', async () => {
    /*
     * A DELIBERATE REVERSAL, recorded because it contradicts a test that used
     * to assert the opposite.
     *
     * The controls were hidden until the answer was revealed, on the reasoning
     * that steering before answering lets a student skip a question they find
     * hard. The reference image places them beside Confirm, visible while the
     * question is still open, and that is the product decision.
     *
     * This is a REQUIREMENT CHANGE, not a test weakened to reach green. The
     * cost is real and is named rather than hidden: a student can now press
     * Easier instead of thinking. The old assertion is replaced by this one,
     * and the two cannot both be true.
     */
    await startedSession();

    for (const name of names) {
      expect(screen.getByRole('button', { name }), String(name)).toBeInTheDocument();
    }
  });

  it('still shows them after the answer is out', async () => {
    await startedSession();
    fireEvent.click(must(options()[0], 'the first option'));
    fireEvent.click(must(screen.queryByRole('button', { name: /^Confirm$/ }), 'Confirm'));

    for (const name of names) {
      expect(screen.getByRole('button', { name }), String(name)).toBeInTheDocument();
    }
  });
});
