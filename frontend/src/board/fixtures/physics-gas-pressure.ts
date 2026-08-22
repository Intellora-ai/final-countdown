import type { LearningBoard } from '../types/learningBoard'

/* SIMULATION — the one live control, and the conditions it holds under.
 *
 * The particle box shows pressure proportional to temperature, which is true
 * only at constant volume with a fixed amount of gas. The board says so twice:
 * once in the callout the learner reads, once in the caption the component
 * itself renders. Kelvin is not a preference — P ∝ T is false in Celsius, and
 * the validator refuses any other unit.
 */
export const PHYSICS_GAS_PRESSURE_BOARD: LearningBoard = {
  type: 'learning_board',
  version: 1,
  id: 'board-physics-gas-pressure',
  title: 'Why a sealed can bursts in a fire',
  subtitle: 'Pressure and temperature in a fixed volume',
  layout: 'grid',
  blocks: [
    {
      id: 'gas-intro',
      type: 'explanation',
      title: 'Pressure is collisions, counted',
      content:
        'Gas pressure is not a substance pushing outward. It is the sum of countless particle collisions with the container walls — how often they hit, and how hard.\n\nHeating the gas gives every particle more kinetic energy. They move faster, so they strike the walls more often and with more force. The container has not changed; the collisions have.',
      layout: { width: 'medium' },
    },
    {
      id: 'gas-sim',
      type: 'simulation',
      eyebrow: 'MOVE THE SLIDER',
      title: 'A sealed box of gas',
      layout: { width: 'medium' },
      kind: 'particle-box',
      unit: 'K',
      minTemp: 200,
      maxTemp: 600,
      initialTemp: 300,
    },
    {
      id: 'gas-callout',
      type: 'callout',
      tone: 'warning',
      layout: { width: 'wide' },
      content:
        'This relationship holds only while the volume and the amount of gas stay fixed. Let the container expand and pressure can fall while temperature rises. A sealed can cannot expand, which is exactly why it fails.',
    },
  ],
  connectors: [
    { id: 'c1', from: 'gas-intro', to: 'gas-sim', kind: 'reference', label: 'shown here' },
  ],
  metadata: { source: 'fixture' },
}
