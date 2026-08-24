import { describe, expect, it } from "vitest";

import { CURRICULUM, type Subject } from "./curriculum";
import { buildGraph, nebulaFor, seeded } from "./layout";

/**
 * The layout's contract.
 *
 * Two of these are regression guards for bugs that actually shipped into the
 * browser during this build, not hypotheticals — see the comments on each.
 */

describe("buildGraph", () => {
  it("places every chapter and topic in the curriculum", () => {
    const graph = buildGraph();
    const chapters = CURRICULUM.flatMap((subject) => subject.chapters);
    const topics = chapters.flatMap((chapter) => chapter.topics);

    expect(graph.subjects).toHaveLength(CURRICULUM.length);
    expect(graph.chapters).toHaveLength(chapters.length);
    expect(graph.topics).toHaveLength(topics.length);
  });

  it("gives every chapter a spoke and every topic a tendril", () => {
    const graph = buildGraph();

    expect(graph.spokes).toHaveLength(graph.chapters.length);
    expect(graph.tendrils).toHaveLength(graph.topics.length);

    // No tendril may be orphaned: each names a chapter that exists.
    const chapterIds = new Set(graph.chapters.map((chapter) => chapter.id));
    for (const tendril of graph.tendrils) {
      expect(tendril.chapterId).not.toBeNull();
      expect(chapterIds.has(tendril.chapterId!)).toBe(true);
    }
  });

  it("is deterministic — the same curriculum always yields the same map", () => {
    /*
     * A learner builds spatial memory of where their chapters are. A layout
     * that reshuffled between reloads would destroy the single thing a
     * knowledge map is for, so this is a product requirement, not a tidiness
     * one. It is also what makes the assertions above stable.
     */
    expect(buildGraph()).toEqual(buildGraph());
  });

  it("rounds every coordinate to two decimals", () => {
    /*
     * REGRESSION GUARD — this exact bug reached the browser.
     *
     * Full-precision doubles serialise differently on the server and the
     * client (`cx="313.7612184490434"` vs `cx={313.76121844904344}`), which
     * React reports as a hydration mismatch it refuses to patch up. Two
     * decimals round-trips identically through both.
     */
    const graph = buildGraph();
    const coords = [
      ...graph.chapters.flatMap((node) => [node.x, node.y]),
      ...graph.topics.flatMap((node) => [node.x, node.y]),
    ];

    expect(coords.length).toBeGreaterThan(0);
    for (const value of coords) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBe(Math.round(value * 100) / 100);
    }
  });

  it("frames a box that contains every chapter", () => {
    const graph = buildGraph();
    const { x, y, width, height } = graph.bounds;

    for (const chapter of graph.chapters) {
      expect(chapter.x).toBeGreaterThanOrEqual(x);
      expect(chapter.x).toBeLessThanOrEqual(x + width);
      expect(chapter.y).toBeGreaterThanOrEqual(y);
      expect(chapter.y).toBeLessThanOrEqual(y + height);
    }
  });

  it("uses whole numbers for the bounds, which become the SVG viewBox", () => {
    const { x, y, width, height } = buildGraph().bounds;
    for (const value of [x, y, width, height]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("never stacks two subjects on the same spot, at any subject count", () => {
    /*
     * REGRESSION GUARD — this shipped broken.
     *
     * `SUBJECT_ANCHORS` names four subjects. Every other subject used to fall
     * back to ONE shared point, so a fifth and sixth subject rendered exactly
     * on top of each other with their chapter rings interleaved. The map
     * silently misrepresented the syllabus and nothing failed.
     *
     * Asserted across a range because the bug only appeared from the SECOND
     * unnamed subject onward — a single extra subject looked fine.
     */
    const MIN_SEPARATION = 420;

    for (let count = 1; count <= 12; count += 1) {
      const subjects: Subject[] = Array.from({ length: count }, (_, index) => ({
        id: index === 0 ? "economics" : index === 1 ? "accountancy" : `extra-${index}`,
        name: `Subject ${index}`,
        chapters: [
          { id: `s${index}-c1`, number: 1, name: "Chapter", topics: [{ id: `s${index}-t1`, name: "T" }] },
        ],
      }));

      const { subjects: placed } = buildGraph(subjects);

      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          const a = placed[i];
          const b = placed[j];
          expect(a).toBeDefined();
          expect(b).toBeDefined();
          const distance = Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
          expect(
            distance,
            `${count} subjects: "${a?.id}" and "${b?.id}" are ${Math.round(distance)} apart`,
          ).toBeGreaterThanOrEqual(MIN_SEPARATION);
        }
      }
    }
  });

  it("keeps the curated composition regardless of curriculum order", () => {
    /* A derived subject listed FIRST must not displace or collide with a
       curated one listed after it. */
    const subjects: Subject[] = [
      { id: "new-subject", name: "New", chapters: [] },
      { id: "economics", name: "Economics", chapters: [] },
    ];

    const placed = buildGraph(subjects).subjects;
    const economics = placed.find((s) => s.id === "economics");
    const derived = placed.find((s) => s.id === "new-subject");

    // Economics keeps its designed position.
    expect(economics).toMatchObject({ x: 560, y: 470 });
    // And the derived one is clear of it.
    const distance = Math.hypot(
      (derived?.x ?? 0) - (economics?.x ?? 0),
      (derived?.y ?? 0) - (economics?.y ?? 0),
    );
    expect(distance).toBeGreaterThanOrEqual(420);
  });

  it("survives a subject with no anchor, and one with no chapters", () => {
    const odd: Subject[] = [
      { id: "unknown-subject", name: "Unplaced", chapters: [] },
      {
        id: "another",
        name: "One Chapter",
        chapters: [{ id: "c1", number: 1, name: "Only", topics: [{ id: "t1", name: "Solo" }] }],
      },
    ];

    const graph = buildGraph(odd);
    expect(graph.subjects).toHaveLength(2);
    expect(graph.chapters).toHaveLength(1);
    expect(graph.topics).toHaveLength(1);
    for (const value of [graph.bounds.x, graph.bounds.y, graph.bounds.width, graph.bounds.height]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("fans a single-topic chapter without dividing by zero", () => {
    const one: Subject[] = [
      {
        id: "economics",
        name: "Economics",
        chapters: [{ id: "c1", number: 1, name: "Only", topics: [{ id: "t1", name: "Solo" }] }],
      },
    ];

    const topics = buildGraph(one).topics;
    expect(topics).toHaveLength(1);

    const [topic] = topics;
    // `noUncheckedIndexedAccess` is on: assert the element exists rather than
    // asserting it away, so a layout that dropped the topic fails here loudly.
    expect(topic).toBeDefined();
    expect(Number.isFinite(topic?.x)).toBe(true);
    expect(Number.isFinite(topic?.y)).toBe(true);
  });
});

describe("nebulaFor", () => {
  it("produces the requested count per subject, with finite geometry", () => {
    const graph = buildGraph();
    const dots = nebulaFor(graph.subjects, 10);

    expect(dots).toHaveLength(graph.subjects.length * 10);
    for (const dot of dots) {
      expect(Number.isFinite(dot.x)).toBe(true);
      expect(Number.isFinite(dot.y)).toBe(true);
      expect(dot.r).toBeGreaterThan(0);
      expect(dot.opacity).toBeGreaterThan(0);
      expect(dot.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("rounds dot geometry too — the dust is most of the SSR payload", () => {
    for (const dot of nebulaFor(buildGraph().subjects, 20)) {
      expect(dot.x).toBe(Math.round(dot.x * 100) / 100);
      expect(dot.y).toBe(Math.round(dot.y * 100) / 100);
      expect(dot.opacity).toBe(Math.round(dot.opacity * 1000) / 1000);
    }
  });

  it("is deterministic", () => {
    const subjects = buildGraph().subjects;
    expect(nebulaFor(subjects, 12)).toEqual(nebulaFor(subjects, 12));
  });
});

describe("seeded", () => {
  it("returns the same stream for the same key, and a different one otherwise", () => {
    const take = (key: string) => Array.from({ length: 5 }, seeded(key));
    expect(take("eco-1")).toEqual(take("eco-1"));
    expect(take("eco-1")).not.toEqual(take("eco-2"));
  });

  it("stays inside [0, 1)", () => {
    const random = seeded("anything");
    for (let index = 0; index < 500; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
