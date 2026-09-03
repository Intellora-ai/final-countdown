/**
 * THE ONE WAY IN.
 *
 * Seven primitives, not five hundred workflows. I choose which one and how to
 * carry it out; the environment enforces only the shape of the record --
 * question, action, evidence, conclusion. Freedom of reasoning, rigidity of
 * evidence.
 *
 * MOST OF THIS IS NOT BUILT YET, AND SAYS SO. That is the point rather than an
 * apology. A command that answers plausibly when its feature does not exist is
 * the worst thing this tool could do, because an empty answer from something
 * never written is indistinguishable from an empty answer from something that
 * looked and found nothing. One of those is a lie. So an unbuilt command names
 * the phase that will build it and exits non-zero, and nothing it prints can
 * be mistaken for a result.
 */
import { summarise, readStore } from './store.ts'

export interface Command {
  readonly name: string
  readonly takes: string
  readonly does: string
  /** False until the phase that builds it lands. */
  readonly built: boolean
  /** Which phase of the plan builds it. */
  readonly phase: number
}

export const COMMANDS: readonly Command[] = [
  { name: 'status', takes: '', does: 'what the store holds, per system, state, level and status', built: true, phase: 1 },
  { name: 'recall', takes: '<query>', does: 'the smallest set of nodes that could change this decision', built: false, phase: 6 },
  { name: 'why', takes: '<node-id>', does: 'drill from a node down to the source it came from', built: false, phase: 6 },
  { name: 'investigate', takes: '<question>', does: 'the empirical loop: hypotheses, experiment, measurement, falsify', built: false, phase: 4 },
  { name: 'neighbours', takes: '<node-id>', does: 'what this node could be confused with, and how distinct it is', built: false, phase: 5 },
]

export interface Ports {
  readonly dir: string
  readonly say: (line: string) => void
}

/** A count line, padded so a column of them reads as a column. */
function counts(say: (line: string) => void, title: string, of: Readonly<Record<string, number>>): void {
  const shown = Object.entries(of).map(([k, n]) => `${k} ${n}`).join('   ')
  say(`  ${title.padEnd(9)} ${shown}`)
}

function status(ports: Ports): number {
  const store = readStore(ports.dir)
  const seen = summarise(store)

  if (seen.missing) {
    ports.say(`the store is MISSING: ${ports.dir} does not exist.`)
    ports.say('That is a different fault from an empty store, and it is usually a wrong path.')
    return 1
  }

  ports.say(`store: ${store.dir}`)
  ports.say(`  nodes     ${seen.total}`)
  counts(ports.say, 'system', seen.bySystem)
  counts(ports.say, 'state', seen.byState)
  counts(ports.say, 'level', seen.byLevel)
  counts(ports.say, 'status', seen.byStatus)

  if (seen.faults > 0) {
    ports.say('')
    ports.say(`${seen.faults} file(s) could not be read, and are named here rather than skipped:`)
    for (const fault of store.faults) ports.say(`  ${fault.path}: ${fault.why}`)
  }

  if (seen.empty) {
    ports.say('')
    ports.say('the store is EMPTY. Nothing to check is not a pass -- see `gate:knowledge`,')
    ports.say('which printed "0 file(s) ... PASS" against the wrong directory once.')
    return 1
  }
  return seen.faults > 0 ? 1 : 0
}

function notBuilt(ports: Ports, command: Command): number {
  ports.say(`${command.name} is NOT BUILT yet -- phase ${command.phase} builds it.`)
  ports.say(`When it exists it will: ${command.does}.`)
  ports.say('Nothing is returned, deliberately: an empty answer from a feature that was')
  ports.say('never written cannot be told apart from one that looked and found nothing.')
  return 1
}

function usage(ports: Ports): number {
  ports.say('cto -- the engineering environment this repo is built in.')
  ports.say('')
  for (const command of COMMANDS) {
    const mark = command.built ? ' ' : `(phase ${command.phase})`
    ports.say(`  cto ${`${command.name} ${command.takes}`.trim().padEnd(24)} ${command.does} ${mark}`)
  }
  return 1
}

export function run(argv: readonly string[], ports: Ports): number {
  const [name] = argv
  if (name === undefined || name === '') return usage(ports)

  const command = COMMANDS.find((c) => c.name === name)
  if (command === undefined) {
    ports.say(`unknown command: ${name}`)
    return usage(ports)
  }
  if (!command.built) return notBuilt(ports, command)
  if (command.name === 'status') return status(ports)

  /* Unreachable while every built command is handled above. Kept because the
     alternative is a silent 0 for a command somebody adds to the table and
     forgets to wire, which is exactly the failure this file is about. */
  ports.say(`${command.name} is declared as built but nothing handles it.`)
  return 1
}
