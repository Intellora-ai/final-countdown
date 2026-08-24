import type { Block } from '../spec/spec'

export type TableBlock = Extract<Block, { kind: 'table' }>
type Column = TableBlock['columns'][number]
type ColumnType = Column['type']

/**
 * Tables.
 *
 * ALIGNMENT IS THE RENDERER'S, NOT THE AUTHOR'S
 * ---------------------------------------------
 * The spec has no `align` field on purpose, so alignment is derived from the
 * column's TYPE: numbers, percents and currency go right with tabular figures
 * so their digits stack into a readable column; text goes left. An author who
 * could align a column would eventually align two of them differently for the
 * same kind of number, and the table would stop being scannable.
 *
 * A BLANK CELL IS A DIFFERENT CLAIM FROM AN EMPTY ONE
 * ---------------------------------------------------
 * A missing key, a `null`, a non-finite number and a whitespace-only string all
 * render as an em dash, never as blank and never as the string "undefined".
 * Blank in a numeric column reads as zero, and zero is a measurement — exactly
 * the claim the data is refusing to make. The cell also carries an aria-label so
 * a screen reader hears "no value" rather than "em dash".
 *
 * LONG TABLES SCROLL; THEY DO NOT SHRINK
 * --------------------------------------
 * The spec allows 200 rows. `.lc-table-wrap` is a bounded, scrollable region and
 * `.lc-table th` is sticky inside it, so the header stays put while the body
 * moves and every word keeps its designed size. "Make the text smaller so it
 * fits" is not a layout decision, it is a decision to make the table unreadable.
 * The row count is stated above the region so a reader knows what they are
 * scrolling through before they start.
 *
 * Everything visual comes from `canvas.css`, which is written entirely in the
 * custom properties `tokens.ts` publishes — so there is not a raw colour, size
 * or space in this file to drift away from the design system.
 *
 * Title and caption are rendered by `BlockView`, not here.
 */

const NUMERIC: ReadonlySet<ColumnType> = new Set<ColumnType>(['number', 'percent', 'currency'])

/** Stands for "the data does not say", and nothing else. */
const NO_VALUE = '—'

/**
 * The spec carries no currency field, so the renderer has to choose one — and
 * choosing silently in four places is how a table ends up mixing symbols. It is
 * stated once, here, and this is the single line to change.
 */
const CURRENCY = 'USD'

const NUMBER_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const PERCENT_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const CURRENCY_FORMAT = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: CURRENCY,
})

/**
 * Where grouped digits stop helping and start hiding the number.
 *
 * 6.02e23 formatted with separators is `602,000,000,000,000,000,000,000` — 30
 * characters of noise that nobody reads and that drags the column wide enough to
 * crush every other column in the table. A reader wants "6.02e+23".
 *
 * 1e6 is the line because `BlockView.formatNumber` already uses it. The number
 * that matters here is not the threshold itself but the fact that there is only
 * ONE: the same quantity has to render identically whether it lands in a metric
 * block or a table cell, and two renderers each picking a sensible-looking
 * cutoff is exactly how a page turns into two products stacked.
 *
 * The lower bound is the same defect mirrored. `maximumFractionDigits: 2` prints
 * 0.00003 as "0", and a measurement displayed as zero is a claim the data never
 * made — the same reason a missing cell here is an em dash and not a blank.
 */
const SCIENTIFIC_AT_OR_ABOVE = 1e6
const SCIENTIFIC_BELOW = 1e-4

/** The currency's symbol, so scientific notation does not drop it. */
const CURRENCY_SYMBOL =
  CURRENCY_FORMAT.formatToParts(1).find((part) => part.type === 'currency')?.value ?? ''

function needsScientific(value: number): boolean {
  const magnitude = Math.abs(value)
  return magnitude >= SCIENTIFIC_AT_OR_ABOVE || (magnitude > 0 && magnitude < SCIENTIFIC_BELOW)
}

/** Three significant figures, matching `BlockView.formatNumber`. */
function scientific(value: number): string {
  return value.toExponential(2)
}

interface Cell {
  text: string
  /** True when the data declined to say, as opposed to saying a value. */
  missing: boolean
}

export function TableView({ block }: { block: TableBlock }) {
  const rowCount = block.rows.length
  const rowNoun = rowCount === 1 ? 'row' : 'rows'

  return (
    <>
      <p className="lc-caption">
        {rowCount} {rowNoun}
      </p>

      {/* `tabIndex` makes the scroll region reachable by keyboard — a bounded
          scroller that only a mouse can move hides rows from half its readers. */}
      <div
        className="lc-table-wrap"
        role="region"
        tabIndex={0}
        aria-label={`${block.title ?? 'Table'}, ${rowCount} ${rowNoun}, scrollable`}
      >
        <table className="lc-table">
          {/* A real <caption> names the table for assistive technology. It is
              hidden visually because BlockView already shows the title. */}
          <caption className="lc-sr-only">
            {block.title ?? 'Table'} — {rowCount} {rowNoun}
          </caption>

          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column.key} scope="col" data-numeric={NUMERIC.has(column.type)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Rows carry no id, and position IS their identity here: the spec
                orders them and nothing reorders them afterwards. */}
            {block.rows.map((row, index) => (
              <tr key={index}>
                {block.columns.map((column) => {
                  const cell = formatCell(row[column.key], column.type)
                  return (
                    <td
                      key={column.key}
                      data-numeric={NUMERIC.has(column.type)}
                      aria-label={cell.missing ? 'no value' : undefined}
                    >
                      {cell.missing ? (
                        <span className="lc-table__empty" aria-hidden>
                          {cell.text}
                        </span>
                      ) : (
                        cell.text
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * Format by column TYPE.
 *
 * `percent` treats the number as already being in percentage points — 12.5
 * renders as "12.5%", not "1250%". The spec has no field that says which
 * convention a column uses, so one had to be picked; this is the one authors
 * actually write, and stating it here is better than each caller guessing.
 *
 * A string in a numeric column is passed through untouched. Coercing it would
 * print "NaN", which is a number nobody wrote — and 'n/a' or '<0.01' are things
 * an author legitimately means.
 */
export function formatCell(value: string | number | null | undefined, type: ColumnType): Cell {
  if (value === null || value === undefined) return { text: NO_VALUE, missing: true }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? { text: NO_VALUE, missing: true } : { text: trimmed, missing: false }
  }

  /* NaN and Infinity are the shape of a failed calculation upstream. Printing
     them as numbers would dress a bug up as a measurement. */
  if (!Number.isFinite(value)) return { text: NO_VALUE, missing: true }

  const huge = needsScientific(value)

  if (type === 'currency') {
    /* Built from the parts rather than `notation: 'scientific'` so the exponent
       reads the same in every column: "$-6.02e+23" would be wrong, so the sign
       leads and the symbol sits against the digits. */
    const text = huge
      ? `${value < 0 ? '-' : ''}${CURRENCY_SYMBOL}${scientific(Math.abs(value))}`
      : CURRENCY_FORMAT.format(value)
    return { text, missing: false }
  }

  if (type === 'percent') {
    return { text: `${huge ? scientific(value) : PERCENT_FORMAT.format(value)}%`, missing: false }
  }

  if (type === 'number') {
    return { text: huge ? scientific(value) : NUMBER_FORMAT.format(value), missing: false }
  }

  /* A number in a column the author declared TEXT: shown as written, because
     grouping separators would be the renderer overriding a stated intent. */
  return { text: String(value), missing: false }
}
