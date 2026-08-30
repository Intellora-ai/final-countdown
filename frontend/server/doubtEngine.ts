/**
 * THE DOUBT ENGINE BRIDGE — one implementation, two callers.
 *
 * WHY THIS MOVED OUT OF `vite-plugin-engine.ts`
 * ---------------------------------------------
 * That file's own docstring said "this repository contains no HTTP server
 * anywhere — measured, not assumed", and on that measurement it attached the
 * route to the dev server instead. The measurement has stopped being true:
 * `frontend/server/index.ts` is a real Node server that holds the model key and
 * already serves `/api/lesson`, `/api/ask`, `/api/search`, `/api/day` and
 * `/api/done`. What it did not serve was this route, so `/api/doubt` existed
 * under `vite dev` and 404'd everywhere else.
 *
 * So the bridge lives here, beside that server, and the Vite plugin imports it.
 * The direction matters: the deployed server owns the bridge and the dev
 * middleware is an adapter onto it. The alternative — copying `askEngine` into
 * the server — is two implementations of one status map, which drift the first
 * time either is touched and give a product that behaves one way on a laptop
 * and another way deployed. That is the exact class of bug this move closes.
 *
 * NOTHING IN THE BEHAVIOUR CHANGED. This is a move: same functions, same status
 * map, same numbers. `vite-plugin-engine.test.ts` still imports `askEngine`,
 * `interpreterFor` and `ENGINE_PYTHON_ENV` through the plugin and still passes,
 * unedited, which is what proves the move was a move.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

/**
 * Points the bridge at a specific interpreter.
 *
 * For anyone running the engine from conda, pyenv, a container, or a layout
 * this file's discovery does not anticipate. An escape hatch that is not
 * "edit the config" is what stops somebody editing the config.
 */
export const ENGINE_PYTHON_ENV = 'LEARNING_OS_PYTHON'

/**
 * Long enough for a model call, short enough that a wedged child does not hold
 * a learner's question open forever.
 */
const TIMEOUT_MS = 60_000

/** A question is a sentence. Anything larger is not a question. */
const MAX_DOUBT_BODY_BYTES = 8_000

export interface DoubtEngineOptions {
  /** Repository root, so the engine can be found relative to it. */
  readonly root?: string
  /** Overrides the interpreter. Defaults to the venv, then to `python3`. */
  readonly python?: string
}

/**
 * Which interpreter to run.
 *
 * THE ENGINE'S OWN VENV FIRST, AND THAT ORDER IS THE FIX FOR A REAL BUG.
 *
 * This originally reached for `<root>/.venv` because that is what `make
 * bootstrap` creates. That venv belongs to the AXLE and gate work and does not
 * contain `pydantic`; the engine pins its dependencies separately in
 * `learning-os/requirements-learning-os.lock`. So every request came back as a
 * `ModuleNotFoundError` traceback inside a 502, which reads as the engine being
 * broken rather than as the wrong python being picked.
 *
 * Order: an explicit argument, then `LEARNING_OS_PYTHON`, then the engine's own
 * venv, then the repository venv, then whatever is on PATH. Falls back rather
 * than failing at each step, so an unusual layout still works and the error --
 * when there is one -- comes from actually trying.
 */
export function interpreterFor(root: string, override?: string): string {
  if (override) return override

  const fromEnv = process.env[ENGINE_PYTHON_ENV]
  if (fromEnv) return fromEnv

  for (const candidate of ['learning-os/.venv/bin/python3', '.venv/bin/python3']) {
    const full = resolvePath(root, candidate)
    if (existsSync(full)) return full
  }
  return 'python3'
}

/**
 * Turn a child's stderr into something a person can act on.
 *
 * A raw traceback is technically complete and practically useless: the reader
 * has to know the repository layout to work out that the wrong venv was chosen.
 * The missing-module case is by far the most common and the most fixable, so it
 * is named specifically and everything else is passed through.
 */
export function explainStderr(stderr: string, python: string): string {
  const missing = /No module named '([^']+)'/.exec(stderr)
  if (missing) {
    const name = missing[1]
    return (
      `the engine could not start: ${python} has no '${name}'. The engine pins ` +
      `its own dependencies in learning-os/requirements-learning-os.lock, which ` +
      `is a different set from the repository venv. Create one for it:  ` +
      `python3 -m venv learning-os/.venv && learning-os/.venv/bin/pip install ` +
      `-r learning-os/requirements-learning-os.lock`
    )
  }
  return `the engine exited without answering. ${stderr.slice(0, 400)}`
}

export interface EngineReply {
  readonly status: number
  readonly body: string
}

/**
 * Run one doubt through the engine and return what to send back.
 *
 * Exported so the whole path is testable without a dev server, a socket or a
 * browser. Never throws: every failure becomes a status and a JSON document,
 * because the caller renders whatever it gets and an exception here reaches a
 * learner as a blank panel.
 */
export async function askEngine(
  requestBody: string,
  options: DoubtEngineOptions = {},
): Promise<EngineReply> {
  const root = options.root ?? process.cwd()
  const python = interpreterFor(root, options.python)
  const engineRoot = resolvePath(root, 'learning-os')

  if (Buffer.byteLength(requestBody) > MAX_DOUBT_BODY_BYTES) {
    return {
      status: 413,
      body: JSON.stringify({ outcome: 'bad_request', refusal: 'that question is too long' }),
    }
  }

  return await new Promise<EngineReply>((settle) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(python, ['-m', 'learning_os.api.ask'], {
        cwd: engineRoot,
        /* `shell: false` stated rather than left to the default. The question is
           text a learner typed; it reaches the child on stdin and never touches
           a command line, and restoring a shell here would put it back on one. */
        shell: false,
        env: {
          ...process.env,
          /* The package is not installed — `tests/test_supply_chain.py` refuses
             any pip install that is not `--require-hashes -r <lock>`, which
             rules out `pip install -e .`. So `src` goes on the path, exactly as
             the CI job does it. */
          PYTHONPATH: resolvePath(engineRoot, 'src'),
          /* The fake hashes its contract; an unpinned seed would make the same
             question produce different skeleton prose between reloads. */
          PYTHONHASHSEED: '0',
        },
      })
    } catch (error) {
      settle(unavailable(python, error, engineRoot))
      return
    }

    let out = ''
    let err = ''
    let done = false

    const finish = (reply: EngineReply): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      settle(reply)
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({
        status: 504,
        body: JSON.stringify({
          outcome: 'unavailable',
          refusal: 'the engine took too long to answer',
        }),
      })
    }, TIMEOUT_MS)

    child.stdout?.on('data', (chunk) => {
      out += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      err += String(chunk)
    })

    child.on('error', (error) => {
      finish(unavailable(python, error, engineRoot))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        /* stderr is kept, read, and returned. A non-zero engine that reported
           nothing is the hardest failure to diagnose from a browser; a non-zero
           engine that returned a raw traceback is only slightly better.
           `explainStderr` names the fixable case. */
        finish({
          status: 502,
          body: JSON.stringify({
            outcome: 'engine_error',
            refusal: explainStderr(err, python),
            detail: err.slice(0, 600),
          }),
        })
        return
      }
      try {
        JSON.parse(out)
      } catch {
        finish({
          status: 502,
          body: JSON.stringify({
            outcome: 'engine_error',
            refusal: 'the engine returned something that is not JSON',
            detail: out.slice(0, 300),
          }),
        })
        return
      }
      finish({ status: 200, body: out })
    })

    child.stdin?.end(requestBody)
  })
}

function unavailable(python: string, error: unknown, engineRoot?: string): EngineReply {
  const detail = error instanceof Error ? error.message : String(error)

  /* Two different causes produce the same ENOENT and they need different fixes.
     Checking which one is actually absent is cheap and turns "could not start
     the engine" into a sentence naming the thing to create. */
  const missingRoot = engineRoot !== undefined && !existsSync(engineRoot)
  const refusal = missingRoot
    ? `could not start the engine: ${engineRoot} does not exist, so there is nothing to run.`
    : `could not start the engine (${python}): ${detail}. If the interpreter is ` +
      `missing, create one for the engine:  python3 -m venv learning-os/.venv && ` +
      `learning-os/.venv/bin/pip install -r learning-os/requirements-learning-os.lock`

  return {
    status: 503,
    body: JSON.stringify({ outcome: 'unavailable', refusal }),
  }
}



/**
 * The engine as a `DoubtPort` for `server/handler.ts`.
 *
 * The handler takes ports rather than processes so every error path is testable
 * without an interpreter. This is the one real implementation of that port; the
 * tests inject their own.
 */
export function doubtPort(options: DoubtEngineOptions = {}): {
  ask(request: string): Promise<EngineReply>
} {
  return {
    ask(request: string): Promise<EngineReply> {
      return askEngine(request, options)
    },
  }
}
