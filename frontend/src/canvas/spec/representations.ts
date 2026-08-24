/**
 * The representation taxonomy.
 *
 * THE INSIGHT THIS FILE IS BUILT ON
 * --------------------------------
 * There are roughly 150 named ways to draw data, and only about a dozen SHAPES
 * of data underneath them. A lollipop chart, a dot plot, a bar chart and a
 * slope chart are one shape — named series over a shared axis — drawn four
 * ways. A mind map, an org chart, a fault tree, a dependency graph and a DAG
 * are one shape: nodes and edges.
 *
 * Writing 150 renderers would mean 150 places for a bug and 150 chances to
 * drift from the design system. Writing 12 shapes, each with its own
 * invariants, and treating the named type as a VARIANT of a shape, means a new
 * chart type is usually a rendering option rather than new code — and it
 * inherits the shape's correctness rules for free.
 *
 * WHERE THE INVARIANTS LIVE, AND WHY HERE
 * ---------------------------------------
 * On the SHAPE, not the name. "A pie cannot show negative parts" is not a fact
 * about pies; it is a fact about parts-of-a-whole, and it is equally true of a
 * treemap, a waffle and a funnel. Attaching it to the shape means every one of
 * those inherits it and none can forget it.
 *
 * A rule is only in this file if breaking it produces a chart that is WRONG,
 * not merely ugly. Ugly is the design system's job.
 */

/* -------------------------------------------------------------------------- */
/* The shapes                                                                 */
/* -------------------------------------------------------------------------- */

export const SHAPES = [
  'series', // named runs of (x, y) over a shared axis
  'distribution', // raw samples, per group — the chart derives the summary
  'parts', // labelled parts that make one whole
  'matrix', // a rectangular grid of values with row and column keys
  'graph', // nodes and edges; direction and acyclicity are declared
  'process', // ordered steps with branches, optionally by actor
  'flowWeighted', // weighted movement between stages
  'intervals', // items with a start and an end on one axis
  'hierarchy', // strict containment: every node has exactly one parent
  'tabular', // rows and columns
  'geometry', // a drawn construction: axes, vectors, sets, bodies, circuits
  'logic', // truth tables, proof and derivation trees
] as const

export type Shape = (typeof SHAPES)[number]

/* -------------------------------------------------------------------------- */
/* The registry: ~150 named types, each mapped to a shape and a variant        */
/* -------------------------------------------------------------------------- */

export interface Representation {
  /** The underlying data shape. Decides which renderer and which invariants. */
  shape: Shape
  /** What the reader is being asked to do. Drives the layout grammar's choices. */
  intent: 'compare' | 'trend' | 'distribution' | 'relationship' | 'composition' | 'structure' | 'sequence' | 'construct'
  /**
   * When this named type is the WRONG choice, in one sentence.
   *
   * Present because the commonest visualisation defect is not a broken axis; it
   * is a correct chart answering a question nobody asked. The selector reads
   * this, and so does anyone maintaining the registry.
   */
  avoidWhen: string
}

export const REPRESENTATIONS = {
  /* -- Comparison ------------------------------------------------------- */
  bar: { shape: 'series', intent: 'compare', avoidWhen: 'the x axis is continuous — use a line' },
  groupedBar: { shape: 'series', intent: 'compare', avoidWhen: 'there are more than about four groups per category' },
  stackedBar: { shape: 'series', intent: 'composition', avoidWhen: 'the reader must compare the middle segments — only the bottom one shares a baseline' },
  lollipop: { shape: 'series', intent: 'compare', avoidWhen: 'bars would not already be too heavy; this is a bar chart on a diet' },
  dotPlot: { shape: 'series', intent: 'compare', avoidWhen: 'values are near zero and the missing baseline would mislead' },
  bullet: { shape: 'series', intent: 'compare', avoidWhen: 'there is no target or band to compare against' },
  radar: { shape: 'series', intent: 'compare', avoidWhen: 'the axes are not commensurable — area on a radar implies a total that may be meaningless' },
  slope: { shape: 'series', intent: 'trend', avoidWhen: 'there are more than two time points' },
  parallelCoordinates: { shape: 'series', intent: 'relationship', avoidWhen: 'the axis ORDER is arbitrary — it changes which relationships are visible' },

  /* -- Change over time -------------------------------------------------- */
  line: { shape: 'series', intent: 'trend', avoidWhen: 'x is categorical — a line between categories implies values in between' },
  area: { shape: 'series', intent: 'trend', avoidWhen: 'series overlap and the fill hides one behind another' },
  stackedArea: { shape: 'series', intent: 'composition', avoidWhen: 'any value can be negative' },
  streamgraph: { shape: 'series', intent: 'composition', avoidWhen: 'exact values matter — the shifting baseline makes them unreadable' },
  step: { shape: 'series', intent: 'trend', avoidWhen: 'the quantity really does change continuously' },
  candlestick: { shape: 'series', intent: 'trend', avoidWhen: 'the data has no open, high, low and close' },
  controlChart: { shape: 'series', intent: 'trend', avoidWhen: 'no control limits are defined — it is then just a line' },
  burndown: { shape: 'series', intent: 'trend', avoidWhen: 'scope changes during the period; use a burn-up' },
  burnup: { shape: 'series', intent: 'trend', avoidWhen: 'scope is genuinely fixed — a burn-down is simpler' },
  regression: { shape: 'series', intent: 'relationship', avoidWhen: 'the fit is shown without the scatter it was fitted to' },
  residual: { shape: 'series', intent: 'relationship', avoidWhen: 'no model is being diagnosed' },
  learningCurve: { shape: 'series', intent: 'trend', avoidWhen: 'train and validation are not both plotted — one alone hides overfitting' },
  lossCurve: { shape: 'series', intent: 'trend', avoidWhen: 'the y axis is not on a scale that shows the tail' },
  rocCurve: { shape: 'series', intent: 'relationship', avoidWhen: 'classes are heavily imbalanced; use precision-recall' },
  precisionRecall: { shape: 'series', intent: 'relationship', avoidWhen: 'the positive class is the majority' },
  calibration: { shape: 'series', intent: 'relationship', avoidWhen: 'the diagonal reference is omitted — it is the whole point' },

  /* -- Distribution ------------------------------------------------------ */
  histogram: { shape: 'distribution', intent: 'distribution', avoidWhen: 'the bin width is not stated — it changes the shape of the answer' },
  boxPlot: { shape: 'distribution', intent: 'distribution', avoidWhen: 'the distribution is bimodal — a box hides the second mode entirely' },
  violin: { shape: 'distribution', intent: 'distribution', avoidWhen: 'samples are few; the smooth implies data that is not there' },
  density: { shape: 'distribution', intent: 'distribution', avoidWhen: 'the bandwidth is not stated' },
  strip: { shape: 'distribution', intent: 'distribution', avoidWhen: 'points overlap heavily; use a beeswarm' },
  beeswarm: { shape: 'distribution', intent: 'distribution', avoidWhen: 'there are so many points the shape becomes a blob' },
  ridgeline: { shape: 'distribution', intent: 'distribution', avoidWhen: 'groups have no natural order' },
  populationPyramid: { shape: 'distribution', intent: 'compare', avoidWhen: 'the two sides are not the same measure' },
  quantile: { shape: 'distribution', intent: 'distribution', avoidWhen: 'the reader wants counts rather than position' },
  qqPlot: { shape: 'distribution', intent: 'relationship', avoidWhen: 'the reference distribution is not named' },

  /* -- Relationship ------------------------------------------------------ */
  scatter: { shape: 'series', intent: 'relationship', avoidWhen: 'one axis is time — use a line' },
  bubble: { shape: 'series', intent: 'relationship', avoidWhen: 'radius rather than AREA encodes the value; that triples the apparent difference' },
  connectedScatter: { shape: 'series', intent: 'trend', avoidWhen: 'the ordering is not meaningful' },
  hexbin: { shape: 'matrix', intent: 'relationship', avoidWhen: 'there are few enough points to plot directly' },
  contour: { shape: 'matrix', intent: 'relationship', avoidWhen: 'the surface is not continuous' },
  heatMap: { shape: 'matrix', intent: 'relationship', avoidWhen: 'the colour scale is not anchored — an unanchored diverging scale invents a midpoint' },
  correlationMatrix: { shape: 'matrix', intent: 'relationship', avoidWhen: 'correlation is being read as causation' },
  confusionMatrix: { shape: 'matrix', intent: 'relationship', avoidWhen: 'counts are shown without the class balance that explains them' },
  adjacencyMatrix: { shape: 'matrix', intent: 'structure', avoidWhen: 'the graph is sparse — a node-link view reads better' },
  missingDataMap: { shape: 'matrix', intent: 'distribution', avoidWhen: 'nothing is missing, or rows were dropped before the map was drawn — it then reports a completeness the analysis never had' },
  pairPlot: { shape: 'matrix', intent: 'relationship', avoidWhen: 'there are more than about six variables' },
  featureImportance: { shape: 'series', intent: 'compare', avoidWhen: 'importances come from different models and are not comparable' },
  shapSummary: { shape: 'distribution', intent: 'relationship', avoidWhen: 'the reader has not been told what a SHAP value is' },
  embeddingProjection: { shape: 'series', intent: 'relationship', avoidWhen: 'distance in the projection is read as distance in the original space' },
  clusterPlot: { shape: 'series', intent: 'relationship', avoidWhen: 'the cluster count was chosen to look tidy' },
  decisionBoundary: { shape: 'matrix', intent: 'relationship', avoidWhen: 'the input has more than two dimensions and the rest are silently fixed' },

  /* -- Parts of a whole -------------------------------------------------- */
  pie: { shape: 'parts', intent: 'composition', avoidWhen: 'there are more than about five slices, or slices must be compared precisely' },
  donut: { shape: 'parts', intent: 'composition', avoidWhen: 'the hole is doing nothing — it is a pie with a worse angle cue' },
  treemap: { shape: 'hierarchy', intent: 'composition', avoidWhen: 'the hierarchy is shallow — a bar chart is more readable' },
  sunburst: { shape: 'hierarchy', intent: 'composition', avoidWhen: 'depth is more than about three rings' },
  waffle: { shape: 'parts', intent: 'composition', avoidWhen: 'the total is not a round number of cells' },
  waterfall: { shape: 'parts', intent: 'composition', avoidWhen: 'the steps do not actually sum to the end value' },
  funnel: { shape: 'parts', intent: 'sequence', avoidWhen: 'stages are not strictly nested subsets of the one before' },
  marimekko: { shape: 'parts', intent: 'composition', avoidWhen: 'either dimension needs to be read precisely' },

  /* -- Networks ---------------------------------------------------------- */
  nodeLink: { shape: 'graph', intent: 'structure', avoidWhen: 'the graph is dense — use an adjacency matrix' },
  directedGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'direction carries no meaning' },
  weightedGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'weights span orders of magnitude with a linear width scale' },
  bipartiteGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'the two sets are not actually disjoint' },
  dag: { shape: 'graph', intent: 'structure', avoidWhen: 'the graph contains a cycle — then it is not a DAG' },
  dependencyGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'transitive edges are drawn as well as direct ones' },
  callGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'recursion is not marked' },
  socialGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'layout position is read as meaning' },
  chord: { shape: 'flowWeighted', intent: 'relationship', avoidWhen: 'there are more than about ten groups' },
  arcDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'node order is arbitrary' },
  sankey: { shape: 'flowWeighted', intent: 'composition', avoidWhen: 'flow is not conserved between stages' },
  alluvial: { shape: 'flowWeighted', intent: 'trend', avoidWhen: 'category membership does not actually change' },
  mindMap: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'relationships between branches matter — use a concept map' },
  conceptMap: { shape: 'graph', intent: 'structure', avoidWhen: 'edges are unlabelled; an unlabelled concept map is a mind map' },
  taxonomy: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'an item belongs in two places' },
  ontology: { shape: 'graph', intent: 'structure', avoidWhen: 'relationship types are not named' },
  argumentMap: { shape: 'graph', intent: 'structure', avoidWhen: 'objections are omitted — then it is an assertion, not an argument' },
  issueTree: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'branches overlap; the split must be mutually exclusive' },
  hypothesisTree: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'hypotheses are not testable as stated' },
  affinityDiagram: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'clusters were named before the items were gathered' },
  pyramidStructure: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'the conclusion is not stated first' },

  /* -- Process ----------------------------------------------------------- */
  flowchart: { shape: 'process', intent: 'sequence', avoidWhen: 'there are no branches — a numbered list is clearer' },
  decisionFlow: { shape: 'process', intent: 'sequence', avoidWhen: 'a decision node has only one outcome' },
  swimlane: { shape: 'process', intent: 'sequence', avoidWhen: 'there is only one actor' },
  bpmn: { shape: 'process', intent: 'sequence', avoidWhen: 'the reader does not know BPMN notation' },
  pipeline: { shape: 'process', intent: 'sequence', avoidWhen: 'stages run in parallel and the diagram implies order' },
  valueStream: { shape: 'process', intent: 'sequence', avoidWhen: 'wait times are omitted — they are usually the finding' },
  serviceBlueprint: { shape: 'process', intent: 'sequence', avoidWhen: 'the line of visibility is not drawn' },
  stateDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'a state has no way out' },
  sequenceDiagram: { shape: 'process', intent: 'sequence', avoidWhen: 'lifelines are not the actual participants' },

  /* -- Time -------------------------------------------------------------- */
  timeline: { shape: 'intervals', intent: 'sequence', avoidWhen: 'events have no duration and no order matters' },
  gantt: { shape: 'intervals', intent: 'sequence', avoidWhen: 'dependencies are not drawn — then it is a bar chart of dates' },

  /* -- Software ---------------------------------------------------------- */
  systemContext: { shape: 'graph', intent: 'structure', avoidWhen: 'internal detail leaks into a context view' },
  containerDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'deployment and container concerns are mixed' },
  componentDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'it duplicates the class diagram' },
  deploymentDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'logical structure is being shown, not physical' },
  classDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'every field and method is listed rather than the ones that matter' },
  erDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'cardinality is not marked' },
  moduleGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'cycles are present but not highlighted' },
  controlFlowGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'the function is short enough to read' },
  dataFlowGraph: { shape: 'graph', intent: 'structure', avoidWhen: 'control flow is what is actually being asked about' },
  gitBranchGraph: { shape: 'graph', intent: 'sequence', avoidWhen: 'merge commits are hidden' },
  infrastructureTopology: { shape: 'graph', intent: 'structure', avoidWhen: 'trust boundaries are omitted' },
  threatModel: { shape: 'graph', intent: 'structure', avoidWhen: 'assets are not identified first' },
  testPyramid: { shape: 'hierarchy', intent: 'composition', avoidWhen: 'the proportions are aspirational rather than measured' },

  /* -- Cause and risk ---------------------------------------------------- */
  fishbone: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'the categories were chosen before the causes' },
  causalLoop: { shape: 'graph', intent: 'structure', avoidWhen: 'loop polarity is unmarked — the sign is the content' },
  faultTree: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'the gates are not marked AND or OR' },
  eventTree: { shape: 'hierarchy', intent: 'sequence', avoidWhen: 'branch probabilities do not sum to one' },
  bowTie: { shape: 'graph', intent: 'structure', avoidWhen: 'either causes or consequences are missing' },
  riskHeatMap: { shape: 'matrix', intent: 'compare', avoidWhen: 'likelihood and impact scales are not defined' },
  impactEffort: { shape: 'series', intent: 'compare', avoidWhen: 'placement is opinion presented as measurement' },
  attackTree: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'the attacker goal is not at the root' },
  bayesianNetwork: { shape: 'graph', intent: 'structure', avoidWhen: 'the graph has a cycle — it must be acyclic' },
  influenceDiagram: { shape: 'graph', intent: 'structure', avoidWhen: 'decision and chance nodes are drawn the same' },
  rootCauseTree: { shape: 'hierarchy', intent: 'structure', avoidWhen: 'it stops before reaching something actionable' },
  feedbackLoop: { shape: 'graph', intent: 'structure', avoidWhen: 'the path does not actually return to its start — a chain drawn as a loop claims a self-reinforcement that is not there' },

  /* -- Science and mathematics ------------------------------------------- */
  numberLine: { shape: 'geometry', intent: 'construct', avoidWhen: 'the scale is not marked' },
  coordinatePlane: { shape: 'geometry', intent: 'construct', avoidWhen: 'the axes are not labelled with units' },
  functionGraph: { shape: 'series', intent: 'relationship', avoidWhen: 'the domain shown hides the behaviour being discussed' },
  geometricFigure: { shape: 'geometry', intent: 'construct', avoidWhen: 'the figure is drawn to a scale it is not actually at' },
  vectorDiagram: { shape: 'geometry', intent: 'construct', avoidWhen: 'the frame of reference is unstated' },
  vennDiagram: { shape: 'geometry', intent: 'composition', avoidWhen: 'there are more than three sets' },
  eulerDiagram: { shape: 'geometry', intent: 'composition', avoidWhen: 'every intersection exists — a Venn is then simpler' },
  logicCircuit: { shape: 'geometry', intent: 'construct', avoidWhen: 'gate types are not distinguishable' },
  freeBodyDiagram: { shape: 'geometry', intent: 'construct', avoidWhen: 'the body is not isolated from its surroundings' },
  circuitSchematic: { shape: 'geometry', intent: 'construct', avoidWhen: 'components are unlabelled' },
  molecularStructure: { shape: 'graph', intent: 'structure', avoidWhen: 'bond order is not shown' },
  reactionDiagram: { shape: 'process', intent: 'sequence', avoidWhen: 'the equation is unbalanced' },
  biologicalCycle: { shape: 'graph', intent: 'structure', avoidWhen: 'the cycle does not close' },
  foodWeb: { shape: 'graph', intent: 'structure', avoidWhen: 'arrow direction does not follow energy flow' },
  blockDiagram: { shape: 'process', intent: 'structure', avoidWhen: 'feedback paths are omitted' },
  experimentalSetup: { shape: 'geometry', intent: 'construct', avoidWhen: 'the control condition is not shown' },

  /* -- Logic ------------------------------------------------------------- */
  truthTable: { shape: 'logic', intent: 'structure', avoidWhen: 'there are more than about four inputs' },
  proofTree: { shape: 'logic', intent: 'structure', avoidWhen: 'the rule used at each step is unnamed' },
  derivationTree: { shape: 'logic', intent: 'structure', avoidWhen: 'the grammar is not given' },

  /* -- Tabular ----------------------------------------------------------- */
  table: { shape: 'tabular', intent: 'compare', avoidWhen: 'the reader needs a shape rather than a value' },
  comparisonTable: { shape: 'tabular', intent: 'compare', avoidWhen: 'options differ on so many axes that a table hides the tradeoff' },
} as const satisfies Record<string, Representation>

export type RepresentationName = keyof typeof REPRESENTATIONS

export const REPRESENTATION_NAMES = Object.keys(REPRESENTATIONS) as RepresentationName[]

/** Which shape a named representation needs. */
export function shapeOf(name: RepresentationName): Shape {
  return REPRESENTATIONS[name].shape
}

/** Every named type that a given shape can render. */
export function namesForShape(shape: Shape): RepresentationName[] {
  return REPRESENTATION_NAMES.filter((name) => REPRESENTATIONS[name].shape === shape)
}
