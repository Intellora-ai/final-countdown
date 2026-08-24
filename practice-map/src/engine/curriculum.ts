/**
 * The curriculum: subjects → chapters → topics.
 *
 * WHY THIS IS DATA AND NOT MARKUP
 * -------------------------------
 * The constellation is generated from this file. Adding a chapter here makes a
 * node appear on the map, wired to its subject, with its topics fanned around
 * it — no layout to hand-edit, no coordinates to keep in sync. That is the
 * difference between a picture of a knowledge map and a knowledge map.
 *
 * Positions are NOT stored here on purpose. They are derived in `layout.ts`
 * from the shape of this tree. Two places holding coordinates is the usual way
 * a graph starts drawing edges to where a node used to be.
 */

export type SubjectId = string;
export type ChapterId = string;
export type TopicId = string;

export interface Topic {
  id: TopicId;
  name: string;
}

export interface Chapter {
  id: ChapterId;
  /** Chapter number as the student knows it — "Chapter 3" on their syllabus. */
  number: number;
  name: string;
  topics: readonly Topic[];
}

export interface Subject {
  id: SubjectId;
  name: string;
  chapters: readonly Chapter[];
}

/* -------------------------------------------------------------------------- */
/* Seed: CBSE class 12, commerce stream                                       */
/* -------------------------------------------------------------------------- */

/**
 * Ids are stable, human-readable slugs rather than array indices, because they
 * are written into saved progress. Reordering a chapter must not silently
 * reassign someone's practice history to a different chapter.
 */
export const CURRICULUM: readonly Subject[] = [
  {
    id: "economics",
    name: "Economics",
    chapters: [
      {
        id: "eco-1",
        number: 1,
        name: "Introduction to Microeconomics",
        topics: [
          { id: "eco-1-central-problems", name: "Central problems" },
          { id: "eco-1-ppc", name: "Production possibility curve" },
          { id: "eco-1-opportunity-cost", name: "Opportunity cost" },
          { id: "eco-1-scarcity", name: "Scarcity and choice" },
        ],
      },
      {
        id: "eco-2",
        number: 2,
        name: "Consumer's Equilibrium and Demand",
        topics: [
          { id: "eco-2-utility", name: "Utility" },
          { id: "eco-2-marginal-utility", name: "Marginal utility" },
          { id: "eco-2-equilibrium", name: "Consumer's equilibrium" },
          { id: "eco-2-law-of-demand", name: "Law of demand" },
          { id: "eco-2-elasticity", name: "Elasticity of demand" },
        ],
      },
      {
        id: "eco-3",
        number: 3,
        name: "Producer Behaviour and Supply",
        topics: [
          { id: "eco-3-production-function", name: "Production function" },
          { id: "eco-3-returns", name: "Returns to a factor" },
          { id: "eco-3-cost", name: "Cost curves" },
          { id: "eco-3-revenue", name: "Revenue" },
          { id: "eco-3-supply", name: "Law of supply" },
        ],
      },
      {
        id: "eco-4",
        number: 4,
        name: "Forms of Market and Price Determination",
        topics: [
          { id: "eco-4-perfect-competition", name: "Perfect competition" },
          { id: "eco-4-monopoly", name: "Monopoly" },
          { id: "eco-4-monopolistic", name: "Monopolistic competition" },
          { id: "eco-4-equilibrium-price", name: "Equilibrium price" },
        ],
      },
      {
        id: "eco-5",
        number: 5,
        name: "National Income",
        topics: [
          { id: "eco-5-gdp", name: "GDP and GNP" },
          { id: "eco-5-methods", name: "Methods of measurement" },
          { id: "eco-5-real-nominal", name: "Real vs nominal GDP" },
          { id: "eco-5-welfare", name: "GDP and welfare" },
        ],
      },
      {
        id: "eco-6",
        number: 6,
        name: "Money and Banking",
        topics: [
          { id: "eco-6-functions-of-money", name: "Functions of money" },
          { id: "eco-6-commercial-banks", name: "Commercial banks" },
          { id: "eco-6-central-bank", name: "Central bank" },
          { id: "eco-6-credit-creation", name: "Credit creation" },
        ],
      },
      {
        id: "eco-7",
        number: 7,
        name: "Income and Employment",
        topics: [
          { id: "eco-7-aggregate-demand", name: "Aggregate demand" },
          { id: "eco-7-multiplier", name: "Investment multiplier" },
          { id: "eco-7-excess-demand", name: "Excess demand" },
          { id: "eco-7-deficient-demand", name: "Deficient demand" },
        ],
      },
      {
        id: "eco-8",
        number: 8,
        name: "Government Budget",
        topics: [
          { id: "eco-8-receipts", name: "Budget receipts" },
          { id: "eco-8-expenditure", name: "Budget expenditure" },
          { id: "eco-8-deficits", name: "Types of deficit" },
        ],
      },
    ],
  },

  {
    id: "accountancy",
    name: "Accountancy",
    chapters: [
      {
        id: "acc-1",
        number: 1,
        name: "Accounting for Partnership Firms",
        topics: [
          { id: "acc-1-partnership-deed", name: "Partnership deed" },
          { id: "acc-1-capital-accounts", name: "Capital accounts" },
          { id: "acc-1-profit-sharing", name: "Profit sharing ratio" },
          { id: "acc-1-interest-on-capital", name: "Interest on capital" },
        ],
      },
      {
        id: "acc-2",
        number: 2,
        name: "Reconstitution of Partnership",
        topics: [
          { id: "acc-2-admission", name: "Admission of a partner" },
          { id: "acc-2-goodwill", name: "Valuation of goodwill" },
          { id: "acc-2-revaluation", name: "Revaluation account" },
          { id: "acc-2-retirement", name: "Retirement of a partner" },
          { id: "acc-2-death", name: "Death of a partner" },
        ],
      },
      {
        id: "acc-3",
        number: 3,
        name: "Dissolution of Partnership",
        topics: [
          { id: "acc-3-realisation", name: "Realisation account" },
          { id: "acc-3-settlement", name: "Settlement of accounts" },
          { id: "acc-3-insolvency", name: "Insolvency of a partner" },
        ],
      },
      {
        id: "acc-4",
        number: 4,
        name: "Accounting for Share Capital",
        topics: [
          { id: "acc-4-issue-of-shares", name: "Issue of shares" },
          { id: "acc-4-forfeiture", name: "Forfeiture of shares" },
          { id: "acc-4-reissue", name: "Reissue of shares" },
          { id: "acc-4-private-placement", name: "Private placement" },
        ],
      },
      {
        id: "acc-5",
        number: 5,
        name: "Issue and Redemption of Debentures",
        topics: [
          { id: "acc-5-issue", name: "Issue of debentures" },
          { id: "acc-5-collateral", name: "Collateral security" },
          { id: "acc-5-redemption", name: "Redemption methods" },
        ],
      },
      {
        id: "acc-6",
        number: 6,
        name: "Financial Statements of a Company",
        topics: [
          { id: "acc-6-balance-sheet", name: "Balance sheet" },
          { id: "acc-6-profit-loss", name: "Statement of profit and loss" },
          { id: "acc-6-schedule-iii", name: "Schedule III format" },
        ],
      },
      {
        id: "acc-7",
        number: 7,
        name: "Analysis of Financial Statements",
        topics: [
          { id: "acc-7-comparative", name: "Comparative statements" },
          { id: "acc-7-common-size", name: "Common size statements" },
          { id: "acc-7-liquidity-ratios", name: "Liquidity ratios" },
          { id: "acc-7-solvency-ratios", name: "Solvency ratios" },
          { id: "acc-7-profitability", name: "Profitability ratios" },
        ],
      },
      {
        id: "acc-8",
        number: 8,
        name: "Cash Flow Statement",
        topics: [
          { id: "acc-8-operating", name: "Operating activities" },
          { id: "acc-8-investing", name: "Investing activities" },
          { id: "acc-8-financing", name: "Financing activities" },
        ],
      },
    ],
  },

  {
    id: "business-studies",
    name: "Business Studies",
    chapters: [
      {
        id: "bst-1",
        number: 1,
        name: "Nature and Significance of Management",
        topics: [
          { id: "bst-1-objectives", name: "Objectives of management" },
          { id: "bst-1-levels", name: "Levels of management" },
          { id: "bst-1-functions", name: "Functions of management" },
          { id: "bst-1-coordination", name: "Coordination" },
        ],
      },
      {
        id: "bst-2",
        number: 2,
        name: "Principles of Management",
        topics: [
          { id: "bst-2-fayol", name: "Fayol's principles" },
          { id: "bst-2-taylor", name: "Taylor's scientific management" },
          { id: "bst-2-techniques", name: "Techniques of Taylor" },
        ],
      },
      {
        id: "bst-3",
        number: 3,
        name: "Business Environment",
        topics: [
          { id: "bst-3-dimensions", name: "Dimensions of environment" },
          { id: "bst-3-liberalisation", name: "Liberalisation" },
          { id: "bst-3-impact", name: "Impact on business" },
        ],
      },
      {
        id: "bst-4",
        number: 4,
        name: "Planning",
        topics: [
          { id: "bst-4-process", name: "Planning process" },
          { id: "bst-4-types", name: "Types of plans" },
          { id: "bst-4-limitations", name: "Limitations of planning" },
        ],
      },
      {
        id: "bst-5",
        number: 5,
        name: "Organising",
        topics: [
          { id: "bst-5-structure", name: "Organisation structure" },
          { id: "bst-5-delegation", name: "Delegation" },
          { id: "bst-5-decentralisation", name: "Decentralisation" },
          { id: "bst-5-formal-informal", name: "Formal and informal" },
        ],
      },
      {
        id: "bst-6",
        number: 6,
        name: "Staffing",
        topics: [
          { id: "bst-6-recruitment", name: "Recruitment" },
          { id: "bst-6-selection", name: "Selection process" },
          { id: "bst-6-training", name: "Training and development" },
        ],
      },
      {
        id: "bst-7",
        number: 7,
        name: "Directing",
        topics: [
          { id: "bst-7-supervision", name: "Supervision" },
          { id: "bst-7-motivation", name: "Motivation" },
          { id: "bst-7-leadership", name: "Leadership styles" },
          { id: "bst-7-communication", name: "Communication" },
        ],
      },
      {
        id: "bst-8",
        number: 8,
        name: "Financial Management",
        topics: [
          { id: "bst-8-capital-structure", name: "Capital structure" },
          { id: "bst-8-fixed-capital", name: "Fixed capital" },
          { id: "bst-8-working-capital", name: "Working capital" },
          { id: "bst-8-dividend", name: "Dividend decision" },
        ],
      },
      {
        id: "bst-9",
        number: 9,
        name: "Marketing Management",
        topics: [
          { id: "bst-9-mix", name: "Marketing mix" },
          { id: "bst-9-branding", name: "Branding and labelling" },
          { id: "bst-9-pricing", name: "Pricing factors" },
          { id: "bst-9-promotion", name: "Promotion" },
        ],
      },
    ],
  },

  {
    id: "applied-maths",
    name: "Applied Mathematics",
    chapters: [
      {
        id: "mat-1",
        number: 1,
        name: "Numbers and Quantification",
        topics: [
          { id: "mat-1-modulo", name: "Modulo arithmetic" },
          { id: "mat-1-alligation", name: "Alligation and mixture" },
          { id: "mat-1-numerical", name: "Numerical problems" },
        ],
      },
      {
        id: "mat-2",
        number: 2,
        name: "Algebra",
        topics: [
          { id: "mat-2-matrices", name: "Matrices" },
          { id: "mat-2-determinants", name: "Determinants" },
          { id: "mat-2-quadratics", name: "Quadratic equations" },
        ],
      },
      {
        id: "mat-3",
        number: 3,
        name: "Calculus",
        topics: [
          { id: "mat-3-derivatives", name: "Derivatives" },
          { id: "mat-3-marginal-cost", name: "Marginal cost and revenue" },
          { id: "mat-3-maxima-minima", name: "Maxima and minima" },
          { id: "mat-3-integration", name: "Integration" },
        ],
      },
      {
        id: "mat-4",
        number: 4,
        name: "Probability Distributions",
        topics: [
          { id: "mat-4-random-variable", name: "Random variables" },
          { id: "mat-4-binomial", name: "Binomial distribution" },
          { id: "mat-4-normal", name: "Normal distribution" },
        ],
      },
      {
        id: "mat-5",
        number: 5,
        name: "Inferential Statistics",
        topics: [
          { id: "mat-5-sampling", name: "Sampling" },
          { id: "mat-5-t-test", name: "t-test" },
          { id: "mat-5-hypothesis", name: "Hypothesis testing" },
        ],
      },
      {
        id: "mat-6",
        number: 6,
        name: "Financial Mathematics",
        topics: [
          { id: "mat-6-emi", name: "EMI and instalments" },
          { id: "mat-6-annuity", name: "Annuities" },
          { id: "mat-6-depreciation", name: "Depreciation" },
          { id: "mat-6-returns", name: "Rate of return" },
        ],
      },
    ],
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Flat indexes, built once at module load.
 *
 * The panel needs "what is this id?" on every click, and the graph needs
 * "which chapter owns this topic?" while laying out. Walking the tree each time
 * is fine at this size, but the indexes keep the call sites readable and make
 * an unknown id a `undefined` rather than a silent no-match.
 */
export const SUBJECT_BY_ID: ReadonlyMap<SubjectId, Subject> = new Map(
  CURRICULUM.map((subject) => [subject.id, subject]),
);

export const CHAPTER_BY_ID: ReadonlyMap<ChapterId, Chapter> = new Map(
  CURRICULUM.flatMap((subject) => subject.chapters.map((chapter) => [chapter.id, chapter] as const)),
);

export const TOPIC_BY_ID: ReadonlyMap<TopicId, Topic> = new Map(
  CURRICULUM.flatMap((subject) =>
    subject.chapters.flatMap((chapter) => chapter.topics.map((topic) => [topic.id, topic] as const)),
  ),
);

/** Which chapter a topic belongs to — needed to draw the topic's edge home. */
export const CHAPTER_OF_TOPIC: ReadonlyMap<TopicId, ChapterId> = new Map(
  CURRICULUM.flatMap((subject) =>
    subject.chapters.flatMap((chapter) =>
      chapter.topics.map((topic) => [topic.id, chapter.id] as const),
    ),
  ),
);

/** Which subject a chapter belongs to. */
export const SUBJECT_OF_CHAPTER: ReadonlyMap<ChapterId, SubjectId> = new Map(
  CURRICULUM.flatMap((subject) =>
    subject.chapters.map((chapter) => [chapter.id, subject.id] as const),
  ),
);

export const ALL_TOPIC_IDS: readonly TopicId[] = [...TOPIC_BY_ID.keys()];

/** Every topic in a chapter, or an empty list for an id nobody knows. */
export function topicsOfChapter(chapterId: ChapterId): readonly Topic[] {
  return CHAPTER_BY_ID.get(chapterId)?.topics ?? [];
}
