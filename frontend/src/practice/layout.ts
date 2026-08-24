import {
  CURRICULUM,
  type Chapter,
  type ChapterId,
  type Subject,
  type SubjectId,
  type TopicId,
} from "./curriculum";

/**
 * Where every node sits, derived from the curriculum's shape.
 *
 * DERIVED, NEVER STORED
 * ---------------------
 * No coordinate is written in `curriculum.ts`. Positions come out of this file
 * as a function of the tree, so adding a chapter re-flows its subject's ring
 * automatically and no edge can point at where a node used to be.
 *
 * DETERMINISTIC, NEVER RANDOM AT RUNTIME
 * --------------------------------------
 * The jitter that keeps the rings from looking like clock faces is seeded from
 * each node's own id. The same curriculum always produces the same map — which
 * matters more than it sounds: a learner builds spatial memory of where their
 * chapters are, and a layout that reshuffled on reload would destroy the one
 * thing a knowledge map is for. It also makes the layout snapshot-testable.
 */

export interface Placed {
  x: number;
  y: number;
}

export interface SubjectNode extends Placed {
  kind: "subject";
  id: SubjectId;
  name: string;
}

export interface ChapterNode extends Placed {
  kind: "chapter";
  id: ChapterId;
  subjectId: SubjectId;
  number: number;
  name: string;
  /** Ring radius its topics fan out at — larger for chapters with more topics. */
  topicRadius: number;
}

export interface TopicNode extends Placed {
  kind: "topic";
  id: TopicId;
  chapterId: ChapterId;
  subjectId: SubjectId;
  name: string;
}

export interface Edge {
  from: Placed;
  to: Placed;
  /** Topic edges are only drawn when their chapter is open. */
  chapterId: ChapterId | null;
}

export interface Graph {
  subjects: readonly SubjectNode[];
  chapters: readonly ChapterNode[];
  topics: readonly TopicNode[];
  /** Subject centre → each of its chapters. Always drawn. */
  spokes: readonly Edge[];
  /** Chapter → each of its topics. Drawn only while that chapter is open. */
  tendrils: readonly Edge[];
  bounds: { x: number; y: number; width: number; height: number };
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Where each subject's cluster sits, in canvas units.
 *
 * These are hand-placed rather than computed, and deliberately uneven. An
 * even ring of four would read as a diagram; the reference composition works
 * because the clusters sit at different distances and heights, leaving the
 * asymmetric negative space that makes it look like a sky rather than a chart.
 */
const SUBJECT_ANCHORS: Record<SubjectId, Placed> = {
  economics: { x: 560, y: 470 },
  accountancy: { x: 1250, y: 360 },
  "business-studies": { x: 1010, y: 900 },
  "applied-maths": { x: 1560, y: 800 },
};

/** No two subject centres may sit closer than this, in canvas units. */
const MIN_SUBJECT_SEPARATION = 420;

/** Where derived anchors orbit, when the curated map runs out. */
const DERIVED_ORIGIN: Placed = { x: 1010, y: 620 };
const DERIVED_RADIUS_MIN = 620;
const DERIVED_RADIUS_STEP = 210;

/**
 * A position for a subject the curated map does not name.
 *
 * WHY THIS EXISTS
 * ---------------
 * `SUBJECT_ANCHORS` is a design asset, not a lookup table: the four positions
 * are uneven on purpose, and that asymmetry is why the map reads as a sky
 * rather than a chart. Deriving all four from a formula would make it worse.
 *
 * But a hardcoded map is only correct for the subjects it names. Before this
 * function existed, every unnamed subject collapsed onto ONE fallback point —
 * add Chemistry and History and both rendered at 900,620, one on top of the
 * other, with their chapter rings interleaved. The map silently lied about the
 * syllabus, and nothing failed.
 *
 * So curated anchors win when they exist, and anything else walks a golden-angle
 * spiral until it finds a slot at least `MIN_SUBJECT_SEPARATION` from every
 * subject already placed. Deterministic (no randomness, no time), and it cannot
 * return a colliding point because it does not stop until it has a clear one.
 */
function deriveAnchor(index: number, taken: readonly Placed[]): Placed {
  /* The golden angle spreads successive points maximally — the same reason
     sunflowers use it — so consecutive subjects never bunch on one side. */
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  for (let attempt = 0; attempt < 256; attempt += 1) {
    const step = index + attempt;
    const angle = step * GOLDEN_ANGLE;
    const radius = DERIVED_RADIUS_MIN + Math.floor(step / 6) * DERIVED_RADIUS_STEP;

    const candidate = {
      x: round2(DERIVED_ORIGIN.x + Math.cos(angle) * radius),
      /* Squashed vertically to match the curated anchors' proportions: the map
         is wider than it is tall, so a true circle would push subjects off the
         top and bottom while leaving the sides empty. */
      y: round2(DERIVED_ORIGIN.y + Math.sin(angle) * radius * 0.72),
    };

    const clear = taken.every(
      (other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= MIN_SUBJECT_SEPARATION,
    );
    if (clear) return candidate;
  }

  /* Unreachable for any realistic subject count — the radius grows every six
     attempts, so a clear slot always exists. Returning the origin rather than
     throwing keeps a malformed curriculum rendering something. */
  return DERIVED_ORIGIN;
}

/** Distance from a subject's centre to its chapter ring. */
const CHAPTER_RADIUS = 250;
/** Extra radius per chapter beyond the sixth, so busy subjects do not crowd. */
const CHAPTER_RADIUS_PER_EXTRA = 13;
/** Base distance from a chapter to its topics. */
const TOPIC_RADIUS = 96;
const TOPIC_RADIUS_PER_EXTRA = 7;
/** How far the topic fan opens, in radians. Less than a full circle so the fan
 *  reads as pointing away from its subject rather than englobing the chapter. */
const TOPIC_ARC = Math.PI * 1.15;

const JITTER_PX = 16;

export function buildGraph(curriculum: readonly Subject[] = CURRICULUM): Graph {
  const subjects: SubjectNode[] = [];
  const chapters: ChapterNode[] = [];
  const topics: TopicNode[] = [];
  const spokes: Edge[] = [];
  const tendrils: Edge[] = [];

  /*
   * Curated anchors are seeded BEFORE any derivation runs.
   *
   * Accumulating them inside the loop instead looks equivalent and is not: a
   * derived subject listed ahead of a curated one would derive its position
   * without knowing where the curated one lands, and could be placed right on
   * top of it. Curriculum order is the author's business, not the layout's.
   */
  const placed: Placed[] = curriculum
    .map((subject) => SUBJECT_ANCHORS[subject.id])
    .filter((anchor): anchor is Placed => anchor !== undefined);

  curriculum.forEach((subject, subjectIndex) => {
    let anchor = SUBJECT_ANCHORS[subject.id];
    if (!anchor) {
      anchor = deriveAnchor(subjectIndex, placed);
      placed.push(anchor);
    }

    const subjectNode: SubjectNode = {
      kind: "subject",
      id: subject.id,
      name: subject.name,
      x: anchor.x,
      y: anchor.y,
    };
    subjects.push(subjectNode);

    const count = subject.chapters.length;
    const radius = CHAPTER_RADIUS + Math.max(0, count - 6) * CHAPTER_RADIUS_PER_EXTRA;

    /* Rotating each subject's ring by a different amount stops all four
       subjects putting "Chapter 1" at the same o'clock position, which is the
       tell that a layout was generated rather than composed. */
    const ringRotation = subjectIndex * 0.9 + 0.35;

    subject.chapters.forEach((chapter, chapterIndex) => {
      const angle = ringRotation + (chapterIndex / Math.max(1, count)) * Math.PI * 2;
      const wobble = jitter(chapter.id, JITTER_PX);

      const chapterNode: ChapterNode = {
        kind: "chapter",
        id: chapter.id,
        subjectId: subject.id,
        number: chapter.number,
        name: chapter.name,
        topicRadius: topicRadiusFor(chapter),
        x: round2(anchor.x + Math.cos(angle) * radius + wobble.x),
        y: round2(anchor.y + Math.sin(angle) * radius * 0.82 + wobble.y),
      };
      chapters.push(chapterNode);
      spokes.push({ from: subjectNode, to: chapterNode, chapterId: null });

      /* Topics fan on the far side of the chapter from its subject, so an open
         chapter never draws its topics back over the subject's own label. */
      const outward = Math.atan2(chapterNode.y - anchor.y, chapterNode.x - anchor.x);
      const topicCount = chapter.topics.length;

      chapter.topics.forEach((topic, topicIndex) => {
        const spread =
          topicCount === 1 ? 0 : (topicIndex / (topicCount - 1) - 0.5) * TOPIC_ARC;
        const topicAngle = outward + spread;
        const topicWobble = jitter(topic.id, JITTER_PX * 0.5);

        const topicNode: TopicNode = {
          kind: "topic",
          id: topic.id,
          chapterId: chapter.id,
          subjectId: subject.id,
          name: topic.name,
          x: round2(chapterNode.x + Math.cos(topicAngle) * chapterNode.topicRadius + topicWobble.x),
          y: round2(chapterNode.y + Math.sin(topicAngle) * chapterNode.topicRadius + topicWobble.y),
        };
        topics.push(topicNode);
        tendrils.push({ from: chapterNode, to: topicNode, chapterId: chapter.id });
      });
    });
  });

  return { subjects, chapters, topics, spokes, tendrils, bounds: boundsOf(chapters) };
}

function topicRadiusFor(chapter: Chapter): number {
  return TOPIC_RADIUS + Math.max(0, chapter.topics.length - 3) * TOPIC_RADIUS_PER_EXTRA;
}

/**
 * The box containing every node, with room for labels.
 *
 * Topics are included even though they are usually hidden: fitting the view to
 * only the visible nodes would make the whole map lurch every time a chapter
 * opened. The frame is stable; what is drawn inside it changes.
 */
function boundsOf(chapters: readonly ChapterNode[]): Graph["bounds"] {
  /*
   * Chapters only, with padding wide enough to cover a topic fan.
   *
   * Including the topics' own positions makes the box roughly a third larger,
   * and since the opening view is fitted to this box, every chapter label then
   * opens too small to read — for the sake of framing nodes that are hidden.
   * The padding below exceeds the largest topic radius, so an open fan still
   * lands inside the frame, and the frame stays constant whether chapters are
   * open or shut.
   */
  const points: Placed[] = [...chapters];
  if (points.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  // Whole numbers: these become the SVG `viewBox`, which is serialised the same
  // way every coordinate above is, and mismatches for the same reason.
  const pad = 190;
  return {
    x: Math.round(minX - pad),
    y: Math.round(minY - pad),
    width: Math.round(maxX - minX + pad * 2),
    height: Math.round(maxY - minY + pad * 2),
  };
}

/* -------------------------------------------------------------------------- */
/* Decorative field                                                           */
/* -------------------------------------------------------------------------- */

export interface Dot {
  x: number;
  y: number;
  r: number;
  opacity: number;
  /** A few dots catch the accent, most stay neutral. */
  hot: boolean;
}

/**
 * The dust each subject sits in.
 *
 * Purely decorative — no dot is clickable and none stands for a concept. It
 * exists because a graph of bare nodes on a flat field reads as a diagram; the
 * haze is what makes it read as a sky. Density falls off from each subject's
 * centre via `sqrt`, which is what gives a cloud rather than a uniform disc.
 */
export function nebulaFor(
  subjects: readonly SubjectNode[],
  perSubject = 90,
): readonly Dot[] {
  const dots: Dot[] = [];

  for (const subject of subjects) {
    const random = seeded(subject.id);
    for (let index = 0; index < perSubject; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random());
      const hot = random() < 0.07;
      dots.push({
        x: round2(subject.x + Math.cos(angle) * distance * 330),
        y: round2(subject.y + Math.sin(angle) * distance * 285),
        r: round2(0.9 + random() * 1.7),
        opacity: round3(hot ? 0.45 + random() * 0.35 : 0.07 + random() * 0.26),
        hot,
      });
    }
  }

  return dots;
}

/* -------------------------------------------------------------------------- */
/* Seeded randomness                                                          */
/* -------------------------------------------------------------------------- */

/** mulberry32, seeded from a string so a node's jitter follows its identity. */
export function seeded(key: string): () => number {
  let state = 0;
  for (let index = 0; index < key.length; index += 1) {
    state = (Math.imul(state, 31) + key.charCodeAt(index)) | 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(key: string, amount: number): Placed {
  const random = seeded(key);
  return { x: (random() - 0.5) * amount * 2, y: (random() - 0.5) * amount * 2 };
}

/*
 * ROUNDING IS NOT COSMETIC HERE — IT IS WHAT MAKES SSR WORK
 * ---------------------------------------------------------
 * A full-precision double reaches the server's HTML as a 16-digit string and
 * the client as a 17-digit number, and React compares the two and declares a
 * hydration mismatch it will not patch up:
 *
 *     server  cx="313.7612184490434"
 *     client  cx={313.76121844904344}
 *
 * Two decimals round-trips identically through both, and — as `viewportMath`'s
 * own `n()` helper notes for the same reason — is below one device pixel at
 * every scale the canvas allows. Opacity gets three, since it spans 0–1.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
