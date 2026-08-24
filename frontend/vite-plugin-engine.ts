import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import type { Plugin } from 'vite'

/**
 * The bridge between the canvas and the Python engine.
 *
 * WHY THIS IS A VITE PLUGIN AND NOT A SERVER
 * ------------------------------------------
 * This repository contains no HTTP server anywhere — measured, not assumed.
 * Adding one means a framework, a port, a process to supervise, and a
 * deployment story, all to move one JSON document between two languages that
 * are already on the same machine. The dev server is already running, already
 * listening, and already dies when the developer stops working. Attaching one
 * route to it costs nothing and adds no dependency.
 *
 * WHAT THAT DELIBERATELY DOES NOT COVER
 * -------------------------------------
 * A production build. `vite build` produces static files and this middleware is
 * not among them, so a deployed canvas has the lesson rung and the web rung and
 * no engine rung. That is a real limit and it is stated here rather than
 * discovered later: making the engine reachable in production is a hosting
 * decision — where Python runs, who pays for it, what holds the key — and it
 * is not one a build plugin gets to make quietly.
 *
 * WHY THE KEY IS SAFE HERE AND WOULD NOT BE IN THE BROWSER
 * --------------------------------------------------------
 * The subprocess inherits this process's environment. `LEARNING_OS_GEMINI_API_KEY`
 * therefore reaches the engine without ever being sent to a browser, which is
 * the entire reason the model rung has to sit behind something server-side. A
 * key shipped to a page is a key you have published.
 *
 * WHY THE CHILD IS SPAWNED WITH AN ARGUMENT LIST AND NO SHELL
 * -----------------------------------------------------------
 * The question is text a learner typed. It goes to the child on STDIN, never as
 * an argument and never through a shell, so there is no interpolation anywhere
 * for it to escape from. `shell: false` is the default and is stated explicitly
 * below so nobody restores it while adding a flag.
 */

/** The one route. Relative, so it cannot leak a key it never has. */
export const ENDPOINT = '/api/doubt'

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
const MAX_BODY_BYTES = 8_000

export interface EnginePluginOptions {
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
  options: EnginePluginOptions = {},
): Promise<EngineReply> {
  const root = options.root ?? process.cwd()
  const python = interpreterFor(root, options.python)
  const engineRoot = resolvePath(root, 'learning-os')

  if (Buffer.byteLength(requestBody) > MAX_BODY_BYTES) {
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
 * Attach the route to the dev server.
 *
 * `configureServer` only — deliberately no `configurePreviewServer`. `vite
 * preview` serves the production build, and pretending the engine is present
 * there would make a build behave one way locally and another way deployed,
 * which is worse than it plainly being absent in both.
 */
export function enginePlugin(options: EnginePluginOptions = {}): Plugin {
  return {
    name: 'learning-os-engine',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        let aborted = false

        request.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BODY_BYTES) {
            aborted = true
            response.statusCode = 413
            response.setHeader('content-type', 'application/json')
            response.end(
              JSON.stringify({ outcome: 'bad_request', refusal: 'that question is too long' }),
            )
            request.destroy()
            return
          }
          chunks.push(chunk)
        })

        request.on('end', () => {
          if (aborted) return
          void askEngine(Buffer.concat(chunks).toString('utf8'), {
            root: options.root ?? resolvePath(server.config.root, '..'),
            ...(options.python === undefined ? {} : { python: options.python }),
          }).then((reply) => {
            response.statusCode = reply.status
            response.setHeader('content-type', 'application/json')
            response.end(reply.body)
          })
        })
      })
    },
  }
}
