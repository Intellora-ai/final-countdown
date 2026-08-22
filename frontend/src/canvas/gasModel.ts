import type { BoardModel } from './model/types'

/* THE PHYSICS OF THE SCENE, STATED ONCE.
 *
 * Every number on this board — the cube's particle speed, the dial, the
 * graph's curve, the graph's marker and the prose — is read from this model.
 * There is no second copy of the ideal gas law anywhere in the scene, which is
 * why the dial cannot say one pressure while the graph shows another.
 *
 * WHY V = 22.674 L, WHICH LOOKS LIKE AN ODD NUMBER TO PICK.
 * The reference image asserts two pressures: 165 kPa at 450 K on the dial, and
 * a marker at 300 K that its axis labels 100 kPa. Those cannot both be true of
 * one container — they imply 22.674 L and 24.94 L respectively. The image is
 * internally inconsistent, in the same way its y-axis (200, 150, 100, 110) is:
 * the numbers were drawn rather than computed.
 *
 * 22.674 L is the volume that makes the DIAL exact — 165.0 kPa at 450 K — and
 * it puts 300 K at 110.0 kPa. '110' is one of the values printed on the
 * reference's own y-axis, which is the tell: 110 was the intended reading and
 * the '100' label was the drawing error. So this volume reproduces the
 * reference's two real numbers and refuses only its typo.
 */

export const GAS_MODEL: BoardModel = {
  vars: [
    {
      id: 'T',
      label: 'Temperature',
      value: 450,
      min: 100,
      max: 600,
      step: 1,
      unit: 'K',
    },
    /* Held fixed — this is the "constant volume" the panel heading promises.
     * It is a var rather than a literal inside the formula so the board can
     * say what is being held constant, and so a later lesson can hand the
     * learner the same control over it without touching the formula. */
    { id: 'V', label: 'Volume', value: 22.674, min: 22.674, max: 22.674, unit: 'L' },
    { id: 'n', label: 'Amount of gas', value: 1, min: 1, max: 1, unit: 'mol' },
  ],
  derived: [
    {
      id: 'P',
      label: 'Pressure',
      /* R = 8.314 J·mol⁻¹·K⁻¹; with V in litres this yields kPa directly. */
      expr: 'n * 8.314 * T / V',
      unit: 'kPa',
      precision: 0,
    },
    {
      id: 'KE',
      label: 'Mean kinetic energy',
      /* (3/2)RT per mole — the quantity the causal chain names in step three. */
      expr: '1.5 * 8.314 * T',
      unit: 'J/mol',
      precision: 0,
    },
    {
      id: 'speed',
      label: 'Particle speed',
      /* Relative to the coldest temperature the lesson allows, because this
       * box has no mass and a figure in m/s would be invented. */
      expr: 'sqrt(T / 100)',
      unit: '× base',
      precision: 2,
    },
  ],
}
