/* The board's public surface. Everything outside frontend/src/board imports
 * from here, so the internal file layout stays free to change. */
export { BoardView } from './BoardView'
export { GalleryView } from './GalleryView'
export { validateBoard } from './renderer/validateBoard'
export type {
  LearningBoard,
  BoardSource,
  ValidatedBoard,
  ValidatedBlock,
  UnknownBlockData,
  BoardResult,
  Notice,
  Block,
  BlockType,
  BlockWidth,
  BlockLayout,
  BoardLayoutMode,
  BoardMetadata,
  Connector,
  ConnectorKind,
  ExplanationBlock,
  TextBlock,
  TableBlock,
  CalloutBlock,
  CalloutTone,
  PieChartBlock,
  BarChartBlock,
  LineChartBlock,
  EquationBlock,
  ProcessBlock,
  TimelineBlock,
  ComparisonBlock,
  DiagramBlock,
  ExampleBlock,
  QuizBlock,
  ImageBlock,
  SimulationBlock,
} from './types/learningBoard'
