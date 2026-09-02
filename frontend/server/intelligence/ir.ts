/**
 * THE LEARNING ACTION IR -- the only shape an intelligence may hand the canvas.
 *
 * Every action says WHY. Every action carries a RISK the verifier reads:
 * 0 = deterministic checks are enough, 1 = a claim about the world that needs
 * a source, 2 = a stated number, a derivation or a dated fact. The tiers are
 * set honestly by the intelligence that proposes and never lowered by anyone
 * downstream. `payload` is what the canvas adapter turns into an artifact.
 */
import { z } from 'zod'

const ACTION_KINDS = ['explain', 'diagnose', 'ask', 'practice', 'represent', 'retrieve', 'defer', 'unknown'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export const learningAction = z
  .object({
    kind: z.enum(ACTION_KINDS),
    because: z.string().min(1),
    risk: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    evidence: z.array(z.string()),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type LearningAction = z.infer<typeof learningAction>
