/* GENERATED FILE — do not edit by hand.
 *
 * Built by frontend/scripts/curriculum/build.mjs from the official CBSE 2026-27
 * syllabus documents recorded in data/curriculum-sources.lock.json.
 * Re-generate with: npm run curriculum:build
 *
 * Class 11: 21 subjects, 1404 concepts.
 *
 * Every concept carries the pdf and page it was read from. Every "minutes"
 * value is an ESTIMATE derived from the concept's wording, not a figure the
 * document states.
 */

import type { Subject } from '../../types'

export const CLASS_11: Subject[] = [
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
            "id": "unit-iv--energy-and-power",
            "name": "Energy and Power",
            "minutes": 15,
            "deps": [],
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
        "id": "unit-1",
        "name": "Unit 1",
        "concepts": [
          {
            "id": "unit-1--some-basic-concepts-of-chemistry-importance-of-chemistry",
            "name": "Some Basic Concepts of Chemistry Importance of Chemistry",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--nature-of-matter",
            "name": "Nature of Matter",
            "minutes": 15,
            "deps": [
              "unit-1--some-basic-concepts-of-chemistry-importance-of-chemistry"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--properties-of-matter-and-their-measurement",
            "name": "Properties of Matter and their Measurement",
            "minutes": 20,
            "deps": [
              "unit-1--nature-of-matter"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--uncertainty-in-measurement",
            "name": "Uncertainty in Measurement",
            "minutes": 15,
            "deps": [
              "unit-1--properties-of-matter-and-their-measurement"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--laws-of-chemical-combination",
            "name": "Laws of Chemical Combination",
            "minutes": 15,
            "deps": [
              "unit-1--uncertainty-in-measurement"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--daltons-atomic-theory",
            "name": "Dalton's Atomic Theory",
            "minutes": 15,
            "deps": [
              "unit-1--laws-of-chemical-combination"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--atomic-and-molecular-masses",
            "name": "Atomic and Molecular Masses",
            "minutes": 15,
            "deps": [
              "unit-1--daltons-atomic-theory"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--mole-concept-and-molar-masses",
            "name": "Mole Concept and Molar Masses",
            "minutes": 20,
            "deps": [
              "unit-1--atomic-and-molecular-masses"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--percentage-composition",
            "name": "Percentage Composition",
            "minutes": 10,
            "deps": [
              "unit-1--mole-concept-and-molar-masses"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-1--stoichiometry-and-stoichiometric-calculations",
            "name": "Stoichiometry and Stoichiometric Calculations",
            "minutes": 15,
            "deps": [
              "unit-1--percentage-composition"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "unit-3",
        "name": "Unit 3",
        "concepts": [
          {
            "id": "unit-3--modern-periodic-law-and-the-present-form-of-periodic-table",
            "name": "Modern Periodic Law and the Present Form of Periodic Table",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-3--nomenclature-of-elements-with-atomic-number-100",
            "name": "Nomenclature of Elements with Atomic Number > 100",
            "minutes": 25,
            "deps": [
              "unit-3--modern-periodic-law-and-the-present-form-of-periodic-table"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-3--electronic-configuration-of-elements-and-the-periodic-table",
            "name": "Electronic Configuration of Elements and the Periodic Table",
            "minutes": 25,
            "deps": [
              "unit-3--nomenclature-of-elements-with-atomic-number-100"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "electronic-configuration-of-elements-and-types-of-elements",
        "name": "Electronic Configuration of Elements and Types of Elements",
        "concepts": [
          {
            "id": "electronic-configuration-of-elements-and-types-of-elements--f-blocks",
            "name": "f- Blocks",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "electronic-configuration-of-elements-and-types-of-elements--periodic-trends-in-properties-of-elements",
            "name": "Periodic Trends in Properties of Elements",
            "minutes": 20,
            "deps": [
              "electronic-configuration-of-elements-and-types-of-elements--f-blocks"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "unit-4",
        "name": "Unit 4",
        "concepts": [
          {
            "id": "unit-4--chemical-bonding-and-molecular-structure-kossel-lewis-approach-to-chemical-bondi",
            "name": "Chemical Bonding and Molecular Structure Kossel-Lewis Approach to Chemical Bonding",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--ionic-or-electrovalent-bond",
            "name": "Ionic or Electrovalent Bond",
            "minutes": 15,
            "deps": [
              "unit-4--chemical-bonding-and-molecular-structure-kossel-lewis-approach-to-chemical-bondi"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--bond-parameters",
            "name": "Bond Parameters",
            "minutes": 10,
            "deps": [
              "unit-4--ionic-or-electrovalent-bond"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--the-valence-shell-electron-pair-repulsion-vsepr-theory",
            "name": "The Valence Shell Electron Pair Repulsion (VSEPR) Theory",
            "minutes": 25,
            "deps": [
              "unit-4--bond-parameters"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--valence-bond-theory",
            "name": "Valence Bond Theory",
            "minutes": 15,
            "deps": [
              "unit-4--the-valence-shell-electron-pair-repulsion-vsepr-theory"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--hybridisation",
            "name": "Hybridisation",
            "minutes": 10,
            "deps": [
              "unit-4--valence-bond-theory"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--molecular-orbital-theory",
            "name": "Molecular Orbital Theory",
            "minutes": 15,
            "deps": [
              "unit-4--hybridisation"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--bonding-in-some-homonuclear-diatomic-molecules",
            "name": "Bonding in Some Homonuclear Diatomic Molecules",
            "minutes": 20,
            "deps": [
              "unit-4--molecular-orbital-theory"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          },
          {
            "id": "unit-4--hydrogen-bonding",
            "name": "Hydrogen Bonding",
            "minutes": 10,
            "deps": [
              "unit-4--bonding-in-some-homonuclear-diatomic-molecules"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "general-introduction-tetravalence-of-carbon",
        "name": "General Introduction, Tetravalence of Carbon",
        "concepts": [
          {
            "id": "general-introduction-tetravalence-of-carbon--shapes-of-organic-compounds",
            "name": "Shapes of Organic Compounds",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--structural-representations-of-organic-compounds",
            "name": "Structural Representations of Organic Compounds",
            "minutes": 20,
            "deps": [
              "general-introduction-tetravalence-of-carbon--shapes-of-organic-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--classification-of-organic-compounds",
            "name": "Classification of Organic Compounds",
            "minutes": 15,
            "deps": [
              "general-introduction-tetravalence-of-carbon--structural-representations-of-organic-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--nomenclature-of-organic-compounds",
            "name": "Nomenclature of Organic Compounds",
            "minutes": 15,
            "deps": [
              "general-introduction-tetravalence-of-carbon--classification-of-organic-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--isomerism",
            "name": "Isomerism",
            "minutes": 10,
            "deps": [
              "general-introduction-tetravalence-of-carbon--nomenclature-of-organic-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--fundamental-concepts-in-organic-reaction-mechanism",
            "name": "Fundamental Concepts in Organic Reaction Mechanism",
            "minutes": 20,
            "deps": [
              "general-introduction-tetravalence-of-carbon--isomerism"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--methods-of-purification-of-organic-compounds",
            "name": "Methods of Purification of Organic Compounds",
            "minutes": 20,
            "deps": [
              "general-introduction-tetravalence-of-carbon--fundamental-concepts-in-organic-reaction-mechanism"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--qualitative-analysis-of-organic-compounds",
            "name": "Qualitative Analysis of Organic Compounds",
            "minutes": 20,
            "deps": [
              "general-introduction-tetravalence-of-carbon--methods-of-purification-of-organic-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          },
          {
            "id": "general-introduction-tetravalence-of-carbon--quantitative-analysis",
            "name": "Quantitative Analysis",
            "minutes": 10,
            "deps": [
              "general-introduction-tetravalence-of-carbon--qualitative-analysis-of-organic-compounds"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--cutting-glass-tube-and-glass-rod",
            "name": "Cutting glass tube and glass rod",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--bending-a-glass-tube",
            "name": "Bending a glass tube",
            "minutes": 15,
            "deps": [
              "syllabus--cutting-glass-tube-and-glass-rod"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--drawing-out-a-glass-jet",
            "name": "Drawing out a glass jet",
            "minutes": 20,
            "deps": [
              "syllabus--bending-a-glass-tube"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--boring-a-cork-b-characterization-and-purification-of-chemical-substances",
            "name": "Boring a cork B.Characterization and Purification of Chemical Substances",
            "minutes": 25,
            "deps": [
              "syllabus--drawing-out-a-glass-jet"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--determination-of-melting-point-of-an-organic-compound",
            "name": "Determination of melting point of an organic compound",
            "minutes": 25,
            "deps": [
              "syllabus--boring-a-cork-b-characterization-and-purification-of-chemical-substances"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--determination-of-boiling-point-of-an-organic-compound",
            "name": "Determination of boiling point of an organic compound",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-melting-point-of-an-organic-compound"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--crystallization-of-impure-sample-of-any-one-of-the-following-alum-copper-sulphat",
            "name": "Crystallization of impure sample of any one of the following: Alum, Copper Sulphate, Benzoic Acid. C.Experiments based on pH",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-boiling-point-of-an-organic-compound"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--any-one-of-the-following-experiments",
            "name": "Any one of the following experiments:",
            "minutes": 20,
            "deps": [
              "syllabus--crystallization-of-impure-sample-of-any-one-of-the-following-alum-copper-sulphat"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 4
            }
          },
          {
            "id": "syllabus--using-a-mechanical-balance-electronic-balance",
            "name": "Using a mechanical balance/electronic balance",
            "minutes": 20,
            "deps": [
              "syllabus--any-one-of-the-following-experiments"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 5
            }
          },
          {
            "id": "syllabus--preparation-of-standard-solution-of-oxalic-acid",
            "name": "Preparation of standard solution of Oxalic acid",
            "minutes": 20,
            "deps": [
              "syllabus--using-a-mechanical-balance-electronic-balance"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 5
            }
          },
          {
            "id": "syllabus--determination-of-strength-of-a-given-solution-of-sodium-hydroxide-by-titrating-i",
            "name": "Determination of strength of a given solution of Sodium hydroxide by titrating it against standard solution of Oxalic acid",
            "minutes": 25,
            "deps": [
              "syllabus--preparation-of-standard-solution-of-oxalic-acid"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 5
            }
          },
          {
            "id": "syllabus--preparation-of-standard-solution-of-sodium-carbonate",
            "name": "Preparation of standard solution of Sodium carbonate",
            "minutes": 20,
            "deps": [
              "syllabus--determination-of-strength-of-a-given-solution-of-sodium-hydroxide-by-titrating-i"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 5
            }
          },
          {
            "id": "syllabus--determination-of-strength-of-a-given-solution-of-hydrochloric-acid-by-titrating-",
            "name": "Determination of strength of a given solution of hydrochloric acid by titrating it against standard Sodium Carbonate solution. F.Qualitative Analysis",
            "minutes": 25,
            "deps": [
              "syllabus--preparation-of-standard-solution-of-sodium-carbonate"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 5
            }
          },
          {
            "id": "syllabus--determination-of-one-anion-and-one-cation-in-a-given-salt-cations",
            "name": "Determination of one anion and one cation in a given salt Cations: 𝑷𝒃𝟐+",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-strength-of-a-given-solution-of-hydrochloric-acid-by-titrating-"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 5
            }
          },
          {
            "id": "syllabus--determination-of-ph-of-some-solutions-obtained-from-fruit-juices-solutions-of-kn",
            "name": "Determination of pH of some solutions obtained from fruit juices, solutions of known and varied concentrations of acids, bases and salts using pH paper",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-one-anion-and-one-cation-in-a-given-salt-cations"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 6
            }
          },
          {
            "id": "syllabus--comparing-the-ph-of-solutions-of-strong-and-weak-acids-of-same-concentration-c-c",
            "name": "Comparing the pH of solutions of strong and weak acids of same concentration. C. Chemical Equilibrium",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-ph-of-some-solutions-obtained-from-fruit-juices-solutions-of-kn"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 6
            }
          },
          {
            "id": "syllabus--study-the-shift-in-equilibrium-between-ferric-ions-and-thiocyanate-ions-by-incre",
            "name": "Study the shift in equilibrium between ferric ions and thiocyanate ions by increasing/decreasing the concentration of either ions",
            "minutes": 25,
            "deps": [
              "syllabus--comparing-the-ph-of-solutions-of-strong-and-weak-acids-of-same-concentration-c-c"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 6
            }
          },
          {
            "id": "syllabus--study-the-shift-in-equilibrium-between-co-h2o-6-2-and-chloride-ions-by-changing-",
            "name": "Study the shift in equilibrium between [Co(H2O)6]2+ and chloride ions by changing the concentration of either of the ions. D. Quantitative estimation",
            "minutes": 25,
            "deps": [
              "syllabus--study-the-shift-in-equilibrium-between-ferric-ions-and-thiocyanate-ions-by-incre"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 6
            }
          },
          {
            "id": "syllabus--determination-of-molarity-of-a-given-solution-of-sodium-hydroxide-by-titrating-i",
            "name": "Determination of molarity of a given solution of sodium hydroxide by titrating it against standard solution of oxalic acid. E. Qualitative Analysis",
            "minutes": 25,
            "deps": [
              "syllabus--study-the-shift-in-equilibrium-between-co-h2o-6-2-and-chloride-ions-by-changing-"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 6
            }
          },
          {
            "id": "syllabus--determination-of-one-anion-and-one-cation-in-a-given-salt-cations-2",
            "name": "Determination of one anion and one cation in a given salt Cations - 𝑵𝑯𝟒",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-molarity-of-a-given-solution-of-sodium-hydroxide-by-titrating-i"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 6
            }
          },
          {
            "id": "syllabus--detection-of-nitrogen-in-the-given-organic-compound",
            "name": "Detection of Nitrogen in the given organic compound",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-one-anion-and-one-cation-in-a-given-salt-cations-2"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 6
            }
          },
          {
            "id": "syllabus--detection-of-halogen-in-the-given-organic-compound-7-note-the-above-practical-ma",
            "name": "Detection of Halogen in the given organic compound.7 Note: The above practical may be carried out in an experiential manner rather than recording observations",
            "minutes": 25,
            "deps": [
              "syllabus--detection-of-nitrogen-in-the-given-organic-compound"
            ],
            "source": {
              "pdf": "chemistry",
              "page": 7
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
        "id": "chapter-2",
        "name": "Chapter-2",
        "concepts": [
          {
            "id": "chapter-2--biological-classification-five-kingdom-classification",
            "name": "Biological Classification Five kingdom classification",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          },
          {
            "id": "chapter-2--salient-features-and-classification-of-monera",
            "name": "Salient features and classification of Monera",
            "minutes": 20,
            "deps": [
              "chapter-2--biological-classification-five-kingdom-classification"
            ],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          },
          {
            "id": "chapter-2--protista-and-fungi-into-major-groups",
            "name": "Protista and Fungi into major groups",
            "minutes": 20,
            "deps": [
              "chapter-2--salient-features-and-classification-of-monera"
            ],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          },
          {
            "id": "chapter-2--lichens",
            "name": "Lichens",
            "minutes": 10,
            "deps": [
              "chapter-2--protista-and-fungi-into-major-groups"
            ],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          },
          {
            "id": "chapter-2--viruses-and-viroids",
            "name": "Viruses and Viroids",
            "minutes": 15,
            "deps": [
              "chapter-2--lichens"
            ],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "chapter-5",
        "name": "Chapter-5",
        "concepts": [
          {
            "id": "chapter-5--morphology-of-flowering-plants",
            "name": "Morphology of Flowering Plants",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "morphology-of-different-parts-of-flowering-plants",
        "name": "Morphology of different parts of flowering plants",
        "concepts": [
          {
            "id": "morphology-of-different-parts-of-flowering-plants--inflorescence",
            "name": "inflorescence",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          },
          {
            "id": "morphology-of-different-parts-of-flowering-plants--flower",
            "name": "flower",
            "minutes": 10,
            "deps": [
              "morphology-of-different-parts-of-flowering-plants--inflorescence"
            ],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          },
          {
            "id": "morphology-of-different-parts-of-flowering-plants--fruit-and-seed-description-of-family-solanaceae",
            "name": "fruit and seed. Description of family Solanaceae",
            "minutes": 20,
            "deps": [
              "morphology-of-different-parts-of-flowering-plants--flower"
            ],
            "source": {
              "pdf": "biology",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "chapter-6",
        "name": "Chapter-6",
        "concepts": [
          {
            "id": "chapter-6--anatomy-of-flowering-plants-anatomy-and-functions-of-tissue-systems-in-dicots-an",
            "name": "Anatomy of Flowering Plants Anatomy and functions of tissue systems in dicots and monocots",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-7",
        "name": "Chapter-7",
        "concepts": [
          {
            "id": "chapter-7--structural-organisation-in-animals-morphology",
            "name": "Structural Organisation in Animals Morphology",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "unit-iii-cell",
        "name": "Unit-III Cell",
        "concepts": [
          {
            "id": "unit-iii-cell--structure-and-function",
            "name": "Structure and Function",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-8",
        "name": "Chapter-8",
        "concepts": [
          {
            "id": "chapter-8--cell-the-unit-of-life-cell-theory-and-cell-as-the-basic-unit-of-life",
            "name": "Cell-The Unit of Life Cell theory and cell as the basic unit of life",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--structure-of-prokaryotic-and-eukaryotic-cells",
            "name": "structure of prokaryotic and eukaryotic cells",
            "minutes": 20,
            "deps": [
              "chapter-8--cell-the-unit-of-life-cell-theory-and-cell-as-the-basic-unit-of-life"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--plant-cell-and-animal-cell",
            "name": "Plant cell and animal cell",
            "minutes": 20,
            "deps": [
              "chapter-8--structure-of-prokaryotic-and-eukaryotic-cells"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--cell-envelope",
            "name": "cell envelope",
            "minutes": 10,
            "deps": [
              "chapter-8--plant-cell-and-animal-cell"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--cell-membrane",
            "name": "cell membrane",
            "minutes": 10,
            "deps": [
              "chapter-8--cell-envelope"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--cell-wall",
            "name": "cell wall",
            "minutes": 10,
            "deps": [
              "chapter-8--cell-membrane"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--cell-organelles-structure-and-function",
            "name": "cell organelles - structure and function",
            "minutes": 20,
            "deps": [
              "chapter-8--cell-wall"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--endomembrane-system",
            "name": "endomembrane system",
            "minutes": 10,
            "deps": [
              "chapter-8--cell-organelles-structure-and-function"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--endoplasmic-reticulum",
            "name": "endoplasmic reticulum",
            "minutes": 10,
            "deps": [
              "chapter-8--endomembrane-system"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--golgi-bodies",
            "name": "golgi bodies",
            "minutes": 10,
            "deps": [
              "chapter-8--endoplasmic-reticulum"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--lysosomes",
            "name": "lysosomes",
            "minutes": 10,
            "deps": [
              "chapter-8--golgi-bodies"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--vacuoles",
            "name": "vacuoles",
            "minutes": 10,
            "deps": [
              "chapter-8--lysosomes"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--mitochondria",
            "name": "mitochondria",
            "minutes": 10,
            "deps": [
              "chapter-8--vacuoles"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--ribosomes",
            "name": "ribosomes",
            "minutes": 10,
            "deps": [
              "chapter-8--mitochondria"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--plastids",
            "name": "plastids",
            "minutes": 10,
            "deps": [
              "chapter-8--ribosomes"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--microbodies",
            "name": "microbodies",
            "minutes": 10,
            "deps": [
              "chapter-8--plastids"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--cytoskeleton",
            "name": "cytoskeleton",
            "minutes": 10,
            "deps": [
              "chapter-8--microbodies"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--flagella",
            "name": "flagella",
            "minutes": 10,
            "deps": [
              "chapter-8--cytoskeleton"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--centrioles-ultrastructure-and-function",
            "name": "centrioles (ultrastructure and function)",
            "minutes": 15,
            "deps": [
              "chapter-8--flagella"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-8--nucleus",
            "name": "nucleus",
            "minutes": 10,
            "deps": [
              "chapter-8--centrioles-ultrastructure-and-function"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chemical-constituents-of-living-cells",
        "name": "Chemical constituents of living cells",
        "concepts": [
          {
            "id": "chemical-constituents-of-living-cells--biomolecules",
            "name": "biomolecules",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chemical-constituents-of-living-cells--structure-and-function-of-proteins",
            "name": "structure and function of proteins",
            "minutes": 20,
            "deps": [
              "chemical-constituents-of-living-cells--biomolecules"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chemical-constituents-of-living-cells--carbohydrates",
            "name": "carbohydrates",
            "minutes": 10,
            "deps": [
              "chemical-constituents-of-living-cells--structure-and-function-of-proteins"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chemical-constituents-of-living-cells--lipids",
            "name": "lipids",
            "minutes": 10,
            "deps": [
              "chemical-constituents-of-living-cells--carbohydrates"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chemical-constituents-of-living-cells--enzyme-types",
            "name": "Enzyme - types",
            "minutes": 15,
            "deps": [
              "chemical-constituents-of-living-cells--lipids"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chemical-constituents-of-living-cells--properties",
            "name": "properties",
            "minutes": 10,
            "deps": [
              "chemical-constituents-of-living-cells--enzyme-types"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-10",
        "name": "Chapter-10",
        "concepts": [
          {
            "id": "chapter-10--cell-cycle-and-cell-division-cell-cycle",
            "name": "Cell Cycle and Cell Division Cell cycle",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-10--mitosis",
            "name": "mitosis",
            "minutes": 10,
            "deps": [
              "chapter-10--cell-cycle-and-cell-division-cell-cycle"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-10--meiosis-and-their-significance",
            "name": "meiosis and their significance",
            "minutes": 15,
            "deps": [
              "chapter-10--mitosis"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-11",
        "name": "Chapter-11",
        "concepts": [
          {
            "id": "chapter-11--photosynthesis-in-higher-plants-photosynthesis-as-a-means-of-autotrophic-nutriti",
            "name": "Photosynthesis in Higher Plants Photosynthesis as a means of autotrophic nutrition",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--site-of-photosynthesis",
            "name": "site of photosynthesis",
            "minutes": 15,
            "deps": [
              "chapter-11--photosynthesis-in-higher-plants-photosynthesis-as-a-means-of-autotrophic-nutriti"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--pigments-involved-in-photosynthesis-elementary-idea",
            "name": "pigments involved in photosynthesis (elementary idea)",
            "minutes": 20,
            "deps": [
              "chapter-11--site-of-photosynthesis"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--photochemical-and-biosynthetic-phases-of-photosynthesis",
            "name": "photochemical and biosynthetic phases of photosynthesis",
            "minutes": 20,
            "deps": [
              "chapter-11--pigments-involved-in-photosynthesis-elementary-idea"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--cyclic-and-non-cyclic-photophosphorylation",
            "name": "cyclic and non-cyclic photophosphorylation",
            "minutes": 15,
            "deps": [
              "chapter-11--photochemical-and-biosynthetic-phases-of-photosynthesis"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--chemiosmotic-hypothesis",
            "name": "chemiosmotic hypothesis",
            "minutes": 10,
            "deps": [
              "chapter-11--cyclic-and-non-cyclic-photophosphorylation"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--photorespiration",
            "name": "photorespiration",
            "minutes": 10,
            "deps": [
              "chapter-11--chemiosmotic-hypothesis"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--c3-and-c4-pathways",
            "name": "C3 and C4 pathways",
            "minutes": 15,
            "deps": [
              "chapter-11--photorespiration"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-11--factors-affecting-photosynthesis",
            "name": "factors affecting photosynthesis",
            "minutes": 15,
            "deps": [
              "chapter-11--c3-and-c4-pathways"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-12",
        "name": "Chapter-12",
        "concepts": [
          {
            "id": "chapter-12--respiration-in-plants-exchange-of-gases",
            "name": "Respiration in Plants Exchange of gases",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-12--cellular-respiration-glycolysis",
            "name": "cellular respiration - glycolysis",
            "minutes": 15,
            "deps": [
              "chapter-12--respiration-in-plants-exchange-of-gases"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-12--fermentation-anaerobic",
            "name": "fermentation (anaerobic)",
            "minutes": 10,
            "deps": [
              "chapter-12--cellular-respiration-glycolysis"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-12--tca-cycle-and-electron-transport-system-aerobic",
            "name": "TCA cycle and electron transport system (aerobic)",
            "minutes": 20,
            "deps": [
              "chapter-12--fermentation-anaerobic"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-12--energy-relations-number-of-atp-molecules-generated",
            "name": "energy relations - number of ATP molecules generated",
            "minutes": 25,
            "deps": [
              "chapter-12--tca-cycle-and-electron-transport-system-aerobic"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-12--amphibolic-pathways",
            "name": "amphibolic pathways",
            "minutes": 10,
            "deps": [
              "chapter-12--energy-relations-number-of-atp-molecules-generated"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-12--respiratory-quotient",
            "name": "respiratory quotient",
            "minutes": 10,
            "deps": [
              "chapter-12--amphibolic-pathways"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-13",
        "name": "Chapter-13",
        "concepts": [
          {
            "id": "chapter-13--plant-growth-and-development-seed-germination",
            "name": "Plant - Growth and Development Seed germination",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--phases-of-plant-growth-and-plant-growth-rate",
            "name": "phases of plant growth and plant growth rate",
            "minutes": 25,
            "deps": [
              "chapter-13--plant-growth-and-development-seed-germination"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--conditions-of-growth",
            "name": "conditions of growth",
            "minutes": 15,
            "deps": [
              "chapter-13--phases-of-plant-growth-and-plant-growth-rate"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--differentiation",
            "name": "differentiation",
            "minutes": 10,
            "deps": [
              "chapter-13--conditions-of-growth"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--dedifferentiation-and-redifferentiation",
            "name": "dedifferentiation and redifferentiation",
            "minutes": 15,
            "deps": [
              "chapter-13--differentiation"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--sequence-of-developmental-processes-in-a-plant-cell",
            "name": "sequence of developmental processes in a plant cell",
            "minutes": 25,
            "deps": [
              "chapter-13--dedifferentiation-and-redifferentiation"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--plant-growth-regulators-auxin",
            "name": "plant growth regulators - auxin",
            "minutes": 20,
            "deps": [
              "chapter-13--sequence-of-developmental-processes-in-a-plant-cell"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--gibberellin",
            "name": "gibberellin",
            "minutes": 10,
            "deps": [
              "chapter-13--plant-growth-regulators-auxin"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--cytokinin",
            "name": "cytokinin",
            "minutes": 10,
            "deps": [
              "chapter-13--gibberellin"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          },
          {
            "id": "chapter-13--ethylene",
            "name": "ethylene",
            "minutes": 10,
            "deps": [
              "chapter-13--cytokinin"
            ],
            "source": {
              "pdf": "biology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter-14",
        "name": "Chapter-14",
        "concepts": [
          {
            "id": "chapter-14--breathing-and-exchange-of-gases-respiratory-organs-in-animals-recall-only",
            "name": "Breathing and Exchange of Gases Respiratory organs in animals (recall only)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-14--respiratory-system-in-humans",
            "name": "Respiratory system in humans",
            "minutes": 15,
            "deps": [
              "chapter-14--breathing-and-exchange-of-gases-respiratory-organs-in-animals-recall-only"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-14--mechanism-of-breathing-and-its-regulation-in-humans-exchange-of-gases",
            "name": "mechanism of breathing and its regulation in humans - exchange of gases",
            "minutes": 25,
            "deps": [
              "chapter-14--respiratory-system-in-humans"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-14--transport-of-gases-and-regulation-of-respiration",
            "name": "transport of gases and regulation of respiration",
            "minutes": 20,
            "deps": [
              "chapter-14--mechanism-of-breathing-and-its-regulation-in-humans-exchange-of-gases"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-14--respiratory-volume",
            "name": "respiratory volume",
            "minutes": 10,
            "deps": [
              "chapter-14--transport-of-gases-and-regulation-of-respiration"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-14--disorders-related-to-respiration-asthma",
            "name": "disorders related to respiration - asthma",
            "minutes": 20,
            "deps": [
              "chapter-14--respiratory-volume"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-14--emphysema",
            "name": "emphysema",
            "minutes": 10,
            "deps": [
              "chapter-14--disorders-related-to-respiration-asthma"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-14--occupational-respiratory-disorders",
            "name": "occupational respiratory disorders",
            "minutes": 15,
            "deps": [
              "chapter-14--emphysema"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "chapter-15",
        "name": "Chapter-15",
        "concepts": [
          {
            "id": "chapter-15--body-fluids-and-circulation-composition-of-blood",
            "name": "Body Fluids and Circulation Composition of blood",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--blood-groups",
            "name": "blood groups",
            "minutes": 10,
            "deps": [
              "chapter-15--body-fluids-and-circulation-composition-of-blood"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--coagulation-of-blood",
            "name": "coagulation of blood",
            "minutes": 15,
            "deps": [
              "chapter-15--blood-groups"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--composition-of-lymph-and-its-function",
            "name": "composition of lymph and its function",
            "minutes": 20,
            "deps": [
              "chapter-15--coagulation-of-blood"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--human-circulatory-system-structure-of-human-heart-and-blood-vessels",
            "name": "human circulatory system - Structure of human heart and blood vessels",
            "minutes": 25,
            "deps": [
              "chapter-15--composition-of-lymph-and-its-function"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--cardiac-cycle",
            "name": "cardiac cycle",
            "minutes": 10,
            "deps": [
              "chapter-15--human-circulatory-system-structure-of-human-heart-and-blood-vessels"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--cardiac-output",
            "name": "cardiac output",
            "minutes": 10,
            "deps": [
              "chapter-15--cardiac-cycle"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--double-circulation",
            "name": "double circulation",
            "minutes": 10,
            "deps": [
              "chapter-15--cardiac-output"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--regulation-of-cardiac-activity",
            "name": "regulation of cardiac activity",
            "minutes": 15,
            "deps": [
              "chapter-15--double-circulation"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--disorders-of-circulatory-system-hypertension",
            "name": "disorders of circulatory system - hypertension",
            "minutes": 20,
            "deps": [
              "chapter-15--regulation-of-cardiac-activity"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--coronary-artery-disease",
            "name": "coronary artery disease",
            "minutes": 15,
            "deps": [
              "chapter-15--disorders-of-circulatory-system-hypertension"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--angina-pectoris",
            "name": "angina pectoris",
            "minutes": 10,
            "deps": [
              "chapter-15--coronary-artery-disease"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-15--heart-failure",
            "name": "heart failure",
            "minutes": 10,
            "deps": [
              "chapter-15--angina-pectoris"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "chapter-16",
        "name": "Chapter-16",
        "concepts": [
          {
            "id": "chapter-16--excretory-products-and-their-elimination-modes-of-excretion-ammonotelism",
            "name": "Excretory Products and their Elimination Modes of excretion - ammonotelism",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--ureotelism",
            "name": "ureotelism",
            "minutes": 10,
            "deps": [
              "chapter-16--excretory-products-and-their-elimination-modes-of-excretion-ammonotelism"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--uricotelism",
            "name": "uricotelism",
            "minutes": 10,
            "deps": [
              "chapter-16--ureotelism"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--human-excretory-system-structure-and-function",
            "name": "human excretory system – structure and function",
            "minutes": 20,
            "deps": [
              "chapter-16--uricotelism"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--urine-formation",
            "name": "urine formation",
            "minutes": 10,
            "deps": [
              "chapter-16--human-excretory-system-structure-and-function"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--osmoregulation",
            "name": "osmoregulation",
            "minutes": 10,
            "deps": [
              "chapter-16--urine-formation"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--regulation-of-kidney-function-renin-angiotensin",
            "name": "regulation of kidney function - renin - angiotensin",
            "minutes": 25,
            "deps": [
              "chapter-16--osmoregulation"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--atrial-natriuretic-factor",
            "name": "atrial natriuretic factor",
            "minutes": 15,
            "deps": [
              "chapter-16--regulation-of-kidney-function-renin-angiotensin"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--adh-and-diabetes-insipidus",
            "name": "ADH and diabetes insipidus",
            "minutes": 15,
            "deps": [
              "chapter-16--atrial-natriuretic-factor"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--role-of-other-organs-in-excretion",
            "name": "role of other organs in excretion",
            "minutes": 20,
            "deps": [
              "chapter-16--adh-and-diabetes-insipidus"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--disorders-uremia",
            "name": "disorders - uremia",
            "minutes": 15,
            "deps": [
              "chapter-16--role-of-other-organs-in-excretion"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--renal-failure",
            "name": "renal failure",
            "minutes": 10,
            "deps": [
              "chapter-16--disorders-uremia"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--renal-calculi",
            "name": "renal calculi",
            "minutes": 10,
            "deps": [
              "chapter-16--renal-failure"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--nephritis",
            "name": "nephritis",
            "minutes": 10,
            "deps": [
              "chapter-16--renal-calculi"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--dialysis-and-artificial-kidney",
            "name": "dialysis and artificial kidney",
            "minutes": 15,
            "deps": [
              "chapter-16--nephritis"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-16--kidney-transplant",
            "name": "kidney transplant",
            "minutes": 10,
            "deps": [
              "chapter-16--dialysis-and-artificial-kidney"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "chapter-17",
        "name": "Chapter-17",
        "concepts": [
          {
            "id": "chapter-17--locomotion-and-movement-types-of-movement-ciliary",
            "name": "Locomotion and Movement Types of movement - ciliary",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--flagellar",
            "name": "flagellar",
            "minutes": 10,
            "deps": [
              "chapter-17--locomotion-and-movement-types-of-movement-ciliary"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--muscular",
            "name": "muscular",
            "minutes": 10,
            "deps": [
              "chapter-17--flagellar"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--skeletal-muscle",
            "name": "skeletal muscle",
            "minutes": 10,
            "deps": [
              "chapter-17--muscular"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--contractile-proteins-and-muscle-contraction",
            "name": "contractile proteins and muscle contraction",
            "minutes": 20,
            "deps": [
              "chapter-17--skeletal-muscle"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--skeletal-system-and-its-functions",
            "name": "skeletal system and its functions",
            "minutes": 20,
            "deps": [
              "chapter-17--contractile-proteins-and-muscle-contraction"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--joints",
            "name": "joints",
            "minutes": 10,
            "deps": [
              "chapter-17--skeletal-system-and-its-functions"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--disorders-of-muscular-and-skeletal-systems-myasthenia-gravis",
            "name": "disorders of muscular and skeletal systems - myasthenia gravis",
            "minutes": 25,
            "deps": [
              "chapter-17--joints"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--tetany",
            "name": "tetany",
            "minutes": 10,
            "deps": [
              "chapter-17--disorders-of-muscular-and-skeletal-systems-myasthenia-gravis"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--muscular-dystrophy",
            "name": "muscular dystrophy",
            "minutes": 10,
            "deps": [
              "chapter-17--tetany"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--arthritis",
            "name": "arthritis",
            "minutes": 10,
            "deps": [
              "chapter-17--muscular-dystrophy"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-17--osteoporosis",
            "name": "osteoporosis",
            "minutes": 10,
            "deps": [
              "chapter-17--arthritis"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "chapter-18",
        "name": "Chapter-18",
        "concepts": [
          {
            "id": "chapter-18--neural-control-and-coordination-neuron-and-nerves",
            "name": "Neural Control and Coordination Neuron and nerves",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-18--nervous-system-in-humans-central-nervous-system",
            "name": "Nervous system in humans - central nervous system",
            "minutes": 25,
            "deps": [
              "chapter-18--neural-control-and-coordination-neuron-and-nerves"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-18--peripheral-nervous-system-and-visceral-nervous-system",
            "name": "peripheral nervous system and visceral nervous system",
            "minutes": 20,
            "deps": [
              "chapter-18--nervous-system-in-humans-central-nervous-system"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-18--generation-and-conduction-of-nerve-impulse",
            "name": "generation and conduction of nerve impulse",
            "minutes": 20,
            "deps": [
              "chapter-18--peripheral-nervous-system-and-visceral-nervous-system"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "chapter-19",
        "name": "Chapter- 19",
        "concepts": [
          {
            "id": "chapter-19--chemical-coordination-and-integration-endocrine-glands-and-hormones",
            "name": "Chemical Coordination and Integration Endocrine glands and hormones",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--human-endocrine-system-hypothalamus",
            "name": "human endocrine system - hypothalamus",
            "minutes": 20,
            "deps": [
              "chapter-19--chemical-coordination-and-integration-endocrine-glands-and-hormones"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--pituitary",
            "name": "pituitary",
            "minutes": 10,
            "deps": [
              "chapter-19--human-endocrine-system-hypothalamus"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--pineal",
            "name": "pineal",
            "minutes": 10,
            "deps": [
              "chapter-19--pituitary"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--thyroid",
            "name": "thyroid",
            "minutes": 10,
            "deps": [
              "chapter-19--pineal"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--parathyroid",
            "name": "parathyroid",
            "minutes": 10,
            "deps": [
              "chapter-19--thyroid"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--adrenal",
            "name": "adrenal",
            "minutes": 10,
            "deps": [
              "chapter-19--parathyroid"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--pancreas",
            "name": "pancreas",
            "minutes": 10,
            "deps": [
              "chapter-19--adrenal"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--gonads",
            "name": "gonads",
            "minutes": 10,
            "deps": [
              "chapter-19--pancreas"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--mechanism-of-hormone-action-elementary-idea",
            "name": "mechanism of hormone action (elementary idea)",
            "minutes": 20,
            "deps": [
              "chapter-19--gonads"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--role-of-hormones-as-messengers-and-regulators",
            "name": "role of hormones as messengers and regulators",
            "minutes": 20,
            "deps": [
              "chapter-19--mechanism-of-hormone-action-elementary-idea"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--hypo-and-hyperactivity-and-related-disorders",
            "name": "hypo - and hyperactivity and related disorders",
            "minutes": 20,
            "deps": [
              "chapter-19--role-of-hormones-as-messengers-and-regulators"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--dwarfism",
            "name": "dwarfism",
            "minutes": 10,
            "deps": [
              "chapter-19--hypo-and-hyperactivity-and-related-disorders"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--acromegaly",
            "name": "acromegaly",
            "minutes": 10,
            "deps": [
              "chapter-19--dwarfism"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--cretinism",
            "name": "cretinism",
            "minutes": 10,
            "deps": [
              "chapter-19--acromegaly"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--goiter",
            "name": "goiter",
            "minutes": 10,
            "deps": [
              "chapter-19--cretinism"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--exophthalmic-goitre",
            "name": "exophthalmic goitre",
            "minutes": 10,
            "deps": [
              "chapter-19--goiter"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--diabetes",
            "name": "diabetes",
            "minutes": 10,
            "deps": [
              "chapter-19--exophthalmic-goitre"
            ],
            "source": {
              "pdf": "biology",
              "page": 5
            }
          },
          {
            "id": "chapter-19--addisons-disease",
            "name": "Addison's disease",
            "minutes": 10,
            "deps": [
              "chapter-19--diabetes"
            ],
            "source": {
              "pdf": "biology",
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
            "id": "syllabus--preparation-and-studyof-t-s-of-dicot-and-monocot-roots-and-stems-primary",
            "name": "Preparation and studyof T.S. of dicot and monocot roots and stems (primary)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biology",
              "page": 6
            }
          },
          {
            "id": "syllabus--studyof-osmosis-by-potato-osmometer",
            "name": "Studyof osmosis by potato osmometer",
            "minutes": 20,
            "deps": [
              "syllabus--preparation-and-studyof-t-s-of-dicot-and-monocot-roots-and-stems-primary"
            ],
            "source": {
              "pdf": "biology",
              "page": 6
            }
          },
          {
            "id": "syllabus--study-of-plasmolysis-in-epidermal-peels-e-g-rhoeo-lily-leaves-or-flashy-scale-le",
            "name": "Study of plasmolysis in epidermal peels (e.g. Rhoeo/lily leaves or flashy scale leaves of onion bulb)",
            "minutes": 25,
            "deps": [
              "syllabus--studyof-osmosis-by-potato-osmometer"
            ],
            "source": {
              "pdf": "biology",
              "page": 6
            }
          },
          {
            "id": "syllabus--studyof-distribution-of-stomata-on-the-upper-and-lower-surfaces-of-leaves",
            "name": "Studyof distribution of stomata on the upper and lower surfaces of leaves",
            "minutes": 25,
            "deps": [
              "syllabus--study-of-plasmolysis-in-epidermal-peels-e-g-rhoeo-lily-leaves-or-flashy-scale-le"
            ],
            "source": {
              "pdf": "biology",
              "page": 6
            }
          },
          {
            "id": "syllabus--comparative-study-of-the-rates-of-transpiration-in-the-upper-and-lower-surfaces-",
            "name": "Comparative study of the rates of transpiration in the upper and lower surfaces of7 leaves",
            "minutes": 25,
            "deps": [
              "syllabus--studyof-distribution-of-stomata-on-the-upper-and-lower-surfaces-of-leaves"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--test-for-the-presence-of-sugar-starch-proteins-and-fats-in-suitable-plant-and-an",
            "name": "Test for the presence of sugar, starch, proteins and fats in suitable plant and animal materials",
            "minutes": 25,
            "deps": [
              "syllabus--comparative-study-of-the-rates-of-transpiration-in-the-upper-and-lower-surfaces-"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--separation-of-plant-pigments-through-paper-chromatography",
            "name": "Separation of plant pigments through paper chromatography",
            "minutes": 20,
            "deps": [
              "syllabus--test-for-the-presence-of-sugar-starch-proteins-and-fats-in-suitable-plant-and-an"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--studyof-the-rate-of-respiration-in-flower-buds-leaf-tissue-and-germinating-seeds",
            "name": "Studyof the rate of respiration in flower buds/leaf tissue and germinating seeds",
            "minutes": 25,
            "deps": [
              "syllabus--separation-of-plant-pigments-through-paper-chromatography"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--test-for-presence-of-urea-in-urine",
            "name": "Test for presence of urea in urine",
            "minutes": 20,
            "deps": [
              "syllabus--studyof-the-rate-of-respiration-in-flower-buds-leaf-tissue-and-germinating-seeds"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--test-for-presence-of-sugar-in-urine",
            "name": "Test for presence of sugar in urine",
            "minutes": 20,
            "deps": [
              "syllabus--test-for-presence-of-urea-in-urine"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--test-for-presence-of-albumin-in-urine",
            "name": "Test for presence of albumin in urine",
            "minutes": 20,
            "deps": [
              "syllabus--test-for-presence-of-sugar-in-urine"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--test-for-presence-of-bile-salts-in-urine-b-study-and-observe-the-following-spott",
            "name": "Test for presence of bile salts in urine. B. Study and Observe the following (spotting):",
            "minutes": 25,
            "deps": [
              "syllabus--test-for-presence-of-albumin-in-urine"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--parts-of-a-compound-microscope",
            "name": "Parts of a compound microscope",
            "minutes": 20,
            "deps": [
              "syllabus--test-for-presence-of-bile-salts-in-urine-b-study-and-observe-the-following-spott"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--mitosis-in-onion-root-tip-cells-and-animals-cells-grasshopper-from-permanent-sli",
            "name": "Mitosis in onion root tip cells and animal’s cells (grasshopper) from permanent slides",
            "minutes": 25,
            "deps": [
              "syllabus--parts-of-a-compound-microscope"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--types-of-inflorescence-cymose-and-racemose",
            "name": "Types of inflorescence (cymose and racemose)",
            "minutes": 20,
            "deps": [
              "syllabus--mitosis-in-onion-root-tip-cells-and-animals-cells-grasshopper-from-permanent-sli"
            ],
            "source": {
              "pdf": "biology",
              "page": 7
            }
          },
          {
            "id": "syllabus--study-locally-available-common-flowering-plants-of-the-family-solanaceae-and-ide",
            "name": "Study locally available common flowering plants of the family – Solanaceae and identify type of stem (Herbaceous or Woody), type of leaves",
            "minutes": 25,
            "deps": [
              "syllabus--types-of-inflorescence-cymose-and-racemose"
            ],
            "source": {
              "pdf": "biology",
              "page": 8
            }
          },
          {
            "id": "syllabus--study-the-parts-of-a-compound-microscope-eye-piece-and-objective-lens-mirror-sta",
            "name": "Study the parts of a compound microscope- eye piece and objective lens, mirror, stage, coarse and fine adjustment knobs",
            "minutes": 25,
            "deps": [
              "syllabus--study-locally-available-common-flowering-plants-of-the-family-solanaceae-and-ide"
            ],
            "source": {
              "pdf": "biology",
              "page": 8
            }
          },
          {
            "id": "syllabus--differentiate-between-monocot-and-dicot-plants-on-the-basis-of-venation-patterns",
            "name": "Differentiate between monocot and dicot plants on the basis of venation patterns",
            "minutes": 25,
            "deps": [
              "syllabus--study-the-parts-of-a-compound-microscope-eye-piece-and-objective-lens-mirror-sta"
            ],
            "source": {
              "pdf": "biology",
              "page": 8
            }
          },
          {
            "id": "syllabus--study-the-following-parts-of-human-skeleton-model-ball-and-socket-joints-of-thig",
            "name": "Study the following parts of human skeleton (Model): Ball and socket joints of thigh and shoulder",
            "minutes": 25,
            "deps": [
              "syllabus--differentiate-between-monocot-and-dicot-plants-on-the-basis-of-venation-patterns"
            ],
            "source": {
              "pdf": "biology",
              "page": 8
            }
          },
          {
            "id": "syllabus--rib-cage",
            "name": "Rib cage",
            "minutes": 10,
            "deps": [
              "syllabus--study-the-following-parts-of-human-skeleton-model-ball-and-socket-joints-of-thig"
            ],
            "source": {
              "pdf": "biology",
              "page": 8
            }
          },
          {
            "id": "syllabus--study-honeybee-butterfly-snail-sheik-snail-through-shell-starfish-pigeon",
            "name": "Study honeybee/butterfly, snail/sheik snail through shell, Starfish, Pigeon",
            "minutes": 25,
            "deps": [
              "syllabus--rib-cage"
            ],
            "source": {
              "pdf": "biology",
              "page": 8
            }
          },
          {
            "id": "syllabus--identifythe-given-specimen-of-a-fungus-mushroom-gymnosperm-pine-cone",
            "name": "Identifythe given specimen of a fungus – mushroom, gymnosperm-pine cone",
            "minutes": 25,
            "deps": [
              "syllabus--study-honeybee-butterfly-snail-sheik-snail-through-shell-starfish-pigeon"
            ],
            "source": {
              "pdf": "biology",
              "page": 8
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
        "id": "unit-i-biotechnology",
        "name": "Unit- I           Biotechnology",
        "concepts": [
          {
            "id": "unit-i-biotechnology--an-overview-5",
            "name": "An overview 5",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "chapter-1",
        "name": "Chapter 1",
        "concepts": [
          {
            "id": "chapter-1--an-overview-historical-perspectives",
            "name": "An Overview Historical Perspectives",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-1--technology-and-applications-of-biotechnology",
            "name": "Technology and Applications of Biotechnology",
            "minutes": 20,
            "deps": [
              "chapter-1--an-overview-historical-perspectives"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-1--global-market-and-biotech-products",
            "name": "Global market and Biotech Products",
            "minutes": 20,
            "deps": [
              "chapter-1--technology-and-applications-of-biotechnology"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-1--building-blocks-building-blocks-of-carbohydrates-sugars-and-their-derivatives",
            "name": "Building Blocks Building Blocks of Carbohydrates - Sugars and their Derivatives",
            "minutes": 25,
            "deps": [
              "chapter-1--global-market-and-biotech-products"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-1--building-blocks-of-proteins-amino-acids",
            "name": "Building Blocks of Proteins - Amino Acids",
            "minutes": 20,
            "deps": [
              "chapter-1--building-blocks-building-blocks-of-carbohydrates-sugars-and-their-derivatives"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-1--building-blocks-of-lipids-simple-fatty-acids",
            "name": "Building Blocks of Lipids- Simple Fatty Acids",
            "minutes": 20,
            "deps": [
              "chapter-1--building-blocks-of-proteins-amino-acids"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-1--glycerol-and-cholesterol",
            "name": "Glycerol and Cholesterol",
            "minutes": 15,
            "deps": [
              "chapter-1--building-blocks-of-lipids-simple-fatty-acids"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-1--building-blocks-of-nucleic-acids-nucleotides",
            "name": "Building Blocks of Nucleic Acids – Nucleotides",
            "minutes": 20,
            "deps": [
              "chapter-1--glycerol-and-cholesterol"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "chapter-2",
        "name": "Chapter 2",
        "concepts": [
          {
            "id": "chapter-2--structure-function-carbohydrates-the-energy-givers",
            "name": "Structure & Function Carbohydrates - The Energy Givers",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--proteins-the-performers",
            "name": "Proteins - The Performers",
            "minutes": 15,
            "deps": [
              "chapter-2--structure-function-carbohydrates-the-energy-givers"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--enzymes-the-catalysts",
            "name": "Enzymes -The Catalysts",
            "minutes": 15,
            "deps": [
              "chapter-2--proteins-the-performers"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--lipids-and-biomembranes-the-barriers",
            "name": "Lipids and Biomembranes - The Barriers",
            "minutes": 20,
            "deps": [
              "chapter-2--enzymes-the-catalysts"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--nucleic-acids-the-managers",
            "name": "Nucleic Acids - The Managers",
            "minutes": 20,
            "deps": [
              "chapter-2--lipids-and-biomembranes-the-barriers"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--structure-and-function-discovery-of-dna-as-genetic-material",
            "name": "Structure and Function Discovery of DNA as Genetic Material",
            "minutes": 25,
            "deps": [
              "chapter-2--nucleic-acids-the-managers"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--dna-replication",
            "name": "DNA Replication",
            "minutes": 10,
            "deps": [
              "chapter-2--structure-and-function-discovery-of-dna-as-genetic-material"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--fine-structure-of-the-genes",
            "name": "Fine Structure of the Genes",
            "minutes": 20,
            "deps": [
              "chapter-2--dna-replication"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--from-gene-to-protein",
            "name": "From Gene to Protein",
            "minutes": 15,
            "deps": [
              "chapter-2--fine-structure-of-the-genes"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--transcription-the-basic-process",
            "name": "Transcription – The Basic Process",
            "minutes": 20,
            "deps": [
              "chapter-2--from-gene-to-protein"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--genetic-code",
            "name": "Genetic Code",
            "minutes": 10,
            "deps": [
              "chapter-2--transcription-the-basic-process"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--translation",
            "name": "Translation",
            "minutes": 10,
            "deps": [
              "chapter-2--genetic-code"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--mutations",
            "name": "Mutations",
            "minutes": 10,
            "deps": [
              "chapter-2--translation"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          },
          {
            "id": "chapter-2--human-genetic-disorders-2",
            "name": "Human Genetic Disorders. 2",
            "minutes": 15,
            "deps": [
              "chapter-2--mutations"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--preparation-of-buffers-and-ph-determination",
            "name": "Preparation of buffers and pH determination",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "biotechnology",
              "page": 3
            }
          },
          {
            "id": "syllabus--sterilization-techniques",
            "name": "Sterilization techniques",
            "minutes": 10,
            "deps": [
              "syllabus--preparation-of-buffers-and-ph-determination"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 3
            }
          },
          {
            "id": "syllabus--preparation-of-bacterial-growth-medium",
            "name": "Preparation of bacterial growth medium",
            "minutes": 20,
            "deps": [
              "syllabus--sterilization-techniques"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 3
            }
          },
          {
            "id": "syllabus--cell-counting",
            "name": "Cell counting",
            "minutes": 10,
            "deps": [
              "syllabus--preparation-of-bacterial-growth-medium"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 3
            }
          },
          {
            "id": "syllabus--sugar-estimation-using-di-nitro-salicylic-acid-test-dns-test",
            "name": "Sugar Estimation using Di Nitro Salicylic Acid test (DNS test)",
            "minutes": 25,
            "deps": [
              "syllabus--cell-counting"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 3
            }
          },
          {
            "id": "syllabus--assay-for-amylase-enzyme",
            "name": "Assay for amylase enzyme",
            "minutes": 15,
            "deps": [
              "syllabus--sugar-estimation-using-di-nitro-salicylic-acid-test-dns-test"
            ],
            "source": {
              "pdf": "biotechnology",
              "page": 3
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
        "id": "sections-of-a-cone",
        "name": "Sections of a cone",
        "concepts": [
          {
            "id": "sections-of-a-cone--circles",
            "name": "circles",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          },
          {
            "id": "sections-of-a-cone--ellipse",
            "name": "ellipse",
            "minutes": 10,
            "deps": [
              "sections-of-a-cone--circles"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          },
          {
            "id": "sections-of-a-cone--parabola",
            "name": "parabola",
            "minutes": 10,
            "deps": [
              "sections-of-a-cone--ellipse"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          },
          {
            "id": "sections-of-a-cone--hyperbola",
            "name": "hyperbola",
            "minutes": 10,
            "deps": [
              "sections-of-a-cone--parabola"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          },
          {
            "id": "sections-of-a-cone--a-point",
            "name": "a point",
            "minutes": 10,
            "deps": [
              "sections-of-a-cone--hyperbola"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          },
          {
            "id": "sections-of-a-cone--ellipse-and-hyperbola-standard-equation-of-a-circle",
            "name": "ellipse and hyperbola. Standard equation of a circle",
            "minutes": 25,
            "deps": [
              "sections-of-a-cone--a-point"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "measures-of-dispersion",
        "name": "Measures of Dispersion",
        "concepts": [
          {
            "id": "measures-of-dispersion--mean-deviation",
            "name": "Mean deviation",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          },
          {
            "id": "measures-of-dispersion--variance-and-standard-deviation-of-ungrouped-grouped-data",
            "name": "variance and standard deviation of ungrouped/grouped data",
            "minutes": 20,
            "deps": [
              "measures-of-dispersion--mean-deviation"
            ],
            "source": {
              "pdf": "maths-senior",
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
            "id": "syllabus--linear-inequalities-linear-inequalities-algebraic-solutions-of-linear-inequaliti",
            "name": "Linear Inequalities Linear inequalities. Algebraic solutions of linear inequalities in one variable and their representation on the number line",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-senior",
              "page": 3
            }
          },
          {
            "id": "syllabus--binomial-theorem-historical-perspective-statement-and-proof-of-the-binomial-theo",
            "name": "Binomial Theorem Historical perspective, statement and proof of the binomial theorem for positive integral indices. Pascal’s triangle, simple applications",
            "minutes": 25,
            "deps": [
              "syllabus--linear-inequalities-linear-inequalities-algebraic-solutions-of-linear-inequaliti"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 3
            }
          },
          {
            "id": "syllabus--statistics-measures-of-dispersion-range-mean-deviation-variance-and-standard-dev",
            "name": "Statistics Measures of Dispersion: Range, Mean deviation, variance and standard deviation of ungrouped/grouped data",
            "minutes": 25,
            "deps": [
              "syllabus--binomial-theorem-historical-perspective-statement-and-proof-of-the-binomial-theo"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 4
            }
          },
          {
            "id": "syllabus--no-chapter-wise-weightage-care-to-be-taken-to-cover-all-the-chapters",
            "name": "No chapter wise weightage. Care to be taken to cover all the chapters",
            "minutes": 25,
            "deps": [
              "syllabus--statistics-measures-of-dispersion-range-mean-deviation-variance-and-standard-dev"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 5
            }
          },
          {
            "id": "syllabus--sets-practical-problems-on-union-and-intersection-of-two-sets",
            "name": "Sets Practical problems on Union and Intersection of two sets",
            "minutes": 25,
            "deps": [
              "syllabus--no-chapter-wise-weightage-care-to-be-taken-to-cover-all-the-chapters"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
            }
          },
          {
            "id": "syllabus--relations-and-functions-composition-of-functions",
            "name": "Relations and Functions Composition of Functions",
            "minutes": 20,
            "deps": [
              "syllabus--sets-practical-problems-on-union-and-intersection-of-two-sets"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
            }
          },
          {
            "id": "syllabus--trigonometric-functions-general-solution-of-trigonometric-equations-of-the-type-",
            "name": "Trigonometric Functions General solution of trigonometric equations of the type sin𝑦 = sin𝑎,cos𝑦 = cos𝑎 and tan𝑦 = tan𝑎. Unit-II: Algebra",
            "minutes": 25,
            "deps": [
              "syllabus--relations-and-functions-composition-of-functions"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
            }
          },
          {
            "id": "syllabus--binomial-theorem-general-and-middle-term-in-binomial-expansion",
            "name": "Binomial Theorem General and middle term in binomial expansion",
            "minutes": 25,
            "deps": [
              "syllabus--trigonometric-functions-general-solution-of-trigonometric-equations-of-the-type-"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
            }
          },
          {
            "id": "syllabus--sequence-and-series-formulae-for-the-following-special-sums",
            "name": "Sequence and Series Formulae for the following special sums",
            "minutes": 25,
            "deps": [
              "syllabus--binomial-theorem-general-and-middle-term-in-binomial-expansion"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
            }
          },
          {
            "id": "syllabus--straight-lines-normal-form-general-equation-of-a-line",
            "name": "Straight Lines Normal form. General equation of a line",
            "minutes": 25,
            "deps": [
              "syllabus--sequence-and-series-formulae-for-the-following-special-sums"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
            }
          },
          {
            "id": "syllabus--introduction-to-three-dimensional-geometry-section-formula-unit-iv-calculus",
            "name": "Introduction to Three-dimensional Geometry Section formula. Unit-IV: Calculus",
            "minutes": 25,
            "deps": [
              "syllabus--straight-lines-normal-form-general-equation-of-a-line"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
            }
          },
          {
            "id": "syllabus--limits-and-derivatives-derivativesofcompositefunctions-chainrule-unit-v-statisti",
            "name": "Limits and Derivatives Derivativesofcompositefunctions(Chainrule). Unit-V Statistics and Probability",
            "minutes": 25,
            "deps": [
              "syllabus--introduction-to-three-dimensional-geometry-section-formula-unit-iv-calculus"
            ],
            "source": {
              "pdf": "maths-senior",
              "page": 6
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
            "id": "unit-1--purchase",
            "name": "Purchase",
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
            "id": "unit-1--debtor",
            "name": "Debtor",
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
            "id": "bank-reconciliation-statement--per-their-nature-in-different-subsidiary-books-causes",
            "name": "per their nature in different subsidiary books . Causes",
            "minutes": 25,
            "deps": [
              "bank-reconciliation-statement--features"
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
            "id": "process-of-entrepreneurship-development--intellectual-property-rights-start-up-india-scheme",
            "name": "Intellectual Property Rights Start-up India Scheme",
            "minutes": 20,
            "deps": [],
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
            "id": "planning--policies",
            "name": "policies",
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
            "id": "dth--enlist-its-features",
            "name": "Enlist its features",
            "minutes": 15,
            "deps": [
              "dth--water-storage-tank"
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
            "id": "dth--decisions-related-to-warehousing-state-reasons",
            "name": "Decisions related to warehousing, state reasons",
            "minutes": 20,
            "deps": [
              "dth--draft-a-tag-line"
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
              "dth--decisions-related-to-warehousing-state-reasons"
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
            "id": "dth--draft-a-social-message-for-your-label",
            "name": "Draft a social message for your label",
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
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--focus-on-some-important-developments-in-different-spheres-political-social-cultu",
            "name": "Focus on some important developments in different spheres-political, social, cultural, and economic. Classes XI-XII (2026-27)2",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "history",
              "page": 1
            }
          },
          {
            "id": "syllabus--adetailed-overviewof-the-events-issues-and-processes-under-discussion",
            "name": "Adetailed overviewof the events, issues, and processes under discussion",
            "minutes": 25,
            "deps": [
              "syllabus--focus-on-some-important-developments-in-different-spheres-political-social-cultu"
            ],
            "source": {
              "pdf": "history",
              "page": 2
            }
          },
          {
            "id": "syllabus--asummary-of-the-present-state-of-research-on-the-theme",
            "name": "Asummary of the present state of research on the theme",
            "minutes": 25,
            "deps": [
              "syllabus--adetailed-overviewof-the-events-issues-and-processes-under-discussion"
            ],
            "source": {
              "pdf": "history",
              "page": 2
            }
          },
          {
            "id": "syllabus--an-account-of-howknowledge-about-the-theme-has-been-acquired",
            "name": "An account of howknowledge about the theme has been acquired",
            "minutes": 25,
            "deps": [
              "syllabus--asummary-of-the-present-state-of-research-on-the-theme"
            ],
            "source": {
              "pdf": "history",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "prescribed",
        "name": "Prescribed",
        "concepts": [
          {
            "id": "prescribed--writing-and-city-life",
            "name": "Writing and City Life",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "history",
              "page": 3
            }
          },
          {
            "id": "prescribed--an-empire-across-three-continents",
            "name": "An Empire Across Three Continents",
            "minutes": 20,
            "deps": [
              "prescribed--writing-and-city-life"
            ],
            "source": {
              "pdf": "history",
              "page": 3
            }
          },
          {
            "id": "prescribed--nomadic-empires",
            "name": "Nomadic Empires",
            "minutes": 10,
            "deps": [
              "prescribed--an-empire-across-three-continents"
            ],
            "source": {
              "pdf": "history",
              "page": 3
            }
          },
          {
            "id": "prescribed--the-three-orders",
            "name": "The Three orders",
            "minutes": 15,
            "deps": [
              "prescribed--nomadic-empires"
            ],
            "source": {
              "pdf": "history",
              "page": 3
            }
          },
          {
            "id": "prescribed--changing-cultural-traditions",
            "name": "Changing Cultural Traditions",
            "minutes": 15,
            "deps": [
              "prescribed--the-three-orders"
            ],
            "source": {
              "pdf": "history",
              "page": 3
            }
          },
          {
            "id": "prescribed--displacing-indigenous-peoples",
            "name": "Displacing Indigenous Peoples",
            "minutes": 15,
            "deps": [
              "prescribed--changing-cultural-traditions"
            ],
            "source": {
              "pdf": "history",
              "page": 3
            }
          },
          {
            "id": "prescribed--paths-to-modernisation",
            "name": "Paths to Modernisation",
            "minutes": 15,
            "deps": [
              "prescribed--displacing-indigenous-peoples"
            ],
            "source": {
              "pdf": "history",
              "page": 3
            }
          },
          {
            "id": "prescribed--themes-in-indian-history-part-i",
            "name": "Themes in Indian History Part--I",
            "minutes": 20,
            "deps": [
              "prescribed--paths-to-modernisation"
            ],
            "source": {
              "pdf": "history",
              "page": 9
            }
          },
          {
            "id": "prescribed--themes-in-indian-history-part-ii",
            "name": "Themes in Indian History Part—II",
            "minutes": 20,
            "deps": [
              "prescribed--themes-in-indian-history-part-i"
            ],
            "source": {
              "pdf": "history",
              "page": 9
            }
          },
          {
            "id": "prescribed--themes-in-indian-history-part-iii",
            "name": "Themes in Indian History Part—III",
            "minutes": 20,
            "deps": [
              "prescribed--themes-in-indian-history-part-ii"
            ],
            "source": {
              "pdf": "history",
              "page": 9
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
        "id": "unit-iv-natural-hazards-and-disasters",
        "name": "Unit-IV Natural Hazards and Disasters",
        "concepts": [
          {
            "id": "unit-iv-natural-hazards-and-disasters--causes-consequences-and-management",
            "name": "Causes Consequences and Management",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "unit-2",
        "name": "Unit 2",
        "concepts": [
          {
            "id": "unit-2--lithosphere",
            "name": "Lithosphere",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 5
            }
          },
          {
            "id": "unit-2--atmosphere-and-hydrosphere-origin-of-life",
            "name": "Atmosphere and Hydrosphere ● Origin of Life",
            "minutes": 20,
            "deps": [
              "unit-2--lithosphere"
            ],
            "source": {
              "pdf": "geography",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "unit-3",
        "name": "Unit 3",
        "concepts": [
          {
            "id": "unit-3--diastrophism",
            "name": "Diastrophism",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 5
            }
          },
          {
            "id": "unit-3--weathering",
            "name": "Weathering",
            "minutes": 10,
            "deps": [
              "unit-3--diastrophism"
            ],
            "source": {
              "pdf": "geography",
              "page": 5
            }
          },
          {
            "id": "unit-3--processes-and-factors-of-soil-formation",
            "name": "Processes and factors of Soil Formation",
            "minutes": 20,
            "deps": [
              "unit-3--weathering"
            ],
            "source": {
              "pdf": "geography",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "unit-5",
        "name": "Unit 5",
        "concepts": [
          {
            "id": "unit-5--factors",
            "name": "Factors",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 6
            }
          },
          {
            "id": "unit-5--horizontal-and-vertical-distribution-of-temperature-and-salinity",
            "name": "Horizontal and Vertical distribution of temperature and Salinity",
            "minutes": 25,
            "deps": [
              "unit-5--factors"
            ],
            "source": {
              "pdf": "geography",
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
            "id": "unit-1--chapter-1-india-location",
            "name": "Chapter 1 India — Location",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 6
            }
          },
          {
            "id": "unit-1--latitudinal-and-longitudinal-extent",
            "name": "Latitudinal and Longitudinal extent",
            "minutes": 15,
            "deps": [
              "unit-1--chapter-1-india-location"
            ],
            "source": {
              "pdf": "geography",
              "page": 6
            }
          },
          {
            "id": "unit-1--introduction-indian-standard-time",
            "name": "Introduction Indian Standard time",
            "minutes": 15,
            "deps": [
              "unit-1--latitudinal-and-longitudinal-extent"
            ],
            "source": {
              "pdf": "geography",
              "page": 6
            }
          },
          {
            "id": "unit-1--india-and-its-neighbours",
            "name": "India and its neighbours",
            "minutes": 15,
            "deps": [
              "unit-1--introduction-indian-standard-time"
            ],
            "source": {
              "pdf": "geography",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "vegetation-wildlife-reserves",
        "name": "Vegetation        Wildlife reserves",
        "concepts": [
          {
            "id": "vegetation-wildlife-reserves--corbett",
            "name": "Corbett",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "vegetation-wildlife-reserves--kaziranga",
            "name": "Kaziranga",
            "minutes": 10,
            "deps": [
              "vegetation-wildlife-reserves--corbett"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "vegetation-wildlife-reserves--ranthambore-shivpuri",
            "name": "Ranthambore. Shivpuri",
            "minutes": 10,
            "deps": [
              "vegetation-wildlife-reserves--kaziranga"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "vegetation-wildlife-reserves--periyar",
            "name": "Periyar",
            "minutes": 10,
            "deps": [
              "vegetation-wildlife-reserves--ranthambore-shivpuri"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "vegetation-wildlife-reserves--rajaji",
            "name": "Rajaji",
            "minutes": 10,
            "deps": [
              "vegetation-wildlife-reserves--periyar"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "vegetation-wildlife-reserves--mudumalai",
            "name": "Mudumalai",
            "minutes": 10,
            "deps": [
              "vegetation-wildlife-reserves--rajaji"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "vegetation-wildlife-reserves--dachigam",
            "name": "Dachigam",
            "minutes": 10,
            "deps": [
              "vegetation-wildlife-reserves--mudumalai"
            ],
            "source": {
              "pdf": "geography",
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
            "id": "syllabus--a-practical-file-must-be-prepared-by-students-covering-all-the-topics-prescribed",
            "name": "A practical file must be prepared by students covering all the topics prescribed in the practical syllabus",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--the-file-should-be-completely-handwritten-with-a-cover-page-index-page-and-ackno",
            "name": "The file should be completely handwritten with a cover page, index page and acknowledgment",
            "minutes": 25,
            "deps": [
              "syllabus--a-practical-file-must-be-prepared-by-students-covering-all-the-topics-prescribed"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--all-practical-works-should-be-drawn-neatly-with-appropriate-headings-scale-index",
            "name": "All practical works should be drawn neatly with appropriate headings, scale, index etc. Data can be taken from the NCERT textbook",
            "minutes": 25,
            "deps": [
              "syllabus--the-file-should-be-completely-handwritten-with-a-cover-page-index-page-and-ackno"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--the-practical-file-will-be-assessed-at-the-time-of-term-end-practical-examinatio",
            "name": "The practical file will be assessed at the time of term end practical examinations",
            "minutes": 25,
            "deps": [
              "syllabus--all-practical-works-should-be-drawn-neatly-with-appropriate-headings-scale-index"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--a-written-exam-of-25-marks-will-be-conducted-based-on-prescribed-practical-sylla",
            "name": "A written exam of 25 marks will be conducted based on prescribed practical syllabus",
            "minutes": 25,
            "deps": [
              "syllabus--the-practical-file-will-be-assessed-at-the-time-of-term-end-practical-examinatio"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--viva-will-be-conducted-based-on-practical-syllabus-only",
            "name": "Viva will be conducted based on practical syllabus only",
            "minutes": 25,
            "deps": [
              "syllabus--a-written-exam-of-25-marks-will-be-conducted-based-on-prescribed-practical-sylla"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--written-exam-25-marks",
            "name": "Written Exam -25 Marks",
            "minutes": 15,
            "deps": [
              "syllabus--viva-will-be-conducted-based-on-practical-syllabus-only"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--practical-file-03-marks",
            "name": "Practical file- 03 Marks",
            "minutes": 15,
            "deps": [
              "syllabus--written-exam-25-marks"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
            }
          },
          {
            "id": "syllabus--viva-02-marks-class-xi",
            "name": "Viva- 02 Marks CLASS: XI",
            "minutes": 20,
            "deps": [
              "syllabus--practical-file-03-marks"
            ],
            "source": {
              "pdf": "geography",
              "page": 10
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
            "id": "prescribed--primary-activities-areas-of-subsistence-gathering",
            "name": "Primary Activities Areas of subsistence gathering",
            "minutes": 20,
            "deps": [
              "prescribed--the-world"
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
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--indian-constitution-at-work",
            "name": "Indian Constitution at Work:",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "political-science",
              "page": 1
            }
          },
          {
            "id": "syllabus--political-theory",
            "name": "Political Theory:",
            "minutes": 10,
            "deps": [
              "syllabus--indian-constitution-at-work"
            ],
            "source": {
              "pdf": "political-science",
              "page": 2
            }
          },
          {
            "id": "syllabus--politics-in-india-since-independence",
            "name": "Politics in India since Independence",
            "minutes": 20,
            "deps": [
              "syllabus--political-theory"
            ],
            "source": {
              "pdf": "political-science",
              "page": 2
            }
          },
          {
            "id": "syllabus--contents-of-amendments-made-so-far",
            "name": "Contents of amendments made so far",
            "minutes": 20,
            "deps": [
              "syllabus--politics-in-india-since-independence"
            ],
            "source": {
              "pdf": "political-science",
              "page": 7
            }
          },
          {
            "id": "syllabus--indian-constitution-at-work-class-xi-published-by-ncert",
            "name": "Indian Constitution at Work, Class XI, Published by NCERT",
            "minutes": 25,
            "deps": [
              "syllabus--contents-of-amendments-made-so-far"
            ],
            "source": {
              "pdf": "political-science",
              "page": 9
            }
          },
          {
            "id": "syllabus--political-theory-class-xi-published-by-ncert",
            "name": "Political Theory, Class XI, Published by NCERT",
            "minutes": 20,
            "deps": [
              "syllabus--indian-constitution-at-work-class-xi-published-by-ncert"
            ],
            "source": {
              "pdf": "political-science",
              "page": 9
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
        "id": "time",
        "name": "Time",
        "concepts": [
          {
            "id": "time--80-units-marks",
            "name": "80 Units Marks",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "sociology",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--sociology-society-and-its-relationship-with-other-social-science-disciplines-10",
            "name": "Sociology, Society and its relationship with other Social Science disciplines 10",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "sociology",
              "page": 2
            }
          },
          {
            "id": "syllabus--terms-concepts-and-their-use-in-sociology-10",
            "name": "Terms, concepts and their use in Sociology 10",
            "minutes": 25,
            "deps": [
              "syllabus--sociology-society-and-its-relationship-with-other-social-science-disciplines-10"
            ],
            "source": {
              "pdf": "sociology",
              "page": 2
            }
          },
          {
            "id": "syllabus--understanding-social-institutions-12",
            "name": "Understanding Social Institutions 12",
            "minutes": 15,
            "deps": [
              "syllabus--terms-concepts-and-their-use-in-sociology-10"
            ],
            "source": {
              "pdf": "sociology",
              "page": 2
            }
          },
          {
            "id": "syllabus--culture-and-socialization-12-total-44-class-xi-2026-27-3-b-understanding-society",
            "name": "Culture and Socialization 12 Total 44 Class XI (2026-27)3 B Understanding Society",
            "minutes": 25,
            "deps": [
              "syllabus--understanding-social-institutions-12"
            ],
            "source": {
              "pdf": "sociology",
              "page": 2
            }
          },
          {
            "id": "syllabus--social-change-and-social-order-in-rural-and-urban-society-12",
            "name": "Social Change and Social order in Rural and Urban Society 12",
            "minutes": 25,
            "deps": [
              "syllabus--culture-and-socialization-12-total-44-class-xi-2026-27-3-b-understanding-society"
            ],
            "source": {
              "pdf": "sociology",
              "page": 3
            }
          },
          {
            "id": "syllabus--introducingwestern-sociologists-12",
            "name": "IntroducingWestern Sociologists 12",
            "minutes": 15,
            "deps": [
              "syllabus--social-change-and-social-order-in-rural-and-urban-society-12"
            ],
            "source": {
              "pdf": "sociology",
              "page": 3
            }
          },
          {
            "id": "syllabus--introduction-2-marks",
            "name": "Introduction -2 Marks",
            "minutes": 15,
            "deps": [
              "syllabus--introducingwestern-sociologists-12"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "syllabus--statement-of-purpose-2-marks",
            "name": "Statement of Purpose – 2 Marks",
            "minutes": 20,
            "deps": [
              "syllabus--introduction-2-marks"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "syllabus--research-question-2-marks",
            "name": "Research Question – 2 Marks",
            "minutes": 20,
            "deps": [
              "syllabus--statement-of-purpose-2-marks"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "syllabus--methodology-3-marks",
            "name": "Methodology – 3 Marks",
            "minutes": 15,
            "deps": [
              "syllabus--research-question-2-marks"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "syllabus--data-analysis-4-marks",
            "name": "Data Analysis – 4 Marks",
            "minutes": 20,
            "deps": [
              "syllabus--methodology-3-marks"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          },
          {
            "id": "syllabus--conclusion-2-marks-15-marks-b-viva-based-on-the-project-work-05-marks5-sociology",
            "name": "Conclusion – 2 Marks 15 Marks B. Viva – based on the project work 05 Marks5 SOCIOLOGY",
            "minutes": 25,
            "deps": [
              "syllabus--data-analysis-4-marks"
            ],
            "source": {
              "pdf": "sociology",
              "page": 4
            }
          }
        ]
      },
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
        "id": "understanding-psychology",
        "name": "Understanding Psychology",
        "concepts": [
          {
            "id": "understanding-psychology--introduction",
            "name": "Introduction",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--nature-of-psychology",
            "name": "Nature of Psychology:",
            "minutes": 15,
            "deps": [
              "understanding-psychology--introduction"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--understanding-mind-and-behaviour",
            "name": "Understanding Mind and Behaviour",
            "minutes": 15,
            "deps": [
              "understanding-psychology--nature-of-psychology"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--popular-notions-about-the-discipline-of-psychology",
            "name": "Popular Notions about the Discipline of Psychology",
            "minutes": 20,
            "deps": [
              "understanding-psychology--understanding-mind-and-behaviour"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--evolution-of-psychology",
            "name": "Evolution of Psychology",
            "minutes": 15,
            "deps": [
              "understanding-psychology--popular-notions-about-the-discipline-of-psychology"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--development-of-psychology-in-india",
            "name": "Development of Psychology in India",
            "minutes": 20,
            "deps": [
              "understanding-psychology--evolution-of-psychology"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--branches-of-psychology",
            "name": "Branches of Psychology",
            "minutes": 15,
            "deps": [
              "understanding-psychology--development-of-psychology-in-india"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--psychology-and-other-disciplines",
            "name": "Psychology and Other Disciplines",
            "minutes": 15,
            "deps": [
              "understanding-psychology--branches-of-psychology"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "understanding-psychology--psychology-in-everyday-life",
            "name": "Psychology in Everyday Life",
            "minutes": 15,
            "deps": [
              "understanding-psychology--psychology-and-other-disciplines"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "methods-of-enquiry-in-psychology",
        "name": "Methods of Enquiry in Psychology",
        "concepts": [
          {
            "id": "methods-of-enquiry-in-psychology--goals-of-psychological-enquiry",
            "name": "Goals of Psychological Enquiry",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "methods-of-enquiry-in-psychology--nature-of-psychological-data",
            "name": "Nature of Psychological Data",
            "minutes": 15,
            "deps": [
              "methods-of-enquiry-in-psychology--goals-of-psychological-enquiry"
            ],
            "source": {
              "pdf": "psychology",
              "page": 2
            }
          },
          {
            "id": "methods-of-enquiry-in-psychology--some-important-methods-in-psychology",
            "name": "Some Important Methods in Psychology",
            "minutes": 20,
            "deps": [
              "methods-of-enquiry-in-psychology--nature-of-psychological-data"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "methods-of-enquiry-in-psychology--analysis-of-data",
            "name": "Analysis of Data",
            "minutes": 15,
            "deps": [
              "methods-of-enquiry-in-psychology--some-important-methods-in-psychology"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "methods-of-enquiry-in-psychology--limitations-of-psychological-enquiry",
            "name": "Limitations of Psychological Enquiry",
            "minutes": 15,
            "deps": [
              "methods-of-enquiry-in-psychology--analysis-of-data"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "methods-of-enquiry-in-psychology--ethical-issues",
            "name": "Ethical Issues",
            "minutes": 10,
            "deps": [
              "methods-of-enquiry-in-psychology--limitations-of-psychological-enquiry"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "human-development",
        "name": "Human Development",
        "concepts": [
          {
            "id": "human-development--meaning-of-development",
            "name": "Meaning of Development",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "human-development--factors-influencing-development",
            "name": "Factors Influencing Development",
            "minutes": 15,
            "deps": [
              "human-development--meaning-of-development"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "human-development--context-of-development",
            "name": "Context of Development",
            "minutes": 15,
            "deps": [
              "human-development--factors-influencing-development"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "human-development--overview-of-developmental-stages",
            "name": "Overview of Developmental Stages",
            "minutes": 15,
            "deps": [
              "human-development--context-of-development"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "sensory-attentional-and-perceptual-processes",
        "name": "Sensory, Attentional and Perceptual Processes",
        "concepts": [
          {
            "id": "sensory-attentional-and-perceptual-processes--knowing-the-world",
            "name": "Knowing the world",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--nature-and-varieties-of-stimulus",
            "name": "Nature and varieties of Stimulus",
            "minutes": 20,
            "deps": [
              "sensory-attentional-and-perceptual-processes--knowing-the-world"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--sense-modalities",
            "name": "Sense Modalities",
            "minutes": 10,
            "deps": [
              "sensory-attentional-and-perceptual-processes--nature-and-varieties-of-stimulus"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--attentional-processes",
            "name": "Attentional Processes",
            "minutes": 10,
            "deps": [
              "sensory-attentional-and-perceptual-processes--sense-modalities"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--perceptual-processes",
            "name": "Perceptual Processes",
            "minutes": 10,
            "deps": [
              "sensory-attentional-and-perceptual-processes--attentional-processes"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--the-perceiver",
            "name": "The Perceiver",
            "minutes": 10,
            "deps": [
              "sensory-attentional-and-perceptual-processes--perceptual-processes"
            ],
            "source": {
              "pdf": "psychology",
              "page": 3
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--principles-of-perceptual-organisation4",
            "name": "Principles of Perceptual Organisation4",
            "minutes": 15,
            "deps": [
              "sensory-attentional-and-perceptual-processes--the-perceiver"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--perception-of-space-depth-and-distance",
            "name": "Perception of Space, Depth and Distance",
            "minutes": 20,
            "deps": [
              "sensory-attentional-and-perceptual-processes--principles-of-perceptual-organisation4"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--perceptual-constancies",
            "name": "Perceptual Constancies",
            "minutes": 10,
            "deps": [
              "sensory-attentional-and-perceptual-processes--perception-of-space-depth-and-distance"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--illusions",
            "name": "Illusions",
            "minutes": 10,
            "deps": [
              "sensory-attentional-and-perceptual-processes--perceptual-constancies"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "sensory-attentional-and-perceptual-processes--socio-cultural-influences-on-perception",
            "name": "Socio-Cultural Influences on Perception",
            "minutes": 15,
            "deps": [
              "sensory-attentional-and-perceptual-processes--illusions"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "learning",
        "name": "Learning",
        "concepts": [
          {
            "id": "learning--nature-of-learning",
            "name": "Nature of Learning",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--paradigms-of-learning",
            "name": "Paradigms of Learning",
            "minutes": 15,
            "deps": [
              "learning--nature-of-learning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--classical-conditioning",
            "name": "Classical Conditioning",
            "minutes": 10,
            "deps": [
              "learning--paradigms-of-learning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--operant-instrumental-conditioning",
            "name": "Operant/Instrumental Conditioning",
            "minutes": 10,
            "deps": [
              "learning--classical-conditioning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--observational-learning",
            "name": "Observational Learning",
            "minutes": 10,
            "deps": [
              "learning--operant-instrumental-conditioning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--cognitive-learning",
            "name": "Cognitive Learning",
            "minutes": 10,
            "deps": [
              "learning--observational-learning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--verbal-learning",
            "name": "Verbal Learning",
            "minutes": 10,
            "deps": [
              "learning--cognitive-learning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--skill-learning",
            "name": "Skill Learning",
            "minutes": 10,
            "deps": [
              "learning--verbal-learning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--factors-facilitating-learning",
            "name": "Factors Facilitating Learning",
            "minutes": 15,
            "deps": [
              "learning--skill-learning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "learning--learning-disabilities",
            "name": "Learning Disabilities",
            "minutes": 10,
            "deps": [
              "learning--factors-facilitating-learning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "human-memory",
        "name": "Human Memory",
        "concepts": [
          {
            "id": "human-memory--nature-of-memory",
            "name": "Nature of memory",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "human-memory--information-processing-approach-the-stage-model",
            "name": "Information Processing Approach : The Stage Model",
            "minutes": 20,
            "deps": [
              "human-memory--nature-of-memory"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "human-memory--memory-systems-sensory-short-term-and-long-term-memories",
            "name": "Memory Systems : Sensory, Short-term and Long-term Memories",
            "minutes": 25,
            "deps": [
              "human-memory--information-processing-approach-the-stage-model"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "human-memory--levels-of-processing",
            "name": "Levels of Processing",
            "minutes": 15,
            "deps": [
              "human-memory--memory-systems-sensory-short-term-and-long-term-memories"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "human-memory--types-of-long-term-memory",
            "name": "Types of Long-term Memory",
            "minutes": 15,
            "deps": [
              "human-memory--levels-of-processing"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "human-memory--nature-and-causes-of-forgetting",
            "name": "Nature and Causes of Forgetting",
            "minutes": 20,
            "deps": [
              "human-memory--types-of-long-term-memory"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          },
          {
            "id": "human-memory--enhancing-memory",
            "name": "Enhancing Memory",
            "minutes": 10,
            "deps": [
              "human-memory--nature-and-causes-of-forgetting"
            ],
            "source": {
              "pdf": "psychology",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "thinking",
        "name": "Thinking",
        "concepts": [
          {
            "id": "thinking--nature-of-thinking5",
            "name": "Nature of Thinking5",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "thinking--the-processes-of-thinking",
            "name": "The Processes of Thinking",
            "minutes": 15,
            "deps": [
              "thinking--nature-of-thinking5"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "thinking--problem-solving",
            "name": "Problem Solving",
            "minutes": 10,
            "deps": [
              "thinking--the-processes-of-thinking"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "thinking--reasoning",
            "name": "Reasoning",
            "minutes": 10,
            "deps": [
              "thinking--problem-solving"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "thinking--decision-making",
            "name": "Decision-making",
            "minutes": 10,
            "deps": [
              "thinking--reasoning"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "thinking--nature-and-process-of-creative-thinking",
            "name": "Nature and Process of Creative Thinking",
            "minutes": 20,
            "deps": [
              "thinking--decision-making"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "thinking--thought-and-language",
            "name": "Thought and Language",
            "minutes": 15,
            "deps": [
              "thinking--nature-and-process-of-creative-thinking"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "thinking--development-of-language-and-language-use",
            "name": "Development of Language and Language Use",
            "minutes": 20,
            "deps": [
              "thinking--thought-and-language"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "motivation-and-emotion",
        "name": "Motivation and Emotion",
        "concepts": [
          {
            "id": "motivation-and-emotion--nature-of-motivation",
            "name": "Nature of Motivation",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "motivation-and-emotion--types-of-motives",
            "name": "Types of Motives",
            "minutes": 15,
            "deps": [
              "motivation-and-emotion--nature-of-motivation"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "motivation-and-emotion--maslows-hierarchy-of-needs",
            "name": "Maslow’s Hierarchy of Needs",
            "minutes": 15,
            "deps": [
              "motivation-and-emotion--types-of-motives"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "motivation-and-emotion--nature-of-emotions",
            "name": "Nature of Emotions",
            "minutes": 15,
            "deps": [
              "motivation-and-emotion--maslows-hierarchy-of-needs"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "motivation-and-emotion--expression-of-emotions",
            "name": "Expression of Emotions",
            "minutes": 15,
            "deps": [
              "motivation-and-emotion--nature-of-emotions"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
            }
          },
          {
            "id": "motivation-and-emotion--managing-negative-emotions",
            "name": "Managing Negative Emotions",
            "minutes": 15,
            "deps": [
              "motivation-and-emotion--expression-of-emotions"
            ],
            "source": {
              "pdf": "psychology",
              "page": 5
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
            "id": "syllabus--the-preamble",
            "name": "The Preamble",
            "minutes": 10,
            "deps": [
              "syllabus--law-is-too-vast-and-complicated-to-be-taught-in-a-non-professional-setting"
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
            "id": "lists--reverse",
            "name": "reverse()",
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
            "id": "dictionary--keys",
            "name": "keys()",
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
            "id": "dictionary--clear",
            "name": "clear()",
            "minutes": 10,
            "deps": [
              "dictionary--update"
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
            "id": "relational-data-model--relation",
            "name": "relation",
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
            "id": "data-query--between",
            "name": "BETWEEN",
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
            "id": "network-devices--switch",
            "name": "switch",
            "minutes": 10,
            "deps": [],
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
            "id": "network-topologies--mesh-introduction-to-internet",
            "name": "Mesh. Introduction to Internet",
            "minutes": 15,
            "deps": [],
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
            "id": "syllabus--create-a-data-frame-for-examination-result-and-display-row-labels-column-labels-",
            "name": "Create a data frame for examination result and display row labels, column labels data types of each column and the dimensions",
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
            "id": "syllabus--for-the-data-frames-created-above-analyze-and-plot-appropriate-charts-with-title",
            "name": "For the Data frames created above, analyze, and plot appropriate charts with title and legend",
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
            "id": "syllabus--write-a-sql-query-to-order-the-student-id-marks-table-in-descending-order-of-the",
            "name": "Write a SQL query to order the (student ID, marks) table in descending order of the marks",
            "minutes": 25,
            "deps": [
              "syllabus--use-the-select-command-to-get-the-details-of-the-students-with-marks-more-than-8"
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
            "id": "load--techniques",
            "name": "Techniques",
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
        "id": "course-structure",
        "name": "Course Structure",
        "concepts": [
          {
            "id": "course-structure--70-marks",
            "name": "70 Marks",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "time",
        "name": "Time",
        "concepts": [
          {
            "id": "time--30-marks",
            "name": "30 Marks",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "unit-iii",
        "name": "Unit III",
        "concepts": [
          {
            "id": "unit-iii--understating-family",
            "name": "Understating family",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 4
            }
          },
          {
            "id": "unit-iii--a-nutrition",
            "name": "A. Nutrition",
            "minutes": 10,
            "deps": [
              "unit-iii--understating-family"
            ],
            "source": {
              "pdf": "home-science",
              "page": 4
            }
          },
          {
            "id": "unit-iii--health-and-hygiene-b-resources-availability-and-management",
            "name": "Health and Hygiene B. Resources Availability and Management",
            "minutes": 25,
            "deps": [
              "unit-iii--a-nutrition"
            ],
            "source": {
              "pdf": "home-science",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "chapter",
        "name": "CHAPTER",
        "concepts": [
          {
            "id": "chapter--nutrition",
            "name": "NUTRITION",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 6
            }
          },
          {
            "id": "chapter--health-and-fitness",
            "name": "HEALTH AND FITNESS",
            "minutes": 15,
            "deps": [
              "chapter--nutrition"
            ],
            "source": {
              "pdf": "home-science",
              "page": 6
            }
          },
          {
            "id": "chapter--management-of-resources",
            "name": "MANAGEMENT OF RESOURCES",
            "minutes": 15,
            "deps": [
              "chapter--health-and-fitness"
            ],
            "source": {
              "pdf": "home-science",
              "page": 6
            }
          },
          {
            "id": "chapter--concerns-and-needs-in-diverse-contexts",
            "name": "CONCERNS AND NEEDS IN DIVERSE CONTEXTS",
            "minutes": 20,
            "deps": [
              "chapter--management-of-resources"
            ],
            "source": {
              "pdf": "home-science",
              "page": 8
            }
          },
          {
            "id": "chapter--health-and-well-being",
            "name": "HEALTH AND WELL-BEING",
            "minutes": 15,
            "deps": [
              "chapter--concerns-and-needs-in-diverse-contexts"
            ],
            "source": {
              "pdf": "home-science",
              "page": 9
            }
          },
          {
            "id": "chapter--financial-management-and-planning",
            "name": "FINANCIAL MANAGEMENT AND PLANNING",
            "minutes": 15,
            "deps": [
              "chapter--health-and-well-being"
            ],
            "source": {
              "pdf": "home-science",
              "page": 10
            }
          },
          {
            "id": "chapter--care-and-maintenance-of-fabrics",
            "name": "CARE AND MAINTENANCE OF FABRICS",
            "minutes": 20,
            "deps": [
              "chapter--financial-management-and-planning"
            ],
            "source": {
              "pdf": "home-science",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "unit-iii",
        "name": "UNIT III",
        "concepts": [
          {
            "id": "unit-iii--understanding-family",
            "name": "UNDERSTANDING FAMILY",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 8
            }
          },
          {
            "id": "unit-iii--community-and-society",
            "name": "COMMUNITY AND SOCIETY",
            "minutes": 15,
            "deps": [
              "unit-iii--understanding-family"
            ],
            "source": {
              "pdf": "home-science",
              "page": 8
            }
          }
        ]
      },
      {
        "id": "prescribed-textbook",
        "name": "Prescribed textbook",
        "concepts": [
          {
            "id": "prescribed-textbook--part-i-and-part-ii",
            "name": "Part I and Part II",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--introduction-to-home-science-02",
            "name": "Introduction to Home Science 02",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--understanding-oneself-adolescence-23",
            "name": "Understanding oneself: Adolescence 23",
            "minutes": 15,
            "deps": [
              "syllabus--introduction-to-home-science-02"
            ],
            "source": {
              "pdf": "home-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--understanding-family-community-and-society-15",
            "name": "Understanding Family, Community and Society 15",
            "minutes": 20,
            "deps": [
              "syllabus--understanding-oneself-adolescence-23"
            ],
            "source": {
              "pdf": "home-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--childhood-15",
            "name": "Childhood 15",
            "minutes": 10,
            "deps": [
              "syllabus--understanding-family-community-and-society-15"
            ],
            "source": {
              "pdf": "home-science",
              "page": 3
            }
          },
          {
            "id": "syllabus--adulthood-15-theory-70-practical-30-grand-total-1004-class-xi",
            "name": "Adulthood 15 Theory 70 Practical 30 Grand Total 1004 Class XI",
            "minutes": 25,
            "deps": [
              "syllabus--childhood-15"
            ],
            "source": {
              "pdf": "home-science",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "understanding-oneself-with-reference-to",
        "name": "Understanding oneself with reference to:",
        "concepts": [
          {
            "id": "understanding-oneself-with-reference-to--observe-developmental-norms-physical-motor-language-social-and-emotional-birth-t",
            "name": "Observe developmental norms: (Physical, Motor, Language, Social and Emotional) birth to three years",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "home-science",
              "page": 12
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--preparation-of-different-healthy-snacks-for-an-adolescent",
            "name": "Preparation of different healthy snacks for an adolescent",
            "minutes": 25,
            "deps": [
              "understanding-oneself-with-reference-to--observe-developmental-norms-physical-motor-language-social-and-emotional-birth-t"
            ],
            "source": {
              "pdf": "home-science",
              "page": 12
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--plan-a-budget-for-a-given-situation-purpose",
            "name": "Plan a budget for a given situation/purpose",
            "minutes": 20,
            "deps": [
              "understanding-oneself-with-reference-to--preparation-of-different-healthy-snacks-for-an-adolescent"
            ],
            "source": {
              "pdf": "home-science",
              "page": 12
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--preparation-of-healthy-snacks-for-an-adolescent-7",
            "name": "Preparation of healthy snacks for an adolescent. 7",
            "minutes": 25,
            "deps": [
              "understanding-oneself-with-reference-to--plan-a-budget-for-a-given-situation-purpose"
            ],
            "source": {
              "pdf": "home-science",
              "page": 13
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--plan-a-budget-for-a-given-situation-purpose-3",
            "name": "Plan a budget for a given situation/purpose. 3",
            "minutes": 25,
            "deps": [
              "understanding-oneself-with-reference-to--preparation-of-healthy-snacks-for-an-adolescent-7"
            ],
            "source": {
              "pdf": "home-science",
              "page": 13
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--prepare-a-time-plan-for-yourself-3",
            "name": "Prepare a time plan for yourself. 3",
            "minutes": 20,
            "deps": [
              "understanding-oneself-with-reference-to--plan-a-budget-for-a-given-situation-purpose-3"
            ],
            "source": {
              "pdf": "home-science",
              "page": 13
            }
          },
          {
            "id": "understanding-oneself-with-reference-to--file-work-5",
            "name": "File Work 5",
            "minutes": 15,
            "deps": [
              "understanding-oneself-with-reference-to--prepare-a-time-plan-for-yourself-3"
            ],
            "source": {
              "pdf": "home-science",
              "page": 13
            }
          }
        ]
      }
    ]
  }
]
