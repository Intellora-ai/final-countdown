/* The board's public surface. Everything outside frontend/src/board imports
 * from here, so the internal file layout stays free to change. */
export { BoardView } from './BoardView'
export type {
  LearningBoard,
  Block,
  BlockType,
  BlockWidth,
  BlockLayout,
  BoardLayoutMode,
  BoardMetadata,
  Connector,
  ExplanationBlock,
  TableBlock,
  CalloutBlock,
  CalloutTone,
} from './types/learningBoard'
