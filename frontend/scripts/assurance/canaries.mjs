/**
 * ATTACK F -- THE DEPLOYMENT-PRESERVATION CANARY.
 *
 * The cloud layer's unique question is NOT "is the code correct" (CI answered
 * that) but "did DEPLOYMENT preserve the semantics that passed CI?" A build,
 * a bundle, an import order, a packaging step can change behaviour the source
 * never did. So the canary issues a handful of requests that differ only along
 * an identity dimension and checks the deployed system still tells them apart.
 *
 * `ask(canary, subject) -> servedArtifactId | null` is injected: in-process
 * against the real handler for the law here (using `canary.asked`), or a real
 * `fetch` against a deployed base URL post-deploy (using `canary.phrasing`).
 * The engine does not care which.
 */

/**
 * @param {{decision: string, subject: string, canaries: {name: string, asked: string, phrasing: string}[]}} spec
 * @param {(canary: object, subject: string) => Promise<string|null>} ask
 * @returns {Promise<{served: Record<string,string|null>, violations: object[]}>}
 */
export async function runCanaries(spec, ask) {
  const served = {}
  for (const c of spec.canaries) served[c.name] = await ask(c, spec.subject)

  const violations = []
  const names = spec.canaries.map((c) => c.name)
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = served[names[i]]
      const b = served[names[j]]
      // A collapse: two identity-distinct asks served ONE artifact. null means
      // the writer was asked (a legitimate miss), not a collapse.
      if (a !== null && b !== null && a === b) {
        violations.push({ decision: spec.decision, a: names[i], b: names[j], artifact: a, reason: 'deployment collapsed two identity-distinct asks onto one artifact' })
      }
    }
  }
  return { served, violations }
}
