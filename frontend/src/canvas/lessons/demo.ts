import type { Lesson } from '../contract/types'

/* A QUESTION THE ENGINE HAS NEVER SEEN.
 *
 * Written the way a generator would write it: what exists, and how the pieces
 * relate. There is no archetype named here, no column width, no colour, no
 * chart type and no coordinate — the software decides all of it.
 */
export const financialCrisis: Lesson = {
  id: 'financial-crisis-2008',
  question: 'What caused the 2008 financial crisis?',
  elements: [
    {
      id: 'chain',
      kind: 'diagram',
      purpose: 'sequence',
      priority: 'primary',
      title: 'How it unwound',
      payload: {
        nodes: [
          { id: 'rates', label: 'Low interest rates' },
          { id: 'lending', label: 'Subprime lending' },
          { id: 'bundling', label: 'Loans bundled as securities' },
          { id: 'ratings', label: 'Rated AAA' },
          { id: 'default', label: 'Borrowers default' },
          { id: 'seize', label: 'Credit markets seize' },
          { id: 'collapse', label: 'Banks collapse' },
        ],
        edges: [
          { from: 'rates', to: 'lending' },
          { from: 'lending', to: 'bundling' },
          { from: 'bundling', to: 'ratings' },
          { from: 'ratings', to: 'default' },
          { from: 'default', to: 'seize' },
          { from: 'seize', to: 'collapse' },
        ],
      },
    },
    {
      id: 'prices',
      kind: 'chart',
      purpose: 'quantify',
      priority: 'supporting',
      title: 'US house prices',
      payload: {
        intent: 'trend',
        fields: [
          { name: 'year', role: 'x', type: 'temporal' },
          { name: 'index', role: 'y', type: 'quantitative', unit: 'index' },
        ],
        data: [
          { year: 2000, index: 100 }, { year: 2002, index: 122 },
          { year: 2004, index: 152 }, { year: 2006, index: 184 },
          { year: 2008, index: 155 }, { year: 2010, index: 129 },
          { year: 2012, index: 124 },
        ],
      },
    },
    {
      id: 'terms',
      kind: 'table',
      purpose: 'define',
      priority: 'supporting',
      title: 'The instruments',
      payload: {
        columns: [
          { key: 'name', label: 'Instrument', type: 'text' },
          { key: 'what', label: 'What it was', type: 'text' },
          { key: 'risk', label: 'Actual risk', type: 'category' },
        ],
        rows: [
          { name: 'MBS', what: 'Mortgages pooled and sold as a bond', risk: 'High' },
          { name: 'CDO', what: 'MBS re-sliced into risk tranches', risk: 'Very high' },
          { name: 'CDS', what: 'Insurance against a default', risk: 'Unbounded' },
        ],
      },
    },
    {
      id: 'lesson',
      kind: 'text',
      purpose: 'explain',
      priority: 'optional',
      title: 'The part that repeats',
      payload: {
        paragraphs: [
          'Complexity hid risk rather than removing it. Each repackaging made the underlying loans harder to inspect, and the AAA rating told everyone they no longer had to.',
        ],
      },
    },
  ],
}
