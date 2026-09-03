/**
 * ATTACK B -- THE EQUIVALENCE DETECTOR (runtime, the deterministic authority).
 *
 * For each distinguishing pair the contract marks `differ: true` -- two
 * requests that a collapsed identity would treat as EQUAL but the contract
 * treats as DIFFERENT -- seed the decision's store for member `a`, issue member
 * `b`, and see which artifact is served. A REUSE of a's artifact for b is a
 * proven equivalence violation: the decision has thrown away information that
 * mattered. This is the exact shape of the shelf bug.
 *
 * Generic on purpose: the pairs and identity come from the contract; the driver
 * knows how to seed and ask for one specific decision. Adding a decision is a
 * contract plus a driver, never a change here.
 *
 * `differ: false` pairs are controls, not run here: they are semantically
 * identical, so serving one artifact for both is correct, and asserting a
 * difference would be crying wolf. The live-clean result (no violations on real
 * code, which exercises the real lookup) is the control that the detector is
 * not simply always-null.
 */

export async function equivalence(contract, driver, env) {
  const violations = []
  const pairs = Array.isArray(contract?.distinguishing_pairs) ? contract.distinguishing_pairs : []
  for (const pair of pairs) {
    if (pair?.differ !== true) continue
    await driver.reset(env)
    const seededId = await driver.seed(env, pair.a)
    const served = await driver.ask(env, pair.b, seededId)
    if (served !== null && served === seededId) {
      violations.push({
        decision: contract.decision,
        pair,
        seededId,
        served,
        reason: 'reused one artifact for a semantically different request (equivalence collapse)',
      })
    }
  }
  return violations
}
