import type { LearningBoard } from '../types/learningBoard'

/* TABLE-HEAVY — three tables carrying the lesson, not decorating it.
 *
 * Every row is a real measured value, and the point of the board is the
 * comparison BETWEEN the tables: the same elements, three properties, one
 * direction of change. Rows are rectangular; the validator would pad a ragged
 * one and say so, and a fixture that needed padding would not be teaching.
 */
export const CHEMISTRY_PERIODIC_TRENDS_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-chemistry-periodic-trends',
  title: 'Reading a period across the table',
  subtitle: 'Three properties, one direction',
  layout: 'grid',
  blocks: [
    {
      id: 'trends-intro',
      type: 'explanation',
      title: 'Left to right, the nucleus wins',
      content:
        'Moving across period 3, each element adds one proton and one electron. The added electron goes into the same shell, so it is barely any further from the nucleus — but the extra proton pulls on every electron already there.\n\nThe result is a tug-of-war the nucleus keeps winning: atoms get smaller, and their electrons get harder to remove.',
      layout: { width: 'wide' },
    },
    {
      id: 'trends-radius',
      type: 'table',
      eyebrow: 'PROPERTY 1',
      title: 'Atomic radius shrinks',
      layout: { width: 'medium' },
      columns: ['Element', 'Protons', 'Radius (pm)'],
      rows: [
        ['Na', 11, 186],
        ['Mg', 12, 160],
        ['Al', 13, 143],
        ['Si', 14, 118],
        ['P', 15, 110],
        ['S', 16, 104],
        ['Cl', 17, 99],
      ],
    },
    {
      id: 'trends-ionisation',
      type: 'table',
      eyebrow: 'PROPERTY 2',
      title: 'First ionisation energy rises',
      layout: { width: 'medium' },
      columns: ['Element', 'Energy (kJ/mol)', 'Trend'],
      rows: [
        ['Na', 496, 'lowest'],
        ['Mg', 738, 'rising'],
        ['Al', 578, 'dips'],
        ['Si', 787, 'rising'],
        ['P', 1012, 'rising'],
        ['S', 1000, 'dips'],
        ['Cl', 1251, 'highest'],
      ],
    },
    {
      id: 'trends-character',
      type: 'table',
      eyebrow: 'PROPERTY 3',
      title: 'Metal gives way to non-metal',
      layout: { width: 'wide' },
      columns: ['Element', 'Character', 'Oxide in water'],
      rows: [
        ['Na', 'metal', 'strongly basic'],
        ['Mg', 'metal', 'weakly basic'],
        ['Al', 'metalloid-like', 'amphoteric'],
        ['Si', 'metalloid', 'insoluble, weakly acidic'],
        ['P', 'non-metal', 'acidic'],
        ['S', 'non-metal', 'strongly acidic'],
        ['Cl', 'non-metal', 'strongly acidic'],
      ],
    },
    {
      id: 'trends-callout',
      type: 'callout',
      tone: 'note',
      layout: { width: 'wide' },
      content:
        'The two dips in ionisation energy — at aluminium and at sulfur — are not noise. They are where a new sub-shell begins and where electrons first pair up, and a trend line drawn straight through them would hide the structure that causes them.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'trends-radius', to: 'trends-ionisation', kind: 'causal', label: 'smaller atom, tighter hold' },
  ],
  metadata: { source: 'fixture' },
}
