/* THE AGABI VISUAL LANGUAGE, as components.
 *
 * Everything a second lesson needs in order to look like the first. Before
 * this, all of it lived inside GasPressureScene.tsx as local functions and
 * .sc-* CSS classes, which meant the design language was something one route
 * had rather than something the product owned.
 *
 * A new lesson imports from here and inherits the panel surface, the numbered
 * heading, the annotation face, the arrow geometry and the node shape without
 * knowing any of their values.
 */
export { PanelSurface, type PanelTone, type PanelSurfaceProps } from './PanelSurface'
export { SectionHeading, Badge, type SectionHeadingProps } from './SectionHeading'
export { SceneLabel, type SceneLabelProps } from './SceneLabel'
export {
  RelationArrow, ArrowHead, relationPath,
  type RelationKind, type RelationArrowProps, type Point,
} from './RelationArrow'
export { DiagramNode, type DiagramNodeProps } from './DiagramNode'
