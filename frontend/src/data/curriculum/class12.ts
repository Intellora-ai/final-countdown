/* GENERATED FILE — do not edit by hand.
 *
 * Built by frontend/scripts/curriculum/build.mjs from the official CBSE 2026-27
 * syllabus documents recorded in data/curriculum-sources.lock.json.
 * Re-generate with: npm run curriculum:build
 *
 * Class 12: 21 subjects, 1509 concepts.
 *
 * Every concept carries the pdf and page it was read from. Every "minutes"
 * value is an ESTIMATE derived from the concept's wording, not a figure the
 * document states.
 */

import type { Subject } from '../../types'

export const CLASS_12: Subject[] = [
  {
    "id": "physics",
    "name": "Physics",
    "chapters": [
      {
        "id": "need-for-measurement",
        "name": "Need for measurement",
        "concepts": [
          {
            "id": "need-for-measurement--units-of-measurement",
            "name": "Units of measurement",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          },
          {
            "id": "need-for-measurement--systems-of-units",
            "name": "systems of units",
            "minutes": 15,
            "deps": [
              "need-for-measurement--units-of-measurement"
            ],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          },
          {
            "id": "need-for-measurement--si-units",
            "name": "SI units",
            "minutes": 10,
            "deps": [
              "need-for-measurement--systems-of-units"
            ],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          },
          {
            "id": "need-for-measurement--fundamental-and-derived-units-significant-figures",
            "name": "fundamental and derived units. significant figures",
            "minutes": 20,
            "deps": [
              "need-for-measurement--si-units"
            ],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          },
          {
            "id": "need-for-measurement--determining-the-uncertainty-in-result-dimensions-of-physical-quantities",
            "name": "Determining the uncertainty in result. Dimensions of physical quantities",
            "minutes": 25,
            "deps": [
              "need-for-measurement--fundamental-and-derived-units-significant-figures"
            ],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          },
          {
            "id": "need-for-measurement--dimensional-analysis-and-its-applications",
            "name": "dimensional analysis and its applications",
            "minutes": 20,
            "deps": [
              "need-for-measurement--determining-the-uncertainty-in-result-dimensions-of-physical-quantities"
            ],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "dynamics-of-uniform-circular-motion",
        "name": "Dynamics of uniform circular motion",
        "concepts": [
          {
            "id": "dynamics-of-uniform-circular-motion--centripetal-force",
            "name": "Centripetal force",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          },
          {
            "id": "dynamics-of-uniform-circular-motion--examples-of-circular-motion-vehicle-on-a-level-circular-road-vehicle-on-a-banked",
            "name": "examples of circular motion (vehicle on a level circular road, vehicle on a banked road)",
            "minutes": 25,
            "deps": [
              "dynamics-of-uniform-circular-motion--centripetal-force"
            ],
            "source": {
              "pdf": "physics",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "unit-iv",
        "name": "Unit IV",
        "concepts": [
          {
            "id": "unit-iv--work",
            "name": "Work",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 4
            }
          },
          {
            "id": "unit-iv--energy-and-power",
            "name": "Energy and Power",
            "minutes": 15,
            "deps": [
              "unit-iv--work"
            ],
            "source": {
              "pdf": "physics",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "wave-motion",
        "name": "Wave motion",
        "concepts": [
          {
            "id": "wave-motion--transverse-and-longitudinal-waves",
            "name": "Transverse and longitudinal waves",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          },
          {
            "id": "wave-motion--speed-of-travelling-wave",
            "name": "speed of travelling wave",
            "minutes": 15,
            "deps": [
              "wave-motion--transverse-and-longitudinal-waves"
            ],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          },
          {
            "id": "wave-motion--displacement-relation-for-a-progressive-wave",
            "name": "displacement relation for a progressive wave",
            "minutes": 20,
            "deps": [
              "wave-motion--speed-of-travelling-wave"
            ],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          },
          {
            "id": "wave-motion--principle-of-superposition-of-waves",
            "name": "principle of superposition of waves",
            "minutes": 20,
            "deps": [
              "wave-motion--displacement-relation-for-a-progressive-wave"
            ],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          },
          {
            "id": "wave-motion--reflection-of-waves",
            "name": "reflection of waves",
            "minutes": 15,
            "deps": [
              "wave-motion--principle-of-superposition-of-waves"
            ],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          },
          {
            "id": "wave-motion--standing-waves-in-strings-and-organ-pipes",
            "name": "standing waves in strings and organ pipes",
            "minutes": 20,
            "deps": [
              "wave-motion--reflection-of-waves"
            ],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          },
          {
            "id": "wave-motion--fundamental-mode-and-harmonics",
            "name": "fundamental mode and harmonics",
            "minutes": 15,
            "deps": [
              "wave-motion--standing-waves-in-strings-and-organ-pipes"
            ],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          },
          {
            "id": "wave-motion--beats",
            "name": "Beats",
            "minutes": 10,
            "deps": [
              "wave-motion--fundamental-mode-and-harmonics"
            ],
            "source": {
              "pdf": "physics",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "ray-optics",
        "name": "Ray Optics",
        "concepts": [
          {
            "id": "ray-optics--reflection-of-light",
            "name": "Reflection of light",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--spherical-mirrors",
            "name": "spherical mirrors",
            "minutes": 10,
            "deps": [
              "ray-optics--reflection-of-light"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--mirror-formula",
            "name": "mirror formula",
            "minutes": 10,
            "deps": [
              "ray-optics--spherical-mirrors"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--refraction-of-light",
            "name": "refraction of light",
            "minutes": 15,
            "deps": [
              "ray-optics--mirror-formula"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--total-internal-reflection-and-optical-fibers",
            "name": "total internal reflection and optical fibers",
            "minutes": 20,
            "deps": [
              "ray-optics--refraction-of-light"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--refraction-at-spherical-surfaces",
            "name": "refraction at spherical surfaces",
            "minutes": 15,
            "deps": [
              "ray-optics--total-internal-reflection-and-optical-fibers"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--lenses",
            "name": "lenses",
            "minutes": 10,
            "deps": [
              "ray-optics--refraction-at-spherical-surfaces"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--thin-lens-formula",
            "name": "thin lens formula",
            "minutes": 15,
            "deps": [
              "ray-optics--lenses"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--lens-makers-formula",
            "name": "lens maker’s formula",
            "minutes": 15,
            "deps": [
              "ray-optics--thin-lens-formula"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--magnification",
            "name": "magnification",
            "minutes": 10,
            "deps": [
              "ray-optics--lens-makers-formula"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--power-of-a-lens",
            "name": "power of a lens",
            "minutes": 15,
            "deps": [
              "ray-optics--magnification"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--combination-of-thin-lenses-in-contact",
            "name": "combination of thin lenses in contact",
            "minutes": 20,
            "deps": [
              "ray-optics--power-of-a-lens"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "ray-optics--refraction-of-light-through-a-prism",
            "name": "refraction of light through a prism",
            "minutes": 20,
            "deps": [
              "ray-optics--combination-of-thin-lenses-in-contact"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "wave-optics",
        "name": "Wave optics",
        "concepts": [
          {
            "id": "wave-optics--wave-front-and-huygens-principle",
            "name": "Wave front and Huygen’s principle",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "wave-optics--coherent-sources-and-sustained-interference-of-light",
            "name": "coherent sources and sustained interference of light",
            "minutes": 20,
            "deps": [
              "wave-optics--wave-front-and-huygens-principle"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "wave-optics--diffraction-due-to-a-single-slit",
            "name": "diffraction due to a single slit",
            "minutes": 20,
            "deps": [
              "wave-optics--coherent-sources-and-sustained-interference-of-light"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          },
          {
            "id": "wave-optics--width-of-central-maxima-qualitative-treatment-only",
            "name": "width of central maxima (qualitative treatment only)",
            "minutes": 20,
            "deps": [
              "wave-optics--diffraction-due-to-a-single-slit"
            ],
            "source": {
              "pdf": "physics",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna",
        "name": "To measure diameter of a small spherical/cylindrical body and to measure internal",
        "concepts": [
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-diameter-of-a-given-wire-and-thickness-of-a-given-sheet-using-screw-g",
            "name": "To measure diameter of a given wire and thickness of a given sheet using screw gauge",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 7
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-volume-of-an-irregular-lamina-using-screw-gauge",
            "name": "To determine volume of an irregular lamina using screw gauge",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-diameter-of-a-given-wire-and-thickness-of-a-given-sheet-using-screw-g"
            ],
            "source": {
              "pdf": "physics",
              "page": 7
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-radius-of-curvature-of-a-given-spherical-surface-by-a-spherometer",
            "name": "To determine radius of curvature of a given spherical surface by a spherometer",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-volume-of-an-irregular-lamina-using-screw-gauge"
            ],
            "source": {
              "pdf": "physics",
              "page": 7
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-mass-of-two-different-objects-using-a-beam-balance",
            "name": "To determine the mass of two different objects using a beam balance",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-radius-of-curvature-of-a-given-spherical-surface-by-a-spherometer"
            ],
            "source": {
              "pdf": "physics",
              "page": 7
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-variation-of-time-period-of-a-simple-pendulum-of-a-given-length-by-taki",
            "name": "To study variation of time period of a simple pendulum of a given length by taking bobs of same size but different masses and interpret the result",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-mass-of-two-different-objects-using-a-beam-balance"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-make-a-paper-scale-of-given-least-count-e-g-0-2cm-0-5-cm",
            "name": "To make a paper scale of given least count, e.g., 0.2cm, 0.5 cm",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-variation-of-time-period-of-a-simple-pendulum-of-a-given-length-by-taki"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-mass-of-a-given-body-using-a-metre-scale-by-principle-of-moments",
            "name": "To determine mass of a given body using a metre scale by principle of moments",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-make-a-paper-scale-of-given-least-count-e-g-0-2cm-0-5-cm"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-plot-a-graph-for-a-given-set-of-data-with-proper-choice-of-scales-and-error-b",
            "name": "To plot a graph for a given set of data, with proper choice of scales and error bars",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-mass-of-a-given-body-using-a-metre-scale-by-principle-of-moments"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-the-force-of-limiting-friction-for-rolling-of-a-roller-on-a-horizonta",
            "name": "To measure the force of limiting friction for rolling of a roller on a horizontal plane",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-plot-a-graph-for-a-given-set-of-data-with-proper-choice-of-scales-and-error-b"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-variation-in-range-of-a-projectile-with-angle-of-projection",
            "name": "To study the variation in range of a projectile with angle of projection",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-the-force-of-limiting-friction-for-rolling-of-a-roller-on-a-horizonta"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-conservation-of-energy-of-a-ball-rolling-down-on-an-inclined-plane-",
            "name": "To study the conservation of energy of a ball rolling down on an inclined plane (using a double inclined plane)",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-variation-in-range-of-a-projectile-with-angle-of-projection"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-dissipation-of-energy-of-a-simple-pendulum-by-plotting-a-graph-between-",
            "name": "To study dissipation of energy of a simple pendulum by plotting a graph between square of amplitude and time.SECTION–B Experiments",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-conservation-of-energy-of-a-ball-rolling-down-on-an-inclined-plane-"
            ],
            "source": {
              "pdf": "physics",
              "page": 8
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-youngs-modulus-of-elasticity-of-the-material-of-a-given-wire",
            "name": "To determine Young's modulus of elasticity of the material of a given wire",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-dissipation-of-energy-of-a-simple-pendulum-by-plotting-a-graph-between-"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-force-constant-of-a-helical-spring-by-plotting-a-graph-between-load-",
            "name": "To find the force constant of a helical spring by plotting a graph between load and extension",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-youngs-modulus-of-elasticity-of-the-material-of-a-given-wire"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-variation-in-volume-with-pressure-for-a-sample-of-air-at-constant-t",
            "name": "To study the variation in volume with pressure for a sample of air at constant temperature by plotting graphs between P and V, and between P and 1/V",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-force-constant-of-a-helical-spring-by-plotting-a-graph-between-load-"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-surface-tension-of-water-by-capillary-rise-method",
            "name": "To determine the surface tension of water by capillary rise method",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-variation-in-volume-with-pressure-for-a-sample-of-air-at-constant-t"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-coefficient-of-viscosity-of-a-given-viscous-liquid-by-measuring",
            "name": "To determine the coefficient of viscosity of a given viscous liquid by measuring terminal velocity of a given spherical body",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-surface-tension-of-water-by-capillary-rise-method"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-relationship-between-the-temperature-of-a-hot-body-and-time-by-plot",
            "name": "To study the relationship between the temperature of a hot body and time by plotting a cooling curve",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-coefficient-of-viscosity-of-a-given-viscous-liquid-by-measuring"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-specific-heat-capacity-of-a-given-solid-by-method-of-mixtures",
            "name": "To determine specific heat capacity of a given solid by method of mixtures",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-relationship-between-the-temperature-of-a-hot-body-and-time-by-plot"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-relation-between-frequency-and-length-of-a-given-wire-under-constan",
            "name": "To study the relation between frequency and length of a given wire under constant tension using sonometer",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-specific-heat-capacity-of-a-given-solid-by-method-of-mixtures"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-relation-between-the-length-of-a-given-wire-and-tension-for-constan",
            "name": "To study the relation between the length of a given wire and tension for constant frequency using sonometer",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-relation-between-frequency-and-length-of-a-given-wire-under-constan"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-speed-of-sound-in-air-at-room-temperature-using-a-resonance-tube-by-",
            "name": "To find the speed of sound in air at room temperature using a resonance tube by two resonance positions. Activities",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-relation-between-the-length-of-a-given-wire-and-tension-for-constan"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-observe-change-of-state-and-plot-a-cooling-curve-for-molten-wax",
            "name": "To observe change of state and plot a cooling curve for molten wax",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-speed-of-sound-in-air-at-room-temperature-using-a-resonance-tube-by-"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-observe-and-explain-the-effect-of-heating-on-a-bi-metallic-strip",
            "name": "To observe and explain the effect of heating on a bi-metallic strip",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-observe-change-of-state-and-plot-a-cooling-curve-for-molten-wax"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-note-the-change-in-level-of-liquid-in-a-container-on-heating-and-interpret-th",
            "name": "To note the change in level of liquid in a container on heating and interpret the observations",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-observe-and-explain-the-effect-of-heating-on-a-bi-metallic-strip"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-effect-of-detergent-on-surface-tension-of-water-by-observing-capill",
            "name": "To study the effect of detergent on surface tension of water by observing capillary rise",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-note-the-change-in-level-of-liquid-in-a-container-on-heating-and-interpret-th"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-factors-affecting-the-rate-of-loss-of-heat-of-a-liquid",
            "name": "To study the factors affecting the rate of loss of heat of a liquid",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-effect-of-detergent-on-surface-tension-of-water-by-observing-capill"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-effect-of-load-on-depression-of-a-suitably-clamped-metre-scale-load",
            "name": "To study the effect of load on depression of a suitably clamped metre scale loaded at",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-factors-affecting-the-rate-of-loss-of-heat-of-a-liquid"
            ],
            "source": {
              "pdf": "physics",
              "page": 9
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-diameter-of-a-small-spherical-cylindrical-body-using-vernier-calipers",
            "name": "To measure diameter of a small spherical/cylindrical body using vernier calipers",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-study-the-effect-of-load-on-depression-of-a-suitably-clamped-metre-scale-load"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-the-internal-diameter-and-depth-of-a-given-beaker-calorimeter-using-v",
            "name": "To measure the internal diameter and depth of a given beaker/calorimeter using vernier calipers and hence find its volume",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-diameter-of-a-small-spherical-cylindrical-body-using-vernier-calipers"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-diameter-of-given-wire-using-screw-gauge",
            "name": "To measure diameter of given wire using screw gauge",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-the-internal-diameter-and-depth-of-a-given-beaker-calorimeter-using-v"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-thickness-of-a-given-sheet-using-screw-gauge",
            "name": "To measure thickness of a given sheet using screw gauge",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-diameter-of-given-wire-using-screw-gauge"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-mass-of-a-given-object-using-a-beam-balance",
            "name": "To determine the mass of a given object using a beam balance",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-measure-thickness-of-a-given-sheet-using-screw-gauge"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-weight-of-given-body-using-the-parallelogram-law-of-vectors",
            "name": "To find the weight of given body using the parallelogram law of vectors",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-determine-the-mass-of-a-given-object-using-a-beam-balance"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--using-a-simple-pendulum-plot-l-t-and-graphs-hence-find-the-effective-length-of-s",
            "name": "Using a simple pendulum plot L-T and graphs. Hence find the effective length of second’s pendulum using appropriate length values",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-weight-of-given-body-using-the-parallelogram-law-of-vectors"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-force-constant-of-given-helical-spring-by-plotting-a-graph-between-l",
            "name": "To find the force constant of given helical spring by plotting a graph between load and extension",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--using-a-simple-pendulum-plot-l-t-and-graphs-hence-find-the-effective-length-of-s"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          },
          {
            "id": "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--i-to-study-the-relation-between-frequency-and-length-of-a-given-wire-under-const",
            "name": "(i) To study the relation between frequency and length of a given wire under constant tension using a sonometer",
            "minutes": 25,
            "deps": [
              "to-measure-diameter-of-a-small-spherical-cylindrical-body-and-to-measure-interna--to-find-the-force-constant-of-given-helical-spring-by-plotting-a-graph-between-l"
            ],
            "source": {
              "pdf": "physics",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di",
        "name": "To determine resistivity of two / three wires by plotting a graph for potential difference",
        "concepts": [
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-resistance-of-a-given-wire-standard-resistor-using-metre-bridge",
            "name": "To find resistance of a given wire / standard resistor using metre bridge",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "physics",
              "page": 17
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-resistance-of-a-galvanometer-by-half-deflection-method-and-to-find-",
            "name": "To determine resistance of a galvanometer by half-deflection method and to find its figure of merit",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-resistance-of-a-given-wire-standard-resistor-using-metre-bridge"
            ],
            "source": {
              "pdf": "physics",
              "page": 17
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-frequency-of-ac-mains-with-a-sonometer-activities",
            "name": "To find the frequency of AC mains with a sonometer.Activities",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-resistance-of-a-galvanometer-by-half-deflection-method-and-to-find-"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-measure-the-resistance-and-impedance-of-an-inductor-with-or-without-iron-core",
            "name": "To measure the resistance and impedance of an inductor with or without iron core",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-frequency-of-ac-mains-with-a-sonometer-activities"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-measure-resistance-voltage-ac-dc-current-ac-and-check-continuity-of-a-given-c",
            "name": "To measure resistance, voltage (AC/DC), current (AC) and check continuity of a given circuit using multimeter",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-measure-the-resistance-and-impedance-of-an-inductor-with-or-without-iron-core"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-assemble-a-household-circuit-comprising-three-bulbs-three-on-off-switches-a-f",
            "name": "To assemble a household circuit comprising three bulbs, three (on/off) switches, a fuse and a power source",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-measure-resistance-voltage-ac-dc-current-ac-and-check-continuity-of-a-given-c"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-assemble-the-components-of-a-given-electrical-circuit",
            "name": "To assemble the components of a given electrical circuit",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-assemble-a-household-circuit-comprising-three-bulbs-three-on-off-switches-a-f"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-study-the-variation-in-potential-drop-with-length-of-a-wire-for-a-steady-curr",
            "name": "To study the variation in potential drop with length of a wire for a steady current",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-assemble-the-components-of-a-given-electrical-circuit"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-value-of-v-for-different-values-of-u-in-case-of-a-concave-mirror-and",
            "name": "To find the value of v for different values of u in case of a concave mirror and to find the focal length",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-study-the-variation-in-potential-drop-with-length-of-a-wire-for-a-steady-curr"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-focal-length-of-a-convex-mirror-using-a-convex-lens",
            "name": "To find the focal length of a convex mirror, using a convex lens",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-value-of-v-for-different-values-of-u-in-case-of-a-concave-mirror-and"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-focal-length-of-a-convex-lens-by-plotting-graphs-between-u-and-vor-b",
            "name": "To find the focal length of a convex lens by plotting graphs between u and vor between 1/u and 1/v",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-focal-length-of-a-convex-mirror-using-a-convex-lens"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-focal-length-of-a-concave-lens-using-a-convex-lens",
            "name": "To find the focal length of a concave lens, using a convex lens",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-focal-length-of-a-convex-lens-by-plotting-graphs-between-u-and-vor-b"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-angle-of-minimum-deviation-for-a-given-prism-by-plotting-a-graph-be",
            "name": "To determine angle of minimum deviation for a given prism by plotting a graph between angle of incidence and angle of deviation",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-focal-length-of-a-concave-lens-using-a-convex-lens"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-refractive-index-of-a-glass-slab-using-a-travelling-microscope",
            "name": "To determine refractive index of a glass slab using a travelling microscope",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-angle-of-minimum-deviation-for-a-given-prism-by-plotting-a-graph-be"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-refractive-index-of-a-liquid-using-convex-lens-and-plane-mirror",
            "name": "To find the refractive index of a liquid using convex lens and plane mirror",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-refractive-index-of-a-glass-slab-using-a-travelling-microscope"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-refractive-index-of-a-liquid-using-a-concave-mirror-and-a-plane-mirr",
            "name": "To find the refractive index of a liquid using a concave mirror and a plane mirror",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-refractive-index-of-a-liquid-using-convex-lens-and-plane-mirror"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-draw-the-i-v-characteristic-curve-for-a-p-n-junction-diode-in-forward-and-rev",
            "name": "To draw the I-V characteristic curve for a p-n junction diode in forward and reverse bias. Activities",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-refractive-index-of-a-liquid-using-a-concave-mirror-and-a-plane-mirr"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-identify-a-diode-an-led-a-resistor-and-a-capacitor-from-a-mixed-collection-of",
            "name": "To identify a diode, an LED, a resistor and a capacitor from a mixed collection of such items",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-draw-the-i-v-characteristic-curve-for-a-p-n-junction-diode-in-forward-and-rev"
            ],
            "source": {
              "pdf": "physics",
              "page": 18
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-observe-refraction-and-lateral-deviation-of-a-beam-of-light-incident-obliquel",
            "name": "To observe refraction and lateral deviation of a beam of light incident obliquely on a glass slab",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-identify-a-diode-an-led-a-resistor-and-a-capacitor-from-a-mixed-collection-of"
            ],
            "source": {
              "pdf": "physics",
              "page": 19
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-observe-diffraction-of-light-due-to-a-thin-slit",
            "name": "To observe diffraction of light due to a thin slit",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-observe-refraction-and-lateral-deviation-of-a-beam-of-light-incident-obliquel"
            ],
            "source": {
              "pdf": "physics",
              "page": 19
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-obtain-a-lens-combination-with-the-specified-focal-length-by-using-two-lenses",
            "name": "To obtain a lens combination with the specified focal length by using two lenses from the given set of lenses. Suggested InvestigatoryProjects",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-observe-diffraction-of-light-due-to-a-thin-slit"
            ],
            "source": {
              "pdf": "physics",
              "page": 19
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-study-various-factors-on-which-the-internal-resistance-emf-of-a-cell-depends",
            "name": "To study various factors on which the internal resistance/EMF of a cell depends",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-obtain-a-lens-combination-with-the-specified-focal-length-by-using-two-lenses"
            ],
            "source": {
              "pdf": "physics",
              "page": 19
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-study-the-variations-in-current-flowing-in-a-circuit-containing-an-ldr-becaus",
            "name": "To study the variations in current flowing in a circuit containing an LDR because of a variation in",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-study-various-factors-on-which-the-internal-resistance-emf-of-a-cell-depends"
            ],
            "source": {
              "pdf": "physics",
              "page": 19
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-investigate-the-dependence-of-the-angle-of-deviation-on-the-angle-of-incidenc",
            "name": "To investigate the dependence of the angle of deviation on the angle of incidence using a hollow prism filled one by one, with different transparent fluids",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-study-the-variations-in-current-flowing-in-a-circuit-containing-an-ldr-becaus"
            ],
            "source": {
              "pdf": "physics",
              "page": 19
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-estimate-the-charge-induced-on-each-one-of-the-two-identical-styrofoam-or-pit",
            "name": "To estimate the charge induced on each one of the two identical Styrofoam (or pith) balls suspended in a vertical plane by making use of Coulomb's law",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-investigate-the-dependence-of-the-angle-of-deviation-on-the-angle-of-incidenc"
            ],
            "source": {
              "pdf": "physics",
              "page": 19
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-the-resistance-per-cm-of-a-given-wire-by-plotting-a-graph-between-v",
            "name": "To determine the resistance per cm of a given wire by plotting a graph between voltage and current",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-estimate-the-charge-induced-on-each-one-of-the-two-identical-styrofoam-or-pit"
            ],
            "source": {
              "pdf": "physics",
              "page": 21
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-verify-the-laws-of-combination-series-parallel-combination-of-resistances-by-",
            "name": "To verify the laws of combination (series/parallel combination) of resistances by Ohm’s law",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-the-resistance-per-cm-of-a-given-wire-by-plotting-a-graph-between-v"
            ],
            "source": {
              "pdf": "physics",
              "page": 21
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-resistance-of-a-given-wire-standard-resistor-using-a-meter-bridge",
            "name": "To find the resistance of a given wire / standard resistor using a meter bridge",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-verify-the-laws-of-combination-series-parallel-combination-of-resistances-by-"
            ],
            "source": {
              "pdf": "physics",
              "page": 21
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-the-resistance-of-a-galvanometer-by-half-deflection-method",
            "name": "To determine the resistance of a galvanometer by half deflection method",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-find-the-resistance-of-a-given-wire-standard-resistor-using-a-meter-bridge"
            ],
            "source": {
              "pdf": "physics",
              "page": 21
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-identify-a-resistor-capacitor-inductor-and-diode-from-a-mixed-collection-of-s",
            "name": "To identify a resistor, capacitor, inductor and diode from a mixed collection of such items",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-determine-the-resistance-of-a-galvanometer-by-half-deflection-method"
            ],
            "source": {
              "pdf": "physics",
              "page": 21
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-observe-the-difference-between",
            "name": "To observe the difference between",
            "minutes": 20,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-identify-a-resistor-capacitor-inductor-and-diode-from-a-mixed-collection-of-s"
            ],
            "source": {
              "pdf": "physics",
              "page": 21
            }
          },
          {
            "id": "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-design-an-inductor-coil-and-to-know-the-effect-of",
            "name": "To design an inductor coil and to know the effect of",
            "minutes": 25,
            "deps": [
              "to-determine-resistivity-of-two-three-wires-by-plotting-a-graph-for-potential-di--to-observe-the-difference-between"
            ],
            "source": {
              "pdf": "physics",
              "page": 21
            }
          }
        ]
      }
    ]
  },
  {
    "id": "chemistry",
    "name": "Chemistry",
    "chapters": [
      {
        "id": "unit-4",
        "name": "Unit 4",
        "concepts": [
          {
            "id": "unit-4--d-and-f-block-elements-position-in-the-periodic-table",
            "name": "d and f Block Elements Position in the Periodic Table",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-4--electronic-configuration-of-the-d-block-elements",
            "name": "Electronic configuration of the d-Block Elements",
            "minutes": 20,
            "deps": [
              "unit-4--d-and-f-block-elements-position-in-the-periodic-table"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-4--general-properties-of-the-transition-elements-d-block",
            "name": "General properties of the Transition Elements (d-Block)",
            "minutes": 20,
            "deps": [
              "unit-4--electronic-configuration-of-the-d-block-elements"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-4--some-important-compounds-of-transition-elements",
            "name": "Some Important Compounds of Transition Elements",
            "minutes": 20,
            "deps": [
              "unit-4--general-properties-of-the-transition-elements-d-block"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-4--the-lanthanoids",
            "name": "The Lanthanoids",
            "minutes": 10,
            "deps": [
              "unit-4--some-important-compounds-of-transition-elements"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-4--the-actinoids",
            "name": "The Actinoids",
            "minutes": 10,
            "deps": [
              "unit-4--the-lanthanoids"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-4--some-applications-of-d-and-f-block-elements",
            "name": "Some Applications of d- and f- Block Elements",
            "minutes": 25,
            "deps": [
              "unit-4--the-actinoids"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "unit-5",
        "name": "Unit 5",
        "concepts": [
          {
            "id": "unit-5--coordination-compounds-werners-theory-of-coordination-compound",
            "name": "Coordination Compounds Werner’s Theory of Coordination Compound",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-5--definition-of-some-important-terms-pertaining-to-coordination-compounds",
            "name": "Definition of Some important terms pertaining to Coordination Compounds",
            "minutes": 25,
            "deps": [
              "unit-5--coordination-compounds-werners-theory-of-coordination-compound"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-5--nomenclature-of-coordination-compounds-isomerism-in-coordination-compounds",
            "name": "Nomenclature of Coordination Compounds. Isomerism in Coordination Compounds",
            "minutes": 25,
            "deps": [
              "unit-5--definition-of-some-important-terms-pertaining-to-coordination-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-5--bonding-in-coordination-compounds",
            "name": "Bonding in coordination compounds",
            "minutes": 15,
            "deps": [
              "unit-5--nomenclature-of-coordination-compounds-isomerism-in-coordination-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-5--bonding-in-metal-carbonyls",
            "name": "Bonding in Metal Carbonyls",
            "minutes": 15,
            "deps": [
              "unit-5--bonding-in-coordination-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          },
          {
            "id": "unit-5--importance-and-applications-of-coordination-compounds",
            "name": "Importance and Applications of Coordination Compounds",
            "minutes": 20,
            "deps": [
              "unit-5--bonding-in-metal-carbonyls"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "unit-6",
        "name": "Unit 6",
        "concepts": [
          {
            "id": "unit-6--haloalkanes-and-haloarenes-classification",
            "name": "Haloalkanes and Haloarenes Classification",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-6--nomenclature",
            "name": "Nomenclature",
            "minutes": 10,
            "deps": [
              "unit-6--haloalkanes-and-haloarenes-classification"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-6--nature-of-c-x-bond",
            "name": "Nature of C–X bond",
            "minutes": 15,
            "deps": [
              "unit-6--nomenclature"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-6--methods-of-preparation-of-haloalkanes",
            "name": "Methods of Preparation of Haloalkanes",
            "minutes": 20,
            "deps": [
              "unit-6--nature-of-c-x-bond"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-6--preparation-of-haloarenes",
            "name": "Preparation of Haloarenes",
            "minutes": 15,
            "deps": [
              "unit-6--methods-of-preparation-of-haloalkanes"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-6--physical-properties",
            "name": "Physical Properties",
            "minutes": 10,
            "deps": [
              "unit-6--preparation-of-haloarenes"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-6--chemical-reactions",
            "name": "Chemical Reactions",
            "minutes": 10,
            "deps": [
              "unit-6--physical-properties"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-6--polyhalogen-compounds",
            "name": "Polyhalogen Compounds",
            "minutes": 10,
            "deps": [
              "unit-6--chemical-reactions"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "unit-7",
        "name": "Unit 7",
        "concepts": [
          {
            "id": "unit-7--alcohols",
            "name": "Alcohols",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-7--phenols-and-ethers-classification",
            "name": "Phenols and Ethers Classification",
            "minutes": 15,
            "deps": [
              "unit-7--alcohols"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-7--structures-of-functional-groups",
            "name": "Structures of Functional Groups",
            "minutes": 15,
            "deps": [
              "unit-7--phenols-and-ethers-classification"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-7--alcohols-and-phenols",
            "name": "Alcohols and Phenols",
            "minutes": 15,
            "deps": [
              "unit-7--structures-of-functional-groups"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-7--some-commercially-important-alcohols",
            "name": "Some commercially Important Alcohols",
            "minutes": 15,
            "deps": [
              "unit-7--alcohols-and-phenols"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-7--ethers",
            "name": "Ethers",
            "minutes": 10,
            "deps": [
              "unit-7--some-commercially-important-alcohols"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "unit-8",
        "name": "Unit 8",
        "concepts": [
          {
            "id": "unit-8--aldehydes",
            "name": "Aldehydes",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-8--ketones-and-carboxylic-acids-nomenclature-and-structure-of-carbonyl-group",
            "name": "Ketones and Carboxylic Acids Nomenclature and Structure of Carbonyl Group",
            "minutes": 25,
            "deps": [
              "unit-8--aldehydes"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-8--preparation-of-aldehydes-and-ketones",
            "name": "Preparation of Aldehydes and Ketones",
            "minutes": 20,
            "deps": [
              "unit-8--ketones-and-carboxylic-acids-nomenclature-and-structure-of-carbonyl-group"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-8--physical-properties-and-chemical-reactions",
            "name": "Physical Properties and Chemical Reactions",
            "minutes": 20,
            "deps": [
              "unit-8--preparation-of-aldehydes-and-ketones"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          },
          {
            "id": "unit-8--uses-of-aldehydes-and-ketones",
            "name": "Uses of Aldehydes and Ketones",
            "minutes": 20,
            "deps": [
              "unit-8--physical-properties-and-chemical-reactions"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 9
            }
          }
        ]
      }
    ]
  },
  {
    "id": "biology",
    "name": "Biology",
    "chapters": [
      {
        "id": "chapter-1",
        "name": "Chapter-1",
        "concepts": [
          {
            "id": "chapter-1--sexual-reproduction-in-flowering-plants-flower-structure",
            "name": "Sexual Reproduction in Flowering Plants Flower structure",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--development-of-male-and-female-gametophytes",
            "name": "development of male and female gametophytes",
            "minutes": 20,
            "deps": [
              "chapter-1--sexual-reproduction-in-flowering-plants-flower-structure"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--pollination-types",
            "name": "pollination - types",
            "minutes": 15,
            "deps": [
              "chapter-1--development-of-male-and-female-gametophytes"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--agencies-and-examples",
            "name": "agencies and examples",
            "minutes": 15,
            "deps": [
              "chapter-1--pollination-types"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--out-breeding-devices",
            "name": "out breeding devices",
            "minutes": 15,
            "deps": [
              "chapter-1--agencies-and-examples"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--pollen-pistil-interaction",
            "name": "pollen-pistil interaction",
            "minutes": 10,
            "deps": [
              "chapter-1--out-breeding-devices"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--double-fertilization",
            "name": "double fertilization",
            "minutes": 10,
            "deps": [
              "chapter-1--pollen-pistil-interaction"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--post-fertilization-events-development-of-endosperm-and-embryo",
            "name": "post fertilization events - development of endosperm and embryo",
            "minutes": 25,
            "deps": [
              "chapter-1--double-fertilization"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--development-of-seed-and-formation-of-fruit",
            "name": "development of seed and formation of fruit",
            "minutes": 20,
            "deps": [
              "chapter-1--post-fertilization-events-development-of-endosperm-and-embryo"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--special-modes-apomixis",
            "name": "special modes- apomixis",
            "minutes": 15,
            "deps": [
              "chapter-1--development-of-seed-and-formation-of-fruit"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--parthenocarpy",
            "name": "parthenocarpy",
            "minutes": 10,
            "deps": [
              "chapter-1--special-modes-apomixis"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--polyembryony",
            "name": "polyembryony",
            "minutes": 10,
            "deps": [
              "chapter-1--parthenocarpy"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          },
          {
            "id": "chapter-1--significance-of-seed-dispersal-and-fruit-formation",
            "name": "Significance of seed dispersal and fruit formation",
            "minutes": 20,
            "deps": [
              "chapter-1--polyembryony"
            ],
            "source": {
              "pdf": "biology",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "chapter-4",
        "name": "Chapter-4",
        "concepts": [
          {
            "id": "chapter-4--principles-of-inheritance-and-variation",
            "name": "Principles of Inheritance and Variation",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "heredity-and-variation",
        "name": "Heredity and variation",
        "concepts": [
          {
            "id": "heredity-and-variation--mendelian-inheritance",
            "name": "Mendelian inheritance",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--deviations-from-mendelism-incomplete-dominance",
            "name": "deviations from Mendelism – incomplete dominance",
            "minutes": 20,
            "deps": [
              "heredity-and-variation--mendelian-inheritance"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--co-dominance",
            "name": "co-dominance",
            "minutes": 10,
            "deps": [
              "heredity-and-variation--deviations-from-mendelism-incomplete-dominance"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--multiple-alleles-and-inheritance-of-blood-groups",
            "name": "multiple alleles and inheritance of blood groups",
            "minutes": 20,
            "deps": [
              "heredity-and-variation--co-dominance"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--pleiotropy",
            "name": "pleiotropy",
            "minutes": 10,
            "deps": [
              "heredity-and-variation--multiple-alleles-and-inheritance-of-blood-groups"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--elementary-idea-of-polygenic-inheritance",
            "name": "elementary idea of polygenic inheritance",
            "minutes": 20,
            "deps": [
              "heredity-and-variation--pleiotropy"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--chromosome-theory-of-inheritance",
            "name": "chromosome theory of inheritance",
            "minutes": 15,
            "deps": [
              "heredity-and-variation--elementary-idea-of-polygenic-inheritance"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--chromosomes-and-genes",
            "name": "chromosomes and genes",
            "minutes": 15,
            "deps": [
              "heredity-and-variation--chromosome-theory-of-inheritance"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--sex-determination-in-humans",
            "name": "Sex determination - in humans",
            "minutes": 20,
            "deps": [
              "heredity-and-variation--chromosomes-and-genes"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--birds-and-honey-bee",
            "name": "birds and honey bee",
            "minutes": 15,
            "deps": [
              "heredity-and-variation--sex-determination-in-humans"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--linkage-and-crossing-over",
            "name": "linkage and crossing over",
            "minutes": 15,
            "deps": [
              "heredity-and-variation--birds-and-honey-bee"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--sex-linked-inheritance-haemophilia",
            "name": "sex linked inheritance - haemophilia",
            "minutes": 20,
            "deps": [
              "heredity-and-variation--linkage-and-crossing-over"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--colour-blindness",
            "name": "colour blindness",
            "minutes": 10,
            "deps": [
              "heredity-and-variation--sex-linked-inheritance-haemophilia"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--mendelian-disorders-in-humans-thalassemia",
            "name": "Mendelian disorders in humans - thalassemia",
            "minutes": 20,
            "deps": [
              "heredity-and-variation--colour-blindness"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--chromosomal-disorders-in-humans",
            "name": "chromosomal disorders in humans",
            "minutes": 15,
            "deps": [
              "heredity-and-variation--mendelian-disorders-in-humans-thalassemia"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--downs-syndrome",
            "name": "Down's syndrome",
            "minutes": 10,
            "deps": [
              "heredity-and-variation--chromosomal-disorders-in-humans"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "heredity-and-variation--turners-and-klinefelters-syndromes",
            "name": "Turner's and Klinefelter's syndromes",
            "minutes": 15,
            "deps": [
              "heredity-and-variation--downs-syndrome"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "chapter-5",
        "name": "Chapter-5",
        "concepts": [
          {
            "id": "chapter-5--molecular-basis-of-inheritance-search-for-genetic-material-and-dna-as-genetic-ma",
            "name": "Molecular Basis of Inheritance Search for genetic material and DNA as genetic material",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--structure-of-dna-and-rna",
            "name": "Structure of DNA and RNA",
            "minutes": 20,
            "deps": [
              "chapter-5--molecular-basis-of-inheritance-search-for-genetic-material-and-dna-as-genetic-ma"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--dna-packaging",
            "name": "DNA packaging",
            "minutes": 10,
            "deps": [
              "chapter-5--structure-of-dna-and-rna"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--dna-replication",
            "name": "DNA replication",
            "minutes": 10,
            "deps": [
              "chapter-5--dna-packaging"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--central-dogma",
            "name": "Central Dogma",
            "minutes": 10,
            "deps": [
              "chapter-5--dna-replication"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--transcription",
            "name": "transcription",
            "minutes": 10,
            "deps": [
              "chapter-5--central-dogma"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--genetic-code",
            "name": "genetic code",
            "minutes": 10,
            "deps": [
              "chapter-5--transcription"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--translation",
            "name": "translation",
            "minutes": 10,
            "deps": [
              "chapter-5--genetic-code"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--gene-expression-and-regulation-lac-operon",
            "name": "gene expression and regulation - lac operon",
            "minutes": 20,
            "deps": [
              "chapter-5--translation"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--genome",
            "name": "Genome",
            "minutes": 10,
            "deps": [
              "chapter-5--gene-expression-and-regulation-lac-operon"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--human-and-rice-genome-projects",
            "name": "Human and rice genome projects",
            "minutes": 20,
            "deps": [
              "chapter-5--genome"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-5--dna-fingerprinting",
            "name": "DNA fingerprinting",
            "minutes": 10,
            "deps": [
              "chapter-5--human-and-rice-genome-projects"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "chapter-7",
        "name": "Chapter-7",
        "concepts": [
          {
            "id": "chapter-7--human-health-and-diseases-pathogens",
            "name": "Human Health and Diseases Pathogens",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-7--basic-concepts-of-immunology-vaccines",
            "name": "Basic concepts of immunology - vaccines",
            "minutes": 20,
            "deps": [
              "chapter-7--human-health-and-diseases-pathogens"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-7--cancer",
            "name": "cancer",
            "minutes": 10,
            "deps": [
              "chapter-7--basic-concepts-of-immunology-vaccines"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-7--hiv-and-aids",
            "name": "HIV and AIDS",
            "minutes": 15,
            "deps": [
              "chapter-7--cancer"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-7--adolescence-drug-and-alcohol-abuse",
            "name": "Adolescence - drug and alcohol abuse",
            "minutes": 20,
            "deps": [
              "chapter-7--hiv-and-aids"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "chapter-8",
        "name": "Chapter-8",
        "concepts": [
          {
            "id": "chapter-8--microbes-in-human-welfare-microbes-in-food-processing",
            "name": "Microbes in Human Welfare Microbes in food processing",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-8--industrial-production",
            "name": "industrial production",
            "minutes": 10,
            "deps": [
              "chapter-8--microbes-in-human-welfare-microbes-in-food-processing"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-8--sewage-treatment",
            "name": "sewage treatment",
            "minutes": 10,
            "deps": [
              "chapter-8--industrial-production"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-8--energy-generation-and-microbes-as-bio-control-agents-and-bio-fertilizers-antibio",
            "name": "energy generation and microbes as bio-control agents and bio-fertilizers. Antibiotics",
            "minutes": 25,
            "deps": [
              "chapter-8--sewage-treatment"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          },
          {
            "id": "chapter-8--production-and-judicious-use",
            "name": "production and judicious use",
            "minutes": 15,
            "deps": [
              "chapter-8--energy-generation-and-microbes-as-bio-control-agents-and-bio-fertilizers-antibio"
            ],
            "source": {
              "pdf": "biology",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "chapter-10",
        "name": "Chapter-10",
        "concepts": [
          {
            "id": "chapter-10--biotechnology-and-its-applications",
            "name": "Biotechnology and its Applications",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "application-of-biotechnology-in-health-and-agriculture",
        "name": "Application of biotechnology in health and agriculture",
        "concepts": [
          {
            "id": "application-of-biotechnology-in-health-and-agriculture--human-insulin-and-vaccine-production",
            "name": "Human insulin and vaccine production",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "application-of-biotechnology-in-health-and-agriculture--stem-cell-technology",
            "name": "stem cell technology",
            "minutes": 15,
            "deps": [
              "application-of-biotechnology-in-health-and-agriculture--human-insulin-and-vaccine-production"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "application-of-biotechnology-in-health-and-agriculture--gene-therapy",
            "name": "gene therapy",
            "minutes": 10,
            "deps": [
              "application-of-biotechnology-in-health-and-agriculture--stem-cell-technology"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "application-of-biotechnology-in-health-and-agriculture--genetically-modified-organisms-bt-crops",
            "name": "genetically modified organisms - Bt crops",
            "minutes": 20,
            "deps": [
              "application-of-biotechnology-in-health-and-agriculture--gene-therapy"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "application-of-biotechnology-in-health-and-agriculture--transgenic-animals",
            "name": "transgenic animals",
            "minutes": 10,
            "deps": [
              "application-of-biotechnology-in-health-and-agriculture--genetically-modified-organisms-bt-crops"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "application-of-biotechnology-in-health-and-agriculture--biosafety-issues",
            "name": "biosafety issues",
            "minutes": 10,
            "deps": [
              "application-of-biotechnology-in-health-and-agriculture--transgenic-animals"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "application-of-biotechnology-in-health-and-agriculture--biopiracy-and-patents",
            "name": "biopiracy and patents",
            "minutes": 15,
            "deps": [
              "application-of-biotechnology-in-health-and-agriculture--biosafety-issues"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "chapter-11",
        "name": "Chapter-11",
        "concepts": [
          {
            "id": "chapter-11--organisms-and-populations-population-interactions-mutualism",
            "name": "Organisms and Populations Population interactions - mutualism",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-11--competition",
            "name": "competition",
            "minutes": 10,
            "deps": [
              "chapter-11--organisms-and-populations-population-interactions-mutualism"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-11--predation",
            "name": "predation",
            "minutes": 10,
            "deps": [
              "chapter-11--competition"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-11--parasitism",
            "name": "parasitism",
            "minutes": 10,
            "deps": [
              "chapter-11--predation"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-11--population-attributes-growth",
            "name": "population attributes - growth",
            "minutes": 15,
            "deps": [
              "chapter-11--parasitism"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-11--birth-rate-and-death-rate",
            "name": "birth rate and death rate",
            "minutes": 20,
            "deps": [
              "chapter-11--population-attributes-growth"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-11--age-distribution",
            "name": "age distribution",
            "minutes": 10,
            "deps": [
              "chapter-11--birth-rate-and-death-rate"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "ecosystems",
        "name": "Ecosystems",
        "concepts": [
          {
            "id": "ecosystems--patterns",
            "name": "Patterns",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "ecosystems--components",
            "name": "components",
            "minutes": 10,
            "deps": [
              "ecosystems--patterns"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "ecosystems--productivity-and-decomposition",
            "name": "productivity and decomposition",
            "minutes": 15,
            "deps": [
              "ecosystems--components"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "ecosystems--energy-flow",
            "name": "energy flow",
            "minutes": 10,
            "deps": [
              "ecosystems--productivity-and-decomposition"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "ecosystems--pyramids-of-number",
            "name": "pyramids of number",
            "minutes": 15,
            "deps": [
              "ecosystems--energy-flow"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "ecosystems--biomass",
            "name": "biomass",
            "minutes": 10,
            "deps": [
              "ecosystems--pyramids-of-number"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "ecosystems--energy",
            "name": "energy",
            "minutes": 10,
            "deps": [
              "ecosystems--biomass"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "chapter-13",
        "name": "Chapter-13",
        "concepts": [
          {
            "id": "chapter-13--biodiversity-and-its-conservation-biodiversity-concept",
            "name": "Biodiversity and its Conservation Biodiversity-Concept",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--importance",
            "name": "importance",
            "minutes": 10,
            "deps": [
              "chapter-13--biodiversity-and-its-conservation-biodiversity-concept"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--loss-of-biodiversity",
            "name": "loss of biodiversity",
            "minutes": 15,
            "deps": [
              "chapter-13--importance"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--biodiversity-conservation",
            "name": "biodiversity conservation",
            "minutes": 10,
            "deps": [
              "chapter-13--loss-of-biodiversity"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--hotspots",
            "name": "hotspots",
            "minutes": 10,
            "deps": [
              "chapter-13--biodiversity-conservation"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--endangered-organisms",
            "name": "endangered organisms",
            "minutes": 10,
            "deps": [
              "chapter-13--hotspots"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--extinction",
            "name": "extinction",
            "minutes": 10,
            "deps": [
              "chapter-13--endangered-organisms"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--red-data-book",
            "name": "Red Data Book",
            "minutes": 15,
            "deps": [
              "chapter-13--extinction"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--sacred-groves",
            "name": "Sacred Groves",
            "minutes": 10,
            "deps": [
              "chapter-13--red-data-book"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--biosphere-reserves",
            "name": "biosphere reserves",
            "minutes": 10,
            "deps": [
              "chapter-13--sacred-groves"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--national-parks",
            "name": "national parks",
            "minutes": 10,
            "deps": [
              "chapter-13--biosphere-reserves"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--wildlife",
            "name": "wildlife",
            "minutes": 10,
            "deps": [
              "chapter-13--national-parks"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          },
          {
            "id": "chapter-13--sanctuaries-and-ramsar-sites",
            "name": "sanctuaries and Ramsar sites",
            "minutes": 15,
            "deps": [
              "chapter-13--wildlife"
            ],
            "source": {
              "pdf": "biology",
              "page": 11
            }
          }
        ]
      }
    ]
  },
  {
    "id": "biotechnology",
    "name": "Biotechnology",
    "chapters": [
      {
        "id": "chapter-1",
        "name": "Chapter-1",
        "concepts": [
          {
            "id": "chapter-1--recombinant-dna-technology-introduction",
            "name": "Recombinant DNA Technology Introduction",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--tool-of-recombinant-dna-technology",
            "name": "Tool of Recombinant DNA technology",
            "minutes": 20,
            "deps": [
              "chapter-1--recombinant-dna-technology-introduction"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--making-rdna-molecule",
            "name": "making rDNA molecule",
            "minutes": 15,
            "deps": [
              "chapter-1--tool-of-recombinant-dna-technology"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--introduction-of-recombinant-dna-into-host-cells",
            "name": "Introduction of recombinant DNA into host cells",
            "minutes": 20,
            "deps": [
              "chapter-1--making-rdna-molecule"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--identification-of-recombinants",
            "name": "Identification of recombinants",
            "minutes": 15,
            "deps": [
              "chapter-1--introduction-of-recombinant-dna-into-host-cells"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--polymerase-chain-reaction-pcr",
            "name": "Polymerase Chain Reaction (PCR)",
            "minutes": 15,
            "deps": [
              "chapter-1--identification-of-recombinants"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--dna-sequencing",
            "name": "DNA Sequencing",
            "minutes": 10,
            "deps": [
              "chapter-1--polymerase-chain-reaction-pcr"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--microbial-cell-culture-and-its-applications-introduction",
            "name": "Microbial Cell Culture and its Applications Introduction",
            "minutes": 20,
            "deps": [
              "chapter-1--dna-sequencing"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--microbial-nutrition-and-culture-techniques",
            "name": "Microbial nutrition and culture techniques",
            "minutes": 20,
            "deps": [
              "chapter-1--microbial-cell-culture-and-its-applications-introduction"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--measurement-and-kinetics-of-microbial-growth",
            "name": "Measurement and kinetics of microbial growth",
            "minutes": 20,
            "deps": [
              "chapter-1--microbial-nutrition-and-culture-techniques"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--isolation-of-microbial-products",
            "name": "Isolation of microbial products",
            "minutes": 15,
            "deps": [
              "chapter-1--measurement-and-kinetics-of-microbial-growth"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--strain-isolation-and-improvement",
            "name": "Strain isolation and improvement",
            "minutes": 15,
            "deps": [
              "chapter-1--isolation-of-microbial-products"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-1--applications-of-microbial-culture-technology",
            "name": "Applications of microbial culture technology",
            "minutes": 20,
            "deps": [
              "chapter-1--strain-isolation-and-improvement"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-2",
        "name": "Chapter-2",
        "concepts": [
          {
            "id": "chapter-2--protein-structure-and-engineering-introduction-to-the-world-of-proteins",
            "name": "Protein Structure and Engineering Introduction to the world of proteins",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--structure-function-relationship-in-proteins",
            "name": "Structure-function Relationship in proteins",
            "minutes": 15,
            "deps": [
              "chapter-2--protein-structure-and-engineering-introduction-to-the-world-of-proteins"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--characterization-of-proteins",
            "name": "Characterization of proteins",
            "minutes": 15,
            "deps": [
              "chapter-2--structure-function-relationship-in-proteins"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--protein-based-products",
            "name": "Protein based products",
            "minutes": 15,
            "deps": [
              "chapter-2--characterization-of-proteins"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--designing-proteins-protein-engineering",
            "name": "Designing proteins (Protein Engineering)",
            "minutes": 15,
            "deps": [
              "chapter-2--protein-based-products"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-3",
        "name": "Chapter-3",
        "concepts": [
          {
            "id": "chapter-3--genomics",
            "name": "Genomics",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--proteomics-and-bioinformatics-gene-prediction-and-counting",
            "name": "Proteomics and Bioinformatics Gene prediction and counting",
            "minutes": 20,
            "deps": [
              "chapter-3--genomics"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--genome-similarity",
            "name": "Genome similarity",
            "minutes": 10,
            "deps": [
              "chapter-3--proteomics-and-bioinformatics-gene-prediction-and-counting"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--snps-and-comparative-genomics",
            "name": "SNPs and Comparative genomics",
            "minutes": 15,
            "deps": [
              "chapter-3--genome-similarity"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--functional-genomics",
            "name": "Functional genomics",
            "minutes": 10,
            "deps": [
              "chapter-3--snps-and-comparative-genomics"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--proteomics",
            "name": "Proteomics",
            "minutes": 10,
            "deps": [
              "chapter-3--functional-genomics"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--information-sources",
            "name": "Information sources",
            "minutes": 10,
            "deps": [
              "chapter-3--proteomics"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--analysis-using-bioinformatics-tools",
            "name": "Analysis using bioinformatics tools",
            "minutes": 15,
            "deps": [
              "chapter-3--information-sources"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--animal-cell-culture-and-applications-introduction",
            "name": "Animal Cell Culture and Applications Introduction",
            "minutes": 20,
            "deps": [
              "chapter-3--analysis-using-bioinformatics-tools"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--animal-cell-culture-techniques",
            "name": "Animal cell culture techniques",
            "minutes": 15,
            "deps": [
              "chapter-3--animal-cell-culture-and-applications-introduction"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--applications-of-animal-cell-culture",
            "name": "Applications of animal cell culture",
            "minutes": 20,
            "deps": [
              "chapter-3--animal-cell-culture-techniques"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-3--stem-cell-technology-4",
            "name": "Stem cell technology. 4",
            "minutes": 15,
            "deps": [
              "chapter-3--applications-of-animal-cell-culture"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-2",
        "name": "Chapter -2",
        "concepts": [
          {
            "id": "chapter-2--plant-cell-culture-and-applications-introduction",
            "name": "Plant Cell Culture and Applications Introduction",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--cell-and-tissue-culture-techniques",
            "name": "Cell and tissue culture techniques",
            "minutes": 20,
            "deps": [
              "chapter-2--plant-cell-culture-and-applications-introduction"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--applications-of-cell-and-tissue-culture",
            "name": "Applications of cell and tissue culture",
            "minutes": 20,
            "deps": [
              "chapter-2--cell-and-tissue-culture-techniques"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--transgenic-plants-with-beneficial-traits",
            "name": "Transgenic plants with beneficial traits",
            "minutes": 20,
            "deps": [
              "chapter-2--applications-of-cell-and-tissue-culture"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          },
          {
            "id": "chapter-2--biosafety-of-transgenic-plants",
            "name": "Biosafety of transgenic plants",
            "minutes": 15,
            "deps": [
              "chapter-2--transgenic-plants-with-beneficial-traits"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "cell-culture-and-genetic-manipulation-30",
        "name": "Cell Culture and Genetic Manipulation 30",
        "concepts": [
          {
            "id": "cell-culture-and-genetic-manipulation-30--use-of-special-equipment-in-biotechnology-experiments",
            "name": "Use of special equipment in biotechnology experiments",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--isolation-of-bacterial-plasmid-dna",
            "name": "Isolation of bacterial plasmid DNA",
            "minutes": 20,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--use-of-special-equipment-in-biotechnology-experiments"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--detection-of-dna-bygel-electrophoresis",
            "name": "Detection of DNA bygel electrophoresis",
            "minutes": 20,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--isolation-of-bacterial-plasmid-dna"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--estimation-of-dna-byuv-spectroscopy",
            "name": "Estimation of DNA byUV spectroscopy",
            "minutes": 20,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--detection-of-dna-bygel-electrophoresis"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--isolation-of-bacteria-from-curd-staining-of-bacteria",
            "name": "Isolation of bacteria from curd & staining of bacteria",
            "minutes": 25,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--estimation-of-dna-byuv-spectroscopy"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--cellviability-assay-using-evans-blue-dye-exclusion-method",
            "name": "Cellviability assay using Evan’s blue dye exclusion method",
            "minutes": 25,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--isolation-of-bacteria-from-curd-staining-of-bacteria"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--data-retrieval-and-database-search-using-internet-site-ncbi-and-download-a-dna-a",
            "name": "Data retrieval and database search using internet site NCBI and download a DNA and protein sequence from internet, analyze it and comment on it",
            "minutes": 25,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--cellviability-assay-using-evans-blue-dye-exclusion-method"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--reading-of-a-dna-sequencing-gel-to-arrive-at-the-sequence",
            "name": "Reading of a DNA sequencing gel to arrive at the sequence",
            "minutes": 25,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--data-retrieval-and-database-search-using-internet-site-ncbi-and-download-a-dna-a"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          },
          {
            "id": "cell-culture-and-genetic-manipulation-30--project-work-scheme-of-evaluation-time-3-hours-max-marks-30-the-scheme-of-evalua",
            "name": "Project work Scheme of Evaluation Time: 3 hours Max. Marks 30 The scheme of evaluation at the end of the session will be as under: A Two experiments 6+6",
            "minutes": 25,
            "deps": [
              "cell-culture-and-genetic-manipulation-30--reading-of-a-dna-sequencing-gel-to-arrive-at-the-sequence"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 5
            }
          }
        ]
      }
    ]
  },
  {
    "id": "mathematics",
    "name": "Mathematics",
    "chapters": [
      {
        "id": "types-of-relations",
        "name": "Types of relations",
        "concepts": [
          {
            "id": "types-of-relations--reflexive",
            "name": "reflexive",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "types-of-relations--symmetric",
            "name": "symmetric",
            "minutes": 10,
            "deps": [
              "types-of-relations--reflexive"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "types-of-relations--transitive-and-equivalence-relations-one-to-one-and-onto-functions",
            "name": "transitive and equivalence relations. One to one and onto functions",
            "minutes": 25,
            "deps": [
              "types-of-relations--symmetric"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "applications-of-derivatives",
        "name": "Applications of derivatives",
        "concepts": [
          {
            "id": "applications-of-derivatives--rate-of-change-of-quantities",
            "name": "rate of change of quantities",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-senior",
              "page": 8
            }
          },
          {
            "id": "applications-of-derivatives--increasing-decreasing-functions",
            "name": "increasing/decreasing functions",
            "minutes": 10,
            "deps": [
              "applications-of-derivatives--rate-of-change-of-quantities"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--relations-and-functions-types-of-relations-reflexive-symmetric-transitive-and-eq",
            "name": "Relations and Functions Types of relations: reflexive, symmetric, transitive and equivalence relations. One to one and onto functions",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "syllabus--inverse-trigonometric-functions-definition-range-domain-principal-value-branch-g",
            "name": "Inverse Trigonometric Functions Definition, range, domain, principal value branch. Graphs of inverse trigonometric functions. Unit-II: Algebra",
            "minutes": 25,
            "deps": [
              "syllabus--relations-and-functions-types-of-relations-reflexive-symmetric-transitive-and-eq"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "syllabus--application-of-the-integrals-applications-in-finding-the-area-under-simple-curve",
            "name": "Application of the Integrals Applications in finding the area under simple curves, especially lines, circles/ parabolas/ellipses",
            "minutes": 25,
            "deps": [
              "syllabus--inverse-trigonometric-functions-definition-range-domain-principal-value-branch-g"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 8
            }
          },
          {
            "id": "syllabus--probability-conditional-probability-multiplication-theorem-on-probability-indepe",
            "name": "Probability Conditional probability, multiplication theorem on probability, independent events, total probability, Bayes’ theorem.MATHEMATICS (Code No. – 041)",
            "minutes": 25,
            "deps": [
              "syllabus--application-of-the-integrals-applications-in-finding-the-area-under-simple-curve"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "prescribed",
        "name": "Prescribed",
        "concepts": [
          {
            "id": "prescribed--sets-and-functions",
            "name": "Sets and Functions",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "maths-senior",
              "page": 2
            }
          },
          {
            "id": "prescribed--algebra",
            "name": "Algebra",
            "minutes": 10,
            "deps": [
              "prescribed--sets-and-functions"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 2
            }
          },
          {
            "id": "prescribed--coordinate-geometry",
            "name": "Coordinate Geometry",
            "minutes": 10,
            "deps": [
              "prescribed--algebra"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 2
            }
          },
          {
            "id": "prescribed--calculus",
            "name": "Calculus",
            "minutes": 10,
            "deps": [
              "prescribed--coordinate-geometry"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 2
            }
          },
          {
            "id": "prescribed--statistics-and-probability",
            "name": "Statistics and Probability",
            "minutes": 15,
            "deps": [
              "prescribed--calculus"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 2
            }
          },
          {
            "id": "prescribed--relations-and-functions",
            "name": "Relations and Functions",
            "minutes": 15,
            "deps": [
              "prescribed--statistics-and-probability"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "prescribed--algebra-2",
            "name": "Algebra",
            "minutes": 10,
            "deps": [
              "prescribed--relations-and-functions"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "prescribed--calculus-2",
            "name": "Calculus",
            "minutes": 10,
            "deps": [
              "prescribed--algebra-2"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "prescribed--vectors-and-three-dimensional-geometry",
            "name": "Vectors and Three - Dimensional Geometry",
            "minutes": 20,
            "deps": [
              "prescribed--calculus-2"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "prescribed--linear-programming",
            "name": "Linear Programming",
            "minutes": 10,
            "deps": [
              "prescribed--vectors-and-three-dimensional-geometry"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          },
          {
            "id": "prescribed--probability",
            "name": "Probability",
            "minutes": 10,
            "deps": [
              "prescribed--linear-programming"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 7
            }
          }
        ]
      }
    ]
  },
  {
    "id": "applied-mathematics",
    "name": "Applied Mathematics",
    "chapters": [
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--1-binary-numbers",
            "name": "1 Binary Numbers",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "applied-maths",
              "page": 3
            }
          },
          {
            "id": "syllabus--2-indices-logarithm-and-antilogarithm",
            "name": "2 Indices, Logarithm and Antilogarithm",
            "minutes": 20,
            "deps": [
              "syllabus--1-binary-numbers"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 3
            }
          },
          {
            "id": "syllabus--3-introduction-to-bhartiya-system-of-numeration",
            "name": "3 Introduction To Bhartiya System of Numeration",
            "minutes": 20,
            "deps": [
              "syllabus--2-indices-logarithm-and-antilogarithm"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 3
            }
          },
          {
            "id": "syllabus--4-clocks-evaluate-the-angular-value-of-a-minute",
            "name": "4 Clocks ● Evaluate the angular value of a minute",
            "minutes": 25,
            "deps": [
              "syllabus--3-introduction-to-bhartiya-system-of-numeration"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 3
            }
          },
          {
            "id": "syllabus--5-calendar-odd-days-in-a-month-year-century",
            "name": "5 Calendar ● Odd days in a month/ year/ century",
            "minutes": 25,
            "deps": [
              "syllabus--4-clocks-evaluate-the-angular-value-of-a-minute"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 3
            }
          },
          {
            "id": "syllabus--7-speed-distance-and-time",
            "name": "7 Speed, Distance and Time",
            "minutes": 20,
            "deps": [
              "syllabus--5-calendar-odd-days-in-a-month-year-century"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 4
            }
          },
          {
            "id": "syllabus--8-seating-arrangement",
            "name": "8 Seating arrangement",
            "minutes": 15,
            "deps": [
              "syllabus--7-speed-distance-and-time"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 4
            }
          },
          {
            "id": "syllabus--1-introduction-to-sets-sets-and-their-representati-on",
            "name": "1 Introduction to Sets – Sets and their representati on",
            "minutes": 25,
            "deps": [
              "syllabus--8-seating-arrangement"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 4
            }
          },
          {
            "id": "syllabus--3-subsets-intervals-as-subsets",
            "name": "3 Subsets, Intervals as subsets",
            "minutes": 20,
            "deps": [
              "syllabus--1-introduction-to-sets-sets-and-their-representati-on"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 4
            }
          },
          {
            "id": "syllabus--4-ordered-pairs-cartesian-product-of-two-sets",
            "name": "4 Ordered pairs Cartesian product of two sets",
            "minutes": 25,
            "deps": [
              "syllabus--3-subsets-intervals-as-subsets"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 5
            }
          },
          {
            "id": "syllabus--5-relations-expressing-relation-as-a-subset-of-cartesian-product",
            "name": "5 Relations •Expressing relation as a subset of Cartesian product",
            "minutes": 25,
            "deps": [
              "syllabus--4-ordered-pairs-cartesian-product-of-two-sets"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 5
            }
          },
          {
            "id": "syllabus--6-mathematical-logic",
            "name": "6 Mathematical Logic",
            "minutes": 15,
            "deps": [
              "syllabus--5-relations-expressing-relation-as-a-subset-of-cartesian-product"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 5
            }
          },
          {
            "id": "syllabus--7-sequence-and-series",
            "name": "7 Sequence and Series",
            "minutes": 15,
            "deps": [
              "syllabus--6-mathematical-logic"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 5
            }
          },
          {
            "id": "syllabus--8-arithmetic-progression",
            "name": "8 Arithmetic Progression",
            "minutes": 15,
            "deps": [
              "syllabus--7-sequence-and-series"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 5
            }
          },
          {
            "id": "syllabus--9-geometric-progression",
            "name": "9 Geometric Progression",
            "minutes": 15,
            "deps": [
              "syllabus--8-arithmetic-progression"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 5
            }
          },
          {
            "id": "syllabus--1-functions-and-their-graphs",
            "name": "1 Functions and their graphs",
            "minutes": 20,
            "deps": [
              "syllabus--9-geometric-progression"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 6
            }
          },
          {
            "id": "syllabus--2-limits-and-continuity-of-functions",
            "name": "2 Limits and continuity of functions",
            "minutes": 20,
            "deps": [
              "syllabus--1-functions-and-their-graphs"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 6
            }
          },
          {
            "id": "syllabus--3-differentiation-instantaneous-rate-of-change",
            "name": "3 Differentiation ● Instantaneous rate of change",
            "minutes": 20,
            "deps": [
              "syllabus--2-limits-and-continuity-of-functions"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 6
            }
          },
          {
            "id": "syllabus--4-algebra-of-derivatives",
            "name": "4 Algebra of derivatives",
            "minutes": 15,
            "deps": [
              "syllabus--3-differentiation-instantaneous-rate-of-change"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 6
            }
          },
          {
            "id": "syllabus--1-combinatorics-factorial-of-a-number",
            "name": "1 Combinatorics ● Factorial of a number",
            "minutes": 20,
            "deps": [
              "syllabus--4-algebra-of-derivatives"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 6
            }
          },
          {
            "id": "syllabus--2-probability-random-experiment-and-sample-space-with-suitable-examples",
            "name": "2 Probability ● Random experiment and sample space with suitable examples",
            "minutes": 25,
            "deps": [
              "syllabus--1-combinatorics-factorial-of-a-number"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 7
            }
          },
          {
            "id": "syllabus--1-measures-of-dispersion",
            "name": "1 Measures of Dispersion",
            "minutes": 15,
            "deps": [
              "syllabus--2-probability-random-experiment-and-sample-space-with-suitable-examples"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 7
            }
          },
          {
            "id": "syllabus--2-percentiles-concept-of-percentile-rank",
            "name": "2 Percentiles ● Concept of Percentile rank",
            "minutes": 20,
            "deps": [
              "syllabus--1-measures-of-dispersion"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 7
            }
          },
          {
            "id": "syllabus--3-correlation-concept-of-correlation",
            "name": "3 Correlation ● Concept of Correlation",
            "minutes": 20,
            "deps": [
              "syllabus--2-percentiles-concept-of-percentile-rank"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 7
            }
          },
          {
            "id": "syllabus--4-regression-concept-of-regression-analysis",
            "name": "4 Regression ● Concept of Regression analysis",
            "minutes": 20,
            "deps": [
              "syllabus--3-correlation-concept-of-correlation"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 7
            }
          },
          {
            "id": "syllabus--1-interest-and-interest-rates",
            "name": "1 Interest and Interest Rates",
            "minutes": 20,
            "deps": [
              "syllabus--4-regression-concept-of-regression-analysis"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 8
            }
          },
          {
            "id": "syllabus--2-annuities-meaning-of-immediate-annuity-annuity-due-and-deferred-annuity",
            "name": "2 Annuities ●Meaning of Immediate Annuity, Annuity due and Deferred Annuity",
            "minutes": 25,
            "deps": [
              "syllabus--1-interest-and-interest-rates"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 8
            }
          },
          {
            "id": "syllabus--3-taxes-and-utility-bills",
            "name": "3 Taxes and Utility Bills",
            "minutes": 20,
            "deps": [
              "syllabus--2-annuities-meaning-of-immediate-annuity-annuity-due-and-deferred-annuity"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 8
            }
          },
          {
            "id": "syllabus--1-straight-lines-concept-of-slope-of-a-line",
            "name": "1 Straight lines ● Concept of slope of a line",
            "minutes": 25,
            "deps": [
              "syllabus--3-taxes-and-utility-bills"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 8
            }
          },
          {
            "id": "syllabus--2-circles-and-parabola",
            "name": "2 Circles and Parabola",
            "minutes": 15,
            "deps": [
              "syllabus--1-straight-lines-concept-of-slope-of-a-line"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 9
            }
          },
          {
            "id": "syllabus--personal-budgeting-designing-a-comprehensive-monthly-budget-tracker-in-a-spreads",
            "name": "Personal Budgeting: Designing a comprehensive monthly budget tracker in a spreadsheet to manage income and expenditures using summation and percentage formulas",
            "minutes": 25,
            "deps": [
              "syllabus--2-circles-and-parabola"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 9
            }
          },
          {
            "id": "syllabus--interest-growth-analysis-developing-a-comparative-sheet-for-simple-vs-compound-i",
            "name": "Interest Growth Analysis: Developing a comparative sheet for Simple vs. Compound Interest to track the growth of an investment over time",
            "minutes": 25,
            "deps": [
              "syllabus--personal-budgeting-designing-a-comprehensive-monthly-budget-tracker-in-a-spreads"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 9
            }
          },
          {
            "id": "syllabus--1-modulo-arithmetic-define-modulus-of-an-integer",
            "name": "1 Modulo Arithmetic • Define modulus of an integer",
            "minutes": 25,
            "deps": [
              "syllabus--interest-growth-analysis-developing-a-comparative-sheet-for-simple-vs-compound-i"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 11
            }
          },
          {
            "id": "syllabus--2-congruence-modulo-define-congruence-modulo",
            "name": "2 Congruence Modulo ● Define congruence modulo",
            "minutes": 20,
            "deps": [
              "syllabus--1-modulo-arithmetic-define-modulus-of-an-integer"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 11
            }
          },
          {
            "id": "syllabus--3-alligation-and-mixture",
            "name": "3 Alligation and Mixture",
            "minutes": 15,
            "deps": [
              "syllabus--2-congruence-modulo-define-congruence-modulo"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 11
            }
          },
          {
            "id": "syllabus--4-numerical-problems-solve-real-life-problems-mathematically-boats-and-streams",
            "name": "4 Numerical Problems Solve real life problems mathematically Boats and Streams",
            "minutes": 25,
            "deps": [
              "syllabus--3-alligation-and-mixture"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 11
            }
          },
          {
            "id": "syllabus--5-numerical-inequalities",
            "name": "5 Numerical Inequalities",
            "minutes": 15,
            "deps": [
              "syllabus--4-numerical-problems-solve-real-life-problems-mathematically-boats-and-streams"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 11
            }
          },
          {
            "id": "syllabus--1-matrices-and-types-of-matrices",
            "name": "1 Matrices and types of matrices",
            "minutes": 20,
            "deps": [
              "syllabus--5-numerical-inequalities"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 12
            }
          },
          {
            "id": "syllabus--2-equality-of-matrices-transpose-of-a-matrix-symmetric-and-skew-symmetric-matrix",
            "name": "2 Equality of matrices, Transpose of a matrix, Symmetric and Skew symmetric matrix",
            "minutes": 25,
            "deps": [
              "syllabus--1-matrices-and-types-of-matrices"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 12
            }
          },
          {
            "id": "syllabus--3-algebra-of-matrices-perform-operations-like-addition-subtraction-on-matrices-o",
            "name": "3 Algebra of Matrices ● Perform operations like addition & subtraction on matrices of same order",
            "minutes": 25,
            "deps": [
              "syllabus--2-equality-of-matrices-transpose-of-a-matrix-symmetric-and-skew-symmetric-matrix"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 12
            }
          },
          {
            "id": "syllabus--4-determinants-find-determinant-of-a-square-matrix",
            "name": "4 Determinants ● Find determinant of a square matrix",
            "minutes": 25,
            "deps": [
              "syllabus--3-algebra-of-matrices-perform-operations-like-addition-subtraction-on-matrices-o"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 12
            }
          },
          {
            "id": "syllabus--5-inverse-of-a-matrix-define-the-inverse-of-a-square-matrix",
            "name": "5 Inverse of a matrix • Define the inverse of a square matrix",
            "minutes": 25,
            "deps": [
              "syllabus--4-determinants-find-determinant-of-a-square-matrix"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 12
            }
          },
          {
            "id": "syllabus--6-solving-system-of-simultaneous-equations-using-matrix-method-and-cramers-rule",
            "name": "6 Solving system of simultaneous equations using matrix method and Cramer’s rule",
            "minutes": 25,
            "deps": [
              "syllabus--5-inverse-of-a-matrix-define-the-inverse-of-a-square-matrix"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 12
            }
          },
          {
            "id": "syllabus--1-derivatives-up-to-second-order",
            "name": "1 Derivatives up to second order",
            "minutes": 20,
            "deps": [
              "syllabus--6-solving-system-of-simultaneous-equations-using-matrix-method-and-cramers-rule"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 13
            }
          },
          {
            "id": "syllabus--2-application-of-derivatives",
            "name": "2 Application of Derivatives",
            "minutes": 15,
            "deps": [
              "syllabus--1-derivatives-up-to-second-order"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 13
            }
          },
          {
            "id": "syllabus--3-marginal-cost-and-marginal-revenue-using-derivatives",
            "name": "3 Marginal Cost and Marginal Revenue using derivatives",
            "minutes": 25,
            "deps": [
              "syllabus--2-application-of-derivatives"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 13
            }
          },
          {
            "id": "syllabus--4-increasing",
            "name": "4 Increasing",
            "minutes": 10,
            "deps": [
              "syllabus--3-marginal-cost-and-marginal-revenue-using-derivatives"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 13
            }
          },
          {
            "id": "syllabus--5-maxima-and-minima-determine-critical-points-of-the-function",
            "name": "5 Maxima and Minima • Determine critical points of the function",
            "minutes": 25,
            "deps": [
              "syllabus--4-increasing"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 13
            }
          },
          {
            "id": "syllabus--6-integration-understand-and-determine-indefinite-integrals-of-simple-functions-",
            "name": "6 Integration • Understand and determine indefinite integrals of simple functions as anti- derivative",
            "minutes": 25,
            "deps": [
              "syllabus--5-maxima-and-minima-determine-critical-points-of-the-function"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 13
            }
          },
          {
            "id": "syllabus--8-definite-integrals-as-area-under-the-curve",
            "name": "8 Definite Integrals as area under the curve",
            "minutes": 25,
            "deps": [
              "syllabus--6-integration-understand-and-determine-indefinite-integrals-of-simple-functions-"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 14
            }
          },
          {
            "id": "syllabus--9-application-of-integration",
            "name": "9 Application of Integration",
            "minutes": 15,
            "deps": [
              "syllabus--8-definite-integrals-as-area-under-the-curve"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 14
            }
          },
          {
            "id": "syllabus--10-differential-equations-recognize-a-differential-equation",
            "name": "10 Differential Equations ●Recognize a differential equation",
            "minutes": 20,
            "deps": [
              "syllabus--9-application-of-integration"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 14
            }
          },
          {
            "id": "syllabus--11-formulating-and-solving-differential-equations",
            "name": "11 Formulating and Solving Differential Equations",
            "minutes": 20,
            "deps": [
              "syllabus--10-differential-equations-recognize-a-differential-equation"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 14
            }
          },
          {
            "id": "syllabus--1-probability-distribution",
            "name": "1 Probability Distribution",
            "minutes": 15,
            "deps": [
              "syllabus--11-formulating-and-solving-differential-equations"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 14
            }
          },
          {
            "id": "syllabus--2-mathematical-expectation",
            "name": "2 Mathematical Expectation",
            "minutes": 15,
            "deps": [
              "syllabus--1-probability-distribution"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 14
            }
          },
          {
            "id": "syllabus--3-variance-calculate-the-variance-and-s-d-of-a-random-variable",
            "name": "3 Variance ●Calculate the Variance and S.D. of a random variable",
            "minutes": 25,
            "deps": [
              "syllabus--2-mathematical-expectation"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 14
            }
          },
          {
            "id": "syllabus--5-poison-distribution-understand-the-conditions-of-poisson-distribution",
            "name": "5 Poison Distribution ●Understand the Conditions of Poisson Distribution",
            "minutes": 25,
            "deps": [
              "syllabus--3-variance-calculate-the-variance-and-s-d-of-a-random-variable"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 15
            }
          },
          {
            "id": "syllabus--6-normal-distribution-understand-normal-distribution-is-a-continuous-distributio",
            "name": "6 Normal Distribution ●Understand normal distribution is a Continuous distribution",
            "minutes": 25,
            "deps": [
              "syllabus--5-poison-distribution-understand-the-conditions-of-poisson-distribution"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 15
            }
          },
          {
            "id": "syllabus--1-population-and-sample",
            "name": "1 Population and Sample",
            "minutes": 15,
            "deps": [
              "syllabus--6-normal-distribution-understand-normal-distribution-is-a-continuous-distributio"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 15
            }
          },
          {
            "id": "syllabus--3-t-test-one-sample-t-test-and-for-a-small-group-sample",
            "name": "3 t-Test (one sample t-test and for a small group sample)",
            "minutes": 25,
            "deps": [
              "syllabus--1-population-and-sample"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 16
            }
          },
          {
            "id": "syllabus--1-time-series-identify-time-series-as-chronological-data",
            "name": "1 Time Series ●Identify time series as chronological data",
            "minutes": 25,
            "deps": [
              "syllabus--3-t-test-one-sample-t-test-and-for-a-small-group-sample"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 16
            }
          },
          {
            "id": "syllabus--2-components-of-time-series",
            "name": "2 Components of Time Series",
            "minutes": 20,
            "deps": [
              "syllabus--1-time-series-identify-time-series-as-chronological-data"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 16
            }
          },
          {
            "id": "syllabus--3-time-series-analysis-for-univariate-data",
            "name": "3 Time Series analysis for univariate data",
            "minutes": 20,
            "deps": [
              "syllabus--2-components-of-time-series"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 16
            }
          },
          {
            "id": "syllabus--4-secular-trend-understand-the-long-term-tendency",
            "name": "4 Secular Trend ● Understand the long-term tendency",
            "minutes": 25,
            "deps": [
              "syllabus--3-time-series-analysis-for-univariate-data"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 16
            }
          },
          {
            "id": "syllabus--5-methods-of-measuring-trend",
            "name": "5 Methods of Measuring trend",
            "minutes": 20,
            "deps": [
              "syllabus--4-secular-trend-understand-the-long-term-tendency"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 16
            }
          },
          {
            "id": "syllabus--1-perpetuity-sinking-funds",
            "name": "1 Perpetuity, Sinking Funds",
            "minutes": 15,
            "deps": [
              "syllabus--5-methods-of-measuring-trend"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 17
            }
          },
          {
            "id": "syllabus--2-valuation-of-bonds",
            "name": "2 Valuation of Bonds",
            "minutes": 15,
            "deps": [
              "syllabus--1-perpetuity-sinking-funds"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 17
            }
          },
          {
            "id": "syllabus--3-calculation-of-emi",
            "name": "3 Calculation of EMI",
            "minutes": 15,
            "deps": [
              "syllabus--2-valuation-of-bonds"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 17
            }
          },
          {
            "id": "syllabus--4-compound-annual-growth-rate",
            "name": "4 Compound Annual Growth Rate",
            "minutes": 20,
            "deps": [
              "syllabus--3-calculation-of-emi"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 17
            }
          },
          {
            "id": "syllabus--5-linear-method-of-depreciation",
            "name": "5 Linear method of Depreciation",
            "minutes": 20,
            "deps": [
              "syllabus--4-compound-annual-growth-rate"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 17
            }
          },
          {
            "id": "syllabus--1-introduction-and-related-terminology",
            "name": "1 Introduction and related terminology",
            "minutes": 20,
            "deps": [
              "syllabus--5-linear-method-of-depreciation"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 17
            }
          },
          {
            "id": "syllabus--3-different-types-of-linear-programming-problems",
            "name": "3 Different types of Linear Programming Problems",
            "minutes": 20,
            "deps": [
              "syllabus--1-introduction-and-related-terminology"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 18
            }
          },
          {
            "id": "syllabus--4-graphical-method-of-solution-for-problems-in-two-variables",
            "name": "4 Graphical method of solution for problems in two variables",
            "minutes": 25,
            "deps": [
              "syllabus--3-different-types-of-linear-programming-problems"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 18
            }
          },
          {
            "id": "syllabus--5-feasible-and-infeasible-regions",
            "name": "5 Feasible and Infeasible Regions",
            "minutes": 20,
            "deps": [
              "syllabus--4-graphical-method-of-solution-for-problems-in-two-variables"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 18
            }
          },
          {
            "id": "syllabus--6-feasible-and-infeasible-solutions-optimal-feasible-solution",
            "name": "6 Feasible and infeasible solutions, optimal feasible solution",
            "minutes": 25,
            "deps": [
              "syllabus--5-feasible-and-infeasible-regions"
            ],
            "source": {
              "pdf": "applied-maths",
              "page": 18
            }
          }
        ]
      }
    ]
  },
  {
    "id": "accountancy",
    "name": "Accountancy",
    "chapters": [
      {
        "id": "theory",
        "name": "Theory",
        "concepts": [
          {
            "id": "theory--20-marks-units-marks",
            "name": "20 Marks Units Marks",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "theory--20-marks",
            "name": "20 Marks",
            "minutes": 10,
            "deps": [
              "theory--20-marks-units-marks"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "part-a",
        "name": "Part A",
        "concepts": [
          {
            "id": "part-a--financial-accounting-1",
            "name": "Financial Accounting-1",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "part-a--accounting-for-partnership-firms-and-companies",
            "name": "Accounting for Partnership Firms and Companies",
            "minutes": 20,
            "deps": [
              "part-a--financial-accounting-1"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "part-b",
        "name": "Part B",
        "concepts": [
          {
            "id": "part-b--financial-accounting-ii",
            "name": "Financial Accounting-II",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "part-b--financial-accounting-ii-2",
            "name": "Financial Accounting - II",
            "minutes": 15,
            "deps": [
              "part-b--financial-accounting-ii"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "part-b--financial-statement-analysis",
            "name": "Financial Statement Analysis",
            "minutes": 15,
            "deps": [
              "part-b--financial-accounting-ii-2"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 12
            }
          },
          {
            "id": "part-b--computerised-accounting",
            "name": "Computerised Accounting",
            "minutes": 10,
            "deps": [
              "part-b--financial-statement-analysis"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "part-a",
        "name": "PART A",
        "concepts": [
          {
            "id": "part-a--financial-accounting-i",
            "name": "FINANCIAL ACCOUNTING - I",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "unit-1",
        "name": "Unit-1",
        "concepts": [
          {
            "id": "unit-1--meaning",
            "name": "meaning",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--of-information",
            "name": "of information",
            "minutes": 10,
            "deps": [
              "unit-1--meaning"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--objectives",
            "name": "objectives",
            "minutes": 10,
            "deps": [
              "unit-1--of-information"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--significance",
            "name": "significance",
            "minutes": 10,
            "deps": [
              "unit-1--objectives"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--limitations",
            "name": "limitations",
            "minutes": 10,
            "deps": [
              "unit-1--significance"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--types-of-accounting-information",
            "name": "types of accounting information",
            "minutes": 15,
            "deps": [
              "unit-1--limitations"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--business-entities-that-use-accounting-information-for-transaction",
            "name": "Business entities that use accounting information for Transaction",
            "minutes": 25,
            "deps": [
              "unit-1--types-of-accounting-information"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--capital",
            "name": "Capital",
            "minutes": 10,
            "deps": [
              "unit-1--business-entities-that-use-accounting-information-for-transaction"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--expenditure-capital-and-and-differentiate-between-different-related-revenue",
            "name": "Expenditure (Capital and and differentiate between different related Revenue)",
            "minutes": 25,
            "deps": [
              "unit-1--capital"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--expense",
            "name": "Expense",
            "minutes": 10,
            "deps": [
              "unit-1--expenditure-capital-and-and-differentiate-between-different-related-revenue"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--revenue",
            "name": "Revenue",
            "minutes": 10,
            "deps": [
              "unit-1--expense"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--income",
            "name": "Income",
            "minutes": 10,
            "deps": [
              "unit-1--revenue"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--terms-like-current-and-non-current",
            "name": "terms like current and non-current",
            "minutes": 20,
            "deps": [
              "unit-1--income"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--capital-profit",
            "name": "capital Profit",
            "minutes": 10,
            "deps": [
              "unit-1--terms-like-current-and-non-current"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--gain",
            "name": "Gain",
            "minutes": 10,
            "deps": [
              "unit-1--capital-profit"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--loss",
            "name": "Loss",
            "minutes": 10,
            "deps": [
              "unit-1--gain"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--purchase",
            "name": "Purchase",
            "minutes": 10,
            "deps": [
              "unit-1--loss"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--sales",
            "name": "Sales",
            "minutes": 10,
            "deps": [
              "unit-1--purchase"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--goods",
            "name": "Goods",
            "minutes": 10,
            "deps": [
              "unit-1--sales"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--debtor",
            "name": "Debtor",
            "minutes": 10,
            "deps": [
              "unit-1--goods"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--creditor",
            "name": "Creditor",
            "minutes": 10,
            "deps": [
              "unit-1--debtor"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--voucher",
            "name": "Voucher",
            "minutes": 10,
            "deps": [
              "unit-1--creditor"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--liabilities",
            "name": "liabilities",
            "minutes": 10,
            "deps": [
              "unit-1--voucher"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--assets",
            "name": "assets",
            "minutes": 10,
            "deps": [
              "unit-1--liabilities"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "unit-1--cash-and-credit-sales-purchases-relating-to",
            "name": "cash and credit sales/purchases relating to",
            "minutes": 20,
            "deps": [
              "unit-1--assets"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "gaap",
        "name": "GAAP",
        "concepts": [
          {
            "id": "gaap--business-entity",
            "name": "Business Entity",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "gaap--profits-and-gains-money-measurement",
            "name": "profits and gains. Money Measurement",
            "minutes": 20,
            "deps": [
              "gaap--business-entity"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          },
          {
            "id": "gaap--going-concern",
            "name": "Going Concern",
            "minutes": 10,
            "deps": [
              "gaap--profits-and-gains-money-measurement"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "bank-reconciliation-statement",
        "name": "Bank Reconciliation Statement",
        "concepts": [
          {
            "id": "bank-reconciliation-statement--features",
            "name": "Features",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 4
            }
          },
          {
            "id": "bank-reconciliation-statement--need",
            "name": "Need",
            "minutes": 10,
            "deps": [
              "bank-reconciliation-statement--features"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 4
            }
          },
          {
            "id": "bank-reconciliation-statement--per-their-nature-in-different-subsidiary-books-causes",
            "name": "per their nature in different subsidiary books . Causes",
            "minutes": 25,
            "deps": [
              "bank-reconciliation-statement--need"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 4
            }
          },
          {
            "id": "bank-reconciliation-statement--bank-statement-and-to-reconcile-both-the-i-straight-line-method-slm-balances",
            "name": "bank statement and to reconcile both the i. Straight Line Method (SLM) balances",
            "minutes": 25,
            "deps": [
              "bank-reconciliation-statement--per-their-nature-in-different-subsidiary-books-causes"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 4
            }
          },
          {
            "id": "bank-reconciliation-statement--bank-reconciliation-statement-is-ii-written-down-value-method-wdv-prepared",
            "name": "bank reconciliation statement is ii. Written Down Value Method (WDV) prepared",
            "minutes": 25,
            "deps": [
              "bank-reconciliation-statement--bank-statement-and-to-reconcile-both-the-i-straight-line-method-slm-balances"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "balance-sheet",
        "name": "Balance Sheet",
        "concepts": [
          {
            "id": "balance-sheet--outstanding-expenses",
            "name": "outstanding expenses",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--accrued-income",
            "name": "accrued income",
            "minutes": 10,
            "deps": [
              "balance-sheet--outstanding-expenses"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--income-received-in-other-than-those-shown-in-trial-balance-which-advance",
            "name": "income received in other than those shown in trial balance which advance",
            "minutes": 25,
            "deps": [
              "balance-sheet--accrued-income"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--depreciation",
            "name": "depreciation",
            "minutes": 10,
            "deps": [
              "balance-sheet--income-received-in-other-than-those-shown-in-trial-balance-which-advance"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--bad-debts",
            "name": "bad debts",
            "minutes": 10,
            "deps": [
              "balance-sheet--depreciation"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--provision-for-may-need-adjustments-while-preparing-doubtful-debts",
            "name": "provision for may need adjustments while preparing doubtful debts",
            "minutes": 25,
            "deps": [
              "balance-sheet--bad-debts"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--provision-for-discount-on-debtors",
            "name": "provision for discount on debtors",
            "minutes": 20,
            "deps": [
              "balance-sheet--provision-for-may-need-adjustments-while-preparing-doubtful-debts"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--financial-statements-abnormal-loss",
            "name": "financial statements. Abnormal loss",
            "minutes": 15,
            "deps": [
              "balance-sheet--provision-for-discount-on-debtors"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--loss-account-and-balance-sheet-of-a-sole-closing-stock",
            "name": "Loss account and Balance Sheet of a sole closing stock",
            "minutes": 25,
            "deps": [
              "balance-sheet--financial-statements-abnormal-loss"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          },
          {
            "id": "balance-sheet--provisions",
            "name": "provisions",
            "minutes": 10,
            "deps": [
              "balance-sheet--loss-account-and-balance-sheet-of-a-sole-closing-stock"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "part-c",
        "name": "Part C",
        "concepts": [
          {
            "id": "part-c--project-work-any-one-1-collection-of-source-documents",
            "name": "Project Work (Any One) 1. Collection of source documents",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 6
            }
          },
          {
            "id": "part-c--preparation-of-vouchers",
            "name": "preparation of vouchers",
            "minutes": 15,
            "deps": [
              "part-c--project-work-any-one-1-collection-of-source-documents"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 6
            }
          },
          {
            "id": "part-c--incomes-and-profit-loss",
            "name": "incomes and profit (loss)",
            "minutes": 15,
            "deps": [
              "part-c--preparation-of-vouchers"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "unit-1",
        "name": "Unit 1",
        "concepts": [
          {
            "id": "unit-1--nature",
            "name": "nature",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "goodwill",
        "name": "Goodwill",
        "concepts": [
          {
            "id": "goodwill--factors-affecting",
            "name": "factors affecting",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          },
          {
            "id": "goodwill--need-for-account-involving-guarantee-of-profits-valuation",
            "name": "need for account involving guarantee of profits. valuation",
            "minutes": 25,
            "deps": [
              "goodwill--factors-affecting"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          },
          {
            "id": "goodwill--gaining-the-existing-partners-sacrificing-ratio",
            "name": "gaining the existing partners - sacrificing ratio",
            "minutes": 20,
            "deps": [
              "goodwill--need-for-account-involving-guarantee-of-profits-valuation"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          },
          {
            "id": "goodwill--ratio-and-the-change-in-profit-sharing-ratio-gaining-ratio",
            "name": "ratio and the change in profit sharing ratio gaining ratio",
            "minutes": 25,
            "deps": [
              "goodwill--gaining-the-existing-partners-sacrificing-ratio"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          },
          {
            "id": "goodwill--treatment-of-goodwill-as-per-as-26",
            "name": "treatment of goodwill (as per AS 26)",
            "minutes": 20,
            "deps": [
              "goodwill--ratio-and-the-change-in-profit-sharing-ratio-gaining-ratio"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          },
          {
            "id": "goodwill--accumulated-profits-and-losses",
            "name": "accumulated profits and losses",
            "minutes": 15,
            "deps": [
              "goodwill--treatment-of-goodwill-as-per-as-26"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--to-familiarize-students-with-new-and-emerging-areas-in-the-preparation-and-prese",
            "name": "To familiarize students with new and emerging areas in the preparation and presentation of financial statements",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "accountancy",
              "page": 1
            }
          },
          {
            "id": "syllabus--to-acquaint-students-with-basic-accounting-concepts-and-accounting-standards",
            "name": "To acquaint students with basic accounting concepts and accounting standards",
            "minutes": 25,
            "deps": [
              "syllabus--to-familiarize-students-with-new-and-emerging-areas-in-the-preparation-and-prese"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 1
            }
          },
          {
            "id": "syllabus--to-develop-the-skills-of-designing-need-based-accounting-database",
            "name": "To develop the skills of designing need based accounting database",
            "minutes": 25,
            "deps": [
              "syllabus--to-acquaint-students-with-basic-accounting-concepts-and-accounting-standards"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 1
            }
          },
          {
            "id": "syllabus--to-appreciate-the-role-of-ict-in-business-operations",
            "name": "To appreciate the role of ICT in business operations",
            "minutes": 25,
            "deps": [
              "syllabus--to-develop-the-skills-of-designing-need-based-accounting-database"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 1
            }
          },
          {
            "id": "syllabus--to-develop-an-understanding-about-recording-of-business-transactions-and-prepara",
            "name": "To develop an understanding about recording of business transactions and preparation of financial statements",
            "minutes": 25,
            "deps": [
              "syllabus--to-appreciate-the-role-of-ict-in-business-operations"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 1
            }
          },
          {
            "id": "syllabus--collection-of-source-documents-preparation-of-vouchers-recording-of-transactions",
            "name": "Collection of source documents, preparation of vouchers, recording of transactions with the help of vouchers",
            "minutes": 25,
            "deps": [
              "syllabus--to-develop-an-understanding-about-recording-of-business-transactions-and-prepara"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 6
            }
          },
          {
            "id": "syllabus--preparation-of-bank-reconciliation-statement-with-the-given-cash-book-and-the-pa",
            "name": "Preparation of Bank Reconciliation Statement with the given cash book and the pass book with twenty to twenty-five transactions",
            "minutes": 25,
            "deps": [
              "syllabus--collection-of-source-documents-preparation-of-vouchers-recording-of-transactions"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 6
            }
          },
          {
            "id": "syllabus--a-beauty-parlour-10-mens-wear-19-a-coffee-shop",
            "name": "A beauty parlour 10. Men's wear 19. A coffee shop",
            "minutes": 25,
            "deps": [
              "syllabus--preparation-of-bank-reconciliation-statement-with-the-given-cash-book-and-the-pa"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--mens-saloon-11-ladies-wear-20-a-music-shop",
            "name": "Men's saloon 11. Ladies wear 20. A music shop",
            "minutes": 25,
            "deps": [
              "syllabus--a-beauty-parlour-10-mens-wear-19-a-coffee-shop"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--a-tailoring-shop-12-kiddies-wear-21-a-juice-shop",
            "name": "A tailoring shop 12. Kiddies wear 21. A juice shop",
            "minutes": 25,
            "deps": [
              "syllabus--mens-saloon-11-ladies-wear-20-a-music-shop"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--a-canteen-13-a-saree-shop-22-a-school-canteen",
            "name": "A canteen 13. A Saree shop 22. A school canteen",
            "minutes": 25,
            "deps": [
              "syllabus--a-tailoring-shop-12-kiddies-wear-21-a-juice-shop"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--a-cake-shop-14-artificial-jewellery-shop-23-an-ice-cream-parlour",
            "name": "A cake shop 14. Artificial jewellery shop 23. An ice cream parlour",
            "minutes": 25,
            "deps": [
              "syllabus--a-canteen-13-a-saree-shop-22-a-school-canteen"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--a-confectionery-shop-15-a-small-restaurant-24-a-sandwich-shop",
            "name": "A confectionery shop 15. A small restaurant 24. A sandwich shop",
            "minutes": 25,
            "deps": [
              "syllabus--a-cake-shop-14-artificial-jewellery-shop-23-an-ice-cream-parlour"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--a-chocolate-shop-16-a-sweet-shop-25-a-flower-shop",
            "name": "A chocolate shop 16. A sweet shop 25. A flower shop",
            "minutes": 25,
            "deps": [
              "syllabus--a-confectionery-shop-15-a-small-restaurant-24-a-sandwich-shop"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--a-dry-cleaner-17-a-grocery-shop",
            "name": "A dry cleaner 17. A grocery shop",
            "minutes": 20,
            "deps": [
              "syllabus--a-chocolate-shop-16-a-sweet-shop-25-a-flower-shop"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--rent-19-wages-and-salary",
            "name": "Rent 19. Wages and Salary",
            "minutes": 20,
            "deps": [
              "syllabus--a-dry-cleaner-17-a-grocery-shop"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--advance-rent-approximately-three-months-20-newspaper-and-magazines",
            "name": "Advance rent [approximately three months] 20. Newspaper and magazines",
            "minutes": 25,
            "deps": [
              "syllabus--rent-19-wages-and-salary"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--electricity-deposit-21-petty-expenses",
            "name": "Electricity deposit 21. Petty expenses",
            "minutes": 20,
            "deps": [
              "syllabus--advance-rent-approximately-three-months-20-newspaper-and-magazines"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--electricity-bill-22-tea-expenses",
            "name": "Electricity bill 22. Tea expenses",
            "minutes": 20,
            "deps": [
              "syllabus--electricity-deposit-21-petty-expenses"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--electricity-fitting-23-packaging-expenses",
            "name": "Electricity fitting 23. Packaging expenses",
            "minutes": 20,
            "deps": [
              "syllabus--electricity-bill-22-tea-expenses"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--water-bill-24-transport",
            "name": "Water bill 24. Transport",
            "minutes": 15,
            "deps": [
              "syllabus--electricity-fitting-23-packaging-expenses"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--water-connection-security-deposit-25-delivery-cycle-or-a-vehicle-purchased",
            "name": "Water connection security deposit 25. Delivery cycle or a vehicle purchased",
            "minutes": 25,
            "deps": [
              "syllabus--water-bill-24-transport"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--water-fittings-26-registration",
            "name": "Water fittings 26. Registration",
            "minutes": 15,
            "deps": [
              "syllabus--water-connection-security-deposit-25-delivery-cycle-or-a-vehicle-purchased"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--telephone-bill-27-insurance",
            "name": "Telephone bill 27. Insurance",
            "minutes": 15,
            "deps": [
              "syllabus--water-fittings-26-registration"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--telephone-security-deposit-28-auditors-fee",
            "name": "Telephone security deposit 28. Auditors fee",
            "minutes": 20,
            "deps": [
              "syllabus--telephone-bill-27-insurance"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--telephone-instrument-29-repairs-maintenance",
            "name": "Telephone instrument 29. Repairs & Maintenance",
            "minutes": 20,
            "deps": [
              "syllabus--telephone-security-deposit-28-auditors-fee"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--furniture-30-depreciations",
            "name": "Furniture 30. Depreciations",
            "minutes": 15,
            "deps": [
              "syllabus--telephone-instrument-29-repairs-maintenance"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--computers-31-air-conditioners",
            "name": "Computers 31. Air conditioners",
            "minutes": 15,
            "deps": [
              "syllabus--furniture-30-depreciations"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--internet-connection-32-fans-and-lights",
            "name": "Internet connection 32. Fans and lights",
            "minutes": 20,
            "deps": [
              "syllabus--computers-31-air-conditioners"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--stationery-33-interior-decorations",
            "name": "Stationery 33. Interior decorations",
            "minutes": 15,
            "deps": [
              "syllabus--internet-connection-32-fans-and-lights"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--advertisements-34-refrigerators",
            "name": "Advertisements 34. Refrigerators",
            "minutes": 15,
            "deps": [
              "syllabus--stationery-33-interior-decorations"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--glow-sign-35-purchase-and-sales",
            "name": "Glow sign 35. Purchase and sales",
            "minutes": 20,
            "deps": [
              "syllabus--advertisements-34-refrigerators"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 7
            }
          },
          {
            "id": "syllabus--comparative-and-common-size-financial-statements",
            "name": "Comparative and common size financial statements",
            "minutes": 20,
            "deps": [
              "syllabus--glow-sign-35-purchase-and-sales"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 15
            }
          },
          {
            "id": "syllabus--accounting-ratios",
            "name": "Accounting Ratios",
            "minutes": 10,
            "deps": [
              "syllabus--comparative-and-common-size-financial-statements"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 15
            }
          },
          {
            "id": "syllabus--segment-reports",
            "name": "Segment Reports",
            "minutes": 10,
            "deps": [
              "syllabus--accounting-ratios"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 15
            }
          },
          {
            "id": "syllabus--cash-flow-statements-or-part-b-computerised-accounting-unit-4-computerised-accou",
            "name": "Cash Flow Statements OR Part B: Computerised Accounting Unit 4: Computerised Accounting Overview of Computerised Accounting System",
            "minutes": 25,
            "deps": [
              "syllabus--segment-reports"
            ],
            "source": {
              "pdf": "accountancy",
              "page": 15
            }
          }
        ]
      }
    ]
  },
  {
    "id": "business-studies",
    "name": "Business Studies",
    "chapters": [
      {
        "id": "theory",
        "name": "Theory",
        "concepts": [
          {
            "id": "theory--20-marks",
            "name": "20 Marks",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "part-a",
        "name": "Part A",
        "concepts": [
          {
            "id": "part-a--foundation-of-business-concept-includes-meaning-and-features",
            "name": "Foundation of Business Concept includes meaning and features",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          },
          {
            "id": "part-a--principles-and-functions-of-management",
            "name": "Principles and Functions of Management",
            "minutes": 20,
            "deps": [
              "part-a--foundation-of-business-concept-includes-meaning-and-features"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "history-of-trade-and-commerce-in-india",
        "name": "History of Trade and Commerce in India",
        "concepts": [
          {
            "id": "history-of-trade-and-commerce-in-india--rise-of-and-commerce-in-india-intermediaries",
            "name": "Rise of and Commerce in India Intermediaries",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          },
          {
            "id": "history-of-trade-and-commerce-in-india--transport",
            "name": "Transport",
            "minutes": 10,
            "deps": [
              "history-of-trade-and-commerce-in-india--rise-of-and-commerce-in-india-intermediaries"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          },
          {
            "id": "history-of-trade-and-commerce-in-india--trading",
            "name": "Trading",
            "minutes": 10,
            "deps": [
              "history-of-trade-and-commerce-in-india--transport"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "communities",
        "name": "Communities",
        "concepts": [
          {
            "id": "communities--merchant-corporations",
            "name": "Merchant Corporations",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          },
          {
            "id": "communities--major-trade-centres",
            "name": "Major Trade Centres",
            "minutes": 15,
            "deps": [
              "communities--merchant-corporations"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          },
          {
            "id": "communities--major-imports-and-exports",
            "name": "Major Imports and Exports",
            "minutes": 15,
            "deps": [
              "communities--major-trade-centres"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          },
          {
            "id": "communities--profession-and-employment",
            "name": "profession and employment",
            "minutes": 15,
            "deps": [
              "communities--major-imports-and-exports"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "industry-types",
        "name": "Industry-types",
        "concepts": [
          {
            "id": "industry-types--primary",
            "name": "primary",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 3
            }
          },
          {
            "id": "industry-types--secondary",
            "name": "secondary",
            "minutes": 10,
            "deps": [
              "industry-types--primary"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "hindu-undivided-family-business",
        "name": "Hindu Undivided Family Business",
        "concepts": [
          {
            "id": "hindu-undivided-family-business--merits",
            "name": "merits",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 3
            }
          },
          {
            "id": "hindu-undivided-family-business--producers",
            "name": "producers",
            "minutes": 10,
            "deps": [
              "hindu-undivided-family-business--merits"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 3
            }
          },
          {
            "id": "hindu-undivided-family-business--marketing",
            "name": "marketing",
            "minutes": 10,
            "deps": [
              "hindu-undivided-family-business--producers"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 3
            }
          },
          {
            "id": "hindu-undivided-family-business--farmers",
            "name": "farmers",
            "minutes": 10,
            "deps": [
              "hindu-undivided-family-business--marketing"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 3
            }
          },
          {
            "id": "hindu-undivided-family-business--credit-and-housing-co-operatives",
            "name": "credit and housing co- operatives",
            "minutes": 20,
            "deps": [
              "hindu-undivided-family-business--farmers"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "types",
        "name": "Types",
        "concepts": [
          {
            "id": "types--private",
            "name": "Private",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "unit-3",
        "name": "Unit 3",
        "concepts": [
          {
            "id": "unit-3--public",
            "name": "Public",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "unit-3--private-and-global-enterprises",
            "name": "Private and Global Enterprises",
            "minutes": 15,
            "deps": [
              "unit-3--public"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "forms-of-public-sector-enterprises",
        "name": "Forms of public sector enterprises",
        "concepts": [
          {
            "id": "forms-of-public-sector-enterprises--departmental-undertakings",
            "name": "Departmental Undertakings",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "banking",
        "name": "Banking",
        "concepts": [
          {
            "id": "banking--types-of-bank-accounts-of-business-services-savings",
            "name": "Types of bank accounts - of business services. savings",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "banking--current",
            "name": "current",
            "minutes": 10,
            "deps": [
              "banking--types-of-bank-accounts-of-business-services-savings"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "banking--recurring",
            "name": "recurring",
            "minutes": 10,
            "deps": [
              "banking--current"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "banking--bank-overdraft",
            "name": "Bank Overdraft",
            "minutes": 10,
            "deps": [
              "banking--recurring"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "banking--cash-credit-different-services-provided-by",
            "name": "Cash credit. different services provided by",
            "minutes": 20,
            "deps": [
              "banking--bank-overdraft"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "e-banking",
        "name": "E-Banking",
        "concepts": [
          {
            "id": "e-banking--meaning",
            "name": "meaning",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "e-banking--types-of-digital-banks-payments-insurance-principles-types-life",
            "name": "types of digital banks payments Insurance – Principles. Types – life",
            "minutes": 25,
            "deps": [
              "e-banking--meaning"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "e-banking--health",
            "name": "health",
            "minutes": 10,
            "deps": [
              "e-banking--types-of-digital-banks-payments-insurance-principles-types-life"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "e-banking--insurable-interest",
            "name": "Insurable Interest",
            "minutes": 10,
            "deps": [
              "e-banking--health"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "e-banking--indemnity",
            "name": "Indemnity",
            "minutes": 10,
            "deps": [
              "e-banking--insurable-interest"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          },
          {
            "id": "e-banking--contribution",
            "name": "Contribution",
            "minutes": 10,
            "deps": [
              "e-banking--indemnity"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "e-business",
        "name": "E - business",
        "concepts": [
          {
            "id": "e-business--concept",
            "name": "concept",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "borrowed-funds",
        "name": "Borrowed funds",
        "concepts": [
          {
            "id": "borrowed-funds--debentures-and-bonds",
            "name": "debentures and bonds",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 5
            }
          },
          {
            "id": "borrowed-funds--public-deposits",
            "name": "public deposits",
            "minutes": 10,
            "deps": [
              "borrowed-funds--debentures-and-bonds"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 5
            }
          },
          {
            "id": "borrowed-funds--credit",
            "name": "credit",
            "minutes": 10,
            "deps": [
              "borrowed-funds--public-deposits"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 5
            }
          },
          {
            "id": "borrowed-funds--inter-corporate-deposits-icd-bonds",
            "name": "Inter Corporate Deposits (ICD) bonds",
            "minutes": 20,
            "deps": [
              "borrowed-funds--credit"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 5
            }
          },
          {
            "id": "borrowed-funds--loans-from-financial-institutions-and-commercial-banks",
            "name": "loans from financial institutions and commercial banks",
            "minutes": 20,
            "deps": [
              "borrowed-funds--inter-corporate-deposits-icd-bonds"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "entrepreneurship-development-ed",
        "name": "Entrepreneurship Development (ED)",
        "concepts": [
          {
            "id": "entrepreneurship-development-ed--characteristics-and-need-entrepreneurship-development",
            "name": "Characteristics and Need. Entrepreneurship Development",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "process-of-entrepreneurship-development",
        "name": "Process of Entrepreneurship Development",
        "concepts": [
          {
            "id": "process-of-entrepreneurship-development--ed",
            "name": "(ED)",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 6
            }
          },
          {
            "id": "process-of-entrepreneurship-development--intellectual-property-rights-start-up-india-scheme",
            "name": "Intellectual Property Rights Start-up India Scheme",
            "minutes": 20,
            "deps": [
              "process-of-entrepreneurship-development--ed"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 6
            }
          },
          {
            "id": "process-of-entrepreneurship-development--backward-areas-special-reference-to-rural",
            "name": "backward areas special reference to rural",
            "minutes": 20,
            "deps": [
              "process-of-entrepreneurship-development--intellectual-property-rights-start-up-india-scheme"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 6
            }
          },
          {
            "id": "process-of-entrepreneurship-development--backward-area",
            "name": "backward area",
            "minutes": 10,
            "deps": [
              "process-of-entrepreneurship-development--backward-areas-special-reference-to-rural"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "unit-1",
        "name": "Unit 1",
        "concepts": [
          {
            "id": "unit-1--management-concept",
            "name": "Management - concept",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 9
            }
          },
          {
            "id": "unit-1--objectives",
            "name": "objectives",
            "minutes": 10,
            "deps": [
              "unit-1--management-concept"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 9
            }
          },
          {
            "id": "unit-1--middle-and-lower-levels-of-management-management-functions-planning",
            "name": "middle and lower levels of management Management functions-planning",
            "minutes": 25,
            "deps": [
              "unit-1--objectives"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 9
            }
          },
          {
            "id": "unit-1--staffing",
            "name": "staffing",
            "minutes": 10,
            "deps": [
              "unit-1--middle-and-lower-levels-of-management-management-functions-planning"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "planning",
        "name": "Planning",
        "concepts": [
          {
            "id": "planning--policy",
            "name": "Policy",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 10
            }
          },
          {
            "id": "planning--procedure",
            "name": "Procedure",
            "minutes": 10,
            "deps": [
              "planning--policy"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 10
            }
          },
          {
            "id": "planning--method",
            "name": "Method",
            "minutes": 10,
            "deps": [
              "planning--procedure"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 10
            }
          },
          {
            "id": "planning--rule",
            "name": "Rule",
            "minutes": 10,
            "deps": [
              "planning--method"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 10
            }
          },
          {
            "id": "planning--policies",
            "name": "policies",
            "minutes": 10,
            "deps": [
              "planning--rule"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 10
            }
          },
          {
            "id": "planning--strategy",
            "name": "strategy",
            "minutes": 10,
            "deps": [
              "planning--policies"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 10
            }
          },
          {
            "id": "planning--budget-and-programme-as-types-of-plans",
            "name": "budget and programme as types of plans",
            "minutes": 20,
            "deps": [
              "planning--strategy"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "staffing",
        "name": "Staffing",
        "concepts": [
          {
            "id": "staffing--methods-of-training-on-the-and-development",
            "name": "Methods of training - on the and development",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "directing",
        "name": "Directing",
        "concepts": [
          {
            "id": "directing--styles-authoritative",
            "name": "styles - authoritative",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 12
            }
          },
          {
            "id": "directing--barriers-to-communication-effective-communication",
            "name": "barriers to communication effective communication",
            "minutes": 20,
            "deps": [
              "directing--styles-authoritative"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 12
            }
          }
        ]
      },
      {
        "id": "part-b",
        "name": "Part B",
        "concepts": [
          {
            "id": "part-b--business-finance-and-marketing",
            "name": "Business Finance and Marketing",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "financial-decisions",
        "name": "Financial decisions",
        "concepts": [
          {
            "id": "financial-decisions--investment",
            "name": "investment",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "class-xi",
        "name": "CLASS XI",
        "concepts": [
          {
            "id": "class-xi--guidelines-for-teachers",
            "name": "GUIDELINES FOR TEACHERS",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 16
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--students-must-take-any-one-topic-during-the-academic-session-of-class-xi",
            "name": "Students must take any one topic during the academic session of Class XI",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--the-project-may-be-done-in-a-group-or-individually",
            "name": "The project may be done in a group or individually",
            "minutes": 25,
            "deps": [
              "syllabus--students-must-take-any-one-topic-during-the-academic-session-of-class-xi"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--the-teacher-should-play-the-role-of-a-facilitator-and-should-closely-supervise-t",
            "name": "The teacher should play the role of a facilitator and should closely supervise the process of project completion",
            "minutes": 25,
            "deps": [
              "syllabus--the-project-may-be-done-in-a-group-or-individually"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--the-teachers-must-ensure-that-the-students-self-esteem-should-go-up-and-he",
            "name": "The teachers must ensure that the student’s self esteem should go up, and he",
            "minutes": 25,
            "deps": [
              "syllabus--the-teacher-should-play-the-role-of-a-facilitator-and-should-closely-supervise-t"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--visit-to-a-handicraft-unit",
            "name": "Visit to a Handicraft unit",
            "minutes": 20,
            "deps": [
              "syllabus--the-teachers-must-ensure-that-the-students-self-esteem-should-go-up-and-he"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--visit-to-an-industry",
            "name": "Visit to an Industry",
            "minutes": 15,
            "deps": [
              "syllabus--visit-to-a-handicraft-unit"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--visit-to-a-whole-sale-market-vegetables-fruits-flowers-grains-garments-etc",
            "name": "Visit to a Whole sale market (vegetables, fruits, flowers, grains, garments, etc.)",
            "minutes": 25,
            "deps": [
              "syllabus--visit-to-an-industry"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--visit-to-a-departmental-store",
            "name": "Visit to a Departmental store",
            "minutes": 20,
            "deps": [
              "syllabus--visit-to-a-whole-sale-market-vegetables-fruits-flowers-grains-garments-etc"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--visit-to-a-mall-the-following-points-should-be-kept-in-mind-while-preparing-this",
            "name": "Visit to a Mall. The following points should be kept in mind while preparing this visit",
            "minutes": 25,
            "deps": [
              "syllabus--visit-to-a-departmental-store"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--select-a-suitable-day-free-from-rush-crowd-with-lean-business-hours",
            "name": "Select a suitable day free from rush/crowd with lean business hours",
            "minutes": 25,
            "deps": [
              "syllabus--visit-to-a-mall-the-following-points-should-be-kept-in-mind-while-preparing-this"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--the-teacher-must-visit-the-place-first-and-check-out-on-logistics-its-better-to-",
            "name": "The teacher must visit the place first and check out on logistics. It’s better to seek permission from the concerned business- incharge",
            "minutes": 25,
            "deps": [
              "syllabus--select-a-suitable-day-free-from-rush-crowd-with-lean-business-hours"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--visit-to-be-discussed-with-the-students-in-advance-they-should-be-encouraged-to-",
            "name": "Visit to be discussed with the students in advance. They should be encouraged to prepare a worksheet containing points of observation and reporting",
            "minutes": 25,
            "deps": [
              "syllabus--the-teacher-must-visit-the-place-first-and-check-out-on-logistics-its-better-to-"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--students-may-carry-their-cameras-at-their-own-risk-with-prior-permission-for-col",
            "name": "Students may carry their cameras (at their own risk) with prior permission for collecting evidence of their observations",
            "minutes": 25,
            "deps": [
              "syllabus--visit-to-be-discussed-with-the-students-in-advance-they-should-be-encouraged-to-"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 17
            }
          },
          {
            "id": "syllabus--history-of-insurance-lloyds-contribution",
            "name": "History of Insurance Lloyd’s contribution",
            "minutes": 20,
            "deps": [
              "syllabus--students-may-carry-their-cameras-at-their-own-risk-with-prior-permission-for-col"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--development-of-regulatory-mechanism",
            "name": "Development of regulatory Mechanism",
            "minutes": 15,
            "deps": [
              "syllabus--history-of-insurance-lloyds-contribution"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--insurance-companies-in-india",
            "name": "Insurance Companies in India",
            "minutes": 15,
            "deps": [
              "syllabus--development-of-regulatory-mechanism"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--principles-of-insurance",
            "name": "Principles of Insurance",
            "minutes": 15,
            "deps": [
              "syllabus--insurance-companies-in-india"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--types-of-insurance-importance-of-insurance-to-the-businessmen",
            "name": "Types of Insurance. Importance of insurance to the businessmen",
            "minutes": 25,
            "deps": [
              "syllabus--principles-of-insurance"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--benefits-of-crop-orchards-animal-and-poultry-insurance-to-the-farmers",
            "name": "Benefits of crop, orchards, animal and poultry insurance to the farmers",
            "minutes": 25,
            "deps": [
              "syllabus--types-of-insurance-importance-of-insurance-to-the-businessmen"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--terminologies-used-premium-face-value-market-value-maturity-value-surrender-valu",
            "name": "Terminologies used (premium, face value, market value, maturity value, surrender value) and their meanings",
            "minutes": 25,
            "deps": [
              "syllabus--benefits-of-crop-orchards-animal-and-poultry-insurance-to-the-farmers"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--anecdotes-and-interesting-cases-of-insurance-reference-of-films-depicting-people",
            "name": "Anecdotes and interesting cases of insurance. Reference of films depicting people committing fraudulent acts with insurance companies",
            "minutes": 25,
            "deps": [
              "syllabus--terminologies-used-premium-face-value-market-value-maturity-value-surrender-valu"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--careers-in-insurance-teachers-to-develop-such-aspects-for-other-aids-to-trade-iv",
            "name": "Careers in Insurance. Teachers to develop such aspects for other aids to trade. IV. Project Four: Import /Export Procedure Any one from the following",
            "minutes": 25,
            "deps": [
              "syllabus--anecdotes-and-interesting-cases-of-insurance-reference-of-films-depicting-people"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 20
            }
          },
          {
            "id": "syllabus--the-total-project-will-be-in-a-file-format-consisting-of-the-recordings-of-the-v",
            "name": "The total project will be in a file format, consisting of the recordings of the value of shares and the graphs",
            "minutes": 25,
            "deps": [
              "syllabus--careers-in-insurance-teachers-to-develop-such-aspects-for-other-aids-to-trade-iv"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 21
            }
          },
          {
            "id": "syllabus--the-project-will-be-handwritten",
            "name": "The project will be handwritten",
            "minutes": 20,
            "deps": [
              "syllabus--the-total-project-will-be-in-a-file-format-consisting-of-the-recordings-of-the-v"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 21
            }
          },
          {
            "id": "syllabus--the-project-will-be-presented-in-a-neat-folder",
            "name": "The project will be presented in a neat folder",
            "minutes": 25,
            "deps": [
              "syllabus--the-project-will-be-handwritten"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 21
            }
          },
          {
            "id": "syllabus--nature-of-the-business-organisation-emporium",
            "name": "Nature of the business organisation (emporium)",
            "minutes": 20,
            "deps": [
              "syllabus--the-project-will-be-presented-in-a-neat-folder"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--determinants-for-location-of-the-concerned-emporium",
            "name": "Determinants for location of the concerned emporium",
            "minutes": 20,
            "deps": [
              "syllabus--nature-of-the-business-organisation-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--is-the-space-rented-or-owned",
            "name": "Is the space rented or owned",
            "minutes": 20,
            "deps": [
              "syllabus--determinants-for-location-of-the-concerned-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--nature-of-the-goods-dealt-in",
            "name": "Nature of the goods dealt in",
            "minutes": 20,
            "deps": [
              "syllabus--is-the-space-rented-or-owned"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--sources-of-merchandise-of-the-emporium",
            "name": "Sources of merchandise of the emporium",
            "minutes": 20,
            "deps": [
              "syllabus--nature-of-the-goods-dealt-in"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--role-of-co-operative-societies-in-the-manufacturing-and-or-marketing-of-the-merc",
            "name": "Role of co-operative societies in the manufacturing and/or marketing of the merchandise",
            "minutes": 25,
            "deps": [
              "syllabus--sources-of-merchandise-of-the-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--role-of-gifts-of-nature-or-natural-produce-in-the-development-of-goods-merchandi",
            "name": "Role of gifts of nature or natural produce in the development of goods/merchandise",
            "minutes": 25,
            "deps": [
              "syllabus--role-of-co-operative-societies-in-the-manufacturing-and-or-marketing-of-the-merc"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--types-of-buyers-and-sellers",
            "name": "Types of buyers and sellers",
            "minutes": 20,
            "deps": [
              "syllabus--role-of-gifts-of-nature-or-natural-produce-in-the-development-of-goods-merchandi"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--modes-of-goods-dispersed-minimum-quantity-sold-and-type-of-carrying-bag-or-packa",
            "name": "Modes of goods dispersed, minimum quantity sold and type of carrying bag or package used for delivery of the products sold",
            "minutes": 25,
            "deps": [
              "syllabus--types-of-buyers-and-sellers"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--factors-determining-the-pricing-at-the-emporium",
            "name": "Factors determining the pricing at the emporium",
            "minutes": 20,
            "deps": [
              "syllabus--modes-of-goods-dispersed-minimum-quantity-sold-and-type-of-carrying-bag-or-packa"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--comparison-between-the-prices-of-goods-available-at-the-emporium-with-the-prices",
            "name": "Comparison between the prices of goods available at the emporium with the prices in the open market. Also highlight probable causes of variations if any",
            "minutes": 25,
            "deps": [
              "syllabus--factors-determining-the-pricing-at-the-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--kind-of-raw-material-available-naturally-used-in-making-the-products",
            "name": "Kind of raw material available naturally, used in making the products",
            "minutes": 25,
            "deps": [
              "syllabus--comparison-between-the-prices-of-goods-available-at-the-emporium-with-the-prices"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--the-technique-used-in-making-the-products-i-e-hand-made-or-machine-made",
            "name": "The technique used in making the products i.e., hand made or machine made",
            "minutes": 25,
            "deps": [
              "syllabus--kind-of-raw-material-available-naturally-used-in-making-the-products"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--has-the-child-labour-being-used-in-making-the-products-sold-at-the-emporium",
            "name": "Has the child labour being used in making the products sold at the emporium",
            "minutes": 25,
            "deps": [
              "syllabus--the-technique-used-in-making-the-products-i-e-hand-made-or-machine-made"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--are-the-products-eco-friendly-in-terms-of-manufacturing-disposal-and-packing",
            "name": "Are the products eco-friendly, in terms of manufacturing, disposal and packing",
            "minutes": 25,
            "deps": [
              "syllabus--has-the-child-labour-being-used-in-making-the-products-sold-at-the-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--seasonal-factors-if-any-affecting-the-business-of-the-emporium",
            "name": "Seasonal factors if any affecting the business of the emporium",
            "minutes": 25,
            "deps": [
              "syllabus--are-the-products-eco-friendly-in-terms-of-manufacturing-disposal-and-packing"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--weekly-monthly-non-working-days",
            "name": "Weekly/ Monthly non-working days",
            "minutes": 15,
            "deps": [
              "syllabus--seasonal-factors-if-any-affecting-the-business-of-the-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--mode-of-billing-and-payments-cash-credit-card-debit-card-swipe-facility",
            "name": "Mode of billing and payments - Cash, Credit Card/ Debit Card, Swipe facility",
            "minutes": 25,
            "deps": [
              "syllabus--weekly-monthly-non-working-days"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--does-the-emporium-sell-its-merchandise-in-installment-deferred-payment-basis",
            "name": "Does the emporium sell its merchandise in installment / deferred payment basis",
            "minutes": 25,
            "deps": [
              "syllabus--mode-of-billing-and-payments-cash-credit-card-debit-card-swipe-facility"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--do-they-provide-home-delivery-and-after-sales-services",
            "name": "Do they provide home delivery and after sales services",
            "minutes": 25,
            "deps": [
              "syllabus--does-the-emporium-sell-its-merchandise-in-installment-deferred-payment-basis"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--different-types-of-promotional-campaigns-schemes",
            "name": "Different types of promotional campaigns / schemes",
            "minutes": 20,
            "deps": [
              "syllabus--do-they-provide-home-delivery-and-after-sales-services"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--assistance-by-sales-personnel",
            "name": "Assistance by Sales Personnel",
            "minutes": 15,
            "deps": [
              "syllabus--different-types-of-promotional-campaigns-schemes"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 22
            }
          },
          {
            "id": "syllabus--export-orientation-of-this-emporium-and-procedure-used24-policies-related-to-dam",
            "name": "Export orientation of this emporium and procedure used24. Policies related to damaged/ returned goods",
            "minutes": 25,
            "deps": [
              "syllabus--assistance-by-sales-personnel"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--any-government-facility-available-to-the-emporium",
            "name": "Any government facility available to the emporium",
            "minutes": 20,
            "deps": [
              "syllabus--export-orientation-of-this-emporium-and-procedure-used24-policies-related-to-dam"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--warehousing-facilities-available-availed",
            "name": "Warehousing facilities available / availed",
            "minutes": 20,
            "deps": [
              "syllabus--any-government-facility-available-to-the-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--impact-of-tourism-on-the-business-of-emporium",
            "name": "Impact of tourism on the business of emporium",
            "minutes": 25,
            "deps": [
              "syllabus--warehousing-facilities-available-availed"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--additional-facility-offered-to-customers",
            "name": "Additional facility offered to customers",
            "minutes": 20,
            "deps": [
              "syllabus--impact-of-tourism-on-the-business-of-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--any-corporate-social-responsibility-csr-assumed-by-the-emporium",
            "name": "Any Corporate Social Responsibility (CSR) assumed by the emporium",
            "minutes": 25,
            "deps": [
              "syllabus--additional-facility-offered-to-customers"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--help-students-to-select-any-one-topic-for-the-entire-year",
            "name": "Help students to select any ONE Topic for the entire year",
            "minutes": 25,
            "deps": [
              "syllabus--any-corporate-social-responsibility-csr-assumed-by-the-emporium"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--the-students-must-make-a-presentation-of-the-project-before-the-class",
            "name": "The students must make a presentation of the project before the class",
            "minutes": 25,
            "deps": [
              "syllabus--help-students-to-select-any-one-topic-for-the-entire-year"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--the-teachers-must-ensure-that-the-students-self-esteem-and-creativity-is-enhance",
            "name": "The teachers must ensure that the student’s self-esteem and creativity is enhanced and both the teacher and the student enjoy this process",
            "minutes": 25,
            "deps": [
              "syllabus--the-students-must-make-a-presentation-of-the-project-before-the-class"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 23
            }
          },
          {
            "id": "syllabus--the-changes-in-the-pattern-of-import-and-export-of-different-products",
            "name": "The changes in the pattern of import and export of different Products",
            "minutes": 25,
            "deps": [
              "syllabus--the-teachers-must-ensure-that-the-students-self-esteem-and-creativity-is-enhance"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 24
            }
          },
          {
            "id": "syllabus--the-trend-in-the-changing-interest-rates-and-their-effect-on-savings",
            "name": "The trend in the changing interest rates and their effect on savings",
            "minutes": 25,
            "deps": [
              "syllabus--the-changes-in-the-pattern-of-import-and-export-of-different-products"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 24
            }
          },
          {
            "id": "syllabus--a-study-on-child-labour-laws-its-implementation-and-consequences",
            "name": "A study on child labour laws, its implementation and consequences",
            "minutes": 25,
            "deps": [
              "syllabus--the-trend-in-the-changing-interest-rates-and-their-effect-on-savings"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 24
            }
          },
          {
            "id": "syllabus--the-state-of-anti-plastic-campaign-the-law-its-effects-and-implementation",
            "name": "The state of ‘anti plastic campaign,’ the law, its effects and implementation",
            "minutes": 25,
            "deps": [
              "syllabus--a-study-on-child-labour-laws-its-implementation-and-consequences"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 24
            }
          },
          {
            "id": "syllabus--the-laws-of-mining-setting-up-of-industries-rules-and-regulations-licences-requi",
            "name": "The laws of mining /setting up of industries, rules and regulations, licences required for running that business",
            "minutes": 25,
            "deps": [
              "syllabus--the-state-of-anti-plastic-campaign-the-law-its-effects-and-implementation"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 24
            }
          },
          {
            "id": "syllabus--social-factors-affecting-acceptance-and-rejection-of-an-identified-product-dish-",
            "name": "Social factors affecting acceptance and rejection of an identified product. (Dish washer, Atta maker, etc)",
            "minutes": 25,
            "deps": [
              "syllabus--the-laws-of-mining-setting-up-of-industries-rules-and-regulations-licences-requi"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 24
            }
          },
          {
            "id": "syllabus--a-departmental-store",
            "name": "A departmental store",
            "minutes": 15,
            "deps": [
              "syllabus--social-factors-affecting-acceptance-and-rejection-of-an-identified-product-dish-"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--an-industrial-unit",
            "name": "An Industrial unit",
            "minutes": 15,
            "deps": [
              "syllabus--a-departmental-store"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--a-fast-food-outlet",
            "name": "A fast food outlet",
            "minutes": 15,
            "deps": [
              "syllabus--an-industrial-unit"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--division-of-work",
            "name": "Division of work",
            "minutes": 15,
            "deps": [
              "syllabus--a-fast-food-outlet"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--unity-of-command",
            "name": "Unity of command",
            "minutes": 15,
            "deps": [
              "syllabus--division-of-work"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--unity-of-direction",
            "name": "Unity of direction",
            "minutes": 15,
            "deps": [
              "syllabus--unity-of-command"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--scalar-chain",
            "name": "Scalar chain",
            "minutes": 10,
            "deps": [
              "syllabus--unity-of-direction"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--espirit-de-corps",
            "name": "Espirit de corps",
            "minutes": 15,
            "deps": [
              "syllabus--scalar-chain"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--fair-remuneration-to-all",
            "name": "Fair remuneration to all",
            "minutes": 15,
            "deps": [
              "syllabus--espirit-de-corps"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--equity",
            "name": "Equity",
            "minutes": 10,
            "deps": [
              "syllabus--fair-remuneration-to-all"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--discipline",
            "name": "Discipline",
            "minutes": 10,
            "deps": [
              "syllabus--equity"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--subordination-of-individual-interest-to-general-interest",
            "name": "Subordination of individual interest to general interest",
            "minutes": 20,
            "deps": [
              "syllabus--discipline"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--initiative",
            "name": "Initiative",
            "minutes": 10,
            "deps": [
              "syllabus--subordination-of-individual-interest-to-general-interest"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--centralisation-and-decentralisation",
            "name": "Centralisation and decentralisation",
            "minutes": 15,
            "deps": [
              "syllabus--initiative"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--stability-of-tenure",
            "name": "Stability of tenure",
            "minutes": 15,
            "deps": [
              "syllabus--centralisation-and-decentralisation"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--functional-foremanship",
            "name": "Functional foremanship",
            "minutes": 10,
            "deps": [
              "syllabus--stability-of-tenure"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--standardisation-and-simplification-of-work",
            "name": "Standardisation and simplification of work",
            "minutes": 20,
            "deps": [
              "syllabus--functional-foremanship"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--method-study",
            "name": "Method study",
            "minutes": 10,
            "deps": [
              "syllabus--standardisation-and-simplification-of-work"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--motion-study",
            "name": "Motion Study",
            "minutes": 10,
            "deps": [
              "syllabus--method-study"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--time-study",
            "name": "Time Study",
            "minutes": 10,
            "deps": [
              "syllabus--motion-study"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--fatigue-study",
            "name": "Fatigue Study",
            "minutes": 10,
            "deps": [
              "syllabus--time-study"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--differential-piece-rate-plan-tips-to-teacher",
            "name": "Differential piece rate plan. Tips to teacher",
            "minutes": 20,
            "deps": [
              "syllabus--fatigue-study"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 25
            }
          },
          {
            "id": "syllabus--graphical-presentation-of-the-share-prices-of-different-companies-on-different-d",
            "name": "Graphical presentation of the share prices of different companies on different dates",
            "minutes": 25,
            "deps": [
              "syllabus--differential-piece-rate-plan-tips-to-teacher"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--change-in-market-value-of-shares-due-to-change-of-seasons-festivals-natural-and-",
            "name": "Change in market value of shares due to change of seasons, festivals, natural and human disasters",
            "minutes": 25,
            "deps": [
              "syllabus--graphical-presentation-of-the-share-prices-of-different-companies-on-different-d"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--change-in-market-value-of-shares-due-to-change-in-political-environment-policies",
            "name": "Change in market value of shares due to change in political environment/ policies of various countries/crisis in developed countries or any other reasons",
            "minutes": 25,
            "deps": [
              "syllabus--change-in-market-value-of-shares-due-to-change-of-seasons-festivals-natural-and-"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--adhesives",
            "name": "Adhesives",
            "minutes": 10,
            "deps": [
              "syllabus--change-in-market-value-of-shares-due-to-change-in-political-environment-policies"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--air-conditioners",
            "name": "Air conditioners",
            "minutes": 10,
            "deps": [
              "syllabus--adhesives"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--baby-diapers",
            "name": "Baby diapers",
            "minutes": 10,
            "deps": [
              "syllabus--air-conditioners"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--bathing-soap",
            "name": "Bathing Soap",
            "minutes": 10,
            "deps": [
              "syllabus--baby-diapers"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--bathroom-cleaner",
            "name": "Bathroom cleaner",
            "minutes": 10,
            "deps": [
              "syllabus--bathing-soap"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--blanket",
            "name": "Blanket",
            "minutes": 10,
            "deps": [
              "syllabus--bathroom-cleaner"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--body-spray",
            "name": "Body Spray",
            "minutes": 10,
            "deps": [
              "syllabus--blanket"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--breakfast-cereal",
            "name": "Breakfast cereal",
            "minutes": 10,
            "deps": [
              "syllabus--body-spray"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--butter",
            "name": "Butter",
            "minutes": 10,
            "deps": [
              "syllabus--breakfast-cereal"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--camera",
            "name": "Camera",
            "minutes": 10,
            "deps": [
              "syllabus--butter"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--cheese-spreads",
            "name": "Cheese spreads",
            "minutes": 10,
            "deps": [
              "syllabus--camera"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--chocolate",
            "name": "Chocolate",
            "minutes": 10,
            "deps": [
              "syllabus--cheese-spreads"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--coffee",
            "name": "Coffee",
            "minutes": 10,
            "deps": [
              "syllabus--chocolate"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--cosmetology-product",
            "name": "Cosmetology product",
            "minutes": 10,
            "deps": [
              "syllabus--coffee"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--crayons",
            "name": "Crayons",
            "minutes": 10,
            "deps": [
              "syllabus--cosmetology-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--crockery",
            "name": "Crockery",
            "minutes": 10,
            "deps": [
              "syllabus--crayons"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "syllabus--cutlery",
            "name": "Cutlery",
            "minutes": 10,
            "deps": [
              "syllabus--crockery"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          }
        ]
      },
      {
        "id": "dth",
        "name": "DTH",
        "concepts": [
          {
            "id": "dth--eraser",
            "name": "Eraser",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--e-wash",
            "name": "e-wash",
            "minutes": 10,
            "deps": [
              "dth--eraser"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--fairness-cream",
            "name": "Fairness cream",
            "minutes": 10,
            "deps": [
              "dth--e-wash"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--fruit-candy",
            "name": "Fruit candy",
            "minutes": 10,
            "deps": [
              "dth--fairness-cream"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--furniture",
            "name": "Furniture",
            "minutes": 10,
            "deps": [
              "dth--fruit-candy"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--hair-dye",
            "name": "Hair Dye",
            "minutes": 10,
            "deps": [
              "dth--furniture"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--hair-oil",
            "name": "Hair Oil",
            "minutes": 10,
            "deps": [
              "dth--hair-dye"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--infant-dress",
            "name": "Infant dress",
            "minutes": 10,
            "deps": [
              "dth--hair-oil"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--inverter",
            "name": "Inverter",
            "minutes": 10,
            "deps": [
              "dth--infant-dress"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--jewellery",
            "name": "Jewellery",
            "minutes": 10,
            "deps": [
              "dth--inverter"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--ladies-bag",
            "name": "Ladies bag",
            "minutes": 10,
            "deps": [
              "dth--jewellery"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 27
            }
          },
          {
            "id": "dth--ladies-footwear39-learning-toys",
            "name": "Ladies footwear39. Learning Toys",
            "minutes": 15,
            "deps": [
              "dth--ladies-bag"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--lipstick",
            "name": "Lipstick",
            "minutes": 10,
            "deps": [
              "dth--ladies-footwear39-learning-toys"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--microwave-oven",
            "name": "Microwave oven",
            "minutes": 10,
            "deps": [
              "dth--lipstick"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--mixers",
            "name": "Mixers",
            "minutes": 10,
            "deps": [
              "dth--microwave-oven"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--mobile",
            "name": "Mobile",
            "minutes": 10,
            "deps": [
              "dth--mixers"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--moisturizer",
            "name": "Moisturizer",
            "minutes": 10,
            "deps": [
              "dth--mobile"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--music-player",
            "name": "Music player",
            "minutes": 10,
            "deps": [
              "dth--moisturizer"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--nail-polish",
            "name": "Nail polish",
            "minutes": 10,
            "deps": [
              "dth--music-player"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--newspaper",
            "name": "Newspaper",
            "minutes": 10,
            "deps": [
              "dth--nail-polish"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--noodles",
            "name": "Noodles",
            "minutes": 10,
            "deps": [
              "dth--newspaper"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--pen-drive",
            "name": "Pen drive",
            "minutes": 10,
            "deps": [
              "dth--noodles"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--pencil",
            "name": "Pencil",
            "minutes": 10,
            "deps": [
              "dth--pen-drive"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--pickles",
            "name": "Pickles",
            "minutes": 10,
            "deps": [
              "dth--pencil"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--ready-soups",
            "name": "Ready Soups",
            "minutes": 10,
            "deps": [
              "dth--pickles"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--refrigerator",
            "name": "Refrigerator",
            "minutes": 10,
            "deps": [
              "dth--ready-soups"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--ro-system",
            "name": "RO system",
            "minutes": 10,
            "deps": [
              "dth--refrigerator"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--roasted-snacks",
            "name": "Roasted snacks",
            "minutes": 10,
            "deps": [
              "dth--ro-system"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--sarees",
            "name": "Sarees",
            "minutes": 10,
            "deps": [
              "dth--roasted-snacks"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--sauces-ketchup",
            "name": "Sauces/ Ketchup",
            "minutes": 10,
            "deps": [
              "dth--sarees"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--shampoo",
            "name": "Shampoo",
            "minutes": 10,
            "deps": [
              "dth--sauces-ketchup"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--shaving-cream",
            "name": "Shaving cream",
            "minutes": 10,
            "deps": [
              "dth--shampoo"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--shoe-polish",
            "name": "Shoe polish",
            "minutes": 10,
            "deps": [
              "dth--shaving-cream"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--squashes",
            "name": "Squashes",
            "minutes": 10,
            "deps": [
              "dth--shoe-polish"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--suitcase-airbag",
            "name": "Suitcase/ airbag",
            "minutes": 10,
            "deps": [
              "dth--squashes"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--sunglasses",
            "name": "Sunglasses",
            "minutes": 10,
            "deps": [
              "dth--suitcase-airbag"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--tiffin-wallah",
            "name": "Tiffin Wallah",
            "minutes": 10,
            "deps": [
              "dth--sunglasses"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--toothpaste",
            "name": "Toothpaste",
            "minutes": 10,
            "deps": [
              "dth--tiffin-wallah"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--wallet",
            "name": "Wallet",
            "minutes": 10,
            "deps": [
              "dth--toothpaste"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--washing-detergent",
            "name": "Washing detergent",
            "minutes": 10,
            "deps": [
              "dth--wallet"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--washing-machine",
            "name": "Washing machine",
            "minutes": 10,
            "deps": [
              "dth--washing-detergent"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--washing-powder",
            "name": "Washing powder",
            "minutes": 10,
            "deps": [
              "dth--washing-machine"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--water-bottle",
            "name": "Water bottle",
            "minutes": 10,
            "deps": [
              "dth--washing-powder"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--water-storage-tank",
            "name": "Water storage tank",
            "minutes": 15,
            "deps": [
              "dth--water-bottle"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--why-have-they-selected-this-product-service",
            "name": "Why have they selected this product/service?",
            "minutes": 20,
            "deps": [
              "dth--water-storage-tank"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--find-out-5-competitive-brands-that-exist-in-the-market",
            "name": "Find out ‘5’ competitive brands that exist in the market",
            "minutes": 25,
            "deps": [
              "dth--why-have-they-selected-this-product-service"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--what-permission-and-licences-would-be-required-to-make-the-product",
            "name": "What permission and licences would be required to make the product?",
            "minutes": 25,
            "deps": [
              "dth--find-out-5-competitive-brands-that-exist-in-the-market"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--what-are-your-competitors-unique-selling-proposition-u-s-p",
            "name": "What are your competitors Unique Selling Proposition.[U.S.P.]?",
            "minutes": 20,
            "deps": [
              "dth--what-permission-and-licences-would-be-required-to-make-the-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--does-your-product-have-any-range-give-details",
            "name": "Does your product have any range give details?",
            "minutes": 25,
            "deps": [
              "dth--what-are-your-competitors-unique-selling-proposition-u-s-p"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--what-is-the-name-of-your-product",
            "name": "What is the name of your product?",
            "minutes": 20,
            "deps": [
              "dth--does-your-product-have-any-range-give-details"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--enlist-its-features",
            "name": "Enlist its features",
            "minutes": 15,
            "deps": [
              "dth--what-is-the-name-of-your-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--draw-the-label-of-your-product",
            "name": "Draw the ‘Label’ of your product",
            "minutes": 20,
            "deps": [
              "dth--enlist-its-features"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--draw-a-logo-for-your-product",
            "name": "Draw a logo for your product",
            "minutes": 20,
            "deps": [
              "dth--draw-the-label-of-your-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--draft-a-tag-line",
            "name": "Draft a tag line",
            "minutes": 15,
            "deps": [
              "dth--draw-a-logo-for-your-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--what-is-the-selling-price-of-your-competitors-product",
            "name": "What is the selling price of your competitor’s product?",
            "minutes": 25,
            "deps": [
              "dth--draft-a-tag-line"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 28
            }
          },
          {
            "id": "dth--which-channel-of-distribution-are-you-going-to-use-give-reasons-for-selection",
            "name": "Which channel of distribution are you going to use? Give reasons for selection?",
            "minutes": 25,
            "deps": [
              "dth--what-is-the-selling-price-of-your-competitors-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--decisions-related-to-warehousing-state-reasons",
            "name": "Decisions related to warehousing, state reasons",
            "minutes": 20,
            "deps": [
              "dth--which-channel-of-distribution-are-you-going-to-use-give-reasons-for-selection"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--what-is-going-to-be-your-selling-price",
            "name": "What is going to be your selling price?",
            "minutes": 25,
            "deps": [
              "dth--decisions-related-to-warehousing-state-reasons"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--list-5-ways-of-promoting-your-product",
            "name": "List 5 ways of promoting your product",
            "minutes": 20,
            "deps": [
              "dth--what-is-going-to-be-your-selling-price"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--any-schemes-for",
            "name": "Any schemes for",
            "minutes": 15,
            "deps": [
              "dth--list-5-ways-of-promoting-your-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--what-is-going-to-be-your-u-s-p",
            "name": "What is going to be your ‘U.S.P?",
            "minutes": 20,
            "deps": [
              "dth--any-schemes-for"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--what-means-of-transport-you-will-use-and-why",
            "name": "What means of transport you will use and why?",
            "minutes": 25,
            "deps": [
              "dth--what-is-going-to-be-your-u-s-p"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--draft-a-social-message-for-your-label",
            "name": "Draft a social message for your label",
            "minutes": 20,
            "deps": [
              "dth--what-means-of-transport-you-will-use-and-why"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--what-cost-effective-techniques-will-you-follow-for-your-product",
            "name": "What cost effective techniques will you follow for your product",
            "minutes": 25,
            "deps": [
              "dth--draft-a-social-message-for-your-label"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--type-of-product-service-identified-and-the-consumer-industries-process-involve-t",
            "name": "Type of product /service identified and the (consumer/industries) process involve there in",
            "minutes": 25,
            "deps": [
              "dth--what-cost-effective-techniques-will-you-follow-for-your-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--brand-name-and-the-product",
            "name": "Brand name and the product",
            "minutes": 20,
            "deps": [
              "dth--type-of-product-service-identified-and-the-consumer-industries-process-involve-t"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--range-of-the-product",
            "name": "Range of the product",
            "minutes": 15,
            "deps": [
              "dth--brand-name-and-the-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--identification-mark-or-logo",
            "name": "Identification mark or logo",
            "minutes": 15,
            "deps": [
              "dth--range-of-the-product"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--tagline",
            "name": "Tagline",
            "minutes": 10,
            "deps": [
              "dth--identification-mark-or-logo"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--labeling-and-packaging",
            "name": "Labeling and packaging",
            "minutes": 15,
            "deps": [
              "dth--tagline"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--price-of-the-product-and-basis-of-price-fixation",
            "name": "Price of the product and basis of price fixation",
            "minutes": 25,
            "deps": [
              "dth--labeling-and-packaging"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--selected-channels-of-distribution-and-reasons-thereof",
            "name": "Selected channels of distribution and reasons thereof",
            "minutes": 20,
            "deps": [
              "dth--price-of-the-product-and-basis-of-price-fixation"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--decisions-related-to-transportation-and-warehousing-state-reasons",
            "name": "Decisions related to transportation and warehousing. State reasons",
            "minutes": 25,
            "deps": [
              "dth--selected-channels-of-distribution-and-reasons-thereof"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--promotional-techniques-used-and-starting-reasons-for-deciding-the-particular-tec",
            "name": "Promotional techniques used and starting reasons for deciding the particular technique",
            "minutes": 25,
            "deps": [
              "dth--decisions-related-to-transportation-and-warehousing-state-reasons"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--the-total-length-of-the-project-will-be-of-25-to-30-pages",
            "name": "The total length of the project will be of 25 to 30 pages",
            "minutes": 25,
            "deps": [
              "dth--promotional-techniques-used-and-starting-reasons-for-deciding-the-particular-tec"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--the-project-should-be-handwritten",
            "name": "The project should be handwritten",
            "minutes": 20,
            "deps": [
              "dth--the-total-length-of-the-project-will-be-of-25-to-30-pages"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          },
          {
            "id": "dth--the-project-should-be-presented-in-a-neat-folder",
            "name": "The project should be presented in a neat folder",
            "minutes": 25,
            "deps": [
              "dth--the-project-should-be-handwritten"
            ],
            "source": {
              "pdf": "business-studies",
              "page": 29
            }
          }
        ]
      }
    ]
  },
  {
    "id": "economics",
    "name": "Economics",
    "chapters": [
      {
        "id": "theory",
        "name": "Theory",
        "concepts": [
          {
            "id": "theory--organisation-and-presentation-of-data-statistical-tools-and-interpretation-25-40",
            "name": "Organisation and Presentation of Data Statistical Tools and Interpretation 25 40",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "part-a",
        "name": "Part A",
        "concepts": [
          {
            "id": "part-a--statistics-for-economics-in-this-course",
            "name": "Statistics for Economics In this course",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          },
          {
            "id": "part-a--the-learners-are-expected-to-acquire-skills-in-collection",
            "name": "the learners are expected to acquire skills in collection",
            "minutes": 25,
            "deps": [
              "part-a--statistics-for-economics-in-this-course"
            ],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          },
          {
            "id": "part-a--the-learners-are-also-expected-to-understand-the-behaviour-of-various-economic-d",
            "name": "the learners are also expected to understand the behaviour of various economic data",
            "minutes": 25,
            "deps": [
              "part-a--the-learners-are-expected-to-acquire-skills-in-collection"
            ],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          },
          {
            "id": "part-a--introductory-macroeconomics",
            "name": "Introductory Macroeconomics",
            "minutes": 10,
            "deps": [
              "part-a--the-learners-are-also-expected-to-understand-the-behaviour-of-various-economic-d"
            ],
            "source": {
              "pdf": "economics",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "unit-2",
        "name": "Unit 2",
        "concepts": [
          {
            "id": "unit-2--collection",
            "name": "Collection",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          },
          {
            "id": "unit-2--how-basic-data-is-collected-with-concepts-of-sampling",
            "name": "how basic data is collected with concepts of Sampling",
            "minutes": 25,
            "deps": [
              "unit-2--collection"
            ],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          },
          {
            "id": "unit-2--methods-of-collecting-data",
            "name": "methods of collecting data",
            "minutes": 15,
            "deps": [
              "unit-2--how-basic-data-is-collected-with-concepts-of-sampling"
            ],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          },
          {
            "id": "unit-2--census-of-india-and-national-sample-survey-organisation",
            "name": "Census of India and National Sample Survey Organisation",
            "minutes": 25,
            "deps": [
              "unit-2--methods-of-collecting-data"
            ],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "organisation-of-data",
        "name": "Organisation of Data",
        "concepts": [
          {
            "id": "organisation-of-data--meaning-and-types-of-variables",
            "name": "Meaning and types of variables",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          },
          {
            "id": "organisation-of-data--frequency-distribution",
            "name": "Frequency Distribution",
            "minutes": 10,
            "deps": [
              "organisation-of-data--meaning-and-types-of-variables"
            ],
            "source": {
              "pdf": "economics",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "presentation-of-data",
        "name": "Presentation of Data",
        "concepts": [
          {
            "id": "presentation-of-data--i-geometric-forms-bar-diagrams-and-pie-diagrams",
            "name": "(i) Geometric forms (bar diagrams and pie diagrams)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "unit-3",
        "name": "Unit 3",
        "concepts": [
          {
            "id": "unit-3--statistical-tools-and-interpretation-for-all-the-numerical-problems-and-solution",
            "name": "Statistical Tools and Interpretation For all the numerical problems and solutions",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          },
          {
            "id": "unit-3--the-appropriate-economic-interpretation-may-be-attempted-this-means",
            "name": "the appropriate economic interpretation may be attempted. This means",
            "minutes": 25,
            "deps": [
              "unit-3--statistical-tools-and-interpretation-for-all-the-numerical-problems-and-solution"
            ],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          },
          {
            "id": "unit-3--the-students-need-to-solve-the-problems-and-provide-interpretation-for-the-resul",
            "name": "the students need to solve the problems and provide interpretation for the results derived",
            "minutes": 25,
            "deps": [
              "unit-3--the-appropriate-economic-interpretation-may-be-attempted-this-means"
            ],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "part-b",
        "name": "Part B",
        "concepts": [
          {
            "id": "part-b--introductory-microeconomics",
            "name": "Introductory Microeconomics",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          },
          {
            "id": "part-b--indian-economic-development",
            "name": "Indian Economic Development",
            "minutes": 15,
            "deps": [
              "part-b--introductory-microeconomics"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "unit-5",
        "name": "Unit 5",
        "concepts": [
          {
            "id": "unit-5--consumers-equilibrium-and-demand-consumers-equilibrium-meaning-of-utility",
            "name": "Consumer's Equilibrium and Demand Consumer's equilibrium - meaning of Utility",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          },
          {
            "id": "unit-5--marginal-utility",
            "name": "Marginal Utility",
            "minutes": 10,
            "deps": [
              "unit-5--consumers-equilibrium-and-demand-consumers-equilibrium-meaning-of-utility"
            ],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          },
          {
            "id": "unit-5--law-of-diminishing-marginal-utility",
            "name": "Law of Diminishing Marginal Utility",
            "minutes": 20,
            "deps": [
              "unit-5--marginal-utility"
            ],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          },
          {
            "id": "unit-5--conditions-of-consumers-equilibrium-using-marginal-utility-analysis",
            "name": "conditions of consumer's equilibrium using marginal utility analysis",
            "minutes": 25,
            "deps": [
              "unit-5--law-of-diminishing-marginal-utility"
            ],
            "source": {
              "pdf": "economics",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "unit-6",
        "name": "Unit 6",
        "concepts": [
          {
            "id": "unit-6--total-fixed-cost",
            "name": "Total Fixed Cost",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--total-variable-cost",
            "name": "Total Variable Cost",
            "minutes": 15,
            "deps": [
              "unit-6--total-fixed-cost"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--average-cost",
            "name": "Average Cost",
            "minutes": 10,
            "deps": [
              "unit-6--total-variable-cost"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--average-fixed-cost",
            "name": "Average Fixed Cost",
            "minutes": 15,
            "deps": [
              "unit-6--average-cost"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--market-supply",
            "name": "market supply",
            "minutes": 10,
            "deps": [
              "unit-6--average-fixed-cost"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--determinants-of-supply",
            "name": "determinants of supply",
            "minutes": 15,
            "deps": [
              "unit-6--market-supply"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--supply-schedule",
            "name": "supply schedule",
            "minutes": 10,
            "deps": [
              "unit-6--determinants-of-supply"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--supply-curve-and-its-slope",
            "name": "supply curve and its slope",
            "minutes": 20,
            "deps": [
              "unit-6--supply-schedule"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--movements-along-and-shifts-in-supply-curve",
            "name": "movements along and shifts in supply curve",
            "minutes": 20,
            "deps": [
              "unit-6--supply-curve-and-its-slope"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--price-elasticity-of-supply",
            "name": "price elasticity of supply",
            "minutes": 15,
            "deps": [
              "unit-6--movements-along-and-shifts-in-supply-curve"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "unit-6--measurement-of-price-elasticity-of-supply-percentage-change-method",
            "name": "measurement of price elasticity of supply - percentage-change method",
            "minutes": 25,
            "deps": [
              "unit-6--price-elasticity-of-supply"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "simple-applications-of-demand-and-supply",
        "name": "Simple Applications of Demand and Supply",
        "concepts": [
          {
            "id": "simple-applications-of-demand-and-supply--price-ceiling",
            "name": "Price ceiling",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          },
          {
            "id": "simple-applications-of-demand-and-supply--price-floor",
            "name": "Price floor",
            "minutes": 10,
            "deps": [
              "simple-applications-of-demand-and-supply--price-ceiling"
            ],
            "source": {
              "pdf": "economics",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "basic-concepts-in-macroeconomics",
        "name": "Basic concepts in macroeconomics",
        "concepts": [
          {
            "id": "basic-concepts-in-macroeconomics--consumption-goods",
            "name": "consumption goods",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 6
            }
          },
          {
            "id": "basic-concepts-in-macroeconomics--capital-goods",
            "name": "capital goods",
            "minutes": 10,
            "deps": [
              "basic-concepts-in-macroeconomics--consumption-goods"
            ],
            "source": {
              "pdf": "economics",
              "page": 6
            }
          },
          {
            "id": "basic-concepts-in-macroeconomics--final-goods",
            "name": "final goods",
            "minutes": 10,
            "deps": [
              "basic-concepts-in-macroeconomics--capital-goods"
            ],
            "source": {
              "pdf": "economics",
              "page": 6
            }
          },
          {
            "id": "basic-concepts-in-macroeconomics--intermediate-goods",
            "name": "intermediate goods",
            "minutes": 10,
            "deps": [
              "basic-concepts-in-macroeconomics--final-goods"
            ],
            "source": {
              "pdf": "economics",
              "page": 6
            }
          },
          {
            "id": "basic-concepts-in-macroeconomics--stocks-and-flows",
            "name": "stocks and flows",
            "minutes": 15,
            "deps": [
              "basic-concepts-in-macroeconomics--intermediate-goods"
            ],
            "source": {
              "pdf": "economics",
              "page": 6
            }
          },
          {
            "id": "basic-concepts-in-macroeconomics--gross-investment-and-depreciation",
            "name": "gross investment and depreciation",
            "minutes": 15,
            "deps": [
              "basic-concepts-in-macroeconomics--stocks-and-flows"
            ],
            "source": {
              "pdf": "economics",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "human-capital-formation",
        "name": "Human Capital Formation",
        "concepts": [
          {
            "id": "human-capital-formation--how-people-become-resource",
            "name": "How people become resource",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "human-capital-formation--role-of-human-capital-in-economic-development",
            "name": "Role of human capital in economic development",
            "minutes": 20,
            "deps": [
              "human-capital-formation--how-people-become-resource"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "human-capital-formation--growth-of-education-sector-in-india",
            "name": "Growth of Education Sector in India",
            "minutes": 20,
            "deps": [
              "human-capital-formation--role-of-human-capital-in-economic-development"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "rural-development",
        "name": "Rural development",
        "concepts": [
          {
            "id": "rural-development--key-issues-credit-and-marketing-role-of-cooperatives",
            "name": "Key issues - credit and marketing - role of cooperatives",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "rural-development--agricultural-diversification",
            "name": "agricultural diversification",
            "minutes": 10,
            "deps": [
              "rural-development--key-issues-credit-and-marketing-role-of-cooperatives"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "rural-development--alternative-farming-organic-farming",
            "name": "alternative farming - organic farming",
            "minutes": 20,
            "deps": [
              "rural-development--agricultural-diversification"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "employment",
        "name": "Employment",
        "concepts": [
          {
            "id": "employment--growth-and-changes-in-work-force-participation-rate-in-formal-and-informal-secto",
            "name": "Growth and changes in work force participation rate in formal and informal sectors",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "employment--problems-and-policies",
            "name": "problems and policies",
            "minutes": 15,
            "deps": [
              "employment--growth-and-changes-in-work-force-participation-rate-in-formal-and-informal-secto"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "sustainable-economic-development",
        "name": "Sustainable Economic Development",
        "concepts": [
          {
            "id": "sustainable-economic-development--meaning",
            "name": "Meaning",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "sustainable-economic-development--effects-of-economic-development-on-resources-and-environment",
            "name": "Effects of Economic Development on Resources and Environment",
            "minutes": 25,
            "deps": [
              "sustainable-economic-development--meaning"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "sustainable-economic-development--including-global-warming",
            "name": "including global warming",
            "minutes": 15,
            "deps": [
              "sustainable-economic-development--effects-of-economic-development-on-resources-and-environment"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "issues",
        "name": "Issues",
        "concepts": [
          {
            "id": "issues--economic-growth",
            "name": "economic growth",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "issues--population",
            "name": "population",
            "minutes": 10,
            "deps": [
              "issues--economic-growth"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          },
          {
            "id": "issues--project-in-economics",
            "name": "Project in Economics",
            "minutes": 15,
            "deps": [
              "issues--population"
            ],
            "source": {
              "pdf": "economics",
              "page": 8
            }
          }
        ]
      }
    ]
  },
  {
    "id": "history",
    "name": "History",
    "chapters": [
      {
        "id": "mature-harappan-sites",
        "name": "Mature Harappan sites",
        "concepts": [
          {
            "id": "mature-harappan-sites--harappa",
            "name": "Harappa",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--banawali",
            "name": "Banawali",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--harappa"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--kalibangan",
            "name": "Kalibangan",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--banawali"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--balakot",
            "name": "Balakot",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--kalibangan"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--1-2-rakhigarhi",
            "name": "1 2 Rakhigarhi",
            "minutes": 15,
            "deps": [
              "mature-harappan-sites--balakot"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--dholavira",
            "name": "Dholavira",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--1-2-rakhigarhi"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--nageshwar",
            "name": "Nageshwar",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--dholavira"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--lothal",
            "name": "Lothal",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--nageshwar"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--mohenjodaro",
            "name": "Mohenjodaro",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--lothal"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--chanhudaro",
            "name": "Chanhudaro",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--mohenjodaro"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mature-harappan-sites--kot-diji",
            "name": "Kot Diji",
            "minutes": 10,
            "deps": [
              "mature-harappan-sites--chanhudaro"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "mahajanapada-and-cities",
        "name": "Mahajanapada and cities",
        "concepts": [
          {
            "id": "mahajanapada-and-cities--vajji",
            "name": "Vajji",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--magadha",
            "name": "Magadha",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--vajji"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--kosala",
            "name": "Kosala",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--magadha"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--kuru",
            "name": "Kuru",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--kosala"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--panchala",
            "name": "Panchala",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--kuru"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--2-3-gandhara",
            "name": "2 3 Gandhara",
            "minutes": 15,
            "deps": [
              "mahajanapada-and-cities--panchala"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--avanti",
            "name": "Avanti",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--2-3-gandhara"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--rajgir",
            "name": "Rajgir",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--avanti"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--ujjain",
            "name": "Ujjain",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--rajgir"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--taxila",
            "name": "Taxila",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--ujjain"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--topra",
            "name": "Topra",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--taxila"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--shakas",
            "name": "Shakas",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--topra"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--satavahanas",
            "name": "Satavahanas",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--shakas"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--vakatakas",
            "name": "Vakatakas",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--satavahanas"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--mathura",
            "name": "Mathura",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--vakatakas"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--kanauj",
            "name": "Kanauj",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--mathura"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--puhar",
            "name": "Puhar",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--kanauj"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--braghukachchha",
            "name": "Braghukachchha",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--puhar"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--shravasti",
            "name": "Shravasti",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--braghukachchha"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--vaishali",
            "name": "Vaishali",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--shravasti"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--varanasi",
            "name": "Varanasi",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--vaishali"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "mahajanapada-and-cities--vidisha",
            "name": "Vidisha",
            "minutes": 10,
            "deps": [
              "mahajanapada-and-cities--varanasi"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "territories-cities-under-british-control-in1857",
        "name": "Territories/cities under British Control in1857",
        "concepts": [
          {
            "id": "territories-cities-under-british-control-in1857--punjab",
            "name": "Punjab",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--sindh",
            "name": "Sindh",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--punjab"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--bombay",
            "name": "Bombay",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--sindh"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--8-287-madras-berar",
            "name": "8 287 Madras Berar",
            "minutes": 15,
            "deps": [
              "territories-cities-under-british-control-in1857--bombay"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--bengal",
            "name": "Bengal",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--8-287-madras-berar"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--bihar",
            "name": "Bihar",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--bengal"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--orissa",
            "name": "Orissa",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--bihar"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--surat",
            "name": "Surat",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--orissa"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--calcutta",
            "name": "Calcutta",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--surat"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--patna",
            "name": "Patna",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--calcutta"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "territories-cities-under-british-control-in1857--allahabad",
            "name": "Allahabad",
            "minutes": 10,
            "deps": [
              "territories-cities-under-british-control-in1857--patna"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "main-centres-of-the-revolt-of-1857",
        "name": "Main centres of the Revolt of 1857",
        "concepts": [
          {
            "id": "main-centres-of-the-revolt-of-1857--delhi",
            "name": "Delhi",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--meerut",
            "name": "Meerut",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--delhi"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--jhansi",
            "name": "Jhansi",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--meerut"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--lucknow",
            "name": "Lucknow",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--jhansi"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--kanpur",
            "name": "Kanpur",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--lucknow"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--9-260-azamgarh",
            "name": "9 260 Azamgarh",
            "minutes": 15,
            "deps": [
              "main-centres-of-the-revolt-of-1857--kanpur"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--benaras",
            "name": "Benaras",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--9-260-azamgarh"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--gwalior",
            "name": "Gwalior",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--benaras"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--jabalpur",
            "name": "Jabalpur",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--gwalior"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--agra",
            "name": "Agra",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--jabalpur"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--champaran",
            "name": "Champaran",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--agra"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--kheda",
            "name": "Kheda",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--champaran"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--10-ahmedabad",
            "name": "10 Ahmedabad",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--kheda"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--amritsar",
            "name": "Amritsar",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--10-ahmedabad"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--chauri-chaura",
            "name": "Chauri Chaura",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--amritsar"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--lahore",
            "name": "Lahore",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--chauri-chaura"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--bardoli",
            "name": "Bardoli",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--lahore"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--dandi",
            "name": "Dandi",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--bardoli"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--bombay-quit-india-resolution",
            "name": "Bombay (Quit India Resolution)",
            "minutes": 15,
            "deps": [
              "main-centres-of-the-revolt-of-1857--dandi"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          },
          {
            "id": "main-centres-of-the-revolt-of-1857--karachi",
            "name": "Karachi",
            "minutes": 10,
            "deps": [
              "main-centres-of-the-revolt-of-1857--bombay-quit-india-resolution"
            ],
            "source": {
              "pdf": "history",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "august-planning-and-organization",
        "name": "August -       Planning and organization",
        "concepts": [
          {
            "id": "august-planning-and-organization--forming-significance-and-relevance-of-the-topic",
            "name": "forming Significance and relevance of the topic",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "history",
              "page": 18
            }
          },
          {
            "id": "august-planning-and-organization--5-october-an-action-plan",
            "name": "5 October an action plan",
            "minutes": 20,
            "deps": [
              "august-planning-and-organization--forming-significance-and-relevance-of-the-topic"
            ],
            "source": {
              "pdf": "history",
              "page": 18
            }
          },
          {
            "id": "august-planning-and-organization--feasibility",
            "name": "feasibility",
            "minutes": 10,
            "deps": [
              "august-planning-and-organization--5-october-an-action-plan"
            ],
            "source": {
              "pdf": "history",
              "page": 18
            }
          },
          {
            "id": "august-planning-and-organization--updating-modifying-the-conducting-the-research-action-plan",
            "name": "Updating/ modifying the conducting the research. action plan",
            "minutes": 25,
            "deps": [
              "august-planning-and-organization--feasibility"
            ],
            "source": {
              "pdf": "history",
              "page": 18
            }
          },
          {
            "id": "august-planning-and-organization--data-collection",
            "name": "Data Collection",
            "minutes": 10,
            "deps": [
              "august-planning-and-organization--updating-modifying-the-conducting-the-research-action-plan"
            ],
            "source": {
              "pdf": "history",
              "page": 18
            }
          }
        ]
      }
    ]
  },
  {
    "id": "geography",
    "name": "Geography",
    "chapters": [
      {
        "id": "book",
        "name": "Book",
        "concepts": [
          {
            "id": "book--fundamentals-of-human-geography",
            "name": "Fundamentals of Human Geography",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 12
            }
          },
          {
            "id": "book--people-and-economy",
            "name": "People and Economy",
            "minutes": 15,
            "deps": [
              "book--fundamentals-of-human-geography"
            ],
            "source": {
              "pdf": "geography",
              "page": 14
            }
          }
        ]
      },
      {
        "id": "unit-3",
        "name": "Unit 3",
        "concepts": [
          {
            "id": "unit-3--hunting-and-gathering",
            "name": "● Hunting and Gathering",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 13
            }
          },
          {
            "id": "unit-3--pastoralism",
            "name": "Pastoralism",
            "minutes": 10,
            "deps": [
              "unit-3--hunting-and-gathering"
            ],
            "source": {
              "pdf": "geography",
              "page": 13
            }
          },
          {
            "id": "unit-3--nomadic-herding",
            "name": "Nomadic Herding",
            "minutes": 10,
            "deps": [
              "unit-3--pastoralism"
            ],
            "source": {
              "pdf": "geography",
              "page": 13
            }
          },
          {
            "id": "unit-3--factors-affecting-mining-methods-of-mining",
            "name": "factors affecting mining ● Methods of Mining",
            "minutes": 20,
            "deps": [
              "unit-3--nomadic-herding"
            ],
            "source": {
              "pdf": "geography",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "unit-1",
        "name": "Unit 1",
        "concepts": [
          {
            "id": "unit-1--chapter-1-population-distribution",
            "name": "Chapter- 1 Population Distribution",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 14
            }
          },
          {
            "id": "unit-1--density",
            "name": "Density",
            "minutes": 10,
            "deps": [
              "unit-1--chapter-1-population-distribution"
            ],
            "source": {
              "pdf": "geography",
              "page": 14
            }
          },
          {
            "id": "unit-1--rural-urban-composition",
            "name": "Rural – Urban Composition",
            "minutes": 15,
            "deps": [
              "unit-1--density"
            ],
            "source": {
              "pdf": "geography",
              "page": 14
            }
          },
          {
            "id": "unit-1--linguistic-composition",
            "name": "Linguistic Composition",
            "minutes": 10,
            "deps": [
              "unit-1--rural-urban-composition"
            ],
            "source": {
              "pdf": "geography",
              "page": 14
            }
          }
        ]
      },
      {
        "id": "europe",
        "name": "Europe",
        "concepts": [
          {
            "id": "europe--north-cape",
            "name": "North Cape",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "europe--london",
            "name": "London",
            "minutes": 10,
            "deps": [
              "europe--north-cape"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "europe--hamburg",
            "name": "Hamburg",
            "minutes": 10,
            "deps": [
              "europe--london"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "europe--moscow",
            "name": "Moscow",
            "minutes": 10,
            "deps": [
              "europe--hamburg"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "europe--paris",
            "name": "Paris",
            "minutes": 10,
            "deps": [
              "europe--moscow"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "europe--berlin-and-rome",
            "name": "Berlin and Rome",
            "minutes": 15,
            "deps": [
              "europe--paris"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "north-america",
        "name": "North America",
        "concepts": [
          {
            "id": "north-america--vancouver",
            "name": "Vancouver",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "north-america--san-francisco",
            "name": "San Francisco",
            "minutes": 10,
            "deps": [
              "north-america--vancouver"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "north-america--new-orleans",
            "name": "New Orleans ∙",
            "minutes": 15,
            "deps": [
              "north-america--san-francisco"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "north-america--chicago",
            "name": "Chicago",
            "minutes": 10,
            "deps": [
              "north-america--new-orleans"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "north-america--new-orleans-2",
            "name": "New Orleans",
            "minutes": 10,
            "deps": [
              "north-america--chicago"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "north-america--mexico-city",
            "name": "Mexico City",
            "minutes": 10,
            "deps": [
              "north-america--new-orleans-2"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "south-america",
        "name": "South America",
        "concepts": [
          {
            "id": "south-america--rio-de-janeiro",
            "name": "Rio de Janeiro",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "south-america--cologne",
            "name": "Cologne",
            "minutes": 10,
            "deps": [
              "south-america--rio-de-janeiro"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "south-america--suez-and-cape-town",
            "name": "Suez and Cape Town",
            "minutes": 15,
            "deps": [
              "south-america--cologne"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "south-america--buenos-aires",
            "name": "Buenos Aires",
            "minutes": 10,
            "deps": [
              "south-america--suez-and-cape-town"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "south-america--santiago",
            "name": "Santiago",
            "minutes": 10,
            "deps": [
              "south-america--buenos-aires"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "asia",
        "name": "Asia",
        "concepts": [
          {
            "id": "asia--yokohama",
            "name": "Yokohama",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--shanghai",
            "name": "Shanghai",
            "minutes": 10,
            "deps": [
              "asia--yokohama"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--hong-kong",
            "name": "Hong Kong",
            "minutes": 10,
            "deps": [
              "asia--shanghai"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--aden",
            "name": "Aden",
            "minutes": 10,
            "deps": [
              "asia--hong-kong"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--karachi",
            "name": "Karachi",
            "minutes": 10,
            "deps": [
              "asia--aden"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--kolkata",
            "name": "Kolkata",
            "minutes": 10,
            "deps": [
              "asia--karachi"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--tokyo",
            "name": "Tokyo",
            "minutes": 10,
            "deps": [
              "asia--kolkata"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--beijing",
            "name": "Beijing",
            "minutes": 10,
            "deps": [
              "asia--tokyo"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--mumbai",
            "name": "Mumbai",
            "minutes": 10,
            "deps": [
              "asia--beijing"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "asia--jeddah",
            "name": "Jeddah",
            "minutes": 10,
            "deps": [
              "asia--mumbai"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "australia",
        "name": "Australia",
        "concepts": [
          {
            "id": "australia--perth",
            "name": "Perth",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "australia--sydney",
            "name": "Sydney",
            "minutes": 10,
            "deps": [
              "australia--perth"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "australia--melbourne",
            "name": "Melbourne",
            "minutes": 10,
            "deps": [
              "australia--sydney"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "australia--darwin-and-wellington-inland-waterways-suez-canal",
            "name": "Darwin and Wellington Inland Waterways Suez Canal",
            "minutes": 20,
            "deps": [
              "australia--melbourne"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "australia--panama-canal",
            "name": "Panama Canal",
            "minutes": 10,
            "deps": [
              "australia--darwin-and-wellington-inland-waterways-suez-canal"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          },
          {
            "id": "australia--rhine-waterways-and-st-lawrence-seaways",
            "name": "Rhine waterways and St. Lawrence Seaways",
            "minutes": 20,
            "deps": [
              "australia--panama-canal"
            ],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "africa",
        "name": "Africa",
        "concepts": [
          {
            "id": "africa--johannesburg-nairobi",
            "name": "Johannesburg & Nairobi",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "prescribed",
        "name": "Prescribed",
        "concepts": [
          {
            "id": "prescribed--geography-as-a-discipline",
            "name": "Geography as a Discipline",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--the-origin-and-evolution-of-the-earth",
            "name": "The Origin and Evolution of the Earth",
            "minutes": 20,
            "deps": [
              "prescribed--geography-as-a-discipline"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--interior-of-the-earth",
            "name": "Interior of the Earth",
            "minutes": 15,
            "deps": [
              "prescribed--the-origin-and-evolution-of-the-earth"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--distribution-of-oceans-and-continents",
            "name": "Distribution of oceans and continents",
            "minutes": 20,
            "deps": [
              "prescribed--interior-of-the-earth"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--geomorphic-processes",
            "name": "Geomorphic Processes",
            "minutes": 10,
            "deps": [
              "prescribed--distribution-of-oceans-and-continents"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--landforms-and-their-evolution",
            "name": "Landforms and their Evolution",
            "minutes": 15,
            "deps": [
              "prescribed--geomorphic-processes"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--composition-and-structure-of-atmosphere",
            "name": "Composition and Structure of Atmosphere",
            "minutes": 20,
            "deps": [
              "prescribed--landforms-and-their-evolution"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--solar-radiation-heat-balance-and-temperature",
            "name": "Solar Radiation, Heat balance and Temperature",
            "minutes": 20,
            "deps": [
              "prescribed--composition-and-structure-of-atmosphere"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--atmospheric-circulation-and-weather-systems",
            "name": "Atmospheric Circulation and Weather Systems",
            "minutes": 20,
            "deps": [
              "prescribed--solar-radiation-heat-balance-and-temperature"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--water-in-the-atmosphere",
            "name": "Water in the Atmosphere",
            "minutes": 15,
            "deps": [
              "prescribed--atmospheric-circulation-and-weather-systems"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--world-climate-and-climate-change",
            "name": "World Climate and Climate Change",
            "minutes": 20,
            "deps": [
              "prescribed--water-in-the-atmosphere"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--water-oceans",
            "name": "Water (Oceans)",
            "minutes": 10,
            "deps": [
              "prescribed--world-climate-and-climate-change"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--movements-of-ocean-water",
            "name": "Movements of Ocean Water",
            "minutes": 15,
            "deps": [
              "prescribed--water-oceans"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--biodiversity-and-conservation",
            "name": "Biodiversity and Conservation",
            "minutes": 15,
            "deps": [
              "prescribed--movements-of-ocean-water"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--india-location-size-latitudinal-and-longitudinal-extent",
            "name": "India — Location, Size, Latitudinal and Longitudinal extent,",
            "minutes": 25,
            "deps": [
              "prescribed--biodiversity-and-conservation"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--structure-and-physiography",
            "name": "Structure and Physiography",
            "minutes": 15,
            "deps": [
              "prescribed--india-location-size-latitudinal-and-longitudinal-extent"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--drainage-system",
            "name": "Drainage System",
            "minutes": 10,
            "deps": [
              "prescribed--structure-and-physiography"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--climate",
            "name": "Climate",
            "minutes": 10,
            "deps": [
              "prescribed--drainage-system"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--natural-vegetation",
            "name": "Natural Vegetation",
            "minutes": 10,
            "deps": [
              "prescribed--climate"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--natural-hazards-and-disasters",
            "name": "Natural Hazards and Disasters",
            "minutes": 15,
            "deps": [
              "prescribed--natural-vegetation"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--introduction-to-maps",
            "name": "Introduction to Maps",
            "minutes": 15,
            "deps": [
              "prescribed--natural-hazards-and-disasters"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--map-scale",
            "name": "Map Scale",
            "minutes": 10,
            "deps": [
              "prescribed--introduction-to-maps"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--latitude-longitude-and-time",
            "name": "Latitude, Longitude and Time",
            "minutes": 15,
            "deps": [
              "prescribed--map-scale"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--map-projections",
            "name": "Map Projections",
            "minutes": 10,
            "deps": [
              "prescribed--latitude-longitude-and-time"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--topographical-maps",
            "name": "Topographical Maps",
            "minutes": 10,
            "deps": [
              "prescribed--map-projections"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--introduction-to-remote-sensing",
            "name": "Introduction to Remote Sensing",
            "minutes": 15,
            "deps": [
              "prescribed--topographical-maps"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--human-development",
            "name": "Human Development",
            "minutes": 10,
            "deps": [
              "prescribed--introduction-to-remote-sensing"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--secondary-activities",
            "name": "Secondary Activities",
            "minutes": 10,
            "deps": [
              "prescribed--human-development"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--tertiary-activities",
            "name": "Tertiary Activities",
            "minutes": 10,
            "deps": [
              "prescribed--secondary-activities"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--transport-and-communication",
            "name": "Transport and Communication",
            "minutes": 15,
            "deps": [
              "prescribed--tertiary-activities"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--international-trade",
            "name": "International Trade",
            "minutes": 10,
            "deps": [
              "prescribed--transport-and-communication"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--water-resources",
            "name": "Water Resources",
            "minutes": 10,
            "deps": [
              "prescribed--international-trade"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--mineral-and-energy-resources",
            "name": "Mineral and Energy Resources",
            "minutes": 15,
            "deps": [
              "prescribed--water-resources"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--planning-and-sustainable-development-in-indian-context",
            "name": "Planning and Sustainable Development in Indian Context",
            "minutes": 20,
            "deps": [
              "prescribed--mineral-and-energy-resources"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--international-trade-2",
            "name": "International Trade",
            "minutes": 10,
            "deps": [
              "prescribed--planning-and-sustainable-development-in-indian-context"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--data-its-source-and-compilation",
            "name": "Data – Its Source and Compilation",
            "minutes": 20,
            "deps": [
              "prescribed--international-trade-2"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--data-processing",
            "name": "Data Processing",
            "minutes": 10,
            "deps": [
              "prescribed--data-its-source-and-compilation"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--graphical-representation-of-data",
            "name": "Graphical Representation of Data",
            "minutes": 15,
            "deps": [
              "prescribed--data-processing"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--spatial-information-technology",
            "name": "Spatial Information Technology",
            "minutes": 15,
            "deps": [
              "prescribed--graphical-representation-of-data"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--human-geography-nil",
            "name": "Human Geography Nil",
            "minutes": 15,
            "deps": [
              "prescribed--spatial-information-technology"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--the-world",
            "name": "the world",
            "minutes": 10,
            "deps": [
              "prescribed--human-geography-nil"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--human",
            "name": "human",
            "minutes": 10,
            "deps": [
              "prescribed--the-world"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--primary-activities-areas-of-subsistence-gathering",
            "name": "Primary Activities Areas of subsistence gathering",
            "minutes": 20,
            "deps": [
              "prescribed--human"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--secondary",
            "name": "secondary",
            "minutes": 10,
            "deps": [
              "prescribed--primary-activities-areas-of-subsistence-gathering"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--tertiary-and",
            "name": "Tertiary and",
            "minutes": 10,
            "deps": [
              "prescribed--secondary"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--transport",
            "name": "Transport",
            "minutes": 10,
            "deps": [
              "prescribed--tertiary-and"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--international-trade-nil",
            "name": "International Trade Nil",
            "minutes": 15,
            "deps": [
              "prescribed--transport"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--population",
            "name": "Population",
            "minutes": 10,
            "deps": [
              "prescribed--international-trade-nil"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--human-settlement-nil",
            "name": "Human Settlement Nil",
            "minutes": 15,
            "deps": [
              "prescribed--population"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--land-resources",
            "name": "Land Resources",
            "minutes": 10,
            "deps": [
              "prescribed--human-settlement-nil"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--water-resources-nil",
            "name": "Water Resources Nil",
            "minutes": 15,
            "deps": [
              "prescribed--land-resources"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--mineral-and-energy",
            "name": "Mineral and Energy",
            "minutes": 15,
            "deps": [
              "prescribed--water-resources-nil"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--planning-and",
            "name": "Planning and",
            "minutes": 10,
            "deps": [
              "prescribed--mineral-and-energy"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--transport-and",
            "name": "Transport and",
            "minutes": 10,
            "deps": [
              "prescribed--planning-and"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          },
          {
            "id": "prescribed--international-trade-major-sea-ports-kandla-mumbai-marmagao-kochi",
            "name": "International Trade ● Major Sea Ports: Kandla, Mumbai, Marmagao, Kochi,",
            "minutes": 25,
            "deps": [
              "prescribed--transport-and"
            ],
            "source": {
              "pdf": "geography",
              "page": null
            }
          }
        ]
      }
    ]
  },
  {
    "id": "political-science",
    "name": "Political Science",
    "chapters": [
      {
        "id": "class-xii",
        "name": "Class XII",
        "concepts": [
          {
            "id": "class-xii--for-scrutiny-by-the-board",
            "name": "for scrutiny by the Board",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          }
        ]
      },
      {
        "id": "class-xi",
        "name": "Class XI",
        "concepts": [
          {
            "id": "class-xi--assessment-will-be-done-by-internal-examiner",
            "name": "Assessment will be done by internal examiner",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          }
        ]
      },
      {
        "id": "chapter-3",
        "name": "Chapter -3",
        "concepts": [
          {
            "id": "chapter-3--election-and-representation",
            "name": "Election and Representation",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          }
        ]
      },
      {
        "id": "sub-topic",
        "name": "Sub-Topic",
        "concepts": [
          {
            "id": "sub-topic--madhya-pradesh",
            "name": "Madhya Pradesh",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          },
          {
            "id": "sub-topic--uttar-pradesh",
            "name": "Uttar Pradesh",
            "minutes": 10,
            "deps": [
              "sub-topic--madhya-pradesh"
            ],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          },
          {
            "id": "sub-topic--sikkim",
            "name": "Sikkim",
            "minutes": 10,
            "deps": [
              "sub-topic--uttar-pradesh"
            ],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          },
          {
            "id": "sub-topic--arunachal-pradesh-and-uts-for-the-lok-sabha-elections-for-assembly-elections",
            "name": "Arunachal Pradesh and UTS for the Lok Sabha elections. For Assembly elections",
            "minutes": 25,
            "deps": [
              "sub-topic--sikkim"
            ],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          },
          {
            "id": "sub-topic--sardar-vallabhbhai-patel",
            "name": "Sardar Vallabhbhai Patel",
            "minutes": 15,
            "deps": [
              "sub-topic--arunachal-pradesh-and-uts-for-the-lok-sabha-elections-for-assembly-elections"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "sub-topic--diplomatic-prowess-and-foresightedness",
            "name": "diplomatic prowess and foresightedness",
            "minutes": 15,
            "deps": [
              "sub-topic--sardar-vallabhbhai-patel"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "sub-topic--hyderabad",
            "name": "Hyderabad",
            "minutes": 10,
            "deps": [
              "sub-topic--diplomatic-prowess-and-foresightedness"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "sub-topic--sardar-patels-opinion-on-kashmir-was-different-from-other-leaders-like-hyderabad",
            "name": "Sardar Patel's opinion on Kashmir was different from other leaders. Like Hyderabad",
            "minutes": 25,
            "deps": [
              "sub-topic--hyderabad"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "sub-topic--sardar-patel-could-not-succeed-in-integrating-kashmir-fully-with-india-however",
            "name": "Sardar Patel could not succeed in integrating Kashmir fully with India. However",
            "minutes": 25,
            "deps": [
              "sub-topic--sardar-patels-opinion-on-kashmir-was-different-from-other-leaders-like-hyderabad"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "sub-topic--catalyst-and-realist-popularly-characterised-as-ncr-in-indian-political-history",
            "name": "‘Catalyst’ and ‘Realist’ – popularly characterised as NCR in Indian political history",
            "minutes": 25,
            "deps": [
              "sub-topic--sardar-patel-could-not-succeed-in-integrating-kashmir-fully-with-india-however"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "sub-topic--the-union-cabinet-ministers-and-chief-ministers-of-all-states-or-their-substitut",
            "name": "the Union Cabinet Ministers and Chief Ministers of all States or their substitutes",
            "minutes": 25,
            "deps": [
              "sub-topic--catalyst-and-realist-popularly-characterised-as-ncr-in-indian-political-history"
            ],
            "source": {
              "pdf": "political-science",
              "page": 29
            }
          },
          {
            "id": "sub-topic--rule-of-law",
            "name": "rule of law",
            "minutes": 15,
            "deps": [
              "sub-topic--the-union-cabinet-ministers-and-chief-ministers-of-all-states-or-their-substitut"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--in-areas-such-as-trade",
            "name": "in areas such as trade",
            "minutes": 20,
            "deps": [
              "sub-topic--rule-of-law"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--security",
            "name": "security",
            "minutes": 10,
            "deps": [
              "sub-topic--in-areas-such-as-trade"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--climate-action",
            "name": "climate action",
            "minutes": 10,
            "deps": [
              "sub-topic--security"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--technology",
            "name": "technology",
            "minutes": 10,
            "deps": [
              "sub-topic--climate-action"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--the-india-eu-trade-has-been-focused-on-mainly-machinery-and-appliances",
            "name": "the India-EU trade has been focused on mainly machinery and appliances",
            "minutes": 25,
            "deps": [
              "sub-topic--technology"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--chemicals",
            "name": "chemicals",
            "minutes": 10,
            "deps": [
              "sub-topic--the-india-eu-trade-has-been-focused-on-mainly-machinery-and-appliances"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--base-metals",
            "name": "base metals",
            "minutes": 10,
            "deps": [
              "sub-topic--chemicals"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--mineral-products",
            "name": "mineral products",
            "minutes": 10,
            "deps": [
              "sub-topic--base-metals"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--textiles-and-transport-equipment-over-the-years",
            "name": "textiles and transport equipment. Over the years",
            "minutes": 20,
            "deps": [
              "sub-topic--mineral-products"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--clean-energy",
            "name": "clean energy",
            "minutes": 10,
            "deps": [
              "sub-topic--textiles-and-transport-equipment-over-the-years"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--connectivity-projects",
            "name": "connectivity projects",
            "minutes": 10,
            "deps": [
              "sub-topic--clean-energy"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--skilled-workers-mobility",
            "name": "skilled workers’ mobility",
            "minutes": 15,
            "deps": [
              "sub-topic--connectivity-projects"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--strengthening-cooperation-in-key-areas-including-maritime-security",
            "name": "strengthening cooperation in key areas including maritime security",
            "minutes": 25,
            "deps": [
              "sub-topic--skilled-workers-mobility"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--cybersecurity",
            "name": "cybersecurity",
            "minutes": 10,
            "deps": [
              "sub-topic--strengthening-cooperation-in-key-areas-including-maritime-security"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--cyber-defence",
            "name": "cyber defence",
            "minutes": 10,
            "deps": [
              "sub-topic--cybersecurity"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--indias-nuclear-program-updates-indias-nuclear-policy-has-always-been-peace-orien",
            "name": "‘India’s Nuclear Program’ (Updates) India's nuclear policy has always been peace-oriented",
            "minutes": 25,
            "deps": [
              "sub-topic--cyber-defence"
            ],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          },
          {
            "id": "sub-topic--centre",
            "name": "Centre",
            "minutes": 10,
            "deps": [
              "sub-topic--indias-nuclear-program-updates-indias-nuclear-policy-has-always-been-peace-orien"
            ],
            "source": {
              "pdf": "political-science",
              "page": 31
            }
          },
          {
            "id": "sub-topic--region",
            "name": "Region",
            "minutes": 10,
            "deps": [
              "sub-topic--centre"
            ],
            "source": {
              "pdf": "political-science",
              "page": 31
            }
          },
          {
            "id": "sub-topic--spade-prepared-to-make-efforts",
            "name": "Spade [prepared to make efforts]",
            "minutes": 20,
            "deps": [
              "sub-topic--region"
            ],
            "source": {
              "pdf": "political-science",
              "page": 31
            }
          },
          {
            "id": "sub-topic--vote-power-of-voting",
            "name": "Vote [power of voting]",
            "minutes": 15,
            "deps": [
              "sub-topic--spade-prepared-to-make-efforts"
            ],
            "source": {
              "pdf": "political-science",
              "page": 31
            }
          },
          {
            "id": "sub-topic--deendayal-upadhyaya-and-integral-humanism-pandit-deendayal-upadhyaya-was-a-philo",
            "name": "‘Deendayal Upadhyaya and integral Humanism’ Pandit Deendayal Upadhyaya was a philosopher",
            "minutes": 25,
            "deps": [
              "sub-topic--vote-power-of-voting"
            ],
            "source": {
              "pdf": "political-science",
              "page": 31
            }
          },
          {
            "id": "sub-topic--sociologist",
            "name": "sociologist",
            "minutes": 10,
            "deps": [
              "sub-topic--deendayal-upadhyaya-and-integral-humanism-pandit-deendayal-upadhyaya-was-a-philo"
            ],
            "source": {
              "pdf": "political-science",
              "page": 31
            }
          },
          {
            "id": "sub-topic--it-is-best-suited-for-a-country-as-diverse-as-india",
            "name": "it is best suited for a country as diverse as India",
            "minutes": 25,
            "deps": [
              "sub-topic--sociologist"
            ],
            "source": {
              "pdf": "political-science",
              "page": 31
            }
          },
          {
            "id": "sub-topic--issues-of-development-and-governance-in-addition-to-schemes-already-existing",
            "name": "‘Issues of Development and Governance’ In addition to schemes already existing",
            "minutes": 25,
            "deps": [
              "sub-topic--it-is-best-suited-for-a-country-as-diverse-as-india"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--swachh-bharat-abhiyan",
            "name": "Swachh Bharat Abhiyan",
            "minutes": 15,
            "deps": [
              "sub-topic--issues-of-development-and-governance-in-addition-to-schemes-already-existing"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--jan-dhan-yojana",
            "name": "Jan-Dhan Yojana",
            "minutes": 10,
            "deps": [
              "sub-topic--swachh-bharat-abhiyan"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--deendayal-upadhyaya-gram-jyoti-yojana",
            "name": "Deendayal Upadhyaya Gram Jyoti Yojana",
            "minutes": 20,
            "deps": [
              "sub-topic--jan-dhan-yojana"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--kisan-fasal-bima-yojna",
            "name": "Kisan Fasal Bima Yojna",
            "minutes": 15,
            "deps": [
              "sub-topic--deendayal-upadhyaya-gram-jyoti-yojana"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--beti-bachao-beti-padhao",
            "name": "Beti Bachao Beti Padhao",
            "minutes": 15,
            "deps": [
              "sub-topic--kisan-fasal-bima-yojna"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--ayushman-bharat-yojana",
            "name": "Ayushman Bharat Yojana",
            "minutes": 15,
            "deps": [
              "sub-topic--beti-bachao-beti-padhao"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--particularly-the-women",
            "name": "particularly the women",
            "minutes": 15,
            "deps": [
              "sub-topic--ayushman-bharat-yojana"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          },
          {
            "id": "sub-topic--real-beneficiaries-of-the-central-government-schemes",
            "name": "real beneficiaries of the Central Government schemes",
            "minutes": 20,
            "deps": [
              "sub-topic--particularly-the-women"
            ],
            "source": {
              "pdf": "political-science",
              "page": 34
            }
          }
        ]
      },
      {
        "id": "sub-topics",
        "name": "Sub-Topics",
        "concepts": [
          {
            "id": "sub-topics--quasi-federalism-competitive-federalism",
            "name": "‘Quasi Federalism’. ‘Competitive Federalism’",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          },
          {
            "id": "sub-topics--social",
            "name": "social",
            "minutes": 10,
            "deps": [
              "sub-topics--quasi-federalism-competitive-federalism"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "sub-topics--political-and-economic-justice-are-the-key-dimensions-of-justice-here",
            "name": "political and economic justice are the key dimensions of justice. Here",
            "minutes": 25,
            "deps": [
              "sub-topics--social"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "sub-topics--we-will-try-to-understand-these-dimensions-in-some-details",
            "name": "we will try to understand these dimensions in some details",
            "minutes": 25,
            "deps": [
              "sub-topics--political-and-economic-justice-are-the-key-dimensions-of-justice-here"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          }
        ]
      },
      {
        "id": "quasi-federalism",
        "name": "Quasi Federalism",
        "concepts": [
          {
            "id": "quasi-federalism--in-the-context-of-special-features-and-provisions-of-indian-federalism-we-use-th",
            "name": "In the context of special features and provisions of Indian federalism we use the phrase",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          },
          {
            "id": "quasi-federalism--quasi-federalism",
            "name": "‘Quasi Federalism’",
            "minutes": 10,
            "deps": [
              "quasi-federalism--in-the-context-of-special-features-and-provisions-of-indian-federalism-we-use-th"
            ],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          },
          {
            "id": "quasi-federalism--a-concept-given-by-k-c-wheare-quasi-federalism-represents-a-strong",
            "name": "a concept given by K. C. Wheare. Quasi federalism represents a strong",
            "minutes": 25,
            "deps": [
              "quasi-federalism--quasi-federalism"
            ],
            "source": {
              "pdf": "political-science",
              "page": 21
            }
          }
        ]
      },
      {
        "id": "cooperative-federalism",
        "name": "Cooperative Federalism",
        "concepts": [
          {
            "id": "cooperative-federalism--zonal-councils",
            "name": "Zonal Councils",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 22
            }
          },
          {
            "id": "cooperative-federalism--the-7th-schedule",
            "name": "the 7th Schedule",
            "minutes": 15,
            "deps": [
              "cooperative-federalism--zonal-councils"
            ],
            "source": {
              "pdf": "political-science",
              "page": 22
            }
          }
        ]
      },
      {
        "id": "competitive-federalism",
        "name": "Competitive Federalism",
        "concepts": [
          {
            "id": "competitive-federalism--accountable",
            "name": "accountable",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 22
            }
          }
        ]
      },
      {
        "id": "chapter-9",
        "name": "Chapter 9",
        "concepts": [
          {
            "id": "chapter-9--constitution-amendments-as-of-2024",
            "name": "Constitution Amendments As of 2024",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 22
            }
          },
          {
            "id": "chapter-9--https-legislative-gov-in-constitution-of-india",
            "name": "https://legislative.gov.in/constitution-of-india/",
            "minutes": 10,
            "deps": [
              "chapter-9--constitution-amendments-as-of-2024"
            ],
            "source": {
              "pdf": "political-science",
              "page": 22
            }
          }
        ]
      },
      {
        "id": "political-justice",
        "name": "Political Justice",
        "concepts": [
          {
            "id": "political-justice--freedom-of-expression-and-association-are-important-pillars-of-political-justice",
            "name": "freedom of expression and association are important pillars of political justice",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          }
        ]
      },
      {
        "id": "social-justice",
        "name": "Social Justice",
        "concepts": [
          {
            "id": "social-justice--to-develop-her-his-personality-to-ensure-equality-of-law",
            "name": "to develop her/his personality to ensure equality of law",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "social-justice--prohibition-of-discrimination",
            "name": "prohibition of discrimination",
            "minutes": 15,
            "deps": [
              "social-justice--to-develop-her-his-personality-to-ensure-equality-of-law"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "social-justice--social-security",
            "name": "social security",
            "minutes": 10,
            "deps": [
              "social-justice--prohibition-of-discrimination"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "social-justice--provision-of-equal-political-rights",
            "name": "provision of equal political rights",
            "minutes": 20,
            "deps": [
              "social-justice--social-security"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "social-justice--religion",
            "name": "religion",
            "minutes": 10,
            "deps": [
              "social-justice--provision-of-equal-political-rights"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "social-justice--caste",
            "name": "caste",
            "minutes": 10,
            "deps": [
              "social-justice--religion"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "social-justice--gender-and-place-of-birth",
            "name": "gender and place of birth",
            "minutes": 20,
            "deps": [
              "social-justice--caste"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          }
        ]
      },
      {
        "id": "economic-justice",
        "name": "Economic Justice",
        "concepts": [
          {
            "id": "economic-justice--cloth",
            "name": "cloth",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "economic-justice--by-making-provisions-for-equal-pay-for-equal-work",
            "name": "by making provisions for equal pay for equal work",
            "minutes": 25,
            "deps": [
              "economic-justice--cloth"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          },
          {
            "id": "economic-justice--fair",
            "name": "fair",
            "minutes": 10,
            "deps": [
              "economic-justice--by-making-provisions-for-equal-pay-for-equal-work"
            ],
            "source": {
              "pdf": "political-science",
              "page": 23
            }
          }
        ]
      },
      {
        "id": "chapter-7",
        "name": "Chapter 7",
        "concepts": [
          {
            "id": "chapter-7--the-concept-of-multiculturalism-is-identified-with-the-notion-of-salad-bowl",
            "name": "the concept of multiculturalism is identified with the notion of \"Salad Bowl\"",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 24
            }
          },
          {
            "id": "chapter-7--advocated-by-social-scientist",
            "name": "advocated by social scientist",
            "minutes": 15,
            "deps": [
              "chapter-7--the-concept-of-multiculturalism-is-identified-with-the-notion-of-salad-bowl"
            ],
            "source": {
              "pdf": "political-science",
              "page": 24
            }
          }
        ]
      },
      {
        "id": "part-a",
        "name": "Part A",
        "concepts": [
          {
            "id": "part-a--contemporary-world-politics",
            "name": "Contemporary World Politics",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          }
        ]
      },
      {
        "id": "chapter-1",
        "name": "Chapter-1",
        "concepts": [
          {
            "id": "chapter-1--one-such-event-is-characterised-as-arab-spring-that-began-in-2009-located-in-tun",
            "name": "one such event is characterised as Arab Spring that began in 2009. Located in Tunisia",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-1--the-arab-spring-took-its-roots-where-the-struggle-against-corruption",
            "name": "the Arab Spring took its roots where the struggle against corruption",
            "minutes": 25,
            "deps": [
              "chapter-1--one-such-event-is-characterised-as-arab-spring-that-began-in-2009-located-in-tun"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-1--who-had-been-in-power-in-egypt-since-1979",
            "name": "who had been in power in Egypt since 1979",
            "minutes": 25,
            "deps": [
              "chapter-1--the-arab-spring-took-its-roots-where-the-struggle-against-corruption"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-1--the-influence-of-arab-spring-could-also-be-seen-in-yemen",
            "name": "the influence of Arab Spring could also be seen in Yemen",
            "minutes": 25,
            "deps": [
              "chapter-1--who-had-been-in-power-in-egypt-since-1979"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-1--bahrain",
            "name": "Bahrain",
            "minutes": 10,
            "deps": [
              "chapter-1--the-influence-of-arab-spring-could-also-be-seen-in-yemen"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-1--challenges-of-nation-building",
            "name": "Challenges of Nation Building",
            "minutes": 15,
            "deps": [
              "chapter-1--bahrain"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          }
        ]
      },
      {
        "id": "chapter-2",
        "name": "Chapter-2",
        "concepts": [
          {
            "id": "chapter-2--brics-the-term-brics-refers-to-brazil",
            "name": "‘BRICS’ The term BRICS refers to Brazil",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-2--russia",
            "name": "Russia",
            "minutes": 10,
            "deps": [
              "chapter-2--brics-the-term-brics-refers-to-brazil"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-2--india",
            "name": "India",
            "minutes": 10,
            "deps": [
              "chapter-2--russia"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-2--china",
            "name": "China",
            "minutes": 10,
            "deps": [
              "chapter-2--india"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-2--the-bloc-expanded-beyond-the-original-five-members-egypt",
            "name": "the bloc expanded beyond the original five members. Egypt",
            "minutes": 25,
            "deps": [
              "chapter-2--china"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-2--ethiopia",
            "name": "Ethiopia",
            "minutes": 10,
            "deps": [
              "chapter-2--the-bloc-expanded-beyond-the-original-five-members-egypt"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-2--iran",
            "name": "Iran",
            "minutes": 10,
            "deps": [
              "chapter-2--ethiopia"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          },
          {
            "id": "chapter-2--russia-is-a-nuclear-state-with-25",
            "name": "Russia is a nuclear state with 25",
            "minutes": 20,
            "deps": [
              "chapter-2--iran"
            ],
            "source": {
              "pdf": "political-science",
              "page": 25
            }
          }
        ]
      },
      {
        "id": "chapter-5",
        "name": "Chapter-5",
        "concepts": [
          {
            "id": "chapter-5--often-violent",
            "name": "often violent",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 27
            }
          },
          {
            "id": "chapter-5--are-perpetrated-for-a-religious",
            "name": "are perpetrated for a religious",
            "minutes": 20,
            "deps": [
              "chapter-5--often-violent"
            ],
            "source": {
              "pdf": "political-science",
              "page": 27
            }
          },
          {
            "id": "chapter-5--political-or",
            "name": "political or",
            "minutes": 10,
            "deps": [
              "chapter-5--are-perpetrated-for-a-religious"
            ],
            "source": {
              "pdf": "political-science",
              "page": 27
            }
          },
          {
            "id": "chapter-5--ideological-goal",
            "name": "ideological goal",
            "minutes": 10,
            "deps": [
              "chapter-5--political-or"
            ],
            "source": {
              "pdf": "political-science",
              "page": 27
            }
          },
          {
            "id": "chapter-5--it-is-a-global-problem-and-should-be-combated-collectively",
            "name": "it is a global problem and should be combated collectively",
            "minutes": 25,
            "deps": [
              "chapter-5--ideological-goal"
            ],
            "source": {
              "pdf": "political-science",
              "page": 27
            }
          }
        ]
      },
      {
        "id": "chapter-3",
        "name": "Chapter-3",
        "concepts": [
          {
            "id": "chapter-3--niti-aayog-after-independence",
            "name": "‘NITI Aayog’ After independence",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "chapter-3--especially-in-the-21st-century",
            "name": "especially in the 21st century",
            "minutes": 20,
            "deps": [
              "chapter-3--niti-aayog-after-independence"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "chapter-3--it-was-becoming-ineffective-and-irrelevant",
            "name": "it was becoming ineffective and irrelevant",
            "minutes": 20,
            "deps": [
              "chapter-3--especially-in-the-21st-century"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "chapter-3--particularly-in-terms-of-coping-with-the-pressing-challenges-of-development-henc",
            "name": "particularly in terms of coping with the pressing challenges of development. Hence",
            "minutes": 25,
            "deps": [
              "chapter-3--it-was-becoming-ineffective-and-irrelevant"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          },
          {
            "id": "chapter-3--during-his-independence-day-speech-on-15-august-2014",
            "name": "during his Independence Day speech on 15 August 2014",
            "minutes": 25,
            "deps": [
              "chapter-3--particularly-in-terms-of-coping-with-the-pressing-challenges-of-development-henc"
            ],
            "source": {
              "pdf": "political-science",
              "page": 28
            }
          }
        ]
      },
      {
        "id": "chapter-4",
        "name": "Chapter-4",
        "concepts": [
          {
            "id": "chapter-4--indias-external-relations",
            "name": "India’s External Relations",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 30
            }
          }
        ]
      },
      {
        "id": "chapter-8",
        "name": "Chapter-8",
        "concepts": [
          {
            "id": "chapter-8--nda-iii",
            "name": "‘NDA III",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 33
            }
          },
          {
            "id": "chapter-8--a-government-with-an-33",
            "name": "a government with an 33",
            "minutes": 20,
            "deps": [
              "chapter-8--nda-iii"
            ],
            "source": {
              "pdf": "political-science",
              "page": 33
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--challenges-of-nation-building-topics-to-be-focused-a-challenges-for-the-newnatio",
            "name": "Challenges of Nation Building Topics to be focused: a) Challenges for the newNation",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 13
            }
          },
          {
            "id": "syllabus--era-of-one-partydominance-topics-to-be-focused-a-challenge-of-building-democracy",
            "name": "Era of One-PartyDominance Topics to be focused: a) Challenge of building democracy. b) Congress dominance in the first three general elect ions",
            "minutes": 25,
            "deps": [
              "syllabus--challenges-of-nation-building-topics-to-be-focused-a-challenges-for-the-newnatio"
            ],
            "source": {
              "pdf": "political-science",
              "page": 13
            }
          },
          {
            "id": "syllabus--politics-of-planned-development-topics-to-be-focused-a-political-contestation",
            "name": "Politics of Planned Development Topics to be focused: a) Political contestation",
            "minutes": 25,
            "deps": [
              "syllabus--era-of-one-partydominance-topics-to-be-focused-a-challenge-of-building-democracy"
            ],
            "source": {
              "pdf": "political-science",
              "page": 13
            }
          },
          {
            "id": "syllabus--indias-external-relations-topics-to-be-focused-a-international-context-b-the-pol",
            "name": "India’s External Relations Topics to be focused: a) International Context b) The Policy of Non-Alignment. Students will be able to:",
            "minutes": 25,
            "deps": [
              "syllabus--politics-of-planned-development-topics-to-be-focused-a-political-contestation"
            ],
            "source": {
              "pdf": "political-science",
              "page": 13
            }
          },
          {
            "id": "syllabus--challenges-to-and-restoration-of-the-congress-system-topics-to-be-focused-a-chal",
            "name": "Challenges to and Restoration of the Congress System Topics to be focused: a) Challenge of Political Succession",
            "minutes": 25,
            "deps": [
              "syllabus--indias-external-relations-topics-to-be-focused-a-international-context-b-the-pol"
            ],
            "source": {
              "pdf": "political-science",
              "page": 14
            }
          },
          {
            "id": "syllabus--the-crisis-of-democratic-order-topics-to-be-focused-a-background-to-emergency",
            "name": "The Crisis of Democratic Order Topics to be focused: a) Background to Emergency",
            "minutes": 25,
            "deps": [
              "syllabus--challenges-to-and-restoration-of-the-congress-system-topics-to-be-focused-a-chal"
            ],
            "source": {
              "pdf": "political-science",
              "page": 14
            }
          },
          {
            "id": "syllabus--regional-aspirations-topics-to-be-focused-a-region-and-the-nation",
            "name": "Regional Aspirations Topics to be focused: a) Region and the Nation",
            "minutes": 25,
            "deps": [
              "syllabus--the-crisis-of-democratic-order-topics-to-be-focused-a-background-to-emergency"
            ],
            "source": {
              "pdf": "political-science",
              "page": 15
            }
          },
          {
            "id": "syllabus--recent-developments-in-indian-politics-topics-to-be-focused-a-context-of-1990s-b",
            "name": "Recent Developments in Indian Politics Topics to be focused a) Context of 1990s b) Era of Coalition",
            "minutes": 25,
            "deps": [
              "syllabus--regional-aspirations-topics-to-be-focused-a-region-and-the-nation"
            ],
            "source": {
              "pdf": "political-science",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "asean",
        "name": "ASEAN",
        "concepts": [
          {
            "id": "asean--european-union-and-india",
            "name": "European Union and India",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          }
        ]
      },
      {
        "id": "saarc",
        "name": "SAARC",
        "concepts": [
          {
            "id": "saarc--indias-nuclear-policy",
            "name": "India’s Nuclear Policy",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          },
          {
            "id": "saarc--united-nations-with-focus-on-indias-candidature-in-security-council",
            "name": "United Nations with focus on India’s candidature in Security Council",
            "minutes": 25,
            "deps": [
              "saarc--indias-nuclear-policy"
            ],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          },
          {
            "id": "saarc--un-agencies-unicef-unesco-who",
            "name": "UN Agencies – UNICEF, UNESCO,WHO",
            "minutes": 20,
            "deps": [
              "saarc--united-nations-with-focus-on-indias-candidature-in-security-council"
            ],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          },
          {
            "id": "saarc--partition-of-india-theory-behind-it-and-its-legacy",
            "name": "Partition of India-Theory behind it and its legacy",
            "minutes": 25,
            "deps": [
              "saarc--un-agencies-unicef-unesco-who"
            ],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          },
          {
            "id": "saarc--comparison-between-niti-aayog-and-planning-commission-and-their-contribution-in-",
            "name": "Comparison between NITI AAYOG and Planning Commission and their contribution in India’s Development",
            "minutes": 25,
            "deps": [
              "saarc--partition-of-india-theory-behind-it-and-its-legacy"
            ],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          },
          {
            "id": "saarc--election-commission-of-india-and-electoral-roll-and-its-revision",
            "name": "Election Commission of India and Electoral Roll and its revision",
            "minutes": 25,
            "deps": [
              "saarc--comparison-between-niti-aayog-and-planning-commission-and-their-contribution-in-"
            ],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          },
          {
            "id": "saarc--elections-2019-rise-of-bjp-and-downfall-of-congress-1989-2019",
            "name": "Elections 2019- Rise of BJP and Downfall of Congress (1989-2019)",
            "minutes": 25,
            "deps": [
              "saarc--election-commission-of-india-and-electoral-roll-and-its-revision"
            ],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          },
          {
            "id": "saarc--imposition-of-emergency-in-india",
            "name": "Imposition of Emergency in India",
            "minutes": 20,
            "deps": [
              "saarc--elections-2019-rise-of-bjp-and-downfall-of-congress-1989-2019"
            ],
            "source": {
              "pdf": "political-science",
              "page": 20
            }
          }
        ]
      }
    ]
  },
  {
    "id": "sociology",
    "name": "Sociology",
    "chapters": [
      {
        "id": "prescribed",
        "name": "Prescribed",
        "concepts": [
          {
            "id": "prescribed--sociology-society-and-its-relationship-with-other-social-sciences",
            "name": "Sociology, Society and its Relationship with other Social Sciences",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "sociology",
              "page": 3
            }
          },
          {
            "id": "prescribed--terms-concepts-and-their-use-in-sociology",
            "name": "Terms, Concepts and their use in Sociology",
            "minutes": 20,
            "deps": [
              "prescribed--sociology-society-and-its-relationship-with-other-social-sciences"
            ],
            "source": {
              "pdf": "sociology",
              "page": 3
            }
          },
          {
            "id": "prescribed--understanding-social-institutions",
            "name": "Understanding Social Institutions",
            "minutes": 15,
            "deps": [
              "prescribed--terms-concepts-and-their-use-in-sociology"
            ],
            "source": {
              "pdf": "sociology",
              "page": 3
            }
          },
          {
            "id": "prescribed--culture-and-socialization",
            "name": "Culture and Socialization",
            "minutes": 15,
            "deps": [
              "prescribed--understanding-social-institutions"
            ],
            "source": {
              "pdf": "sociology",
              "page": 3
            }
          },
          {
            "id": "prescribed--social-change-and-social-order-in-rural-and-urban-society",
            "name": "Social Change and Social Order in Rural and Urban Society",
            "minutes": 25,
            "deps": [
              "prescribed--culture-and-socialization"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "prescribed--introducing-western-sociologists",
            "name": "Introducing Western Sociologists",
            "minutes": 15,
            "deps": [
              "prescribed--social-change-and-social-order-in-rural-and-urban-society"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "prescribed--indian-sociologists",
            "name": "Indian Sociologists",
            "minutes": 10,
            "deps": [
              "prescribed--introducing-western-sociologists"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "prescribed--introducing-indian-society",
            "name": "Introducing Indian Society",
            "minutes": 15,
            "deps": [
              "prescribed--indian-sociologists"
            ],
            "source": {
              "pdf": "sociology",
              "page": 6
            }
          },
          {
            "id": "prescribed--the-demographic-structure-of-the-indian-society",
            "name": "The Demographic Structure of the Indian Society",
            "minutes": 20,
            "deps": [
              "prescribed--introducing-indian-society"
            ],
            "source": {
              "pdf": "sociology",
              "page": 6
            }
          },
          {
            "id": "prescribed--social-institutions-continuity-and-change",
            "name": "Social Institutions: Continuity and Change",
            "minutes": 20,
            "deps": [
              "prescribed--the-demographic-structure-of-the-indian-society"
            ],
            "source": {
              "pdf": "sociology",
              "page": 7
            }
          },
          {
            "id": "prescribed--patterns-of-social-inequality-and-exclusion",
            "name": "Patterns of Social Inequality and Exclusion",
            "minutes": 20,
            "deps": [
              "prescribed--social-institutions-continuity-and-change"
            ],
            "source": {
              "pdf": "sociology",
              "page": 7
            }
          },
          {
            "id": "prescribed--the-challenges-of-cultural-diversity",
            "name": "The Challenges of Cultural Diversity",
            "minutes": 20,
            "deps": [
              "prescribed--patterns-of-social-inequality-and-exclusion"
            ],
            "source": {
              "pdf": "sociology",
              "page": 7
            }
          },
          {
            "id": "prescribed--suggestions-for-project-work",
            "name": "Suggestions for Project Work",
            "minutes": 15,
            "deps": [
              "prescribed--the-challenges-of-cultural-diversity"
            ],
            "source": {
              "pdf": "sociology",
              "page": 7
            }
          },
          {
            "id": "prescribed--structural-change",
            "name": "Structural Change",
            "minutes": 10,
            "deps": [
              "prescribed--suggestions-for-project-work"
            ],
            "source": {
              "pdf": "sociology",
              "page": 7
            }
          },
          {
            "id": "prescribed--cultural-change",
            "name": "Cultural Change",
            "minutes": 10,
            "deps": [
              "prescribed--structural-change"
            ],
            "source": {
              "pdf": "sociology",
              "page": 7
            }
          },
          {
            "id": "prescribed--change-and-development-in-rural-society",
            "name": "Change and Development in Rural Society",
            "minutes": 20,
            "deps": [
              "prescribed--cultural-change"
            ],
            "source": {
              "pdf": "sociology",
              "page": 7
            }
          },
          {
            "id": "prescribed--change-and-development-in-industrial-society",
            "name": "Change and Development in Industrial Society",
            "minutes": 20,
            "deps": [
              "prescribed--change-and-development-in-rural-society"
            ],
            "source": {
              "pdf": "sociology",
              "page": 8
            }
          },
          {
            "id": "prescribed--social-movements",
            "name": "Social Movements",
            "minutes": 10,
            "deps": [
              "prescribed--change-and-development-in-industrial-society"
            ],
            "source": {
              "pdf": "sociology",
              "page": 8
            }
          }
        ]
      }
    ]
  },
  {
    "id": "psychology",
    "name": "Psychology",
    "chapters": [
      {
        "id": "variations-in-psychological-attributes",
        "name": "Variations in Psychological Attributes",
        "concepts": [
          {
            "id": "variations-in-psychological-attributes--individual-differences-in-human-functioning",
            "name": "Individual Differences in Human Functioning",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "variations-in-psychological-attributes--assessment-of-psychological-attributes",
            "name": "Assessment of Psychological Attributes",
            "minutes": 15,
            "deps": [
              "variations-in-psychological-attributes--individual-differences-in-human-functioning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "variations-in-psychological-attributes--intelligence",
            "name": "Intelligence",
            "minutes": 10,
            "deps": [
              "variations-in-psychological-attributes--assessment-of-psychological-attributes"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "variations-in-psychological-attributes--individual-differences-in-intelligence",
            "name": "Individual Differences in Intelligence",
            "minutes": 15,
            "deps": [
              "variations-in-psychological-attributes--intelligence"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "variations-in-psychological-attributes--culture-and-intelligence",
            "name": "Culture and Intelligence",
            "minutes": 15,
            "deps": [
              "variations-in-psychological-attributes--individual-differences-in-intelligence"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "variations-in-psychological-attributes--emotional-intelligence",
            "name": "Emotional Intelligence",
            "minutes": 10,
            "deps": [
              "variations-in-psychological-attributes--culture-and-intelligence"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "variations-in-psychological-attributes--special-abilities-aptitude-nature-and-measurement",
            "name": "Special Abilities: Aptitude: Nature and Measurement",
            "minutes": 20,
            "deps": [
              "variations-in-psychological-attributes--emotional-intelligence"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "variations-in-psychological-attributes--creativity",
            "name": "Creativity",
            "minutes": 10,
            "deps": [
              "variations-in-psychological-attributes--special-abilities-aptitude-nature-and-measurement"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "self-and-personality",
        "name": "Self and Personality",
        "concepts": [
          {
            "id": "self-and-personality--self-and-personality",
            "name": "Self and Personality",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "self-and-personality--concept-of-self",
            "name": "Concept of Self",
            "minutes": 15,
            "deps": [
              "self-and-personality--self-and-personality"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "self-and-personality--cognitive-and-behavioural-aspects-of-self",
            "name": "Cognitive and Behavioural aspects of Self",
            "minutes": 20,
            "deps": [
              "self-and-personality--concept-of-self"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "self-and-personality--culture-and-self",
            "name": "Culture and Self",
            "minutes": 15,
            "deps": [
              "self-and-personality--cognitive-and-behavioural-aspects-of-self"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "self-and-personality--concept-of-personality",
            "name": "Concept of Personality",
            "minutes": 15,
            "deps": [
              "self-and-personality--culture-and-self"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "self-and-personality--major-approaches-to-the-study-of-personality",
            "name": "Major Approaches to the Study of Personality",
            "minutes": 20,
            "deps": [
              "self-and-personality--concept-of-personality"
            ],
            "source": {
              "pdf": "psychology",
              "page": 8
            }
          },
          {
            "id": "self-and-personality--assessment-of-personality",
            "name": "Assessment of Personality",
            "minutes": 15,
            "deps": [
              "self-and-personality--major-approaches-to-the-study-of-personality"
            ],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "meeting-life-challenges",
        "name": "Meeting Life Challenges",
        "concepts": [
          {
            "id": "meeting-life-challenges--nature-types-and-sources-of-stress",
            "name": "Nature, Types and Sources of Stress",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          },
          {
            "id": "meeting-life-challenges--effects-of-stress-on-psychological-functioning-and-health",
            "name": "Effects of Stress on Psychological Functioning and Health",
            "minutes": 25,
            "deps": [
              "meeting-life-challenges--nature-types-and-sources-of-stress"
            ],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          },
          {
            "id": "meeting-life-challenges--coping-with-stress",
            "name": "Coping with Stress",
            "minutes": 15,
            "deps": [
              "meeting-life-challenges--effects-of-stress-on-psychological-functioning-and-health"
            ],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          },
          {
            "id": "meeting-life-challenges--promoting-positive-health-and-well-being",
            "name": "Promoting Positive Health and Well-being",
            "minutes": 20,
            "deps": [
              "meeting-life-challenges--coping-with-stress"
            ],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "psychological-disorders",
        "name": "Psychological Disorders",
        "concepts": [
          {
            "id": "psychological-disorders--concepts-of-abnormality-and-psychological-disorders",
            "name": "Concepts of Abnormality and Psychological Disorders",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          },
          {
            "id": "psychological-disorders--classification-of-psychological-disorders",
            "name": "Classification of Psychological Disorders",
            "minutes": 15,
            "deps": [
              "psychological-disorders--concepts-of-abnormality-and-psychological-disorders"
            ],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          },
          {
            "id": "psychological-disorders--factors-underlying-abnormal-behaviour",
            "name": "Factors Underlying Abnormal Behaviour",
            "minutes": 15,
            "deps": [
              "psychological-disorders--classification-of-psychological-disorders"
            ],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          },
          {
            "id": "psychological-disorders--major-psychological-disorders",
            "name": "Major Psychological Disorders",
            "minutes": 15,
            "deps": [
              "psychological-disorders--factors-underlying-abnormal-behaviour"
            ],
            "source": {
              "pdf": "psychology",
              "page": 9
            }
          }
        ]
      },
      {
        "id": "therapeutic-approaches",
        "name": "Therapeutic Approaches",
        "concepts": [
          {
            "id": "therapeutic-approaches--nature-and-process-of-psychotherapy",
            "name": "Nature and Process of psychotherapy",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "therapeutic-approaches--types-of-therapies",
            "name": "Types of Therapies",
            "minutes": 15,
            "deps": [
              "therapeutic-approaches--nature-and-process-of-psychotherapy"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "therapeutic-approaches--rehabilitation-of-the-mentally-ill",
            "name": "Rehabilitation of the Mentally Ill",
            "minutes": 20,
            "deps": [
              "therapeutic-approaches--types-of-therapies"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "attitude-and-social-cognition",
        "name": "Attitude and Social Cognition",
        "concepts": [
          {
            "id": "attitude-and-social-cognition--explaining-social-behaviour",
            "name": "Explaining Social Behaviour",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "attitude-and-social-cognition--nature-and-components-of-attitudes",
            "name": "Nature and Components of Attitudes",
            "minutes": 20,
            "deps": [
              "attitude-and-social-cognition--explaining-social-behaviour"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "attitude-and-social-cognition--attitude-formation-and-change",
            "name": "Attitude Formation and Change",
            "minutes": 15,
            "deps": [
              "attitude-and-social-cognition--nature-and-components-of-attitudes"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "attitude-and-social-cognition--prejudice-and-discrimination",
            "name": "Prejudice and Discrimination",
            "minutes": 15,
            "deps": [
              "attitude-and-social-cognition--attitude-formation-and-change"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "attitude-and-social-cognition--strategies-for-handling-prejudice-unit-vii-social-influence-and-group-processes-",
            "name": "Strategies for Handling Prejudice Unit VII Social Influence and Group Processes The topics in this unit are:",
            "minutes": 25,
            "deps": [
              "attitude-and-social-cognition--prejudice-and-discrimination"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "attitude-and-social-cognition--nature-and-formation-of-groups",
            "name": "Nature and Formation of Groups",
            "minutes": 20,
            "deps": [
              "attitude-and-social-cognition--strategies-for-handling-prejudice-unit-vii-social-influence-and-group-processes-"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "attitude-and-social-cognition--type-of-groups",
            "name": "Type of Groups",
            "minutes": 15,
            "deps": [
              "attitude-and-social-cognition--nature-and-formation-of-groups"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          },
          {
            "id": "attitude-and-social-cognition--influence-of-group-on-individual-behaviour",
            "name": "Influence of Group on Individual Behaviour",
            "minutes": 20,
            "deps": [
              "attitude-and-social-cognition--type-of-groups"
            ],
            "source": {
              "pdf": "psychology",
              "page": 10
            }
          }
        ]
      }
    ]
  },
  {
    "id": "legal-studies",
    "name": "Legal Studies",
    "chapters": [
      {
        "id": "unit-4-judiciary",
        "name": "Unit 4   Judiciary",
        "concepts": [
          {
            "id": "unit-4-judiciary--constitutional",
            "name": "Constitutional",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "legal-studies",
              "page": 4
            }
          },
          {
            "id": "unit-4-judiciary--civil-and-criminal-courts-and-processes",
            "name": "Civil and Criminal Courts and Processes",
            "minutes": 20,
            "deps": [
              "unit-4-judiciary--constitutional"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "judiciary",
        "name": "Judiciary",
        "concepts": [
          {
            "id": "judiciary--establishment-of-the-supreme-court-and-high-courts-constitutional",
            "name": "Establishment of the Supreme Court and High Courts Constitutional",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "legal-studies",
              "page": 4
            }
          },
          {
            "id": "judiciary--ii-constitution",
            "name": "ii. Constitution",
            "minutes": 10,
            "deps": [
              "judiciary--establishment-of-the-supreme-court-and-high-courts-constitutional"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "methodology",
        "name": "METHODOLOGY-",
        "concepts": [
          {
            "id": "methodology--one-criminal-and-one-constitutional-in-character",
            "name": "one criminal and one constitutional in character",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "legal-studies",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--law-is-too-vast-and-complicated-to-be-taught-in-a-non-professional-setting",
            "name": "law is too vast and complicated to be taught in a non-professional setting",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "legal-studies",
              "page": 1
            }
          },
          {
            "id": "syllabus--historical-context-b-indian-constitutional-framework-on-human-rights-and-related",
            "name": "Historical Context b) Indian Constitutional framework on Human Rights and related Laws in India",
            "minutes": 25,
            "deps": [
              "syllabus--law-is-too-vast-and-complicated-to-be-taught-in-a-non-professional-setting"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 10
            }
          },
          {
            "id": "syllabus--the-preamble",
            "name": "The Preamble",
            "minutes": 10,
            "deps": [
              "syllabus--historical-context-b-indian-constitutional-framework-on-human-rights-and-related"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 10
            }
          },
          {
            "id": "syllabus--fundamental-rights-part-iii-of-the-constitution",
            "name": "Fundamental Rights-Part III of the Constitution",
            "minutes": 20,
            "deps": [
              "syllabus--the-preamble"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 10
            }
          },
          {
            "id": "syllabus--directive-principles-part-iv-articles-36-51",
            "name": "Directive Principles-Part IV- Articles 36-51",
            "minutes": 20,
            "deps": [
              "syllabus--fundamental-rights-part-iii-of-the-constitution"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 10
            }
          },
          {
            "id": "syllabus--national-human-rights-commission-nhrc",
            "name": "National Human Rights Commission (NHRC)",
            "minutes": 20,
            "deps": [
              "syllabus--directive-principles-part-iv-articles-36-51"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 10
            }
          },
          {
            "id": "syllabus--national-commission-for-minorities",
            "name": "National Commission for Minorities",
            "minutes": 15,
            "deps": [
              "syllabus--national-human-rights-commission-nhrc"
            ],
            "source": {
              "pdf": "legal-studies",
              "page": 10
            }
          }
        ]
      }
    ]
  },
  {
    "id": "computer-science",
    "name": "Computer Science",
    "chapters": [
      {
        "id": "unit-3",
        "name": "Unit 3",
        "concepts": [
          {
            "id": "unit-3--society",
            "name": "Society",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "computer-science",
              "page": 3
            }
          },
          {
            "id": "unit-3--law-and-ethics",
            "name": "Law and Ethics",
            "minutes": 15,
            "deps": [
              "unit-3--society"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "unit-1",
        "name": "Unit 1",
        "concepts": [
          {
            "id": "unit-1--creating-user-defined-function",
            "name": "creating user defined function",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--arguments-and-parameters",
            "name": "arguments and parameters",
            "minutes": 15,
            "deps": [
              "unit-1--creating-user-defined-function"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--default-parameters",
            "name": "default parameters",
            "minutes": 10,
            "deps": [
              "unit-1--arguments-and-parameters"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--positional-parameters",
            "name": "positional parameters",
            "minutes": 10,
            "deps": [
              "unit-1--default-parameters"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--function-returning-value-s",
            "name": "function returning value(s)",
            "minutes": 15,
            "deps": [
              "unit-1--positional-parameters"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--flow-of-execution",
            "name": "flow of execution",
            "minutes": 15,
            "deps": [
              "unit-1--function-returning-value-s"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--introduction",
            "name": "Introduction",
            "minutes": 10,
            "deps": [
              "unit-1--flow-of-execution"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--handling-exceptions-using-try-except-finally-blocks-introduction-to-files",
            "name": "handling exceptions using try-except-finally blocks ● Introduction to files",
            "minutes": 25,
            "deps": [
              "unit-1--introduction"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--types-of-files-text-file-binary-file-csv-file",
            "name": "types of files (Text file, Binary file, CSV file)",
            "minutes": 25,
            "deps": [
              "unit-1--handling-exceptions-using-try-except-finally-blocks-introduction-to-files"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "unit-1--relative-and-absolute-paths",
            "name": "relative and absolute paths",
            "minutes": 15,
            "deps": [
              "unit-1--types-of-files-text-file-binary-file-csv-file"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--unit-wise-syllabus-unit-1-computer-systems-and-organisation",
            "name": "Unit wise Syllabus Unit 1: Computer Systems and Organisation",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "computer-science",
              "page": 1
            }
          },
          {
            "id": "syllabus--practical-s-no-unit-name-marks-total-30",
            "name": "Practical S.No. Unit Name Marks (Total=30)",
            "minutes": 20,
            "deps": [
              "syllabus--unit-wise-syllabus-unit-1-computer-systems-and-organisation"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--lab-test-12-marks-python-program-60-logic-20-documentation-20-code-quality-12",
            "name": "Lab Test (12 marks) Python program (60% logic + 20% documentation + 20% code quality) 12",
            "minutes": 25,
            "deps": [
              "syllabus--practical-s-no-unit-name-marks-total-30"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--report-file-viva-10-marks-report-file-minimum-20-python-programs-7-viva-voce-3",
            "name": "Report File + Viva (10 marks) Report file: Minimum 20 Python programs 7 Viva voce 3",
            "minutes": 25,
            "deps": [
              "syllabus--lab-test-12-marks-python-program-60-logic-20-documentation-20-code-quality-12"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--project-that-uses-most-of-the-concepts-that-have-been-learnt",
            "name": "Project (that uses most of the concepts that have been learnt)",
            "minutes": 25,
            "deps": [
              "syllabus--report-file-viva-10-marks-report-file-minimum-20-python-programs-7-viva-voce-3"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--suggested-practical-list-python-programming",
            "name": "Suggested Practical List Python Programming",
            "minutes": 20,
            "deps": [
              "syllabus--project-that-uses-most-of-the-concepts-that-have-been-learnt"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 4
            }
          },
          {
            "id": "syllabus--suggested-reading-material",
            "name": "Suggested Reading Material",
            "minutes": 15,
            "deps": [
              "syllabus--suggested-practical-list-python-programming"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 4
            }
          },
          {
            "id": "syllabus--distribution-of-marks-unit-no-unit-name-marks-1-computational-thinking-and-progr",
            "name": "Distribution of Marks: Unit No. Unit Name Marks 1 Computational Thinking and Programming – 2 40 2 Computer Networks 10 3 Database Management 20 Total 70",
            "minutes": 25,
            "deps": [
              "syllabus--suggested-reading-material"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "syllabus--unit-wise-syllabus-unit-1-computational-thinking-and-programming-2",
            "name": "Unit wise Syllabus Unit 1: Computational Thinking and Programming – 2",
            "minutes": 25,
            "deps": [
              "syllabus--distribution-of-marks-unit-no-unit-name-marks-1-computational-thinking-and-progr"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 5
            }
          },
          {
            "id": "syllabus--practical-s-no-unit-name-marks",
            "name": "Practical S.No Unit Name Marks",
            "minutes": 20,
            "deps": [
              "syllabus--unit-wise-syllabus-unit-1-computational-thinking-and-programming-2"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 7
            }
          },
          {
            "id": "syllabus--python-program-60-logic-20-documentation-20-code-quality-8",
            "name": "Python program (60% logic + 20% documentation + 20% code quality) 8",
            "minutes": 25,
            "deps": [
              "syllabus--practical-s-no-unit-name-marks"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 7
            }
          },
          {
            "id": "syllabus--sql-queries-4-queries-based-on-one-or-two-tables-4-2-report-file",
            "name": "SQL queries (4 queries based on one or two tables) 4 2 Report file:",
            "minutes": 25,
            "deps": [
              "syllabus--python-program-60-logic-20-documentation-20-code-quality-8"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 7
            }
          },
          {
            "id": "syllabus--suggested-practical-list-python-programming-2",
            "name": "Suggested Practical List: Python Programming",
            "minutes": 20,
            "deps": [
              "syllabus--sql-queries-4-queries-based-on-one-or-two-tables-4-2-report-file"
            ],
            "source": {
              "pdf": "computer-science",
              "page": 7
            }
          }
        ]
      }
    ]
  },
  {
    "id": "informatics-practices",
    "name": "Informatics Practices",
    "chapters": [
      {
        "id": "introduction-to-computer-and-computing",
        "name": "Introduction to computer and computing",
        "concepts": [
          {
            "id": "introduction-to-computer-and-computing--evolution-of-computing-devices",
            "name": "evolution of computing devices",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          },
          {
            "id": "introduction-to-computer-and-computing--components-of-a-computer-system-and-their-interconnections",
            "name": "components of a computer system and their interconnections",
            "minutes": 25,
            "deps": [
              "introduction-to-computer-and-computing--evolution-of-computing-devices"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          },
          {
            "id": "introduction-to-computer-and-computing--input-output-devices",
            "name": "Input/output devices",
            "minutes": 10,
            "deps": [
              "introduction-to-computer-and-computing--components-of-a-computer-system-and-their-interconnections"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          }
        ]
      },
      {
        "id": "computer-memory",
        "name": "Computer Memory",
        "concepts": [
          {
            "id": "computer-memory--units-of-memory",
            "name": "Units of memory",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          },
          {
            "id": "computer-memory--types-of-memory-primary-and-secondary",
            "name": "types of memory – primary and secondary",
            "minutes": 20,
            "deps": [
              "computer-memory--units-of-memory"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          },
          {
            "id": "computer-memory--data-deletion",
            "name": "data deletion",
            "minutes": 10,
            "deps": [
              "computer-memory--types-of-memory-primary-and-secondary"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          }
        ]
      },
      {
        "id": "software",
        "name": "Software",
        "concepts": [
          {
            "id": "software--purpose-and-types-system-and-application-software",
            "name": "purpose and types – system and application software",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "software--generic-and-specific-purpose-software",
            "name": "generic and specific purpose software",
            "minutes": 20,
            "deps": [
              "software--purpose-and-types-system-and-application-software"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "basics-of-python-programming-execution-modes",
        "name": "Basics of Python programming, execution modes",
        "concepts": [
          {
            "id": "basics-of-python-programming-execution-modes--interactive-and-script-mode",
            "name": "- interactive and script mode",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--the-structure-of-a-program",
            "name": "the structure of a program",
            "minutes": 20,
            "deps": [
              "basics-of-python-programming-execution-modes--interactive-and-script-mode"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--indentation",
            "name": "indentation",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--the-structure-of-a-program"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--identifiers",
            "name": "identifiers",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--indentation"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--keywords",
            "name": "keywords",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--identifiers"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--constants",
            "name": "constants",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--keywords"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--variables",
            "name": "variables",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--constants"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--types-of-operator",
            "name": "types of operator",
            "minutes": 15,
            "deps": [
              "basics-of-python-programming-execution-modes--variables"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--precedence-of-operators",
            "name": "precedence of operators",
            "minutes": 15,
            "deps": [
              "basics-of-python-programming-execution-modes--types-of-operator"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--data-types",
            "name": "data types",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--precedence-of-operators"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--mutable-and-immutable-data-types",
            "name": "mutable and immutable data types",
            "minutes": 20,
            "deps": [
              "basics-of-python-programming-execution-modes--data-types"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--statements",
            "name": "statements",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--mutable-and-immutable-data-types"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--expression-evaluation",
            "name": "expression evaluation",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--statements"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--comments",
            "name": "comments",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--expression-evaluation"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--input-and-output-statements",
            "name": "input and output statements",
            "minutes": 15,
            "deps": [
              "basics-of-python-programming-execution-modes--comments"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--data-type-conversion",
            "name": "data type conversion",
            "minutes": 15,
            "deps": [
              "basics-of-python-programming-execution-modes--input-and-output-statements"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "basics-of-python-programming-execution-modes--debugging",
            "name": "debugging",
            "minutes": 10,
            "deps": [
              "basics-of-python-programming-execution-modes--data-type-conversion"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "control-statements",
        "name": "Control Statements",
        "concepts": [
          {
            "id": "control-statements--for-loop",
            "name": "for loop",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "lists",
        "name": "Lists",
        "concepts": [
          {
            "id": "lists--list-operations-creating",
            "name": "list operations - creating",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--initializing",
            "name": "initializing",
            "minutes": 10,
            "deps": [
              "lists--list-operations-creating"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--traversing-and-manipulating-lists",
            "name": "traversing and manipulating lists",
            "minutes": 15,
            "deps": [
              "lists--initializing"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--list-methods-and-built-in-functions-len",
            "name": "list methods and built-in functions – len()",
            "minutes": 20,
            "deps": [
              "lists--traversing-and-manipulating-lists"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--list",
            "name": "list()",
            "minutes": 10,
            "deps": [
              "lists--list-methods-and-built-in-functions-len"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--append",
            "name": "append()",
            "minutes": 10,
            "deps": [
              "lists--list"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--insert",
            "name": "insert()",
            "minutes": 10,
            "deps": [
              "lists--append"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--count",
            "name": "count()",
            "minutes": 10,
            "deps": [
              "lists--insert"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--index",
            "name": "index()",
            "minutes": 10,
            "deps": [
              "lists--count"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--remove",
            "name": "remove()",
            "minutes": 10,
            "deps": [
              "lists--index"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--pop",
            "name": "pop()",
            "minutes": 10,
            "deps": [
              "lists--remove"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--reverse",
            "name": "reverse()",
            "minutes": 10,
            "deps": [
              "lists--pop"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--sort",
            "name": "sort()",
            "minutes": 10,
            "deps": [
              "lists--reverse"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--min",
            "name": "min()",
            "minutes": 10,
            "deps": [
              "lists--sort"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--max",
            "name": "max()",
            "minutes": 10,
            "deps": [
              "lists--min"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "lists--sum",
            "name": "sum()",
            "minutes": 10,
            "deps": [
              "lists--max"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "dictionary",
        "name": "Dictionary",
        "concepts": [
          {
            "id": "dictionary--concept-of-key-value-pair",
            "name": "concept of key-value pair",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--creating",
            "name": "creating",
            "minutes": 10,
            "deps": [
              "dictionary--concept-of-key-value-pair"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--traversing",
            "name": "traversing",
            "minutes": 10,
            "deps": [
              "dictionary--creating"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--updating-and-deleting-elements",
            "name": "updating and deleting elements",
            "minutes": 15,
            "deps": [
              "dictionary--traversing"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--dictionary-methods-and-built-in-functions-dict",
            "name": "dictionary methods and built-in functions – dict()",
            "minutes": 20,
            "deps": [
              "dictionary--updating-and-deleting-elements"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--len",
            "name": "len()",
            "minutes": 10,
            "deps": [
              "dictionary--dictionary-methods-and-built-in-functions-dict"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--keys",
            "name": "keys()",
            "minutes": 10,
            "deps": [
              "dictionary--len"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--values",
            "name": "values()",
            "minutes": 10,
            "deps": [
              "dictionary--keys"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--items",
            "name": "items()",
            "minutes": 10,
            "deps": [
              "dictionary--values"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--update",
            "name": "update()",
            "minutes": 10,
            "deps": [
              "dictionary--items"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--del",
            "name": "del()",
            "minutes": 10,
            "deps": [
              "dictionary--update"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "dictionary--clear",
            "name": "clear()",
            "minutes": 10,
            "deps": [
              "dictionary--del"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "introduction-to-numpy",
        "name": "Introduction to NumPy",
        "concepts": [
          {
            "id": "introduction-to-numpy--introduction",
            "name": "Introduction",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "introduction-to-numpy--creation-of-numpy-arrays-from-list",
            "name": "Creation of NumPy Arrays from List",
            "minutes": 20,
            "deps": [
              "introduction-to-numpy--introduction"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "database-concepts",
        "name": "Database Concepts",
        "concepts": [
          {
            "id": "database-concepts--introduction-to-database-concepts-and-its-need",
            "name": "Introduction to database concepts and its need",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "database-concepts--database-management-system",
            "name": "Database Management System",
            "minutes": 15,
            "deps": [
              "database-concepts--introduction-to-database-concepts-and-its-need"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "relational-data-model",
        "name": "Relational data model",
        "concepts": [
          {
            "id": "relational-data-model--concept-of-domain",
            "name": "Concept of domain",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--tuple",
            "name": "tuple",
            "minutes": 10,
            "deps": [
              "relational-data-model--concept-of-domain"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--relation",
            "name": "relation",
            "minutes": 10,
            "deps": [
              "relational-data-model--tuple"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--candidate-key",
            "name": "candidate key",
            "minutes": 10,
            "deps": [
              "relational-data-model--relation"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--primary-key",
            "name": "primary key",
            "minutes": 10,
            "deps": [
              "relational-data-model--candidate-key"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--alternate-key-advantages-of-using-structured-query-language",
            "name": "alternate key Advantages of using Structured Query Language",
            "minutes": 25,
            "deps": [
              "relational-data-model--primary-key"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--data-definition-language",
            "name": "Data Definition Language",
            "minutes": 15,
            "deps": [
              "relational-data-model--alternate-key-advantages-of-using-structured-query-language"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--data-query-language-and-data-manipulation-language",
            "name": "Data Query Language and Data Manipulation Language",
            "minutes": 20,
            "deps": [
              "relational-data-model--data-definition-language"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--introduction-to-mysql",
            "name": "Introduction to MySQL",
            "minutes": 15,
            "deps": [
              "relational-data-model--data-query-language-and-data-manipulation-language"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "relational-data-model--creating-a-database-using-mysql",
            "name": "creating a database using MySQL",
            "minutes": 20,
            "deps": [
              "relational-data-model--introduction-to-mysql"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "data-definition",
        "name": "Data Definition",
        "concepts": [
          {
            "id": "data-definition--create-database",
            "name": "CREATE DATABASE",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-definition--create-table",
            "name": "CREATE TABLE",
            "minutes": 10,
            "deps": [
              "data-definition--create-database"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-definition--drop",
            "name": "DROP",
            "minutes": 10,
            "deps": [
              "data-definition--create-table"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-definition--alter",
            "name": "ALTER",
            "minutes": 10,
            "deps": [
              "data-definition--drop"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "data-query",
        "name": "Data Query",
        "concepts": [
          {
            "id": "data-query--select",
            "name": "SELECT",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-query--from",
            "name": "FROM",
            "minutes": 10,
            "deps": [
              "data-query--select"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-query--between",
            "name": "BETWEEN",
            "minutes": 10,
            "deps": [
              "data-query--from"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-query--logical-operators",
            "name": "logical operators",
            "minutes": 10,
            "deps": [
              "data-query--between"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-query--is-null",
            "name": "IS NULL",
            "minutes": 10,
            "deps": [
              "data-query--logical-operators"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-query--is-not-null",
            "name": "IS NOT NULL",
            "minutes": 15,
            "deps": [
              "data-query--is-null"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "data-manipulation",
        "name": "Data Manipulation",
        "concepts": [
          {
            "id": "data-manipulation--insert",
            "name": "INSERT",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-manipulation--delete",
            "name": "DELETE",
            "minutes": 10,
            "deps": [
              "data-manipulation--insert"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          },
          {
            "id": "data-manipulation--update",
            "name": "UPDATE",
            "minutes": 10,
            "deps": [
              "data-manipulation--delete"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "series",
        "name": "Series",
        "concepts": [
          {
            "id": "series--creation-of-series-from-ndarray",
            "name": "Creation of Series from – ndarray",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "series--dictionary",
            "name": "dictionary",
            "minutes": 10,
            "deps": [
              "series--creation-of-series-from-ndarray"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "series--scalar-value",
            "name": "scalar value",
            "minutes": 10,
            "deps": [
              "series--dictionary"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "series--mathematical-operations",
            "name": "mathematical operations",
            "minutes": 10,
            "deps": [
              "series--scalar-value"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "series--head-and-tail-functions",
            "name": "Head() and Tail() functions",
            "minutes": 15,
            "deps": [
              "series--mathematical-operations"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "series--selection",
            "name": "Selection",
            "minutes": 10,
            "deps": [
              "series--head-and-tail-functions"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "series--indexing-and-slicing",
            "name": "Indexing and Slicing",
            "minutes": 15,
            "deps": [
              "series--selection"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "data-frames",
        "name": "Data Frames",
        "concepts": [
          {
            "id": "data-frames--creation-from-dictionary-of-series",
            "name": "creation- from dictionary of Series",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--list-of-dictionaries",
            "name": "list of dictionaries",
            "minutes": 15,
            "deps": [
              "data-frames--creation-from-dictionary-of-series"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--text-csv-files",
            "name": "Text/CSV files",
            "minutes": 10,
            "deps": [
              "data-frames--list-of-dictionaries"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--display",
            "name": "display",
            "minutes": 10,
            "deps": [
              "data-frames--text-csv-files"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--iteration",
            "name": "iteration",
            "minutes": 10,
            "deps": [
              "data-frames--display"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--rename",
            "name": "rename",
            "minutes": 10,
            "deps": [
              "data-frames--iteration"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--head-and-tail-functions",
            "name": "Head and Tail functions",
            "minutes": 15,
            "deps": [
              "data-frames--rename"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--indexing-using-labels",
            "name": "Indexing using Labels",
            "minutes": 15,
            "deps": [
              "data-frames--head-and-tail-functions"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--boolean-indexing",
            "name": "Boolean Indexing",
            "minutes": 10,
            "deps": [
              "data-frames--indexing-using-labels"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--drawing-and-saving-following-types-of-plots-using-matplotlib-line-plot",
            "name": "drawing and saving following types of plots using Matplotlib – line plot",
            "minutes": 25,
            "deps": [
              "data-frames--boolean-indexing"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--bar-graph",
            "name": "bar graph",
            "minutes": 10,
            "deps": [
              "data-frames--drawing-and-saving-following-types-of-plots-using-matplotlib-line-plot"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "data-frames--histogram",
            "name": "histogram",
            "minutes": 10,
            "deps": [
              "data-frames--bar-graph"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "customizing-plots",
        "name": "Customizing plots",
        "concepts": [
          {
            "id": "customizing-plots--adding-label",
            "name": "adding label",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "customizing-plots--title",
            "name": "title",
            "minutes": 10,
            "deps": [
              "customizing-plots--adding-label"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "math-functions",
        "name": "Math functions",
        "concepts": [
          {
            "id": "math-functions--power",
            "name": "POWER ()",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "math-functions--round",
            "name": "ROUND ()",
            "minutes": 10,
            "deps": [
              "math-functions--power"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "math-functions--mod",
            "name": "MOD ()",
            "minutes": 10,
            "deps": [
              "math-functions--round"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "text-functions",
        "name": "Text functions",
        "concepts": [
          {
            "id": "text-functions--ucase-upper",
            "name": "UCASE ()/UPPER ()",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--lcase-lower",
            "name": "LCASE ()/LOWER ()",
            "minutes": 15,
            "deps": [
              "text-functions--ucase-upper"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--mid-substring-substr",
            "name": "MID ()/SUBSTRING ()/SUBSTR ()",
            "minutes": 15,
            "deps": [
              "text-functions--lcase-lower"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--length",
            "name": "LENGTH ()",
            "minutes": 10,
            "deps": [
              "text-functions--mid-substring-substr"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--left",
            "name": "LEFT ()",
            "minutes": 10,
            "deps": [
              "text-functions--length"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--right",
            "name": "RIGHT ()",
            "minutes": 10,
            "deps": [
              "text-functions--left"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--instr",
            "name": "INSTR ()",
            "minutes": 10,
            "deps": [
              "text-functions--right"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--ltrim",
            "name": "LTRIM ()",
            "minutes": 10,
            "deps": [
              "text-functions--instr"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--rtrim",
            "name": "RTRIM ()",
            "minutes": 10,
            "deps": [
              "text-functions--ltrim"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "text-functions--trim",
            "name": "TRIM ()",
            "minutes": 10,
            "deps": [
              "text-functions--rtrim"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "date-functions",
        "name": "Date Functions",
        "concepts": [
          {
            "id": "date-functions--now",
            "name": "NOW ()",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "date-functions--date",
            "name": "DATE ()",
            "minutes": 10,
            "deps": [
              "date-functions--now"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "date-functions--month",
            "name": "MONTH ()",
            "minutes": 10,
            "deps": [
              "date-functions--date"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "date-functions--monthname",
            "name": "MONTHNAME ()",
            "minutes": 10,
            "deps": [
              "date-functions--month"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "date-functions--year",
            "name": "YEAR ()",
            "minutes": 10,
            "deps": [
              "date-functions--monthname"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "date-functions--day",
            "name": "DAY ()",
            "minutes": 10,
            "deps": [
              "date-functions--year"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "date-functions--dayname",
            "name": "DAYNAME ()",
            "minutes": 10,
            "deps": [
              "date-functions--day"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "aggregate-functions",
        "name": "Aggregate Functions",
        "concepts": [
          {
            "id": "aggregate-functions--max",
            "name": "MAX ()",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "aggregate-functions--min",
            "name": "MIN ()",
            "minutes": 10,
            "deps": [
              "aggregate-functions--max"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "aggregate-functions--avg",
            "name": "AVG ()",
            "minutes": 10,
            "deps": [
              "aggregate-functions--min"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "aggregate-functions--sum",
            "name": "SUM ()",
            "minutes": 10,
            "deps": [
              "aggregate-functions--avg"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "aggregate-functions--count",
            "name": "COUNT ()",
            "minutes": 10,
            "deps": [
              "aggregate-functions--sum"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "aggregate-functions--using-count-querying-and-manipulating-data-using-group-by",
            "name": "using COUNT (*). Querying and manipulating data using Group by",
            "minutes": 25,
            "deps": [
              "aggregate-functions--count"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "aggregate-functions--having",
            "name": "Having",
            "minutes": 10,
            "deps": [
              "aggregate-functions--using-count-querying-and-manipulating-data-using-group-by"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "aggregate-functions--order-by-working-with-two-tables-using-equi-join",
            "name": "Order by. Working with two tables using equi-join",
            "minutes": 25,
            "deps": [
              "aggregate-functions--having"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "network-devices",
        "name": "Network Devices",
        "concepts": [
          {
            "id": "network-devices--modem",
            "name": "modem",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-devices--switch",
            "name": "switch",
            "minutes": 10,
            "deps": [
              "network-devices--modem"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-devices--repeater",
            "name": "repeater",
            "minutes": 10,
            "deps": [
              "network-devices--switch"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-devices--router",
            "name": "router",
            "minutes": 10,
            "deps": [
              "network-devices--repeater"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-devices--gateway",
            "name": "gateway",
            "minutes": 10,
            "deps": [
              "network-devices--router"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "network-topologies",
        "name": "Network Topologies",
        "concepts": [
          {
            "id": "network-topologies--star",
            "name": "Star",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-topologies--tree",
            "name": "Tree",
            "minutes": 10,
            "deps": [
              "network-topologies--star"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-topologies--mesh-introduction-to-internet",
            "name": "Mesh. Introduction to Internet",
            "minutes": 15,
            "deps": [
              "network-topologies--tree"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-topologies--email",
            "name": "email",
            "minutes": 10,
            "deps": [
              "network-topologies--mesh-introduction-to-internet"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-topologies--chat",
            "name": "Chat",
            "minutes": 10,
            "deps": [
              "network-topologies--email"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          },
          {
            "id": "network-topologies--voip",
            "name": "VoIP",
            "minutes": 10,
            "deps": [
              "network-topologies--chat"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "website",
        "name": "Website",
        "concepts": [
          {
            "id": "website--difference-between-a-website-and-webpage",
            "name": "difference between a website and webpage",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          },
          {
            "id": "website--static-vs-dynamic-web-page",
            "name": "static vs dynamic web page",
            "minutes": 20,
            "deps": [
              "website--difference-between-a-website-and-webpage"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          },
          {
            "id": "website--web-server-and-hosting-of-a-website",
            "name": "web server and hosting of a website",
            "minutes": 20,
            "deps": [
              "website--static-vs-dynamic-web-page"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "web-browsers",
        "name": "Web Browsers",
        "concepts": [
          {
            "id": "web-browsers--commonly-used-browsers",
            "name": "commonly used browsers",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          },
          {
            "id": "web-browsers--browser-settings",
            "name": "browser settings",
            "minutes": 10,
            "deps": [
              "web-browsers--commonly-used-browsers"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          },
          {
            "id": "web-browsers--add-ons-and-plug-ins",
            "name": "add-ons and plug-ins",
            "minutes": 15,
            "deps": [
              "web-browsers--browser-settings"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          },
          {
            "id": "web-browsers--cookies",
            "name": "cookies",
            "minutes": 10,
            "deps": [
              "web-browsers--add-ons-and-plug-ins"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "e-waste",
        "name": "E-waste",
        "concepts": [
          {
            "id": "e-waste--hazards-and-management-awareness-about-health-concerns-related-to-the-usage-of-t",
            "name": "hazards and management. Awareness about health concerns related to the usage of technology",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--prerequisite-none",
            "name": "Prerequisite. None",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          },
          {
            "id": "syllabus--learning-outcomes-at-the-end-of-this-course-students-will-be-able-to",
            "name": "Learning Outcomes At the end of this course, students will be able to:",
            "minutes": 25,
            "deps": [
              "syllabus--prerequisite-none"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 1
            }
          },
          {
            "id": "syllabus--suggested-practical-list",
            "name": "Suggested Practical List",
            "minutes": 15,
            "deps": [
              "syllabus--learning-outcomes-at-the-end-of-this-course-students-will-be-able-to"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--1-programming-in-python",
            "name": "1 Programming in Python",
            "minutes": 15,
            "deps": [
              "syllabus--suggested-practical-list"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-find-average-and-grade-for-given-marks",
            "name": "To find average and grade for given marks",
            "minutes": 25,
            "deps": [
              "syllabus--1-programming-in-python"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-find-sale-price-of-an-item-with-given-cost-and-discount",
            "name": "To find sale price of an item with given cost and discount (%)",
            "minutes": 25,
            "deps": [
              "syllabus--to-find-average-and-grade-for-given-marks"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-calculate-perimeter-circumference-and-area-of-shapes-such-as-triangle-rectang",
            "name": "To calculate perimeter/circumference and area of shapes such as triangle, rectangle, square and circle",
            "minutes": 25,
            "deps": [
              "syllabus--to-find-sale-price-of-an-item-with-given-cost-and-discount"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-calculate-simple-and-compound-interest",
            "name": "To calculate Simple and Compound interest",
            "minutes": 20,
            "deps": [
              "syllabus--to-calculate-perimeter-circumference-and-area-of-shapes-such-as-triangle-rectang"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-calculate-profit-loss-for-given-cost-and-sell-price",
            "name": "To calculate profit-loss for given Cost and Sell Price",
            "minutes": 25,
            "deps": [
              "syllabus--to-calculate-simple-and-compound-interest"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-calculate-emi-for-amount-period-and-interest",
            "name": "To calculate EMI for Amount, Period and Interest",
            "minutes": 25,
            "deps": [
              "syllabus--to-calculate-profit-loss-for-given-cost-and-sell-price"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-calculate-tax-gst-income-tax",
            "name": "To calculate tax - GST / Income Tax",
            "minutes": 25,
            "deps": [
              "syllabus--to-calculate-emi-for-amount-period-and-interest"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-find-the-largest-and-smallest-numbers-in-a-list",
            "name": "To find the largest and smallest numbers in a list",
            "minutes": 25,
            "deps": [
              "syllabus--to-calculate-tax-gst-income-tax"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-find-the-third-largest-smallest-number-in-a-list",
            "name": "To find the third largest/smallest number in a list",
            "minutes": 25,
            "deps": [
              "syllabus--to-find-the-largest-and-smallest-numbers-in-a-list"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-find-the-sum-of-squares-of-the-first-100-natural-numbers",
            "name": "To find the sum of squares of the first 100 natural numbers",
            "minutes": 25,
            "deps": [
              "syllabus--to-find-the-third-largest-smallest-number-in-a-list"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-print-the-first-n-multiples-of-given-number",
            "name": "To print the first ‘n’ multiples of given number",
            "minutes": 25,
            "deps": [
              "syllabus--to-find-the-sum-of-squares-of-the-first-100-natural-numbers"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-count-the-number-of-vowels-in-user-entered-string",
            "name": "To count the number of vowels in user entered string",
            "minutes": 25,
            "deps": [
              "syllabus--to-print-the-first-n-multiples-of-given-number"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-print-the-words-starting-with-an-alphabet-in-a-user-entered-string",
            "name": "To print the words starting with an alphabet in a user entered string",
            "minutes": 25,
            "deps": [
              "syllabus--to-count-the-number-of-vowels-in-user-entered-string"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-print-number-of-occurrences-of-a-given-alphabet-in-each-string",
            "name": "To print number of occurrences of a given alphabet in each string",
            "minutes": 25,
            "deps": [
              "syllabus--to-print-the-words-starting-with-an-alphabet-in-a-user-entered-string"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--create-a-dictionary-to-store-names-of-states-and-their-capitals",
            "name": "Create a dictionary to store names of states and their capitals",
            "minutes": 25,
            "deps": [
              "syllabus--to-print-number-of-occurrences-of-a-given-alphabet-in-each-string"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--create-a-dictionary-of-students-to-store-names-and-marks-obtained-in-5-subjects",
            "name": "Create a dictionary of students to store names and marks obtained in 5 subjects",
            "minutes": 25,
            "deps": [
              "syllabus--create-a-dictionary-to-store-names-of-states-and-their-capitals"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-print-the-highest-and-lowest-values-in-the-dictionary",
            "name": "To print the highest and lowest values in the dictionary",
            "minutes": 25,
            "deps": [
              "syllabus--create-a-dictionary-of-students-to-store-names-and-marks-obtained-in-5-subjects"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--2-data-management-sql-commands",
            "name": "2 Data Management: SQL Commands",
            "minutes": 20,
            "deps": [
              "syllabus--to-print-the-highest-and-lowest-values-in-the-dictionary"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-create-a-database",
            "name": "To create a database",
            "minutes": 15,
            "deps": [
              "syllabus--2-data-management-sql-commands"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 3
            }
          },
          {
            "id": "syllabus--to-display-the-entire-content-of-table",
            "name": "To display the entire content of table",
            "minutes": 20,
            "deps": [
              "syllabus--to-create-a-database"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 4
            }
          },
          {
            "id": "syllabus--to-display-rno-name-and-marks-of-those-students-who-are-scoring-marks-more-than-",
            "name": "To display Rno, Name and Marks of those students who are scoring marks more than 50",
            "minutes": 25,
            "deps": [
              "syllabus--to-display-the-entire-content-of-table"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 4
            }
          },
          {
            "id": "syllabus--prerequisite-informatics-practices-class-xi",
            "name": "Prerequisite: Informatics Practices – Class XI",
            "minutes": 20,
            "deps": [
              "syllabus--to-display-rno-name-and-marks-of-those-students-who-are-scoring-marks-more-than-"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 5
            }
          },
          {
            "id": "syllabus--1-data-handling",
            "name": "1 Data Handling",
            "minutes": 15,
            "deps": [
              "syllabus--prerequisite-informatics-practices-class-xi"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--create-a-pandas-series-from-a-dictionary-of-values-and-a-ndarray",
            "name": "Create a panda’s series from a dictionary of values and a ndarray",
            "minutes": 25,
            "deps": [
              "syllabus--1-data-handling"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--given-a-series-print-all-the-elements-that-are-above-the-75th-percentile",
            "name": "Given a Series, print all the elements that are above the 75th percentile",
            "minutes": 25,
            "deps": [
              "syllabus--create-a-pandas-series-from-a-dictionary-of-values-and-a-ndarray"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--create-a-data-frame-for-examination-result-and-display-row-labels-column-labels-",
            "name": "Create a data frame for examination result and display row labels, column labels data types of each column and the dimensions",
            "minutes": 25,
            "deps": [
              "syllabus--given-a-series-print-all-the-elements-that-are-above-the-75th-percentile"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--filter-out-rows-based-on-different-criteria-such-as-duplicate-rows",
            "name": "Filter out rows based on different criteria such as duplicate rows",
            "minutes": 25,
            "deps": [
              "syllabus--create-a-data-frame-for-examination-result-and-display-row-labels-column-labels-"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--importing-and-exporting-data-between-pandas-and-csv-file",
            "name": "Importing and exporting data between pandas and CSV file",
            "minutes": 25,
            "deps": [
              "syllabus--filter-out-rows-based-on-different-criteria-such-as-duplicate-rows"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--2-visualization",
            "name": "2 Visualization",
            "minutes": 10,
            "deps": [
              "syllabus--importing-and-exporting-data-between-pandas-and-csv-file"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--given-the-school-result-data-analyses-the-performance-of-the-students-on-differe",
            "name": "Given the school result data, analyses the performance of the students on different parameters, e.g subject wise or class wise",
            "minutes": 25,
            "deps": [
              "syllabus--2-visualization"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--for-the-data-frames-created-above-analyze-and-plot-appropriate-charts-with-title",
            "name": "For the Data frames created above, analyze, and plot appropriate charts with title and legend",
            "minutes": 25,
            "deps": [
              "syllabus--given-the-school-result-data-analyses-the-performance-of-the-students-on-differe"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--3-data-management",
            "name": "3 Data Management",
            "minutes": 15,
            "deps": [
              "syllabus--for-the-data-frames-created-above-analyze-and-plot-appropriate-charts-with-title"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--create-a-student-table-with-the-student-id-name-and-marks-as-attributes-where-th",
            "name": "Create a student table with the student id, name, and marks as attributes where the student id is the primary key",
            "minutes": 25,
            "deps": [
              "syllabus--3-data-management"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--insert-the-details-of-a-new-student-in-the-above-table",
            "name": "Insert the details of a new student in the above table",
            "minutes": 25,
            "deps": [
              "syllabus--create-a-student-table-with-the-student-id-name-and-marks-as-attributes-where-th"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--delete-the-details-of-a-student-in-the-above-table",
            "name": "Delete the details of a student in the above table",
            "minutes": 25,
            "deps": [
              "syllabus--insert-the-details-of-a-new-student-in-the-above-table"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--use-the-select-command-to-get-the-details-of-the-students-with-marks-more-than-8",
            "name": "Use the select command to get the details of the students with marks more than 80",
            "minutes": 25,
            "deps": [
              "syllabus--delete-the-details-of-a-student-in-the-above-table"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--find-the-min-max-sum-and-average-of-the-marks-in-a-student-marks-table",
            "name": "Find the min, max, sum, and average of the marks in a student marks table",
            "minutes": 25,
            "deps": [
              "syllabus--use-the-select-command-to-get-the-details-of-the-students-with-marks-more-than-8"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--find-the-total-number-of-customers-from-each-country-in-the-table-customer-id-cu",
            "name": "Find the total number of customers from each country in the table (customer ID, customer Name, country) using group by",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-min-max-sum-and-average-of-the-marks-in-a-student-marks-table"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          },
          {
            "id": "syllabus--write-a-sql-query-to-order-the-student-id-marks-table-in-descending-order-of-the",
            "name": "Write a SQL query to order the (student ID, marks) table in descending order of the marks",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-total-number-of-customers-from-each-country-in-the-table-customer-id-cu"
            ],
            "source": {
              "pdf": "informatics-practices",
              "page": 8
            }
          }
        ]
      }
    ]
  },
  {
    "id": "english-core",
    "name": "English Core",
    "chapters": [
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--one-unseen-passage-to-assess-comprehension-interpretation-analysis-inference-and",
            "name": "One unseen passage to assess comprehension, interpretation, analysis, inference and vocabulary. The passage may be factual, descriptive or literary",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "english-core",
              "page": 6
            }
          },
          {
            "id": "syllabus--note-making-and-summarization-based-on-a-passage-of-approximately-200-250-words-",
            "name": "Note Making and Summarization based on a passage of approximately 200-250 words. i. Note Making: 5 Marks",
            "minutes": 25,
            "deps": [
              "syllabus--one-unseen-passage-to-assess-comprehension-interpretation-analysis-inference-and"
            ],
            "source": {
              "pdf": "english-core",
              "page": 6
            }
          },
          {
            "id": "syllabus--questions-on-gap-filling-tenses-clauses",
            "name": "Questions on Gap filling (Tenses, Clauses)",
            "minutes": 20,
            "deps": [
              "syllabus--note-making-and-summarization-based-on-a-passage-of-approximately-200-250-words-"
            ],
            "source": {
              "pdf": "english-core",
              "page": 6
            }
          },
          {
            "id": "syllabus--questions-on-re-ordering-transformation-of-sentences",
            "name": "Questions on re-ordering/transformation of sentences",
            "minutes": 20,
            "deps": [
              "syllabus--questions-on-gap-filling-tenses-clauses"
            ],
            "source": {
              "pdf": "english-core",
              "page": 6
            }
          },
          {
            "id": "syllabus--short-writing-task-poster-up-to-50-words-one-out-of-the-two-given-questions-to-b",
            "name": "Short writing task –Poster up to 50 words. One out of the two given questions to be answered. (3 marks: Format: 1 / Content: 1 / Expression: 1)",
            "minutes": 25,
            "deps": [
              "syllabus--questions-on-re-ordering-transformation-of-sentences"
            ],
            "source": {
              "pdf": "english-core",
              "page": 7
            }
          },
          {
            "id": "syllabus--one-poetry-extract-out-of-two-from-the-book-hornbill-to-assess-comprehension-int",
            "name": "One Poetry extract out of two, from the book Hornbill, to assess comprehension, interpretation, analysis, inference and appreciation. 3x1=3 Marks",
            "minutes": 25,
            "deps": [
              "syllabus--short-writing-task-poster-up-to-50-words-one-out-of-the-two-given-questions-to-b"
            ],
            "source": {
              "pdf": "english-core",
              "page": 7
            }
          },
          {
            "id": "syllabus--one-prose-extract-out-of-two-from-the-book-hornbill-to-assess-comprehension-inte",
            "name": "One Prose extract out of two, from the book Hornbill, to assess comprehension, interpretation, analysis, evaluation and appreciation. 3x1=3 Marks",
            "minutes": 25,
            "deps": [
              "syllabus--one-poetry-extract-out-of-two-from-the-book-hornbill-to-assess-comprehension-int"
            ],
            "source": {
              "pdf": "english-core",
              "page": 7
            }
          },
          {
            "id": "syllabus--one-prose-extract-out-of-two-from-the-book-snapshots-to-assess-comprehension-int",
            "name": "One prose extract out of two, from the book Snapshots, to assess comprehension, interpretation, analysis, inference and appreciation. 4x1=4 Marks",
            "minutes": 25,
            "deps": [
              "syllabus--one-prose-extract-out-of-two-from-the-book-hornbill-to-assess-comprehension-inte"
            ],
            "source": {
              "pdf": "english-core",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "prescribed",
        "name": "Prescribed",
        "concepts": [
          {
            "id": "prescribed--the-portrait-of-a-lady-prose",
            "name": "The Portrait of a Lady (Prose)",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--a-photograph-poem",
            "name": "A Photograph (Poem)",
            "minutes": 15,
            "deps": [
              "prescribed--the-portrait-of-a-lady-prose"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--were-not-afraid-to-die-if-we-can-be-together",
            "name": "“We’re Not Afraid to Die… if We Can Be Together",
            "minutes": 25,
            "deps": [
              "prescribed--a-photograph-poem"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--discovering-tut-the-saga-continues",
            "name": "Discovering Tut: The Saga Continues",
            "minutes": 20,
            "deps": [
              "prescribed--were-not-afraid-to-die-if-we-can-be-together"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--the-laburnum-top-poem",
            "name": "The Laburnum Top (Poem)",
            "minutes": 15,
            "deps": [
              "prescribed--discovering-tut-the-saga-continues"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--the-voice-of-the-rain-poem",
            "name": "The Voice of the Rain (Poem)",
            "minutes": 20,
            "deps": [
              "prescribed--the-laburnum-top-poem"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--childhood-poem",
            "name": "Childhood (Poem)",
            "minutes": 10,
            "deps": [
              "prescribed--the-voice-of-the-rain-poem"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--the-adventure",
            "name": "The Adventure",
            "minutes": 10,
            "deps": [
              "prescribed--childhood-poem"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--silk-road-prose",
            "name": "Silk Road (Prose)",
            "minutes": 15,
            "deps": [
              "prescribed--the-adventure"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--father-to-son",
            "name": "Father to Son",
            "minutes": 15,
            "deps": [
              "prescribed--silk-road-prose"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--the-summer-of-the-beautiful-white-horse-prose",
            "name": "The Summer of the Beautiful White Horse (Prose)",
            "minutes": 25,
            "deps": [
              "prescribed--father-to-son"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--the-address-prose",
            "name": "The Address (Prose)",
            "minutes": 15,
            "deps": [
              "prescribed--the-summer-of-the-beautiful-white-horse-prose"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--mothers-day-play",
            "name": "Mother’s Day (Play)",
            "minutes": 15,
            "deps": [
              "prescribed--the-address-prose"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--birth-prose",
            "name": "Birth (Prose)",
            "minutes": 10,
            "deps": [
              "prescribed--mothers-day-play"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          },
          {
            "id": "prescribed--the-tale-of-melon-city",
            "name": "The Tale of Melon City",
            "minutes": 20,
            "deps": [
              "prescribed--birth-prose"
            ],
            "source": {
              "pdf": "english-core",
              "page": null
            }
          }
        ]
      }
    ]
  },
  {
    "id": "entrepreneurship",
    "name": "Entrepreneurship",
    "chapters": [
      {
        "id": "unit-1-entrepreneurship",
        "name": "Unit 1   Entrepreneurship",
        "concepts": [
          {
            "id": "unit-1-entrepreneurship--concept-and-functions-15",
            "name": "Concept and Functions 15",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "entrepreneurship",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "unit-1",
        "name": "Unit 1",
        "concepts": [
          {
            "id": "unit-1--concept-and-functions-competencies-vision",
            "name": "Concept and Functions Competencies- Vision",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "entrepreneurship",
              "page": 3
            }
          },
          {
            "id": "unit-1--decision-making",
            "name": "Decision making",
            "minutes": 10,
            "deps": [
              "unit-1--concept-and-functions-competencies-vision"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 3
            }
          },
          {
            "id": "unit-1--logical",
            "name": "Logical",
            "minutes": 10,
            "deps": [
              "unit-1--decision-making"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 3
            }
          },
          {
            "id": "unit-1--critical-and-analytical-thinking",
            "name": "Critical and Analytical Thinking",
            "minutes": 15,
            "deps": [
              "unit-1--logical"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "unit-3",
        "name": "Unit 3",
        "concepts": [
          {
            "id": "unit-3--scanning-the-environment",
            "name": "Scanning the environment",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "entrepreneurship",
              "page": 4
            }
          },
          {
            "id": "unit-3--information-seeking",
            "name": "Information seeking",
            "minutes": 10,
            "deps": [
              "unit-3--scanning-the-environment"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 4
            }
          },
          {
            "id": "unit-3--creativity",
            "name": "creativity",
            "minutes": 10,
            "deps": [
              "unit-3--information-seeking"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 4
            }
          },
          {
            "id": "unit-3--innovativeness",
            "name": "Innovativeness",
            "minutes": 10,
            "deps": [
              "unit-3--creativity"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 4
            }
          },
          {
            "id": "unit-3--divergent-thinking",
            "name": "divergent thinking",
            "minutes": 10,
            "deps": [
              "unit-3--innovativeness"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 4
            }
          },
          {
            "id": "unit-3--perseverance-contents-learning-outcomes",
            "name": "Perseverance Contents Learning Outcomes",
            "minutes": 15,
            "deps": [
              "unit-3--divergent-thinking"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--visit-of-the-district-industries-centre-and-prepare-a-report-of-activities-and-p",
            "name": "Visit of the District Industries Centre and prepare a report of activities and programs undertaken by them",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "entrepreneurship",
              "page": 7
            }
          },
          {
            "id": "syllabus--conduct-a-case-study-of-any-entrepreneurial-venture-in-your-nearby-area",
            "name": "Conduct a case study of any entrepreneurial venture in your nearby area",
            "minutes": 25,
            "deps": [
              "syllabus--visit-of-the-district-industries-centre-and-prepare-a-report-of-activities-and-p"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 7
            }
          },
          {
            "id": "syllabus--learn-to-earn",
            "name": "Learn to Earn",
            "minutes": 15,
            "deps": [
              "syllabus--conduct-a-case-study-of-any-entrepreneurial-venture-in-your-nearby-area"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 7
            }
          },
          {
            "id": "syllabus--the-objectives-of-the-project-work-objectives-of-project-work-are-to-enable-lear",
            "name": "The objectives of the project work: Objectives of project work are to enable learners to:",
            "minutes": 25,
            "deps": [
              "syllabus--learn-to-earn"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 7
            }
          },
          {
            "id": "syllabus--role-of-the-teacher-the-teacher-plays-a-critical-role-in-developing-thinking-ski",
            "name": "Role of the teacher: The teacher plays a critical role in developing thinking skills of the learners. A teacher should:",
            "minutes": 25,
            "deps": [
              "syllabus--the-objectives-of-the-project-work-objectives-of-project-work-are-to-enable-lear"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 7
            }
          },
          {
            "id": "syllabus--expected-checklist-for-the-project-work",
            "name": "Expected Checklist for the Project Work:",
            "minutes": 20,
            "deps": [
              "syllabus--role-of-the-teacher-the-teacher-plays-a-critical-role-in-developing-thinking-ski"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 8
            }
          },
          {
            "id": "syllabus--viva-voce",
            "name": "Viva-Voce",
            "minutes": 10,
            "deps": [
              "syllabus--expected-checklist-for-the-project-work"
            ],
            "source": {
              "pdf": "entrepreneurship",
              "page": 8
            }
          }
        ]
      }
    ]
  },
  {
    "id": "physical-education",
    "name": "Physical Education",
    "chapters": [
      {
        "id": "load",
        "name": "Load",
        "concepts": [
          {
            "id": "load--over-training-load",
            "name": "Over Training Load",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "load--over-load",
            "name": "Over Load",
            "minutes": 10,
            "deps": [
              "load--over-training-load"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "load--learning",
            "name": "learning",
            "minutes": 10,
            "deps": [
              "load--over-load"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "load--adaptation",
            "name": "Adaptation",
            "minutes": 10,
            "deps": [
              "load--learning"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "load--skill",
            "name": "Skill",
            "minutes": 10,
            "deps": [
              "load--adaptation"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "load--techniques",
            "name": "Techniques",
            "minutes": 10,
            "deps": [
              "load--skill"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "load--technique",
            "name": "Technique",
            "minutes": 10,
            "deps": [
              "load--techniques"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "load--method-tactics",
            "name": "method & Tactics",
            "minutes": 15,
            "deps": [
              "load--technique"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "physical-fitness-test",
        "name": "Physical Fitness Test",
        "concepts": [
          {
            "id": "physical-fitness-test--sai-khelo-india-test",
            "name": "SAI Khelo India Test",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "physical-education",
              "page": 12
            }
          }
        ]
      },
      {
        "id": "nutrients",
        "name": "Nutrients",
        "concepts": [
          {
            "id": "nutrients--non-nutritive-nutrients",
            "name": "Non- Nutritive nutrients",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "nutrients--the-food-myths-pitfalls-of-dieting",
            "name": "The food myths Pitfalls of Dieting",
            "minutes": 20,
            "deps": [
              "nutrients--non-nutritive-nutrients"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "nutrients--food-recognize-the-intolerance",
            "name": "Food * Recognize the Intolerance",
            "minutes": 20,
            "deps": [
              "nutrients--the-food-myths-pitfalls-of-dieting"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "nutrients--pitfalls-of-and-food-dieting-and-food-myths-myths",
            "name": "pitfalls of and Food dieting and food Myths myths",
            "minutes": 25,
            "deps": [
              "nutrients--food-recognize-the-intolerance"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          }
        ]
      },
      {
        "id": "adherence",
        "name": "Adherence",
        "concepts": [
          {
            "id": "adherence--adherence-to-types-of-reasons",
            "name": "Adherence to types of Reasons",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "physical-education",
              "page": 24
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--imparting-and-development-of-positive-approach-among-children-to-opt-for-physica",
            "name": "Imparting and Development of Positive Approach among Children to opt for Physical Education as a Profession",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--developing-management-skills-to-understand-and-organize-sports-tournaments",
            "name": "Developing Management Skills to Understand and Organize Sports Tournaments",
            "minutes": 25,
            "deps": [
              "syllabus--imparting-and-development-of-positive-approach-among-children-to-opt-for-physica"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--learn-and-understand-the-motor-abilities-like-strength-speed-endurance-coordinat",
            "name": "Learn and Understand the Motor Abilities like Strength, Speed, Endurance, Coordination, And Flexibility",
            "minutes": 25,
            "deps": [
              "syllabus--developing-management-skills-to-understand-and-organize-sports-tournaments"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--acquire-knowledge-about-the-human-body-and-its-functioning-and-effects-on-physic",
            "name": "Acquire knowledge about the Human Body and Its Functioning and Effects on Physical Activities",
            "minutes": 25,
            "deps": [
              "syllabus--learn-and-understand-the-motor-abilities-like-strength-speed-endurance-coordinat"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--understand-the-process-of-growth-and-development-and-its-positive-relationship-w",
            "name": "Understand the Process of Growth and Development and its Positive Relationship with Physical Activities",
            "minutes": 25,
            "deps": [
              "syllabus--acquire-knowledge-about-the-human-body-and-its-functioning-and-effects-on-physic"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--develop-socio-psychological-aspects-like-control-of-emotions-balanced-behavior-d",
            "name": "Develop Socio-Psychological Aspects like Control of Emotions, Balanced Behavior, Development of Leadership and Followership Qualities, and Team Spirit",
            "minutes": 25,
            "deps": [
              "syllabus--understand-the-process-of-growth-and-development-and-its-positive-relationship-w"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--learn-and-understand-the-effect-of-physical-and-physiological-training-on-women-",
            "name": "Learn and Understand the Effect of Physical and Physiological Training on Women Athletes",
            "minutes": 25,
            "deps": [
              "syllabus--develop-socio-psychological-aspects-like-control-of-emotions-balanced-behavior-d"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--develop-the-habit-of-practicing-yoga-asanas-and-pranayama-daily-to-minimize-hypo",
            "name": "Develop the Habit of Practicing Yoga Asanas and Pranayama Daily to Minimize Hypokinetic Diseases",
            "minutes": 25,
            "deps": [
              "syllabus--learn-and-understand-the-effect-of-physical-and-physiological-training-on-women-"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--learning-about-nutrition-and-the-importance-of-a-balanced-diet",
            "name": "Learning about Nutrition and the Importance of a Balanced Diet",
            "minutes": 25,
            "deps": [
              "syllabus--develop-the-habit-of-practicing-yoga-asanas-and-pranayama-daily-to-minimize-hypo"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--understand-the-application-of-laws-and-principles-of-physics-in-sports-and-games",
            "name": "Understand the application of Laws and Principles of Physics in Sports and Games",
            "minutes": 25,
            "deps": [
              "syllabus--learning-about-nutrition-and-the-importance-of-a-balanced-diet"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--understanding-the-characteristics-of-children-with-special-needs-cwsn-and-learni",
            "name": "Understanding the Characteristics of Children with Special Needs (CWSN) and Learning the Importance of Physical Activities for them",
            "minutes": 25,
            "deps": [
              "syllabus--understand-the-application-of-laws-and-principles-of-physics-in-sports-and-games"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--learning-the-procedure-and-application-of-different-physical-and-physiological-t",
            "name": "Learning the procedure and application of different Physical and Physiological tests for different Age Categories",
            "minutes": 25,
            "deps": [
              "syllabus--understanding-the-characteristics-of-children-with-special-needs-cwsn-and-learni"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 2
            }
          },
          {
            "id": "syllabus--concept-aims-objectivesof-physical-education",
            "name": "Concept, Aims & Objectivesof Physical Education",
            "minutes": 20,
            "deps": [
              "syllabus--learning-the-procedure-and-application-of-different-physical-and-physiological-t"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 4
            }
          },
          {
            "id": "syllabus--developmen-t-of-physical-education-in-india-post-independenc-e",
            "name": "Developmen t of Physical Education in India – Post Independenc e",
            "minutes": 25,
            "deps": [
              "syllabus--concept-aims-objectivesof-physical-education"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 4
            }
          },
          {
            "id": "syllabus--changing-trends-in-sports-playing-surface-wearable-gear-and-sports-equipment-tec",
            "name": "Changing Trends in Sports- playing surface, wearable gear and sports equipment, technological advancements",
            "minutes": 25,
            "deps": [
              "syllabus--developmen-t-of-physical-education-in-india-post-independenc-e"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 4
            }
          },
          {
            "id": "syllabus--career-options-in-physical-education",
            "name": "Career options in Physical Education",
            "minutes": 20,
            "deps": [
              "syllabus--changing-trends-in-sports-playing-surface-wearable-gear-and-sports-equipment-tec"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 4
            }
          },
          {
            "id": "syllabus--khelo-india-program-and-fit-india-program",
            "name": "Khelo-India Program and Fit – India Program",
            "minutes": 20,
            "deps": [
              "syllabus--career-options-in-physical-education"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 4
            }
          },
          {
            "id": "syllabus--olympism-concept-and-olympics-values",
            "name": "Olympism – Concept and Olympics Values",
            "minutes": 20,
            "deps": [
              "syllabus--khelo-india-program-and-fit-india-program"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 5
            }
          },
          {
            "id": "syllabus--olympic-value-education-joy-of-effort-fair-play-respect-for-others-pursuit-of-ex",
            "name": "Olympic Value Education – Joy of Effort, Fair Play, Respect for Others, Pursuit of Excellence, Balance Among Body, Will & Mind",
            "minutes": 25,
            "deps": [
              "syllabus--olympism-concept-and-olympics-values"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 5
            }
          },
          {
            "id": "syllabus--ancient-and-modern-olympics",
            "name": "Ancient and Modern Olympics",
            "minutes": 15,
            "deps": [
              "syllabus--olympic-value-education-joy-of-effort-fair-play-respect-for-others-pursuit-of-ex"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 5
            }
          },
          {
            "id": "syllabus--olympics-symbols-motto-flag-oath-and-anthem",
            "name": "Olympics - Symbols, Motto, Flag, Oath, and Anthem",
            "minutes": 25,
            "deps": [
              "syllabus--ancient-and-modern-olympics"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 5
            }
          },
          {
            "id": "syllabus--olympic-movement-structure-ioc-noc-ifs-other-members",
            "name": "Olympic Movement Structure - IOC, NOC, IFS, Other members",
            "minutes": 25,
            "deps": [
              "syllabus--olympics-symbols-motto-flag-oath-and-anthem"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 5
            }
          },
          {
            "id": "syllabus--meaning-and-importance-of-yoga",
            "name": "Meaning and importance of Yoga",
            "minutes": 20,
            "deps": [
              "syllabus--olympic-movement-structure-ioc-noc-ifs-other-members"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 6
            }
          },
          {
            "id": "syllabus--introductionto-astanga-yoga",
            "name": "Introductionto Astanga Yoga",
            "minutes": 15,
            "deps": [
              "syllabus--meaning-and-importance-of-yoga"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 6
            }
          },
          {
            "id": "syllabus--yogic-kriyas",
            "name": "Yogic Kriyas",
            "minutes": 10,
            "deps": [
              "syllabus--introductionto-astanga-yoga"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 6
            }
          },
          {
            "id": "syllabus--pranayama-and-its-types",
            "name": "Pranayama and its types",
            "minutes": 15,
            "deps": [
              "syllabus--yogic-kriyas"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 6
            }
          },
          {
            "id": "syllabus--active-lifestyle-and-stress-management-through-yoga",
            "name": "Active Lifestyle and stress management through Yoga",
            "minutes": 20,
            "deps": [
              "syllabus--pranayama-and-its-types"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 6
            }
          },
          {
            "id": "syllabus--concept-of-disability-and-disorder",
            "name": "Concept of Disability and Disorder",
            "minutes": 20,
            "deps": [
              "syllabus--active-lifestyle-and-stress-management-through-yoga"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 6
            }
          },
          {
            "id": "syllabus--types-of-disability-its-causes-nature",
            "name": "Types of Disability, its causes & nature",
            "minutes": 20,
            "deps": [
              "syllabus--concept-of-disability-and-disorder"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 6
            }
          },
          {
            "id": "syllabus--aim-and-objectives-of-adaptive-physical-education",
            "name": "Aim and objectives of Adaptive physical Education",
            "minutes": 20,
            "deps": [
              "syllabus--types-of-disability-its-causes-nature"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 7
            }
          },
          {
            "id": "syllabus--role-of-various-professionals-for-children-with-special-needs",
            "name": "Role of various professionals for children with special needs",
            "minutes": 25,
            "deps": [
              "syllabus--aim-and-objectives-of-adaptive-physical-education"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 7
            }
          },
          {
            "id": "syllabus--meaning-importance-of-wellness-health-and-physical-fitness",
            "name": "Meaning & importance of Wellness, Health, and Physical Fitness",
            "minutes": 25,
            "deps": [
              "syllabus--role-of-various-professionals-for-children-with-special-needs"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 7
            }
          },
          {
            "id": "syllabus--components-dimensions-of-wellness-health-and-physical-fitness",
            "name": "Components/ Dimensions of Wellness, Health, and Physical Fitness",
            "minutes": 25,
            "deps": [
              "syllabus--meaning-importance-of-wellness-health-and-physical-fitness"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 7
            }
          },
          {
            "id": "syllabus--traditional-sports-regional-games-for",
            "name": "Traditional Sports & Regional Games for",
            "minutes": 20,
            "deps": [
              "syllabus--components-dimensions-of-wellness-health-and-physical-fitness"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 7
            }
          },
          {
            "id": "syllabus--leadership-through-physical-activity-and-sports",
            "name": "Leadership through Physical Activity and Sports",
            "minutes": 20,
            "deps": [
              "syllabus--traditional-sports-regional-games-for"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 8
            }
          },
          {
            "id": "syllabus--introduction-tofirst-aid-price-promote-wellness",
            "name": "Introduction toFirst Aid – PRICE promote wellness",
            "minutes": 20,
            "deps": [
              "syllabus--leadership-through-physical-activity-and-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 8
            }
          },
          {
            "id": "syllabus--define-test-measureme-nts-and-evaluation",
            "name": "Define Test, Measureme nts and Evaluation",
            "minutes": 20,
            "deps": [
              "syllabus--introduction-tofirst-aid-price-promote-wellness"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 8
            }
          },
          {
            "id": "syllabus--importance-of-test-measurem-ents-and-evaluation-in-sports",
            "name": "Importance of Test, Measurem ents and Evaluation in Sports",
            "minutes": 25,
            "deps": [
              "syllabus--define-test-measureme-nts-and-evaluation"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 8
            }
          },
          {
            "id": "syllabus--calculation-of-bmi-waist",
            "name": "Calculation of BMI, Waist",
            "minutes": 15,
            "deps": [
              "syllabus--importance-of-test-measurem-ents-and-evaluation-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 8
            }
          },
          {
            "id": "syllabus--somato-types",
            "name": "Somato Types",
            "minutes": 10,
            "deps": [
              "syllabus--calculation-of-bmi-waist"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 8
            }
          },
          {
            "id": "syllabus--definition-and-importance-of-anatomy-and-physiology-in-exercise-and-sports",
            "name": "Definition and importance of Anatomy and Physiology in Exercise and Sports",
            "minutes": 25,
            "deps": [
              "syllabus--somato-types"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 9
            }
          },
          {
            "id": "syllabus--functions-of-skeletal-system-classification-of-bones-and-types-of-joints",
            "name": "Functions of Skeletal System, Classification of Bones, and Types of Joints",
            "minutes": 25,
            "deps": [
              "syllabus--definition-and-importance-of-anatomy-and-physiology-in-exercise-and-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 9
            }
          },
          {
            "id": "syllabus--properties-and-functions-of-muscles",
            "name": "Properties and Functions of Muscles",
            "minutes": 20,
            "deps": [
              "syllabus--functions-of-skeletal-system-classification-of-bones-and-types-of-joints"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 9
            }
          },
          {
            "id": "syllabus--structure-and-functions-of-circulatory-system-and-heart",
            "name": "Structure and Functions of Circulatory System and Heart",
            "minutes": 25,
            "deps": [
              "syllabus--properties-and-functions-of-muscles"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 9
            }
          },
          {
            "id": "syllabus--structureand-functions-of-respiratory-system",
            "name": "Structureand Functions of Respiratory System",
            "minutes": 20,
            "deps": [
              "syllabus--structure-and-functions-of-circulatory-system-and-heart"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 9
            }
          },
          {
            "id": "syllabus--definition-and-importance-of-kinesiology-and-biomechanic-s-in-sports",
            "name": "Definition and Importance of Kinesiology and Biomechanic s in Sports",
            "minutes": 25,
            "deps": [
              "syllabus--structureand-functions-of-respiratory-system"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 10
            }
          },
          {
            "id": "syllabus--principles-of-biomechanic-s",
            "name": "Principles of Biomechanic s",
            "minutes": 15,
            "deps": [
              "syllabus--definition-and-importance-of-kinesiology-and-biomechanic-s-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 10
            }
          },
          {
            "id": "syllabus--kinetics-and-kinematics-in-sports",
            "name": "Kinetics and Kinematics in Sports",
            "minutes": 20,
            "deps": [
              "syllabus--principles-of-biomechanic-s"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 10
            }
          },
          {
            "id": "syllabus--types-of-body-movements-flexion-extension-abduction-adduction-rotation-circumduc",
            "name": "Types of Body Movements - Flexion, Extension, Abduction, Adduction, Rotation, Circumductio n, Supination & Pronation",
            "minutes": 25,
            "deps": [
              "syllabus--kinetics-and-kinematics-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 10
            }
          },
          {
            "id": "syllabus--axis-and-planes-concept-and-its-application-in-body-movements",
            "name": "Axis and Planes – Concept and its application in body movements",
            "minutes": 25,
            "deps": [
              "syllabus--types-of-body-movements-flexion-extension-abduction-adduction-rotation-circumduc"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 10
            }
          },
          {
            "id": "syllabus--definition-importance-of-psychology-in-physical-education-sports",
            "name": "Definition & Importance of Psychology in Physical Education & Sports",
            "minutes": 25,
            "deps": [
              "syllabus--axis-and-planes-concept-and-its-application-in-body-movements"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 10
            }
          },
          {
            "id": "syllabus--develop",
            "name": "Develop-",
            "minutes": 10,
            "deps": [
              "syllabus--definition-importance-of-psychology-in-physical-education-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 10
            }
          },
          {
            "id": "syllabus--adolescent-problems-their-manageme-nt",
            "name": "Adolescent Problems & their Manageme nt",
            "minutes": 20,
            "deps": [
              "syllabus--develop"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "syllabus--team-cohesion-and-sports",
            "name": "Team Cohesion and Sports",
            "minutes": 15,
            "deps": [
              "syllabus--adolescent-problems-their-manageme-nt"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "syllabus--concept-and-principles-of-sports-training",
            "name": "Concept and Principles of Sports Training",
            "minutes": 20,
            "deps": [
              "syllabus--team-cohesion-and-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "syllabus--training-load-over-load-adaptation-and-recovery",
            "name": "Training Load: Over Load, Adaptation, and Recovery",
            "minutes": 20,
            "deps": [
              "syllabus--concept-and-principles-of-sports-training"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "syllabus--warming-up",
            "name": "Warming-up",
            "minutes": 10,
            "deps": [
              "syllabus--training-load-over-load-adaptation-and-recovery"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "syllabus--concept-of-skill-technique-tactics",
            "name": "Concept of Skill, Technique, Tactics &",
            "minutes": 20,
            "deps": [
              "syllabus--warming-up"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 11
            }
          },
          {
            "id": "syllabus--concept-of-doping-and-its-disadvantage-s-students",
            "name": "Concept of Doping and its disadvantage s students",
            "minutes": 25,
            "deps": [
              "syllabus--concept-of-skill-technique-tactics"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 12
            }
          },
          {
            "id": "syllabus--functions-of-sports-events-management",
            "name": "Functions of Sports Events Management",
            "minutes": 20,
            "deps": [
              "syllabus--concept-of-doping-and-its-disadvantage-s-students"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 14
            }
          },
          {
            "id": "syllabus--various-committees-their-responsibiliti-es-pre-during",
            "name": "Various Committees & their Responsibiliti es (pre; during",
            "minutes": 25,
            "deps": [
              "syllabus--functions-of-sports-events-management"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 14
            }
          },
          {
            "id": "syllabus--fixtures-and-their-procedures-knock-out",
            "name": "Fixtures and their Procedures – Knock- Out",
            "minutes": 20,
            "deps": [
              "syllabus--various-committees-their-responsibiliti-es-pre-during"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 14
            }
          },
          {
            "id": "syllabus--intramural-extramural-tournaments",
            "name": "Intramural & Extramural tournaments",
            "minutes": 15,
            "deps": [
              "syllabus--fixtures-and-their-procedures-knock-out"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 14
            }
          },
          {
            "id": "syllabus--community-sports-program",
            "name": "Community sports program",
            "minutes": 15,
            "deps": [
              "syllabus--intramural-extramural-tournaments"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 14
            }
          },
          {
            "id": "syllabus--exercise-guidelines-of-who-for-different-age-groups",
            "name": "Exercise guidelines of WHO for different age groups",
            "minutes": 25,
            "deps": [
              "syllabus--community-sports-program"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 15
            }
          },
          {
            "id": "syllabus--common-postural-deformities-knock-knees-flat-foot-round-shoulders-lordosis-kypho",
            "name": "Common postural deformities- knock knees, flat foot, round shoulders, Lordosis, Kyphosis, Scoliosis, and bow legs and their respective corrective measures",
            "minutes": 25,
            "deps": [
              "syllabus--exercise-guidelines-of-who-for-different-age-groups"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 15
            }
          },
          {
            "id": "syllabus--womens-participation-in-sports-physical-psychological",
            "name": "Women’s participation in Sports- Physical, Psychological",
            "minutes": 20,
            "deps": [
              "syllabus--common-postural-deformities-knock-knees-flat-foot-round-shoulders-lordosis-kypho"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 15
            }
          },
          {
            "id": "syllabus--special-consideration",
            "name": "Special consideration",
            "minutes": 10,
            "deps": [
              "syllabus--womens-participation-in-sports-physical-psychological"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 15
            }
          },
          {
            "id": "syllabus--female-athlete-triad",
            "name": "Female athlete triad",
            "minutes": 15,
            "deps": [
              "syllabus--special-consideration"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 15
            }
          },
          {
            "id": "syllabus--diabetes-procedure-benefits-contraindicati-ons-for-katichakrasan-a-pavanmuktas-a",
            "name": "Diabetes:. Procedure, Benefits & Contraindicati ons for Katichakrasan a, Pavanmuktas ana,Bh ujangasana, Shalabhasana",
            "minutes": 25,
            "deps": [
              "syllabus--female-athlete-triad"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 16
            }
          },
          {
            "id": "syllabus--asthma-procedure-benefits-contraindicat-ions-for-tadasana-urdhwahasto-ttansan-a-",
            "name": "Asthma: Procedure, Benefits & Contraindicat ions for Tadasana, Urdhwahasto ttansan a, UttanManduk asan- a, Bhujangasana",
            "minutes": 25,
            "deps": [
              "syllabus--diabetes-procedure-benefits-contraindicati-ons-for-katichakrasan-a-pavanmuktas-a"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 17
            }
          },
          {
            "id": "syllabus--hypertension",
            "name": "Hypertension",
            "minutes": 10,
            "deps": [
              "syllabus--asthma-procedure-benefits-contraindicat-ions-for-tadasana-urdhwahasto-ttansan-a-"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 17
            }
          },
          {
            "id": "syllabus--organization-s-promoting-disability-sports",
            "name": "Organization s promoting Disability Sports",
            "minutes": 20,
            "deps": [
              "syllabus--hypertension"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 19
            }
          },
          {
            "id": "syllabus--concept-of-classificatio-n-and-divisioning-in-sports",
            "name": "Concept of Classificatio n and Divisioning in Sports",
            "minutes": 25,
            "deps": [
              "syllabus--organization-s-promoting-disability-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 19
            }
          },
          {
            "id": "syllabus--concept-of-inclusion-in-sports-its-need-and-implementat-ion",
            "name": "Concept of Inclusion in sports, its need, and Implementat ion",
            "minutes": 25,
            "deps": [
              "syllabus--concept-of-classificatio-n-and-divisioning-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 19
            }
          },
          {
            "id": "syllabus--advantages-of-physical-activities-for-children-with-special-needs",
            "name": "Advantages of Physical Activities for children with special needs",
            "minutes": 25,
            "deps": [
              "syllabus--concept-of-inclusion-in-sports-its-need-and-implementat-ion"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 19
            }
          },
          {
            "id": "syllabus--strategies-to-make-physical-activities-assessable-for-children-with-special-need",
            "name": "Strategies to make Physical Activities assessable for children with special needs",
            "minutes": 25,
            "deps": [
              "syllabus--advantages-of-physical-activities-for-children-with-special-needs"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 19
            }
          },
          {
            "id": "syllabus--concept-of-balanced-diet-and-nutrition",
            "name": "Concept of balanced diet and nutrition",
            "minutes": 20,
            "deps": [
              "syllabus--strategies-to-make-physical-activities-assessable-for-children-with-special-need"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "syllabus--macro-and-micro-nutrients-food-sources-functions",
            "name": "Macro and Micro Nutrients: Food sources& functions",
            "minutes": 20,
            "deps": [
              "syllabus--concept-of-balanced-diet-and-nutrition"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "syllabus--nutritive-non-nutritive-componen-ts-of-diet",
            "name": "Nutritive & Non- Nutritive Componen ts of Diet",
            "minutes": 25,
            "deps": [
              "syllabus--macro-and-micro-nutrients-food-sources-functions"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "syllabus--eating-for-weight-control-a-healthy-weight-the-pitfalls-of-dieting-food-intolera",
            "name": "Eating for Weight control – A Healthy Weight, The Pitfalls of Dieting, Food Intolerance, and Food Myths",
            "minutes": 25,
            "deps": [
              "syllabus--nutritive-non-nutritive-componen-ts-of-diet"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "syllabus--importance-of-diet-in-sports-pre-during-and-post-competition-requirements",
            "name": "Importance of Diet in Sports- Pre, During and Post competition Requirements",
            "minutes": 25,
            "deps": [
              "syllabus--eating-for-weight-control-a-healthy-weight-the-pitfalls-of-dieting-food-intolera"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "syllabus--fitness-test-sai-khelo-india-fitness-test-in-school",
            "name": "Fitness Test – SAI Khelo India Fitness Test in school:",
            "minutes": 25,
            "deps": [
              "syllabus--importance-of-diet-in-sports-pre-during-and-post-competition-requirements"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 20
            }
          },
          {
            "id": "syllabus--measurement-of-cardio-vascular-fitness-harvard-step-test-duration-of-the-exercis",
            "name": "Measurement of Cardio- Vascular Fitness – Harvard Step Test – Duration of the Exercise in Seconds x100/5.5 X Pulse count of 1-1.5 Min after Exercise",
            "minutes": 25,
            "deps": [
              "syllabus--fitness-test-sai-khelo-india-fitness-test-in-school"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 21
            }
          },
          {
            "id": "syllabus--computing-basal-metabolic-rate-bmr",
            "name": "Computing Basal Metabolic Rate (BMR)",
            "minutes": 20,
            "deps": [
              "syllabus--measurement-of-cardio-vascular-fitness-harvard-step-test-duration-of-the-exercis"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 21
            }
          },
          {
            "id": "syllabus--rikli-jones",
            "name": "Rikli & Jones",
            "minutes": 15,
            "deps": [
              "syllabus--computing-basal-metabolic-rate-bmr"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 21
            }
          },
          {
            "id": "syllabus--johnsen-methney-test-of-motor-educability",
            "name": "Johnsen – Methney Test of Motor Educability",
            "minutes": 20,
            "deps": [
              "syllabus--rikli-jones"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 22
            }
          },
          {
            "id": "syllabus--physiological-factors-determining-components-of-physical-fitness",
            "name": "Physiological factors determining components of physical fitness",
            "minutes": 20,
            "deps": [
              "syllabus--johnsen-methney-test-of-motor-educability"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 22
            }
          },
          {
            "id": "syllabus--effect-of-exercise-on-themuscular-system",
            "name": "Effect of exercise on theMuscular System",
            "minutes": 20,
            "deps": [
              "syllabus--physiological-factors-determining-components-of-physical-fitness"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 22
            }
          },
          {
            "id": "syllabus--effect-of-exercise-on-the-cardio-respiratory-system",
            "name": "Effect of exercise on the Cardio- Respiratory System",
            "minutes": 25,
            "deps": [
              "syllabus--effect-of-exercise-on-themuscular-system"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 22
            }
          },
          {
            "id": "syllabus--physiological-changes-due-to-aging",
            "name": "Physiological changes due to aging",
            "minutes": 20,
            "deps": [
              "syllabus--effect-of-exercise-on-the-cardio-respiratory-system"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 22
            }
          },
          {
            "id": "syllabus--newtons-law-of-motion-its-application-in-sports",
            "name": "Newton’s Law of Motion & its application in sports",
            "minutes": 25,
            "deps": [
              "syllabus--physiological-changes-due-to-aging"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 23
            }
          },
          {
            "id": "syllabus--types-of-levers-and-their-application-in-sports",
            "name": "Types of Levers and their application in Sports",
            "minutes": 25,
            "deps": [
              "syllabus--newtons-law-of-motion-its-application-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 23
            }
          },
          {
            "id": "syllabus--equilibrium-dynamic-static-and-centre-of-gravity-and-its-application-in-sports",
            "name": "Equilibrium – Dynamic & Static and Centre of Gravity and its application in sports",
            "minutes": 25,
            "deps": [
              "syllabus--types-of-levers-and-their-application-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 23
            }
          },
          {
            "id": "syllabus--friction-sports",
            "name": "Friction & Sports",
            "minutes": 15,
            "deps": [
              "syllabus--equilibrium-dynamic-static-and-centre-of-gravity-and-its-application-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 23
            }
          },
          {
            "id": "syllabus--projectile-in-sports",
            "name": "Projectile in Sports",
            "minutes": 15,
            "deps": [
              "syllabus--friction-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 23
            }
          },
          {
            "id": "syllabus--personality-its-definition-types-jung-classification",
            "name": "Personality; its definition & types (Jung Classification",
            "minutes": 20,
            "deps": [
              "syllabus--projectile-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 24
            }
          },
          {
            "id": "syllabus--motivation-its-type-techniques",
            "name": "Motivation, its type & techniques",
            "minutes": 20,
            "deps": [
              "syllabus--personality-its-definition-types-jung-classification"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 24
            }
          },
          {
            "id": "syllabus--exercise-adherence-reasons-benefits-strategies-for-enhancing-it",
            "name": "Exercise Adherence: Reasons, Benefits & Strategies for Enhancing it",
            "minutes": 25,
            "deps": [
              "syllabus--motivation-its-type-techniques"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 24
            }
          },
          {
            "id": "syllabus--meaning-concept-types-of-aggression-s-in-sports",
            "name": "Meaning, Concept & Types of Aggression s in Sports",
            "minutes": 25,
            "deps": [
              "syllabus--exercise-adherence-reasons-benefits-strategies-for-enhancing-it"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 24
            }
          },
          {
            "id": "syllabus--psychological-attributes-in-sports-self-esteem-mental-imagery-self-talk-goal-set",
            "name": "Psychological Attributes in Sports – Self- Esteem, Mental Imagery, Self- Talk, Goal Setting",
            "minutes": 25,
            "deps": [
              "syllabus--meaning-concept-types-of-aggression-s-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 24
            }
          },
          {
            "id": "syllabus--concept-of-talent-identification-and-talent-development-in-sports",
            "name": "Concept of Talent Identification and Talent Development in Sports",
            "minutes": 25,
            "deps": [
              "syllabus--psychological-attributes-in-sports-self-esteem-mental-imagery-self-talk-goal-set"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 24
            }
          },
          {
            "id": "syllabus--types-methods-to-develop-strength-endurance-and-speed",
            "name": "Types & Methods to Develop – Strength, Endurance, and Speed",
            "minutes": 25,
            "deps": [
              "syllabus--concept-of-talent-identification-and-talent-development-in-sports"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 25
            }
          },
          {
            "id": "syllabus--types-methods-to-develop-flexibility-and-coordinative-ability",
            "name": "Types & Methods to Develop – Flexibility and Coordinative Ability",
            "minutes": 25,
            "deps": [
              "syllabus--types-methods-to-develop-strength-endurance-and-speed"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 25
            }
          },
          {
            "id": "syllabus--circuit-training-introduction-its-importance-training-and-the-different-cycle-in",
            "name": "Circuit Training - Introduction& its importance training and the different cycle in sports training",
            "minutes": 25,
            "deps": [
              "syllabus--types-methods-to-develop-flexibility-and-coordinative-ability"
            ],
            "source": {
              "pdf": "physical-education",
              "page": 25
            }
          }
        ]
      }
    ]
  },
  {
    "id": "home-science",
    "name": "Home Science",
    "chapters": [
      {
        "id": "unit-i",
        "name": "UNIT I",
        "concepts": [
          {
            "id": "unit-i--work",
            "name": "Work",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 15
            }
          },
          {
            "id": "unit-i--livelihood-and-career",
            "name": "Livelihood and Career",
            "minutes": 15,
            "deps": [
              "unit-i--work"
            ],
            "source": {
              "pdf": "home-science",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "unit-ii",
        "name": "UNIT II",
        "concepts": [
          {
            "id": "unit-ii--food-science-and-technology",
            "name": "Food Science and Technology",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "chapter",
        "name": "Chapter",
        "concepts": [
          {
            "id": "chapter--management-of-support-services",
            "name": "MANAGEMENT OF SUPPORT SERVICES",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 18
            }
          },
          {
            "id": "chapter--institutions-and-programmes-for-children",
            "name": "INSTITUTIONS AND PROGRAMMES FOR CHILDREN",
            "minutes": 20,
            "deps": [
              "chapter--management-of-support-services"
            ],
            "source": {
              "pdf": "home-science",
              "page": 18
            }
          },
          {
            "id": "chapter--fads",
            "name": "fads",
            "minutes": 10,
            "deps": [
              "chapter--institutions-and-programmes-for-children"
            ],
            "source": {
              "pdf": "home-science",
              "page": 19
            }
          },
          {
            "id": "chapter--style",
            "name": "style",
            "minutes": 10,
            "deps": [
              "chapter--fads"
            ],
            "source": {
              "pdf": "home-science",
              "page": 19
            }
          }
        ]
      },
      {
        "id": "understanding-oneself-with-reference-to",
        "name": "Understanding oneself with reference to:",
        "concepts": [
          {
            "id": "understanding-oneself-with-reference-to--work-livelihood-and-career-05",
            "name": "Work, Livelihood and Career 05",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 14
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--nutrition-food-science-andtechnology-23",
            "name": "Nutrition, Food Science andTechnology 23",
            "minutes": 20,
            "deps": [
              "understanding-oneself-with-reference-to--work-livelihood-and-career-05"
            ],
            "source": {
              "pdf": "home-science",
              "page": 14
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--human-development-and-family-studies-10",
            "name": "Human Development and Family Studies 10",
            "minutes": 20,
            "deps": [
              "understanding-oneself-with-reference-to--nutrition-food-science-andtechnology-23"
            ],
            "source": {
              "pdf": "home-science",
              "page": 14
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--fabric-and-apparel-17",
            "name": "Fabric and Apparel 17",
            "minutes": 15,
            "deps": [
              "understanding-oneself-with-reference-to--human-development-and-family-studies-10"
            ],
            "source": {
              "pdf": "home-science",
              "page": 14
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--resource-management-10",
            "name": "Resource Management 10",
            "minutes": 15,
            "deps": [
              "understanding-oneself-with-reference-to--fabric-and-apparel-17"
            ],
            "source": {
              "pdf": "home-science",
              "page": 14
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--communication-and-extension-05-theory-70-practical-30-grand-total-10015-class-xi",
            "name": "Communication and Extension 05 Theory 70 Practical 30 Grand Total 10015 CLASS XII",
            "minutes": 25,
            "deps": [
              "understanding-oneself-with-reference-to--resource-management-10"
            ],
            "source": {
              "pdf": "home-science",
              "page": 14
            }
          }
        ]
      },
      {
        "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person",
        "name": "Modification of normal diet to soft diet for elderly person.",
        "concepts": [
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--development-and-preparation-of-supplementary-foods-for-nutrition-programmes",
            "name": "Development and preparation of supplementary foods for nutrition programmes",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 22
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--planning-a-menu-for-a-school-canteen-or-mid-day-meal-in-school-for-aweek",
            "name": "Planning a menu for a school canteen or mid-day meal in school for aweek",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--development-and-preparation-of-supplementary-foods-for-nutrition-programmes"
            ],
            "source": {
              "pdf": "home-science",
              "page": 22
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--design-prepare-and-evaluate-a-processed-food-product",
            "name": "Design, prepare and evaluate a processed food product",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--planning-a-menu-for-a-school-canteen-or-mid-day-meal-in-school-for-aweek"
            ],
            "source": {
              "pdf": "home-science",
              "page": 22
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--preparation-of-any-one-article-using-applied-textile-design-techniques-tie-and-d",
            "name": "Preparation of any one article using applied textile design techniques; tie and dye/ batik/block printing",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--design-prepare-and-evaluate-a-processed-food-product"
            ],
            "source": {
              "pdf": "home-science",
              "page": 22
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--remove-different-types-of-stains-from-white-cotton-cloth-ball-pen-curry-grease-i",
            "name": "Remove different types of stains from white cotton cloth –Ball pen, curry, grease, ink, lipstick, tea and coffee. UNIT V RESOURCE MANAGEMENT",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--preparation-of-any-one-article-using-applied-textile-design-techniques-tie-and-d"
            ],
            "source": {
              "pdf": "home-science",
              "page": 22
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--evaluate-any-one-advertisement-for-any-job-position",
            "name": "Evaluate any one advertisement for any job position",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--remove-different-types-of-stains-from-white-cotton-cloth-ball-pen-curry-grease-i"
            ],
            "source": {
              "pdf": "home-science",
              "page": 22
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--visit-to-the-neighboring-areas-and-interview-two-adolescents-and-two-adults-rega",
            "name": "Visit to the neighboring areas and interview two adolescents and two adults regarding their perception of persons with special needs",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--evaluate-any-one-advertisement-for-any-job-position"
            ],
            "source": {
              "pdf": "home-science",
              "page": 23
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--profile-any-two-persons-child-adult-with-special-needs-to-find-out-their-diet-cl",
            "name": "Profile any two persons (child/adult) with special needs to find out their diet, clothing, activities, physical and psychological needs",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--visit-to-the-neighboring-areas-and-interview-two-adolescents-and-two-adults-rega"
            ],
            "source": {
              "pdf": "home-science",
              "page": 23
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--planning-any-five-messages-for-nutrition-health-and-life-skills-using-different-",
            "name": "Planning any five messages for nutrition, health and life skills using different modes of communication for different focal groups",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--profile-any-two-persons-child-adult-with-special-needs-to-find-out-their-diet-cl"
            ],
            "source": {
              "pdf": "home-science",
              "page": 23
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--project-5",
            "name": "Project 5",
            "minutes": 10,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--planning-any-five-messages-for-nutrition-health-and-life-skills-using-different-"
            ],
            "source": {
              "pdf": "home-science",
              "page": 24
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--identify-adulterant-using-chemical-test-in-any-one-of-the-following-pure-ghee-te",
            "name": "Identify adulterant using chemical test in any one of the following- pure ghee, tea leaves, whole black pepper, turmeric powder, milk, asafoetida. 2",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--project-5"
            ],
            "source": {
              "pdf": "home-science",
              "page": 24
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--prepare-a-sample-using-applied-textile-design-techniques-tie-and-dye-batik-block",
            "name": "Prepare a sample using applied textile design techniques tie and dye/batik/block printing. 4",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--identify-adulterant-using-chemical-test-in-any-one-of-the-following-pure-ghee-te"
            ],
            "source": {
              "pdf": "home-science",
              "page": 24
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--remove-any-one-of-the-stains-from-white-cotton-cloth-ball-pen-curry-grease-ink-l",
            "name": "Remove any one of the stains from white cotton cloth –Ball pen, curry, grease, ink, lipstick, tea, coffee. (2 marks) 2",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--prepare-a-sample-using-applied-textile-design-techniques-tie-and-dye-batik-block"
            ],
            "source": {
              "pdf": "home-science",
              "page": 24
            }
          },
          {
            "id": "modification-of-normal-diet-to-soft-diet-for-elderly-person--viva-2-total-30-prescribed-textbook-human-ecology-and-family-sciences-for-class-",
            "name": "Viva 2 TOTAL 30 Prescribed textbook: Human Ecology and Family Sciences (For class XII): Part I and Part II25",
            "minutes": 25,
            "deps": [
              "modification-of-normal-diet-to-soft-diet-for-elderly-person--remove-any-one-of-the-stains-from-white-cotton-cloth-ball-pen-curry-grease-ink-l"
            ],
            "source": {
              "pdf": "home-science",
              "page": 24
            }
          }
        ]
      }
    ]
  }
]
