/**
 * THE RISK ROUTER. A diff -> a tier, a reason, and the decisions it touches.
 *
 * Speed is a first-class invariant: a gate people bypass is a failed gate. So a
 * README change is LOW and runs only the contract self-test; a change under a
 * decision's own machinery is MEDIUM (contract + known-bad corpus); a change to
 * a decision's identity site, or anything whose path smells of the bug classes
 * this engine exists for (cache, lookup, identity, routing, dedup, normalise,
 * fallback, alias, memoise, concurrency), is HIGH and runs the full semantic
 * attack.
 *
 * This pass keys off touched paths -- a deliberately simple, decision-AWARE
 * interface (it names the affected decision) whose internals can grow into
 * symbol-level analysis later without changing the gate around it.
 */

/**
 * @param {string[]} changed  repo-relative changed file paths (from git diff)
 * @param {object} policy     assurance/policies/risk.json
 * @returns {{tier: 'LOW'|'MEDIUM'|'HIGH', reason: string, affected_decisions: string[]}}
 */
export function classifyRisk(changed, policy) {
  const files = Array.isArray(changed) ? changed : []
  const decisionPaths = Array.isArray(policy?.decision_paths) ? policy.decision_paths : []
  const keywords = Array.isArray(policy?.high_risk_keywords) ? policy.high_risk_keywords : []
  const mediumPaths = Array.isArray(policy?.medium_risk_paths) ? policy.medium_risk_paths : []

  const affected = new Set()
  const reasons = []

  // HIGH-A: a change to a decision's declared identity/machinery site.
  for (const { pattern, decision } of decisionPaths) {
    const hit = files.find((f) => f.includes(pattern))
    if (hit !== undefined) { affected.add(decision); reasons.push(`${hit} touches ${decision}`) }
  }
  // HIGH-B: a path that smells of the bug classes, even without a known decision.
  const keywordHit = files.find((f) => keywords.some((k) => f.toLowerCase().includes(k)))
  if (keywordHit !== undefined) reasons.push(`${keywordHit} matches a high-risk keyword`)

  if (affected.size > 0 || keywordHit !== undefined) {
    return { tier: 'HIGH', reason: reasons.join('; '), affected_decisions: [...affected] }
  }

  // MEDIUM: inside a decision's neighbourhood, but not its identity site.
  const mediumHit = files.find((f) => mediumPaths.some((p) => f.includes(p)))
  if (mediumHit !== undefined) {
    return { tier: 'MEDIUM', reason: `${mediumHit} is near a decision's machinery`, affected_decisions: [] }
  }

  // LOW: nothing that can move a decision.
  return { tier: 'LOW', reason: files.length === 0 ? 'no changes' : 'no decision-relevant paths changed', affected_decisions: [] }
}
