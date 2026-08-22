import type { BoardSource } from '../types/learningBoard'

/* BROKEN CONNECTORS — the four ways a stated relationship fails.
 *
 * A connector is a claim that two blocks are related in a particular way. When
 * the claim cannot be checked — one end does not exist, an end is missing
 * entirely, the kind is not one the board understands — the relationship is
 * removed and the removal is announced. Drawing a line to nowhere would be
 * worse than drawing no line, because a learner reads a line as an assertion.
 *
 * The three blocks themselves are valid and survive intact. Only the claims
 * about them are repaired, which is the distinction this fixture exists to
 * show: content and the relationships between content fail independently.
 *
 * Expected: status 'repaired'. One connector survives, downgraded.
 */
export const BROKEN_CONNECTORS_BOARD: BoardSource = {
  type: 'learning_board',
  version: 1,
  id: 'board-broken-connectors',
  title: 'Relationships that could not be kept',
  subtitle: 'The blocks are fine; the lines between them are not',
  layout: 'grid',
  blocks: [
    {
      id: 'bc-cause',
      type: 'explanation',
      title: 'The cause',
      content: 'Warm air holds more water vapour than cold air. This block is valid and is not affected by anything below.',
    },
    {
      id: 'bc-effect',
      type: 'explanation',
      title: 'The effect',
      content: 'As air cools, it reaches a temperature where it can no longer hold what it carries, and the surplus condenses.',
    },
    {
      id: 'bc-aside',
      type: 'callout',
      tone: 'note',
      content: 'Both explanations survived. Every notice on this board is about a relationship, not about content.',
    },
  ],
  connectors: [
    /* Points at a block that does not exist: removed, and the notice names
     * both ends so the author can see which claim was dropped. */
    { id: 'bc-1', from: 'bc-cause', to: 'bc-nonexistent', kind: 'causal', label: 'leads to' },
    /* Missing 'to' entirely: a relationship needs two ends. */
    { id: 'bc-2', from: 'bc-cause', kind: 'sequence' },
    /* Carries a field the connector schema has no place for: refused rather
     * than stripped, on the same rule that governs blocks. */
    { id: 'bc-3', from: 'bc-cause', to: 'bc-effect', kind: 'causal', colour: 'red' },
    /* An unrecognised kind: the relationship is real, so it survives — shown
     * as a plain reference rather than claiming a kind nothing understands. */
    { id: 'bc-4', from: 'bc-cause', to: 'bc-effect', kind: 'quantum-entanglement', label: 'related somehow' },
  ],
  metadata: { source: 'fixture' },
}
