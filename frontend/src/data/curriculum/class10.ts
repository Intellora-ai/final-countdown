/* GENERATED FILE — do not edit by hand.
 *
 * Built by frontend/scripts/curriculum/build.mjs from the official CBSE 2026-27
 * syllabus documents recorded in data/curriculum-sources.lock.json.
 * Re-generate with: npm run curriculum:build
 *
 * Class 10: 9 subjects, 820 concepts.
 *
 * Every concept carries the pdf and page it was read from. Every "minutes"
 * value is an ESTIMATE derived from the concept's wording, not a figure the
 * document states.
 */

import type { Subject } from '../../types'

export const CLASS_10: Subject[] = [
  {
    "id": "mathematics",
    "name": "Mathematics",
    "chapters": [
      {
        "id": "real-numbers",
        "name": "REAL NUMBERS",
        "concepts": [
          {
            "id": "real-numbers--fundamental-theorem-of-arithmetic-statements-after-reviewing-work-done-earlier-a",
            "name": "Fundamental Theorem of Arithmetic - statements after reviewing work done earlier and after illustrating and motivating through examples",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 3
            }
          },
          {
            "id": "real-numbers--proofs-of-irrationality-of",
            "name": "Proofs of irrationality of",
            "minutes": 15,
            "deps": [
              "real-numbers--fundamental-theorem-of-arithmetic-statements-after-reviewing-work-done-earlier-a"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "polynomials",
        "name": "POLYNOMIALS",
        "concepts": [
          {
            "id": "polynomials--zeros-of-a-polynomial",
            "name": "Zeros of a polynomial",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 3
            }
          },
          {
            "id": "polynomials--relationship-between-zeros-and-coefficients-of-quadratic-polynomials",
            "name": "Relationship between zeros and coefficients of quadratic polynomials",
            "minutes": 25,
            "deps": [
              "polynomials--zeros-of-a-polynomial"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 3
            }
          },
          {
            "id": "polynomials--pair-of-linear-equations-in-two-variables-and-graphical-method-of-their-solution",
            "name": "Pair of linear equations in two variables and graphical method of their solution, consistency/inconsistency",
            "minutes": 25,
            "deps": [
              "polynomials--relationship-between-zeros-and-coefficients-of-quadratic-polynomials"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          },
          {
            "id": "polynomials--algebraic-conditions-for-number-of-solutions",
            "name": "Algebraic conditions for number of solutions",
            "minutes": 20,
            "deps": [
              "polynomials--pair-of-linear-equations-in-two-variables-and-graphical-method-of-their-solution"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          },
          {
            "id": "polynomials--solution-of-a-pair-of-linear-equations-in-two-variables-algebraically-by-substit",
            "name": "Solution of a pair of linear equations in two variables algebraically - by substitution, by elimination. Simple situational problems",
            "minutes": 25,
            "deps": [
              "polynomials--algebraic-conditions-for-number-of-solutions"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "quadratic-equations",
        "name": "QUADRATIC EQUATIONS",
        "concepts": [
          {
            "id": "quadratic-equations--standard-form-of-a-quadratic-equation-2",
            "name": "Standard form of a quadratic equation 𝑎𝑥2",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          },
          {
            "id": "quadratic-equations--solutions-of-quadratic-equations-only-real-roots-by-factorization-and-by-using-q",
            "name": "Solutions of quadratic equations (only real roots) by factorization, and by using quadratic formula. Relationship between discriminant and nature of roots",
            "minutes": 25,
            "deps": [
              "quadratic-equations--standard-form-of-a-quadratic-equation-2"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          },
          {
            "id": "quadratic-equations--situational-problems-based-on-quadratic-equations-related-to-day-to-day-activiti",
            "name": "Situational problems based on quadratic equations related to day-to-day activities to be incorporated",
            "minutes": 25,
            "deps": [
              "quadratic-equations--solutions-of-quadratic-equations-only-real-roots-by-factorization-and-by-using-q"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "arithmetic-progressions",
        "name": "ARITHMETIC PROGRESSIONS",
        "concepts": [
          {
            "id": "arithmetic-progressions--motivation-for-studying-arithmetic-progression",
            "name": "Motivation for studying Arithmetic Progression",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          },
          {
            "id": "arithmetic-progressions--derivation-of-the-nth-term-and-sum-of-the-first-n-terms-of-ap-and-their-applicat",
            "name": "Derivation of the nth term and sum of the first n terms of AP and their application in solving daily life problems",
            "minutes": 25,
            "deps": [
              "arithmetic-progressions--motivation-for-studying-arithmetic-progression"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 4
            }
          },
          {
            "id": "arithmetic-progressions--coordinate-geometry",
            "name": "Coordinate Geometry",
            "minutes": 10,
            "deps": [
              "arithmetic-progressions--derivation-of-the-nth-term-and-sum-of-the-first-n-terms-of-ap-and-their-applicat"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 5
            }
          },
          {
            "id": "arithmetic-progressions--review-concepts-of-coordinate-geometry-distance-formula-section-formula-internal",
            "name": "Review: Concepts of coordinate geometry. Distance formula. Section formula (internal division)",
            "minutes": 25,
            "deps": [
              "arithmetic-progressions--coordinate-geometry"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "triangles",
        "name": "TRIANGLES",
        "concepts": [
          {
            "id": "triangles--state-without-proof-if-a-line-divides-two-sides-of-a-triangle-in-the-same-ratio-",
            "name": "State (without proof) If a line divides two sides of a triangle in the same ratio, the line is parallel to the third side",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 5
            }
          },
          {
            "id": "triangles--state-without-proof-if-in-two-triangles-the-corresponding-angles-are-equal-their",
            "name": "State (without proof) If in two triangles, the corresponding angles are equal, their corresponding sides are proportional and the triangles are similar",
            "minutes": 25,
            "deps": [
              "triangles--state-without-proof-if-a-line-divides-two-sides-of-a-triangle-in-the-same-ratio-"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 5
            }
          },
          {
            "id": "triangles--state-without-proof-if-the-corresponding-sides-of-two-triangles-are-proportional",
            "name": "State (without proof) If the corresponding sides of two triangles are proportional, their corresponding angles are equal and the two triangles are similar",
            "minutes": 25,
            "deps": [
              "triangles--state-without-proof-if-in-two-triangles-the-corresponding-angles-are-equal-their"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 5
            }
          },
          {
            "id": "triangles--prove-the-tangent-at-any-point-of-a-circle-is-perpendicular-to-the-radius-throug",
            "name": "(Prove) The tangent at any point of a circle is perpendicular to the radius through the point of contact",
            "minutes": 25,
            "deps": [
              "triangles--state-without-proof-if-the-corresponding-sides-of-two-triangles-are-proportional"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 6
            }
          },
          {
            "id": "triangles--prove-the-lengths-of-tangents-drawn-from-an-external-point-to-a-circle-are-equal",
            "name": "(Prove) The lengths of tangents drawn from an external point to a circle are equal",
            "minutes": 25,
            "deps": [
              "triangles--prove-the-tangent-at-any-point-of-a-circle-is-perpendicular-to-the-radius-throug"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "introduction-to-trigonometry",
        "name": "INTRODUCTION TO TRIGONOMETRY",
        "concepts": [
          {
            "id": "introduction-to-trigonometry--trigonometric-ratios-of-an-acute-angle-of-a-right-angled-triangle-proof-of-their",
            "name": "Trigonometric ratios of an acute angle of a right-angled triangle. Proof of their existence (well defined)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 6
            }
          },
          {
            "id": "introduction-to-trigonometry--motivate-the-ratios-whichever-are-defined-at-0-and-90-values-of-the-trigonometri",
            "name": "Motivate the ratios whichever are defined at 0° and 90°. Values of the trigonometric ratios of 30°, 45° and 60°",
            "minutes": 25,
            "deps": [
              "introduction-to-trigonometry--trigonometric-ratios-of-an-acute-angle-of-a-right-angled-triangle-proof-of-their"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 6
            }
          },
          {
            "id": "introduction-to-trigonometry--relationships-between-the-ratios",
            "name": "Relationships between the ratios",
            "minutes": 15,
            "deps": [
              "introduction-to-trigonometry--motivate-the-ratios-whichever-are-defined-at-0-and-90-values-of-the-trigonometri"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "trigonometric-identities",
        "name": "TRIGONOMETRIC IDENTITIES",
        "concepts": [
          {
            "id": "trigonometric-identities--proof-and-applications-of-the-identity-sin2-a-cos2-a-1",
            "name": "Proof and applications of the identity sin2 A + cos2 A = 1",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 6
            }
          },
          {
            "id": "trigonometric-identities--only-simple-identities-to-be-given",
            "name": "Only simple identities to be given",
            "minutes": 20,
            "deps": [
              "trigonometric-identities--proof-and-applications-of-the-identity-sin2-a-cos2-a-1"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "areas-related-to-circles",
        "name": "AREAS RELATED TO CIRCLES",
        "concepts": [
          {
            "id": "areas-related-to-circles--area-of-sectors-and-segments-of-a-circle",
            "name": "Area of sectors and segments of a circle",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 7
            }
          },
          {
            "id": "areas-related-to-circles--problems-based-on-areas-and-perimeter",
            "name": "Problems based on areas and perimeter",
            "minutes": 20,
            "deps": [
              "areas-related-to-circles--area-of-sectors-and-segments-of-a-circle"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "surface-areas-and-volumes",
        "name": "SURFACE AREAS AND VOLUMES",
        "concepts": [
          {
            "id": "surface-areas-and-volumes--surface-areas-and-volumes-of-combinations-of-any-two-of-the-following-cubes-cubo",
            "name": "Surface areas and volumes of combinations of any two of the following: cubes, cuboids, spheres, hemispheres and right circular cylinders/cones",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "statistics",
        "name": "STATISTICS",
        "concepts": [
          {
            "id": "statistics--mean-median-and-mode-of-grouped-data-bimodal-situation-to-be-avoided",
            "name": "Mean, median and mode of grouped data (bimodal situation to be avoided)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "probability",
        "name": "PROBABILITY",
        "concepts": [
          {
            "id": "probability--classical-definition-of-probability",
            "name": "Classical definition of probability",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "maths-x",
              "page": 7
            }
          },
          {
            "id": "probability--simple-problems-on-finding-the-probability-of-an-event",
            "name": "Simple problems on finding the probability of an event",
            "minutes": 25,
            "deps": [
              "probability--classical-definition-of-probability"
            ],
            "source": {
              "pdf": "maths-x",
              "page": 7
            }
          }
        ]
      }
    ]
  },
  {
    "id": "mathematics-at-advanced-level",
    "name": "Mathematics at Advanced Level",
    "chapters": [
      {
        "id": "example-1",
        "name": "Example 1",
        "concepts": [
          {
            "id": "example-1--whose-first-term-is-3-and-common-difference-is-4",
            "name": "whose first term is –3 and common difference is 4",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 5
            }
          },
          {
            "id": "example-1--find-x-and-y",
            "name": "find x and y",
            "minutes": 15,
            "deps": [
              "example-1--whose-first-term-is-3-and-common-difference-is-4"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 42
            }
          },
          {
            "id": "example-1--let-us-take-a-point-p",
            "name": "Let us take a point P",
            "minutes": 20,
            "deps": [
              "example-1--find-x-and-y"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 60
            }
          },
          {
            "id": "example-1--positioned-in-quadrant-ii",
            "name": "positioned in Quadrant II",
            "minutes": 15,
            "deps": [
              "example-1--let-us-take-a-point-p"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 60
            }
          },
          {
            "id": "example-1--having-coordinates-p-2-3-now-p-takes-two-jumps-as-follows",
            "name": "having coordinates P(–2, 3). Now P takes two jumps as follows:",
            "minutes": 25,
            "deps": [
              "example-1--positioned-in-quadrant-ii"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 60
            }
          },
          {
            "id": "example-1--find-the-sum-upto-n-terms-of-the-sequence-3",
            "name": "Find the sum upto n terms of the sequence 3",
            "minutes": 25,
            "deps": [
              "example-1--having-coordinates-p-2-3-now-p-takes-two-jumps-as-follows"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 88
            }
          }
        ]
      },
      {
        "id": "solution",
        "name": "Solution",
        "concepts": [
          {
            "id": "solution--the-set-of-all-elements-x-such-that-x-is-a-vowel-of-the-english-alphabet",
            "name": "“the set of all elements x such that x is a vowel of the English alphabet",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 5
            }
          },
          {
            "id": "solution--how-many-elements-does-the-set-contains",
            "name": "how many elements does the set contains",
            "minutes": 20,
            "deps": [
              "solution--the-set-of-all-elements-x-such-that-x-is-a-vowel-of-the-english-alphabet"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 7
            }
          },
          {
            "id": "solution--6-or-3-in-fact",
            "name": "6 or 3. In fact",
            "minutes": 20,
            "deps": [
              "solution--how-many-elements-does-the-set-contains"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 7
            }
          },
          {
            "id": "solution--it-is-not-an-empty-set-ii-since-a-composite-number-has-more-than-two-factors",
            "name": "It is not an empty set. (ii) Since a composite number has more than two factors",
            "minutes": 25,
            "deps": [
              "solution--6-or-3-in-fact"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 8
            }
          },
          {
            "id": "solution--since-the-power-set-of-a-is-again-a-set-containing-all-its-subsets",
            "name": "Since the power set of A is again a set containing all its subsets",
            "minutes": 25,
            "deps": [
              "solution--it-is-not-an-empty-set-ii-since-a-composite-number-has-more-than-two-factors"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 11
            }
          },
          {
            "id": "solution--we-denote-it-by-p-a",
            "name": "we denote it by P(A)",
            "minutes": 20,
            "deps": [
              "solution--since-the-power-set-of-a-is-again-a-set-containing-all-its-subsets"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 11
            }
          },
          {
            "id": "solution--since-a-b-consists-of-all-the-elements-of-a-as-well-as-b-hence",
            "name": "Since A B consists of all the elements of A as well as B. Hence",
            "minutes": 25,
            "deps": [
              "solution--we-denote-it-by-p-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 13
            }
          },
          {
            "id": "solution--since-a-b-consists-of-elements-that-are-common-to-a-and-b-hence",
            "name": "Since A  B consists of elements that are common to A and B. Hence",
            "minutes": 25,
            "deps": [
              "solution--since-a-b-consists-of-all-the-elements-of-a-as-well-as-b-hence"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 14
            }
          },
          {
            "id": "solution--since",
            "name": "Since",
            "minutes": 10,
            "deps": [
              "solution--since-a-b-consists-of-elements-that-are-common-to-a-and-b-hence"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 15
            }
          },
          {
            "id": "solution--denoted-by-a-b-is-the-set-containing-elements-which-are-in-a-but-not-in-b-symbol",
            "name": "denoted by A – B is the set containing elements which are in A but not in B. Symbolically",
            "minutes": 25,
            "deps": [
              "solution--since"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 15
            }
          },
          {
            "id": "solution--representing-given-sets-by-venn-diagram-we-get",
            "name": "Representing given sets by Venn diagram we get",
            "minutes": 25,
            "deps": [
              "solution--denoted-by-a-b-is-the-set-containing-elements-which-are-in-a-but-not-in-b-symbol"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 17
            }
          },
          {
            "id": "solution--we-know-that",
            "name": "We know that",
            "minutes": 15,
            "deps": [
              "solution--representing-given-sets-by-venn-diagram-we-get"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 19
            }
          },
          {
            "id": "solution--let-a",
            "name": "Let A",
            "minutes": 10,
            "deps": [
              "solution--we-know-that"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 21
            }
          },
          {
            "id": "solution--b-and-c-represent-the-sets-of-consumers-who-rated-5-stars-to-the-shampoos-a",
            "name": "B and C represent the sets of consumers who rated 5-stars to the shampoos A",
            "minutes": 25,
            "deps": [
              "solution--let-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 21
            }
          },
          {
            "id": "solution--such-as-the-richter-scale-for-measuring-the-magnitude-of-earthquakes",
            "name": "such as the Richter scale for measuring the magnitude of earthquakes",
            "minutes": 25,
            "deps": [
              "solution--b-and-c-represent-the-sets-of-consumers-who-rated-5-stars-to-the-shampoos-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 31
            }
          },
          {
            "id": "solution--using-the-product-rule",
            "name": "Using the product rule",
            "minutes": 15,
            "deps": [
              "solution--such-as-the-richter-scale-for-measuring-the-magnitude-of-earthquakes"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 37
            }
          },
          {
            "id": "solution--since-the-ordered-pairs-are-equal",
            "name": "Since the ordered pairs are equal",
            "minutes": 20,
            "deps": [
              "solution--using-the-product-rule"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 42
            }
          },
          {
            "id": "solution--equating-their-abscissas-and-ordinates",
            "name": "equating their abscissas and ordinates",
            "minutes": 20,
            "deps": [
              "solution--since-the-ordered-pairs-are-equal"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 42
            }
          },
          {
            "id": "solution--the-ordered-pairs-of-a-b-having-first-element-less-than-the-second-element-are-1",
            "name": "The ordered pairs of A × B having first element less than the second element are (1, 4)",
            "minutes": 25,
            "deps": [
              "solution--equating-their-abscissas-and-ordinates"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 43
            }
          },
          {
            "id": "solution--taking-x-coordinates-we-get",
            "name": "Taking x coordinates we get",
            "minutes": 20,
            "deps": [
              "solution--the-ordered-pairs-of-a-b-having-first-element-less-than-the-second-element-are-1"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 44
            }
          },
          {
            "id": "solution--in-roster-form",
            "name": "In roster form",
            "minutes": 15,
            "deps": [
              "solution--taking-x-coordinates-we-get"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 45
            }
          },
          {
            "id": "solution--far-beyond-anything-we-encounter-in-everyday-counting",
            "name": "far beyond anything we encounter in everyday counting",
            "minutes": 25,
            "deps": [
              "solution--in-roster-form"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 45
            }
          },
          {
            "id": "solution--odd-even-and-even-odd-s-so",
            "name": "(odd, even) and (even, odd)  S. So",
            "minutes": 25,
            "deps": [
              "solution--far-beyond-anything-we-encounter-in-everyday-counting"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 45
            }
          },
          {
            "id": "solution--both-domain-and-range-of-the-relation-s-are-the-set-of-integers-z",
            "name": "both domain and range of the relation S are the set of integers Z",
            "minutes": 25,
            "deps": [
              "solution--odd-even-and-even-odd-s-so"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 45
            }
          },
          {
            "id": "solution--a-since",
            "name": "(a) Since",
            "minutes": 10,
            "deps": [
              "solution--both-domain-and-range-of-the-relation-s-are-the-set-of-integers-z"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 50
            }
          },
          {
            "id": "solution--let-us-fill-the-tables",
            "name": "Let us fill the tables",
            "minutes": 20,
            "deps": [
              "solution--a-since"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 55
            }
          },
          {
            "id": "solution--the-coordinates-must-be-m-8-6-therefore",
            "name": "the coordinates must be M (–8, 6). Therefore",
            "minutes": 25,
            "deps": [
              "solution--let-us-fill-the-tables"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 61
            }
          },
          {
            "id": "solution--reflecting-a-k-3-in-the-y-axis-negates-the-x-coordinate",
            "name": "Reflecting A (k, 3) in the y-axis negates the x-coordinate",
            "minutes": 25,
            "deps": [
              "solution--the-coordinates-must-be-m-8-6-therefore"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 61
            }
          },
          {
            "id": "solution--let-us-analyze-slope-first-slope",
            "name": "Let us analyze slope first. Slope",
            "minutes": 20,
            "deps": [
              "solution--reflecting-a-k-3-in-the-y-axis-negates-the-x-coordinate"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 66
            }
          },
          {
            "id": "solution--m-since-a-is-positive-and-b-is-b-a-a-negative",
            "name": "m  . Since A is positive and B is B A A negative",
            "minutes": 25,
            "deps": [
              "solution--let-us-analyze-slope-first-slope"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 66
            }
          },
          {
            "id": "solution--is-negative-therefore",
            "name": "is negative. Therefore",
            "minutes": 15,
            "deps": [
              "solution--m-since-a-is-positive-and-b-is-b-a-a-negative"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 66
            }
          },
          {
            "id": "solution--m-becomes-positive-b-b-the-line-goes-uphill-c-now",
            "name": "m  becomes positive. B B The line goes uphill. C Now",
            "minutes": 25,
            "deps": [
              "solution--is-negative-therefore"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 66
            }
          },
          {
            "id": "solution--b-y-intercept-becomes-positive-the-line-crosses-the-upper-half-of-the-y-axis-c-f",
            "name": "B y-intercept becomes positive. The line crosses the upper half of the y-axis. C Further",
            "minutes": 25,
            "deps": [
              "solution--m-becomes-positive-b-b-the-line-goes-uphill-c-now"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 66
            }
          },
          {
            "id": "solution--the-positive-y-axis",
            "name": "the positive y-axis",
            "minutes": 15,
            "deps": [
              "solution--b-y-intercept-becomes-positive-the-line-crosses-the-upper-half-of-the-y-axis-c-f"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 66
            }
          },
          {
            "id": "solution--slope-of-the-line",
            "name": "slope of the line",
            "minutes": 15,
            "deps": [
              "solution--the-positive-y-axis"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 68
            }
          },
          {
            "id": "solution--m-and-since-line-passes-through-the-point-2-0-2-means-y-intercept",
            "name": "m  and since line passes through the point 2 (0, –2) means y-intercept",
            "minutes": 25,
            "deps": [
              "solution--slope-of-the-line"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 68
            }
          },
          {
            "id": "solution--required-equation-of-the-line-is-y-x-2-2",
            "name": "required equation of the line is y  x  2. 2",
            "minutes": 25,
            "deps": [
              "solution--m-and-since-line-passes-through-the-point-2-0-2-means-y-intercept"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 68
            }
          },
          {
            "id": "solution--opposite-in-sign-means-if-the-x-intercept-is-a",
            "name": "opposite in sign means if the x-intercept is a",
            "minutes": 25,
            "deps": [
              "solution--required-equation-of-the-line-is-y-x-2-2"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 70
            }
          },
          {
            "id": "solution--equation-of-the-line-is-1-x-y-a-a-a-since",
            "name": "equation of the line is  1  xy  a a a Since",
            "minutes": 25,
            "deps": [
              "solution--opposite-in-sign-means-if-the-x-intercept-is-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 70
            }
          },
          {
            "id": "solution--line-passes-through-4-5-so-this-point-must-satisfies-the-equation-of-line",
            "name": "line passes through (–4, 5) so this point must satisfies the equation of line",
            "minutes": 25,
            "deps": [
              "solution--equation-of-the-line-is-1-x-y-a-a-a-since"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 70
            }
          },
          {
            "id": "solution--let-the-equation-of-required-line-be-1-a-b-it-is-given-that",
            "name": "Let the equation of required line be  1 a b It is given that",
            "minutes": 25,
            "deps": [
              "solution--line-passes-through-4-5-so-this-point-must-satisfies-the-equation-of-line"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          },
          {
            "id": "solution--we-get-x",
            "name": "we get x ",
            "minutes": 15,
            "deps": [
              "solution--let-the-equation-of-required-line-be-1-a-b-it-is-given-that"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          },
          {
            "id": "solution--the-standard-equation-is-always-satisfied-if-x",
            "name": "the standard equation is always satisfied if x ",
            "minutes": 25,
            "deps": [
              "solution--we-get-x"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          },
          {
            "id": "solution--5-5-2-3-regardless-of-what-a-and-b-are-therefore",
            "name": "5 5 2 3 regardless of what a and b are. Therefore",
            "minutes": 25,
            "deps": [
              "solution--the-standard-equation-is-always-satisfied-if-x"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          },
          {
            "id": "solution--fixed-point-is",
            "name": "fixed point is ",
            "minutes": 15,
            "deps": [
              "solution--5-5-2-3-regardless-of-what-a-and-b-are-therefore"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          },
          {
            "id": "solution--by-the-fundamental-principle-of-multiplication",
            "name": "by the fundamental principle of multiplication",
            "minutes": 20,
            "deps": [
              "solution--fixed-point-is"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 76
            }
          },
          {
            "id": "solution--the-screen-size-in-2-ways",
            "name": "the screen size in 2 ways",
            "minutes": 20,
            "deps": [
              "solution--by-the-fundamental-principle-of-multiplication"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 76
            }
          },
          {
            "id": "solution--the-student-must-answer-question-1",
            "name": "The student must answer question 1",
            "minutes": 20,
            "deps": [
              "solution--the-screen-size-in-2-ways"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 76
            }
          },
          {
            "id": "solution--question-2",
            "name": "question 2",
            "minutes": 10,
            "deps": [
              "solution--the-student-must-answer-question-1"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 76
            }
          },
          {
            "id": "solution--the-student-joins-a-sports-club-or-a-music-club-or-a-debate-club-exactly-one",
            "name": "The student joins a sports club OR a music club OR a debate club — exactly one",
            "minutes": 25,
            "deps": [
              "solution--question-2"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 76
            }
          },
          {
            "id": "solution--here",
            "name": "Here",
            "minutes": 10,
            "deps": [
              "solution--the-student-joins-a-sports-club-or-a-music-club-or-a-debate-club-exactly-one"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 79
            }
          },
          {
            "id": "solution--we-observe-that-each-term-can-be-written-as",
            "name": "we observe that each term can be written as",
            "minutes": 25,
            "deps": [
              "solution--here"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 79
            }
          },
          {
            "id": "solution--each-term-of-the-given-expression-can-be-written-as-difference-of-two-factorials",
            "name": "each term of the given expression can be written as difference of two factorials",
            "minutes": 25,
            "deps": [
              "solution--we-observe-that-each-term-can-be-written-as"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 79
            }
          },
          {
            "id": "solution--we-select-and-arrange-3-members-for-distinct-roles-since-the-roles-are-different",
            "name": "We select and arrange 3 members for distinct roles. Since the roles are different",
            "minutes": 25,
            "deps": [
              "solution--each-term-of-the-given-expression-can-be-written-as-difference-of-two-factorials"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--the-order-of-selection-matters-so",
            "name": "the order of selection matters. So",
            "minutes": 20,
            "deps": [
              "solution--we-select-and-arrange-3-members-for-distinct-roles-since-the-roles-are-different"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--for-the-number-to-be-greater-than-7000",
            "name": "For the number to be greater than 7000",
            "minutes": 25,
            "deps": [
              "solution--the-order-of-selection-matters-so"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--the-thousands-digit-must-be-7",
            "name": "the thousands digit must be 7",
            "minutes": 20,
            "deps": [
              "solution--for-the-number-to-be-greater-than-7000"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--let-us-consider-the-3-science-books-as-one-single-block-now-we-have",
            "name": "Let us consider the 3 Science books as one single block. Now we have",
            "minutes": 25,
            "deps": [
              "solution--the-thousands-digit-must-be-7"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--we-have-to-arrange-total-5-units-now",
            "name": "we have to arrange total 5 units. Now",
            "minutes": 25,
            "deps": [
              "solution--let-us-consider-the-3-science-books-as-one-single-block-now-we-have"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--the-5-units-can-be-arranged-in-a-row-in-5-ways-i-e",
            "name": "the 5 units can be arranged in a row in 5! ways i.e",
            "minutes": 25,
            "deps": [
              "solution--we-have-to-arrange-total-5-units-now"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--120-ways-now",
            "name": "120 ways. Now",
            "minutes": 15,
            "deps": [
              "solution--the-5-units-can-be-arranged-in-a-row-in-5-ways-i-e"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--the-3-science-books-within-their-block-can-themselves-be-arranged-in-3-ways-i-e",
            "name": "the 3 Science books within their block can themselves be arranged in 3! ways i.e",
            "minutes": 25,
            "deps": [
              "solution--120-ways-now"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--6-ways-by-the-fundamental-principle-of-multiplication",
            "name": "6 ways.  By the Fundamental Principle of Multiplication",
            "minutes": 25,
            "deps": [
              "solution--the-3-science-books-within-their-block-can-themselves-be-arranged-in-3-ways-i-e"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--720-ways",
            "name": "720 ways",
            "minutes": 10,
            "deps": [
              "solution--6-ways-by-the-fundamental-principle-of-multiplication"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "solution--since-the-order-of-selection-of-members-does-not-matter-in-the-formation-of-a-co",
            "name": "Since the order of selection of members does not matter in the formation of a committee",
            "minutes": 25,
            "deps": [
              "solution--720-ways"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 83
            }
          },
          {
            "id": "solution--since-the-order-of-selection-of-questions-does-not-matter",
            "name": "Since the order of selection of questions does not matter",
            "minutes": 25,
            "deps": [
              "solution--since-the-order-of-selection-of-members-does-not-matter-in-the-formation-of-a-co"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 83
            }
          },
          {
            "id": "solution--the-required-number-of-ways-is-120",
            "name": "the required number of ways is 120",
            "minutes": 20,
            "deps": [
              "solution--since-the-order-of-selection-of-questions-does-not-matter"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 83
            }
          },
          {
            "id": "solution--therefore-it-is-a-gp",
            "name": "therefore it is a GP",
            "minutes": 20,
            "deps": [
              "solution--the-required-number-of-ways-is-120"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 88
            }
          },
          {
            "id": "solution--0-25-cm-in-the-second",
            "name": "0.25 cm in the second",
            "minutes": 20,
            "deps": [
              "solution--therefore-it-is-a-gp"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 89
            }
          },
          {
            "id": "solution--he-then",
            "name": "… . He then",
            "minutes": 15,
            "deps": [
              "solution--0-25-cm-in-the-second"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 89
            }
          },
          {
            "id": "solution--let-us-check-the-differences-of-consecutive-terms-t2-t1-4",
            "name": "Let us check the differences of consecutive terms. t2  t1  4",
            "minutes": 25,
            "deps": [
              "solution--he-then"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 94
            }
          },
          {
            "id": "solution--the-sequence-is-3",
            "name": "The sequence is 3",
            "minutes": 15,
            "deps": [
              "solution--let-us-check-the-differences-of-consecutive-terms-t2-t1-4"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 96
            }
          }
        ]
      },
      {
        "id": "example-2",
        "name": "Example 2",
        "concepts": [
          {
            "id": "example-2--write-the-following-sets-in-the-set-builder-form",
            "name": "Write the following sets in the set-builder form:",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 5
            }
          },
          {
            "id": "example-2--find-the-sum-upto-n-terms-of-the-sequence-0-3",
            "name": "Find the sum upto n terms of the sequence 0.3",
            "minutes": 25,
            "deps": [
              "example-2--write-the-following-sets-in-the-set-builder-form"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 89
            }
          }
        ]
      },
      {
        "id": "roster-form",
        "name": "Roster Form",
        "concepts": [
          {
            "id": "roster-form--not-possible-to-write-the-set-in-roster-form",
            "name": "Not possible to write the set in roster form",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 7
            }
          },
          {
            "id": "roster-form--as-we-neither-know-its-first-element-nor-its-last-element-in-fact",
            "name": "as we neither know its first element nor its last element. In fact",
            "minutes": 25,
            "deps": [
              "roster-form--not-possible-to-write-the-set-in-roster-form"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 7
            }
          },
          {
            "id": "roster-form--its-not-possible-to-write-two-consecutive-elements-of-this-set",
            "name": "it’s not possible to write two consecutive elements of this set",
            "minutes": 25,
            "deps": [
              "roster-form--as-we-neither-know-its-first-element-nor-its-last-element-in-fact"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 7
            }
          }
        ]
      },
      {
        "id": "definition",
        "name": "Definition",
        "concepts": [
          {
            "id": "definition--we-write-it-as-a-b-if-a-is-not-a-subset-of-set-b",
            "name": "we write it as A  B. If A is not a subset of set B",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 10
            }
          },
          {
            "id": "definition--we-write-it-as-a-b-we-say-a-b-if-a-a-a-b",
            "name": "we write it as A  B. We say A  B if a  A  a  B",
            "minutes": 25,
            "deps": [
              "definition--we-write-it-as-a-b-if-a-is-not-a-subset-of-set-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 10
            }
          }
        ]
      },
      {
        "id": "example-9",
        "name": "Example 9",
        "concepts": [
          {
            "id": "example-9--i-a-b-ii-since-is-subset-of-every-set",
            "name": "(i) A  B (ii) Since  is subset of every set",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 10
            }
          },
          {
            "id": "example-9--therefore-each-is-a-subset-of-the-other-i-e",
            "name": "therefore each is a subset of the other i.e",
            "minutes": 25,
            "deps": [
              "example-9--i-a-b-ii-since-is-subset-of-every-set"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 10
            }
          },
          {
            "id": "example-9--we-say",
            "name": "we say",
            "minutes": 10,
            "deps": [
              "example-9--therefore-each-is-a-subset-of-the-other-i-e"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 10
            }
          },
          {
            "id": "example-9--an-earthquake-measures-2-on-the-richter-scale",
            "name": "An earthquake measures 2 on the Richter scale",
            "minutes": 25,
            "deps": [
              "example-9--we-say"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 35
            }
          },
          {
            "id": "example-9--find-n",
            "name": "Find n",
            "minutes": 10,
            "deps": [
              "example-9--an-earthquake-measures-2-on-the-richter-scale"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 78
            }
          }
        ]
      },
      {
        "id": "example-18",
        "name": "Example 18",
        "concepts": [
          {
            "id": "example-18--given",
            "name": "Given",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 16
            }
          }
        ]
      },
      {
        "id": "example-20",
        "name": "Example 20",
        "concepts": [
          {
            "id": "example-20--in-a-class-with-40-students",
            "name": "In a class with 40 students",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 18
            }
          },
          {
            "id": "example-20--22-play-badminton",
            "name": "22 play badminton",
            "minutes": 15,
            "deps": [
              "example-20--in-a-class-with-40-students"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 18
            }
          }
        ]
      },
      {
        "id": "hint",
        "name": "Hint",
        "concepts": [
          {
            "id": "hint--you-can-find-sets-a",
            "name": "You can find sets A",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 22
            }
          },
          {
            "id": "hint--c-and-universal-set-u-from-the-given-venn-diagram",
            "name": "C and universal set U from the given Venn diagram",
            "minutes": 25,
            "deps": [
              "hint--you-can-find-sets-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 22
            }
          }
        ]
      },
      {
        "id": "statement",
        "name": "Statement",
        "concepts": [
          {
            "id": "statement--loga-mn-loga-m-loga-n",
            "name": "loga ( MN )  loga M  loga N",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "statement--loga-m-k-k-loga-m",
            "name": "loga  M k   k loga M",
            "minutes": 25,
            "deps": [
              "statement--loga-mn-loga-m-loga-n"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 29
            }
          }
        ]
      },
      {
        "id": "proof",
        "name": "Proof",
        "concepts": [
          {
            "id": "proof--let-x-loga-mn",
            "name": "Let x  loga ( MN )",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--y-log-a-m",
            "name": "y  log a M",
            "minutes": 20,
            "deps": [
              "proof--let-x-loga-mn"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--z-log-a-n",
            "name": "z  log a N",
            "minutes": 20,
            "deps": [
              "proof--y-log-a-m"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--let-x-loga",
            "name": "Let x  loga  ",
            "minutes": 20,
            "deps": [
              "proof--z-log-a-n"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--y-loga-m",
            "name": "y  loga M",
            "minutes": 15,
            "deps": [
              "proof--let-x-loga"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--z-loga-n-n-m-then",
            "name": "z  loga N N M Then",
            "minutes": 20,
            "deps": [
              "proof--y-loga-m"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--a-y-m-and-az-n-n-ay-m-m-therefore",
            "name": "a y  M and az  N N ay M M Therefore",
            "minutes": 25,
            "deps": [
              "proof--z-loga-n-n-m-then"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--loga-m-loga-n-loga-n",
            "name": "loga M  loga N  loga   N",
            "minutes": 25,
            "deps": [
              "proof--a-y-m-and-az-n-n-ay-m-m-therefore"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 28
            }
          },
          {
            "id": "proof--let-x-loga-m-k-and-y-loga-m",
            "name": "Let x  loga  M k  and y  loga M",
            "minutes": 25,
            "deps": [
              "proof--loga-m-loga-n-loga-n"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 29
            }
          },
          {
            "id": "proof--let-x-loga-m-ax-m-now-take-log-with-base-b-on-both-the-sides",
            "name": "Let x  loga ( M )  ax  M Now take log with base b on both the sides",
            "minutes": 25,
            "deps": [
              "proof--let-x-loga-m-k-and-y-loga-m"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 29
            }
          },
          {
            "id": "proof--logb-ax-logb-m-x-logb-a-logb-m-logb-m-thus",
            "name": "logb (ax )  logb M  x logb a  logb M logb ( M ) Thus",
            "minutes": 25,
            "deps": [
              "proof--let-x-loga-m-ax-m-now-take-log-with-base-b-on-both-the-sides"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 29
            }
          },
          {
            "id": "proof--let-x-loga-a-ax-a",
            "name": "Let x  loga a  ax  a",
            "minutes": 25,
            "deps": [
              "proof--logb-ax-logb-m-x-logb-a-logb-m-logb-m-thus"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 29
            }
          }
        ]
      },
      {
        "id": "remember",
        "name": "Remember",
        "concepts": [
          {
            "id": "remember--for-positive-values-of-m",
            "name": "For positive values of m",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 30
            }
          }
        ]
      },
      {
        "id": "the-golden-rule-of-logarithmic-equations",
        "name": "The Golden Rule of Logarithmic Equations",
        "concepts": [
          {
            "id": "the-golden-rule-of-logarithmic-equations--the-value-of-logb-a-is-defined-if-a-is-positive-a-0",
            "name": "the value of logb a is defined if a is positive (a > 0)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 36
            }
          }
        ]
      },
      {
        "id": "example-15",
        "name": "Example 15",
        "concepts": [
          {
            "id": "example-15--logb-logb-ax-1",
            "name": "logb (logb Ax )  1",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 38
            }
          },
          {
            "id": "example-15--in-how-many-ways-can-a-12-member-club-elect-a-president",
            "name": "In how many ways can a 12-member club elect a President",
            "minutes": 25,
            "deps": [
              "example-15--logb-logb-ax-1"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "example-15--vice-president",
            "name": "Vice- President",
            "minutes": 10,
            "deps": [
              "example-15--in-how-many-ways-can-a-12-member-club-elect-a-president"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          }
        ]
      },
      {
        "id": "example-3",
        "name": "Example 3",
        "concepts": [
          {
            "id": "example-3--find-how-many-subsets-will-a-b-have",
            "name": "find how many subsets will A × B have?",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 42
            }
          }
        ]
      },
      {
        "id": "let-us-represent-the-relation-r",
        "name": "Let us represent the relation, R",
        "concepts": [
          {
            "id": "let-us-represent-the-relation-r--a-b-by-an-arrow-diagram-as-shown-below",
            "name": "A  B by an arrow diagram as shown below:",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 44
            }
          }
        ]
      },
      {
        "id": "example-7",
        "name": "Example 7",
        "concepts": [
          {
            "id": "example-7--find-its-domain",
            "name": "find its domain",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 44
            }
          },
          {
            "id": "example-7--range",
            "name": "range",
            "minutes": 10,
            "deps": [
              "example-7--find-its-domain"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 44
            }
          },
          {
            "id": "example-7--find-the-nth-term-of-the-sequence-3",
            "name": "Find the nth term of the sequence 3",
            "minutes": 25,
            "deps": [
              "example-7--range"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 94
            }
          },
          {
            "id": "example-7--and-hence-find-its-8th-term",
            "name": "… and hence find its 8th term",
            "minutes": 20,
            "deps": [
              "example-7--find-the-nth-term-of-the-sequence-3"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 94
            }
          }
        ]
      },
      {
        "id": "in-other-words-a-relation-r",
        "name": "In other words a relation R",
        "concepts": [
          {
            "id": "in-other-words-a-relation-r--the-image-is-unique",
            "name": "the image is unique",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 46
            }
          }
        ]
      },
      {
        "id": "example-14",
        "name": "Example 14",
        "concepts": [
          {
            "id": "example-14--determine-which-of-the-following-rules-describes-a-function-give-reason-for-each",
            "name": "Determine which of the following rules describes a function. Give reason for each",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 48
            }
          },
          {
            "id": "example-14--in-an-8-person-race",
            "name": "In an 8-person race",
            "minutes": 15,
            "deps": [
              "example-14--determine-which-of-the-following-rules-describes-a-function-give-reason-for-each"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "example-14--how-many-ways-can-gold",
            "name": "how many ways can Gold",
            "minutes": 20,
            "deps": [
              "example-14--in-an-8-person-race"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          },
          {
            "id": "example-14--silver",
            "name": "Silver",
            "minutes": 10,
            "deps": [
              "example-14--how-many-ways-can-gold"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          }
        ]
      },
      {
        "id": "a-relation-r",
        "name": "A relation R",
        "concepts": [
          {
            "id": "a-relation-r--co-domain-and-range",
            "name": "co-domain and range",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 49
            }
          }
        ]
      },
      {
        "id": "example-21",
        "name": "Example 21",
        "concepts": [
          {
            "id": "example-21--draw-the-graphs-of-the-functions-f",
            "name": "Draw the graphs of the functions f",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 55
            }
          }
        ]
      },
      {
        "id": "coordinates",
        "name": "Coordinates",
        "concepts": [
          {
            "id": "coordinates--an-ordered-pair-x-y-represents-any-point-p",
            "name": "An ordered pair (x, y) represents any point P",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 58
            }
          },
          {
            "id": "coordinates--from-the-idea-of-ordering-or-arranging-points-in-a-mutual-relationship-to-two-ax",
            "name": "From the idea of “ordering” or “arranging” points in a mutual relationship to two axes",
            "minutes": 25,
            "deps": [
              "coordinates--an-ordered-pair-x-y-represents-any-point-p"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 59
            }
          }
        ]
      },
      {
        "id": "cartesian",
        "name": "Cartesian",
        "concepts": [
          {
            "id": "cartesian--this-term-is-derived-directly-from-the-latin-version-of-descartes-name",
            "name": "This term is derived directly from the Latin version of Descartes’ name",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 59
            }
          },
          {
            "id": "cartesian--renatus-cartesius",
            "name": "Renatus Cartesius",
            "minutes": 10,
            "deps": [
              "cartesian--this-term-is-derived-directly-from-the-latin-version-of-descartes-name"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 59
            }
          }
        ]
      },
      {
        "id": "example-6",
        "name": "Example 6",
        "concepts": [
          {
            "id": "example-6--the-line-will-always-pass-through-one-specific",
            "name": "the line will always pass through one specific",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 67
            }
          },
          {
            "id": "example-6--fixed-point-find-that-point",
            "name": "fixed point. Find that point",
            "minutes": 20,
            "deps": [
              "example-6--the-line-will-always-pass-through-one-specific"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 67
            }
          }
        ]
      },
      {
        "id": "clue-1",
        "name": "Clue 1",
        "concepts": [
          {
            "id": "clue-1--the-line-passes-through-the-coordinate-point-3-10",
            "name": "The line passes through the coordinate point (3, 10)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 67
            }
          }
        ]
      },
      {
        "id": "example-11",
        "name": "Example 11",
        "concepts": [
          {
            "id": "example-11--a-moving-straight-line-intercepts-x-axis-at-a-and-y-axis-at-b-as-the-line-moves",
            "name": "A moving straight line intercepts x-axis at a and y-axis at b. As the line moves",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          },
          {
            "id": "example-11--find-the-coordinates-of-that-fixed-point-x-y",
            "name": "find the coordinates of that fixed point. x y",
            "minutes": 25,
            "deps": [
              "example-11--a-moving-straight-line-intercepts-x-axis-at-a-and-y-axis-at-b-as-the-line-moves"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          }
        ]
      },
      {
        "id": "calculation",
        "name": "Calculation",
        "concepts": [
          {
            "id": "calculation--for-a-line-passing-through-a-x1-y1-and-b-x2-y2",
            "name": "For a line passing through A( x1 , y1 ) and B( x2 , y2 )",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 72
            }
          },
          {
            "id": "calculation--the-line-is-vertical-parallel-to-y-axis",
            "name": "The line is vertical (parallel to y-axis)",
            "minutes": 20,
            "deps": [
              "calculation--for-a-line-passing-through-a-x1-y1-and-b-x2-y2"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 72
            }
          }
        ]
      },
      {
        "id": "historical-note",
        "name": "Historical Note",
        "concepts": [
          {
            "id": "historical-note--the-evolution-of-combinatorics-combinatorics",
            "name": "The Evolution of Combinatorics Combinatorics",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 74
            }
          },
          {
            "id": "historical-note--the-study-of-counting-and-arrangements",
            "name": "the study of counting and arrangements",
            "minutes": 20,
            "deps": [
              "historical-note--the-evolution-of-combinatorics-combinatorics"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 74
            }
          },
          {
            "id": "historical-note--has-roots-in-ancient-mathematics-in-india",
            "name": "has roots in ancient mathematics. In India",
            "minutes": 20,
            "deps": [
              "historical-note--the-study-of-counting-and-arrangements"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 74
            }
          }
        ]
      },
      {
        "id": "example-4",
        "name": "Example 4",
        "concepts": [
          {
            "id": "example-4--a-school-offers-4-sports-clubs",
            "name": "A school offers 4 sports clubs",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 76
            }
          },
          {
            "id": "example-4--3-music-clubs",
            "name": "3 music clubs",
            "minutes": 15,
            "deps": [
              "example-4--a-school-offers-4-sports-clubs"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 76
            }
          }
        ]
      },
      {
        "id": "example-5",
        "name": "Example 5",
        "concepts": [
          {
            "id": "example-5--how-many-2-digit-numbers-can-be-formed-using-the-digits-1",
            "name": "How many 2-digit numbers can be formed using the digits 1",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 77
            }
          },
          {
            "id": "example-5--5-if-repetition-of-digits-is-not-allowed",
            "name": "5 if repetition of digits is not allowed?",
            "minutes": 25,
            "deps": [
              "example-5--how-many-2-digit-numbers-can-be-formed-using-the-digits-1"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 77
            }
          }
        ]
      },
      {
        "id": "example-10",
        "name": "Example 10",
        "concepts": [
          {
            "id": "example-10--find-x",
            "name": "Find x",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 79
            }
          }
        ]
      },
      {
        "id": "example-12",
        "name": "Example 12",
        "concepts": [
          {
            "id": "example-12--find-the-value-of-x-y",
            "name": "Find the value of x  y",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 79
            }
          }
        ]
      },
      {
        "id": "example-16",
        "name": "Example 16",
        "concepts": [
          {
            "id": "example-16--in-how-many-ways-can-6-students-stand-in-a-straight-line-for-a-photograph",
            "name": "In how many ways can 6 students stand in a straight line for a photograph?",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          }
        ]
      },
      {
        "id": "example-17",
        "name": "Example 17",
        "concepts": [
          {
            "id": "example-17--how-many-4-digit-numbers-greater-than-7000-can-be-formed-using-the-digits-2",
            "name": "How many 4-digit numbers greater than 7000 can be formed using the digits 2",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          }
        ]
      },
      {
        "id": "think",
        "name": "Think",
        "concepts": [
          {
            "id": "think--what-if-the-digits-can-be-repeated",
            "name": "What if the digits can be repeated?",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 81
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--sets-1-21",
            "name": "Sets 1-21",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "maths-advanced",
              "page": 2
            }
          },
          {
            "id": "syllabus--logarithms-22-37",
            "name": "Logarithms 22-37",
            "minutes": 10,
            "deps": [
              "syllabus--sets-1-21"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 2
            }
          },
          {
            "id": "syllabus--relations-and-functions-38-54",
            "name": "Relations and Functions 38-54",
            "minutes": 15,
            "deps": [
              "syllabus--logarithms-22-37"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 2
            }
          },
          {
            "id": "syllabus--coordinate-geometry-55-70",
            "name": "Coordinate Geometry 55-70",
            "minutes": 15,
            "deps": [
              "syllabus--relations-and-functions-38-54"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 2
            }
          },
          {
            "id": "syllabus--combinatorics-71-83",
            "name": "Combinatorics 71-83",
            "minutes": 10,
            "deps": [
              "syllabus--coordinate-geometry-55-70"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 2
            }
          },
          {
            "id": "syllabus--3-representation-of-a-set",
            "name": "3 Representation of a Set",
            "minutes": 20,
            "deps": [
              "syllabus--combinatorics-71-83"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 4
            }
          },
          {
            "id": "syllabus--list-the-elements-of-the-following-sets",
            "name": "List the elements of the following sets :",
            "minutes": 25,
            "deps": [
              "syllabus--3-representation-of-a-set"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--determine-which-elements-of-the-set",
            "name": "Determine which elements of the set",
            "minutes": 20,
            "deps": [
              "syllabus--list-the-elements-of-the-following-sets"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--write-the-following-sets-in-roster-form",
            "name": "Write the following sets in roster form:",
            "minutes": 20,
            "deps": [
              "syllabus--determine-which-elements-of-the-set"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--write-the-following-sets-in-set-builder-form",
            "name": "Write the following sets in set-builder form",
            "minutes": 20,
            "deps": [
              "syllabus--write-the-following-sets-in-roster-form"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--which-of-the-following-pairs-of-sets-are-equal",
            "name": "Which of the following pairs of sets are equal",
            "minutes": 25,
            "deps": [
              "syllabus--write-the-following-sets-in-set-builder-form"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--state-which-of-the-following-sets-are-finite-or-infinite",
            "name": "State which of the following sets are finite or infinite",
            "minutes": 25,
            "deps": [
              "syllabus--which-of-the-following-pairs-of-sets-are-equal"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--fill-in-the-blanks-with-symbol-or",
            "name": "Fill in the blanks with symbol  or ",
            "minutes": 25,
            "deps": [
              "syllabus--state-which-of-the-following-sets-are-finite-or-infinite"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 12
            }
          },
          {
            "id": "syllabus--determine-whether-the-following-statements-are-true-or-false",
            "name": "Determine whether the following statements are true or false",
            "minutes": 25,
            "deps": [
              "syllabus--fill-in-the-blanks-with-symbol-or"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 12
            }
          },
          {
            "id": "syllabus--write-the-power-set-of-the-following-sets",
            "name": "Write the power set of the following sets:",
            "minutes": 25,
            "deps": [
              "syllabus--determine-whether-the-following-statements-are-true-or-false"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 12
            }
          },
          {
            "id": "syllabus--what-is-the-cardinality-of-the-following-sets",
            "name": "What is the cardinality of the following sets:",
            "minutes": 25,
            "deps": [
              "syllabus--write-the-power-set-of-the-following-sets"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 12
            }
          },
          {
            "id": "syllabus--let-a-be-a-set-and-n-a-10-then-find-the-value-of-n-p-a-what-if-a-has-100-element",
            "name": "Let A be a set and n(A) = 10, then find the value of n[P(A)]? What if A has 100 elements?",
            "minutes": 25,
            "deps": [
              "syllabus--what-is-the-cardinality-of-the-following-sets"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 12
            }
          },
          {
            "id": "syllabus--14-1-if-a-and-b-are-two-finite-sets-then-their-cardinal-numbers-are-related-as-b",
            "name": "14.1 If A and B are two finite sets, then their cardinal numbers are related as below:",
            "minutes": 25,
            "deps": [
              "syllabus--let-a-be-a-set-and-n-a-10-then-find-the-value-of-n-p-a-what-if-a-has-100-element"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 17
            }
          },
          {
            "id": "syllabus--n-either-in-a-or-in-b-n-a-b-n-a-n-b-n-a-b",
            "name": "n(Either in A or in B) = n(A  B) = n(A) + n(B) – n(A B)",
            "minutes": 25,
            "deps": [
              "syllabus--14-1-if-a-and-b-are-two-finite-sets-then-their-cardinal-numbers-are-related-as-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 17
            }
          },
          {
            "id": "syllabus--n-only-in-a-not-in-b-n-a-b-n-a-n-a-b",
            "name": "n(Only in A, not in B) = n(A – B) = n(A) – n(A B)",
            "minutes": 25,
            "deps": [
              "syllabus--n-either-in-a-or-in-b-n-a-b-n-a-n-b-n-a-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 17
            }
          },
          {
            "id": "syllabus--n-neither-in-a-nor-in-b-n-a-b-n-a-b-n-u-n-a-b",
            "name": "n(Neither in A nor in B) = n(A B) = n(A B) = n(U) – n(A B)",
            "minutes": 25,
            "deps": [
              "syllabus--n-only-in-a-not-in-b-n-a-b-n-a-n-a-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 17
            }
          },
          {
            "id": "syllabus--find-the-union-of-sets-a-and-b-i-e-a-b-in-each-of-the-following-pairs",
            "name": "Find the union of sets A and B i.e. A B, in each of the following pairs",
            "minutes": 25,
            "deps": [
              "syllabus--n-neither-in-a-nor-in-b-n-a-b-n-a-b-n-u-n-a-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 22
            }
          },
          {
            "id": "syllabus--evaluate-each-of-the-following",
            "name": "Evaluate each of the following",
            "minutes": 20,
            "deps": [
              "syllabus--find-the-union-of-sets-a-and-b-i-e-a-b-in-each-of-the-following-pairs"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 22
            }
          },
          {
            "id": "syllabus--which-of-the-following-sets-are-disjoint",
            "name": "Which of the following sets are disjoint?",
            "minutes": 20,
            "deps": [
              "syllabus--evaluate-each-of-the-following"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 22
            }
          },
          {
            "id": "syllabus--find-a-b-in-each-of-the-following",
            "name": "Find A – B in each of the following",
            "minutes": 25,
            "deps": [
              "syllabus--which-of-the-following-sets-are-disjoint"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 22
            }
          },
          {
            "id": "syllabus--use-the-venn-diagram-given-below-to-answer-the-questions-that-follow-hint-you-ca",
            "name": "Use the Venn diagram given below to answer the questions that follow. Hint: You can find sets A, B, C and universal set U from the given Venn diagram.Page | 20",
            "minutes": 25,
            "deps": [
              "syllabus--find-a-b-in-each-of-the-following"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 22
            }
          },
          {
            "id": "syllabus--verify-a-b-a-b-using-the-venn-diagram-given-below",
            "name": "Verify A – B = A B using the Venn diagram given below:",
            "minutes": 25,
            "deps": [
              "syllabus--use-the-venn-diagram-given-below-to-answer-the-questions-that-follow-hint-you-ca"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 23
            }
          },
          {
            "id": "syllabus--for-a-competitive-exam-85-of-students-opted-for-a-mock-test-in-mathematics-and-7",
            "name": "For a competitive exam, 85% of students opted for a Mock Test in Mathematics and 75% opted for a Mock Test in Science",
            "minutes": 25,
            "deps": [
              "syllabus--verify-a-b-a-b-using-the-venn-diagram-given-below"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 23
            }
          },
          {
            "id": "syllabus--1-if-a-and-b-are-two-finite-sets-then-their-cardinal-numbers-are-related-as-belo",
            "name": "1 If A and B are two finite sets, then their cardinal numbers are related as below:",
            "minutes": 25,
            "deps": [
              "syllabus--for-a-competitive-exam-85-of-students-opted-for-a-mock-test-in-mathematics-and-7"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 24
            }
          },
          {
            "id": "syllabus--2-if-a-b-and-c-are-three-finite-sets-then-their-cardinal-numbers-are-related-as-",
            "name": "2 If A, B and C are three finite sets, then their cardinal numbers are related as follows: n(A  B  C) = n(A) + n(B) + n(C) – [n(A  B) + n(B  C) + n(C  A)]",
            "minutes": 25,
            "deps": [
              "syllabus--1-if-a-and-b-are-two-finite-sets-then-their-cardinal-numbers-are-related-as-belo"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 24
            }
          },
          {
            "id": "syllabus--2-understanding-logarithms-as-the-inverse-of-exponents-we-have-earlier-learnt-ab",
            "name": "2 Understanding Logarithms as the Inverse of Exponents We have earlier learnt about squares and cubes. For example:",
            "minutes": 25,
            "deps": [
              "syllabus--2-if-a-b-and-c-are-three-finite-sets-then-their-cardinal-numbers-are-related-as-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 26
            }
          },
          {
            "id": "syllabus--2-1-understanding-logarithms-through-powers-of-10-let-us-look-at-powers-of-10-po",
            "name": "2.1 Understanding Logarithms through powers of 10 Let us look at powers of 10: Powers of 10 Expressed in logarithmic form:",
            "minutes": 25,
            "deps": [
              "syllabus--2-understanding-logarithms-as-the-inverse-of-exponents-we-have-earlier-learnt-ab"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 26
            }
          },
          {
            "id": "syllabus--write-an-equivalent-logarithmic-statement-for",
            "name": "Write an equivalent logarithmic statement for:",
            "minutes": 20,
            "deps": [
              "syllabus--2-1-understanding-logarithms-through-powers-of-10-let-us-look-at-powers-of-10-po"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 27
            }
          },
          {
            "id": "syllabus--write-an-equivalent-exponential-statement-for",
            "name": "Write an equivalent exponential statement for:",
            "minutes": 20,
            "deps": [
              "syllabus--write-an-equivalent-logarithmic-statement-for"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 27
            }
          },
          {
            "id": "syllabus--find-the-value-of",
            "name": "Find the value of",
            "minutes": 15,
            "deps": [
              "syllabus--write-an-equivalent-exponential-statement-for"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 27
            }
          },
          {
            "id": "syllabus--express-the-following-as-a-single-logarithm",
            "name": "Express the following as a single logarithm:",
            "minutes": 20,
            "deps": [
              "syllabus--find-the-value-of"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 33
            }
          },
          {
            "id": "syllabus--find-the-exact-value-of",
            "name": "Find the exact value of",
            "minutes": 20,
            "deps": [
              "syllabus--express-the-following-as-a-single-logarithm"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 33
            }
          },
          {
            "id": "syllabus--if-2-log-3-p-and-2-log-5-q-write-the-following-in-terms-of-p-and-q",
            "name": "If  2 log 3 p and  2 log 5 . q Write the following in terms of p and q",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-exact-value-of"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 33
            }
          },
          {
            "id": "syllabus--which-of-the-following-are-true",
            "name": "Which of the following are true?",
            "minutes": 20,
            "deps": [
              "syllabus--if-2-log-3-p-and-2-log-5-q-write-the-following-in-terms-of-p-and-q"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 33
            }
          },
          {
            "id": "syllabus--if-2026-2026-2026-2026-log-log-log-log-x-y-a-y-z-b-and-2026-2026-log-log-z-x-c-t",
            "name": "If 2026 2026 2026 2026 log log , log log x y a y z b     and 2026 2026 log log , z x c   then find the value of . b c c a a b x y z y z x",
            "minutes": 25,
            "deps": [
              "syllabus--which-of-the-following-are-true"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 33
            }
          },
          {
            "id": "syllabus--social-science-population-growth-often-follows-exponential-patterns",
            "name": "Social Science: Population growth often follows exponential patterns:",
            "minutes": 25,
            "deps": [
              "syllabus--if-2026-2026-2026-2026-log-log-log-log-x-y-a-y-z-b-and-2026-2026-log-log-z-x-c-t"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 34
            }
          },
          {
            "id": "syllabus--express-the-following-in-logarithmic-form",
            "name": "Express the following in logarithmic form:",
            "minutes": 20,
            "deps": [
              "syllabus--social-science-population-growth-often-follows-exponential-patterns"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 35
            }
          },
          {
            "id": "syllabus--using-the-properties-of-logs-simplify-2-2-log-16-log-4",
            "name": "Using the properties of logs, simplify:  2 2 log 16 log 4",
            "minutes": 25,
            "deps": [
              "syllabus--express-the-following-in-logarithmic-form"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 35
            }
          },
          {
            "id": "syllabus--evaluate",
            "name": "Evaluate:",
            "minutes": 10,
            "deps": [
              "syllabus--using-the-properties-of-logs-simplify-2-2-log-16-log-4"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 35
            }
          },
          {
            "id": "syllabus--if-2-log-7-p-and-2-log-3-q-write-in-terms-of-p-and-q",
            "name": "If  2 log 7 p and  2 log 3 . q Write in terms of p and q",
            "minutes": 25,
            "deps": [
              "syllabus--evaluate"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 35
            }
          },
          {
            "id": "syllabus--real-world-application",
            "name": "Real-world Application:",
            "minutes": 10,
            "deps": [
              "syllabus--if-2-log-7-p-and-2-log-3-q-write-in-terms-of-p-and-q"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 35
            }
          },
          {
            "id": "syllabus--true-or-false-explain-your-reasoning",
            "name": "True or False: (Explain your reasoning)",
            "minutes": 20,
            "deps": [
              "syllabus--real-world-application"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 36
            }
          },
          {
            "id": "syllabus--which-is-the-greatest-integer-that-is-less-than-the-number-4-9-log-9-log-28",
            "name": "Which is the greatest integer that is less than the number  4 9 log 9 log 28?",
            "minutes": 25,
            "deps": [
              "syllabus--true-or-false-explain-your-reasoning"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 36
            }
          },
          {
            "id": "syllabus--evaluate-the-value-of-x-5y-where",
            "name": "Evaluate the value of (x + 5y), where,",
            "minutes": 25,
            "deps": [
              "syllabus--which-is-the-greatest-integer-that-is-less-than-the-number-4-9-log-9-log-28"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 36
            }
          },
          {
            "id": "syllabus--43-43-1-log-and-40-2-x-y",
            "name": "43 43 1 log and . 40 2 x y",
            "minutes": 25,
            "deps": [
              "syllabus--evaluate-the-value-of-x-5y-where"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 36
            }
          },
          {
            "id": "syllabus--solve-for-x",
            "name": "Solve for x",
            "minutes": 15,
            "deps": [
              "syllabus--43-43-1-log-and-40-2-x-y"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 38
            }
          },
          {
            "id": "syllabus--if-x-5-y-1-4-6-find-x-and-y",
            "name": "If (x − 5, y + 1) = (4, 6), find x and y",
            "minutes": 25,
            "deps": [
              "syllabus--solve-for-x"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 43
            }
          },
          {
            "id": "syllabus--let-a-1-2-and-b-2-3-5-list-all-elements-of-a-b-and-b-a",
            "name": "Let A = {1, 2} and B = {2, 3, 5}. List all elements of A × B and B × A",
            "minutes": 25,
            "deps": [
              "syllabus--if-x-5-y-1-4-6-find-x-and-y"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 43
            }
          },
          {
            "id": "syllabus--if-n-a-b-20-and-n-a-4-find-n-b",
            "name": "If n(A × B) = 20 and n(A) = 4, find n(B)",
            "minutes": 25,
            "deps": [
              "syllabus--let-a-1-2-and-b-2-3-5-list-all-elements-of-a-b-and-b-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 43
            }
          },
          {
            "id": "syllabus--if-a-1-2-3-and-b-x-y-find-a-b-b-a-a-a-and-b-b",
            "name": "If A = {1, 2, 3} and B = {x, y}, find A × B, B × A, A × A and B × B",
            "minutes": 25,
            "deps": [
              "syllabus--if-n-a-b-20-and-n-a-4-find-n-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 43
            }
          },
          {
            "id": "syllabus--if-a-1-2-3-and-b-2-3-7-find-a-b-b-a",
            "name": "If A = {1, 2, 3} and B = {2, 3, 7}, find (A × B)  (B × A)",
            "minutes": 25,
            "deps": [
              "syllabus--if-a-1-2-3-and-b-x-y-find-a-b-b-a-a-a-and-b-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 43
            }
          },
          {
            "id": "syllabus--verify-a-b-c-a-b-a-c-for-a-1-2-b-2-3-c-4-5",
            "name": "Verify, A × (B  C) = (A × B)  (A × C) for A = {1, 2}, B = {2, 3}, C = {4, 5}",
            "minutes": 25,
            "deps": [
              "syllabus--if-a-1-2-3-and-b-2-3-7-find-a-b-b-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 43
            }
          },
          {
            "id": "syllabus--given-a-2-3-4-5-b-3-6-7-10-define-r-a-b-a-divides-b-a-a-b-b-write-r-in-roster-fo",
            "name": "Given A = {2, 3, 4, 5}, B = {3, 6, 7, 10}. Define R = {(a, b) : a divides b; a  A, b  B}. Write R in roster form hence find its domain and range",
            "minutes": 25,
            "deps": [
              "syllabus--verify-a-b-c-a-b-a-c-for-a-1-2-b-2-3-c-4-5"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 46
            }
          },
          {
            "id": "syllabus--let-r-a-b-a-2b-12-a-b-write-r-in-roster-form-and-hence-find-its-domain-and-range",
            "name": "Let R = {(a, b) : a + 2b = 12, a, b   Write R in roster form and hence find its domain and range",
            "minutes": 25,
            "deps": [
              "syllabus--given-a-2-3-4-5-b-3-6-7-10-define-r-a-b-a-divides-b-a-a-b-b-write-r-in-roster-fo"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 46
            }
          },
          {
            "id": "syllabus--write-r-x-x2-x-is-a-prime-number-less-than-10-in-roster-form-also-find-the-range",
            "name": "Write R = {(x, x2) : x is a prime number less than 10} in roster form. Also find the range of R",
            "minutes": 25,
            "deps": [
              "syllabus--let-r-a-b-a-2b-12-a-b-write-r-in-roster-form-and-hence-find-its-domain-and-range"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 46
            }
          },
          {
            "id": "syllabus--let-a-p-q-r-s-and-b-1-2-how-many-relations-can-be-defined-from-set-a-to-set-b-li",
            "name": "Let A = {p, q, r, s} and B = {1, 2}. How many relations can be defined from set A to set B? List any four of them",
            "minutes": 25,
            "deps": [
              "syllabus--write-r-x-x2-x-is-a-prime-number-less-than-10-in-roster-form-also-find-the-range"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 46
            }
          },
          {
            "id": "syllabus--let-a-1-2-3-4-5-define-a-relation-r-on-a-by-r-a-b-a-b-2-write-r-in-roster-form-a",
            "name": "Let A = {1, 2, 3, 4, 5}. Define a relation R on A by R = {(a, b) : |a − b| = 2}. Write R in roster form and hence find its domain and range",
            "minutes": 25,
            "deps": [
              "syllabus--let-a-p-q-r-s-and-b-1-2-how-many-relations-can-be-defined-from-set-a-to-set-b-li"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 46
            }
          },
          {
            "id": "syllabus--which-of-the-following-relations-are-functions-justify-your-answer-page-48",
            "name": "Which of the following relations are functions? Justify your answer.Page | 48",
            "minutes": 25,
            "deps": [
              "syllabus--let-a-1-2-3-4-5-define-a-relation-r-on-a-by-r-a-b-a-b-2-write-r-in-roster-form-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 51
            }
          },
          {
            "id": "syllabus--which-of-the-following-relations-from-a-3-5-7-9-to-b-1-2-3-4-5-are-functions-fro",
            "name": "Which of the following relations from A = {3, 5, 7, 9} to B = {1, 2, 3, 4, 5} are functions from A to B?",
            "minutes": 25,
            "deps": [
              "syllabus--which-of-the-following-relations-are-functions-justify-your-answer-page-48"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 51
            }
          },
          {
            "id": "syllabus--what-is-the-domain-and-range-of-each-of-the-relations-given-below-which-of-these",
            "name": "What is the domain and range of each of the relations given below? Which of these relations are functions:",
            "minutes": 25,
            "deps": [
              "syllabus--which-of-the-following-relations-from-a-3-5-7-9-to-b-1-2-3-4-5-are-functions-fro"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 56
            }
          },
          {
            "id": "syllabus--draw-a-rough-sketch-of-each-of-the-following-relations-also-write-their-domain-a",
            "name": "Draw a rough sketch of each of the following relations. Also write their domain and range",
            "minutes": 25,
            "deps": [
              "syllabus--what-is-the-domain-and-range-of-each-of-the-relations-given-below-which-of-these"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 56
            }
          },
          {
            "id": "syllabus--determine-the-domain-and-range-of-the-following-functions",
            "name": "Determine the domain and range of the following functions:",
            "minutes": 25,
            "deps": [
              "syllabus--draw-a-rough-sketch-of-each-of-the-following-relations-also-write-their-domain-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 57
            }
          },
          {
            "id": "syllabus--an-ordered-pair-is-a-pair-of-objects-generally-numbers-or-variables-written-in-s",
            "name": "An ordered pair is a pair of objects generally numbers or variables written in specific order. For example: (3, –5), (x, y) etc",
            "minutes": 25,
            "deps": [
              "syllabus--determine-the-domain-and-range-of-the-following-functions"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 57
            }
          },
          {
            "id": "syllabus--the-cartesian-product-of-two-non-empty-sets-a-and-b-is-the-set-of-all-ordered-pa",
            "name": "The Cartesian product of two non-empty sets A and B is the set of all ordered pairs (a, b) where a  A and b  B. i.e., A × B = {(a, b) : a  A, b  B}",
            "minutes": 25,
            "deps": [
              "syllabus--an-ordered-pair-is-a-pair-of-objects-generally-numbers-or-variables-written-in-s"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 57
            }
          },
          {
            "id": "syllabus--the-graph-of-y-f-x-c-can-be-obtained-from-the-graph-of-y-f-x-by-shifting-it",
            "name": "The graph of y = f (x) + c can be obtained from the graph of y = f (x) by shifting it",
            "minutes": 25,
            "deps": [
              "syllabus--the-cartesian-product-of-two-non-empty-sets-a-and-b-is-the-set-of-all-ordered-pa"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 57
            }
          },
          {
            "id": "syllabus--the-y-axis-work-as-a-mirror-when-you-stand-in-front-of-a-vertical-mirror",
            "name": "The Y-axis work as a Mirror: When you stand in front of a vertical mirror",
            "minutes": 25,
            "deps": [
              "syllabus--the-graph-of-y-f-x-c-can-be-obtained-from-the-graph-of-y-f-x-by-shifting-it"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 59
            }
          },
          {
            "id": "syllabus--the-first-jump-of-p-reflects-across-y-axis-when-the-point-p-jumps-over-the-y-axi",
            "name": "The First Jump of P Reflects across Y-axis: When the point P “jumps” over the Y-axis to the other side",
            "minutes": 25,
            "deps": [
              "syllabus--the-y-axis-work-as-a-mirror-when-you-stand-in-front-of-a-vertical-mirror"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 60
            }
          },
          {
            "id": "syllabus--the-second-jump",
            "name": "The Second Jump",
            "minutes": 15,
            "deps": [
              "syllabus--the-first-jump-of-p-reflects-across-y-axis-when-the-point-p-jumps-over-the-y-axi"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 60
            }
          },
          {
            "id": "syllabus--a-point-a-a-b-is-reflected-across-the-x-axis-to-become-point-b-point-b-is-exactl",
            "name": "A point A (a, b) is reflected across the x-axis to become point B. Point B is exactly 8 units below point A. What was the y-coordinate of point A?",
            "minutes": 25,
            "deps": [
              "syllabus--the-second-jump"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 61
            }
          },
          {
            "id": "syllabus--6-the-concept-of-slope-gradient-the-slope-or-gradient-denoted-by-m-measures-the-",
            "name": "6 The Concept of Slope (Gradient) The slope (or gradient) denoted by m, measures the steepness and direction of a line",
            "minutes": 25,
            "deps": [
              "syllabus--a-point-a-a-b-is-reflected-across-the-x-axis-to-become-point-b-point-b-is-exactl"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 62
            }
          },
          {
            "id": "syllabus--7-properties-of-slope",
            "name": "7 Properties of Slope",
            "minutes": 15,
            "deps": [
              "syllabus--6-the-concept-of-slope-gradient-the-slope-or-gradient-denoted-by-m-measures-the-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 63
            }
          },
          {
            "id": "syllabus--8-1-the-y-intercept-this-is-the-point-where-a-given-line-crosses-the-vertical-or",
            "name": "8.1 The y-intercept This is the point where a given line crosses the vertical or y-axis",
            "minutes": 25,
            "deps": [
              "syllabus--7-properties-of-slope"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 64
            }
          },
          {
            "id": "syllabus--8-2-the-x-intercept-this-is-the-point-where-the-line-crosses-the-horizontal-x-ax",
            "name": "8.2 The x-intercept This is the point where the line crosses the horizontal x-axis",
            "minutes": 25,
            "deps": [
              "syllabus--8-1-the-y-intercept-this-is-the-point-where-a-given-line-crosses-the-vertical-or"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 65
            }
          },
          {
            "id": "syllabus--points-p-2-3-q-5-7-and-r-13-k-are-three-consecutive-vertices-of-a-rectangle-what",
            "name": "Points P (2, 3), Q (5, 7), and R (13, k) are three consecutive vertices of a rectangle. What is the value of k?",
            "minutes": 25,
            "deps": [
              "syllabus--8-2-the-x-intercept-this-is-the-point-where-the-line-crosses-the-horizontal-x-ax"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 65
            }
          },
          {
            "id": "syllabus--9-different-forms-of-the-equation-of-a-line-a-straight-line-can-be-represented-a",
            "name": "9 Different Forms of the Equation of a Line A straight line can be represented algebraically in several ways depending on the given information.Page | 63",
            "minutes": 25,
            "deps": [
              "syllabus--points-p-2-3-q-5-7-and-r-13-k-are-three-consecutive-vertices-of-a-rectangle-what"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 65
            }
          },
          {
            "id": "syllabus--9-2-slope-intercept-form-y-mx-c-slope-intercept-form-is-used-when-we-know-the-sl",
            "name": "9.2 Slope-Intercept form: y = mx + c Slope-Intercept Form is used when we know the slope ‘m’ and the y-intercept ‘c’",
            "minutes": 25,
            "deps": [
              "syllabus--9-different-forms-of-the-equation-of-a-line-a-straight-line-can-be-represented-a"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 68
            }
          },
          {
            "id": "syllabus--write-the-equation-of-a-line-in-slope-intercept-form-that-is-parallel-to-the-lin",
            "name": "Write the equation of a line in slope-intercept form that is parallel to the line y = 5x – 12 and passes through the point (0, 9)",
            "minutes": 25,
            "deps": [
              "syllabus--9-2-slope-intercept-form-y-mx-c-slope-intercept-form-is-used-when-we-know-the-sl"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 69
            }
          },
          {
            "id": "syllabus--determine-the-equation-of-the-line-in-slope-intercept-form-that-is-perpendicular",
            "name": "Determine the equation of the line in slope-intercept form that is perpendicular to the line   1 4 3 y x and passes through the origin",
            "minutes": 25,
            "deps": [
              "syllabus--write-the-equation-of-a-line-in-slope-intercept-form-that-is-parallel-to-the-lin"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 69
            }
          },
          {
            "id": "syllabus--a-straight-line-passes-through-the-points-0-6-and-4-10-find-the-equation-of-this",
            "name": "A straight line passes through the points (0, –6) and (4,10). Find the equation of this line in slope-intercept form",
            "minutes": 25,
            "deps": [
              "syllabus--determine-the-equation-of-the-line-in-slope-intercept-form-that-is-perpendicular"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 69
            }
          },
          {
            "id": "syllabus--convert-the-linear-equation-8x-y-7-0-into-slope-intercept-form-page-67",
            "name": "Convert the linear equation 8x – y + 7 = 0 into slope-intercept form.Page | 67",
            "minutes": 25,
            "deps": [
              "syllabus--a-straight-line-passes-through-the-points-0-6-and-4-10-find-the-equation-of-this"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 70
            }
          },
          {
            "id": "syllabus--9-3-intercept-form-1-x-y-a-b",
            "name": "9.3 Intercept Form: 1 x y a b",
            "minutes": 25,
            "deps": [
              "syllabus--convert-the-linear-equation-8x-y-7-0-into-slope-intercept-form-page-67"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 70
            }
          },
          {
            "id": "syllabus--a-straight-line-passes-through-the-point-3-2-the-x-intercept-a-and-y-intercept",
            "name": "A straight line passes through the point (3, 2). The x-intercept (a) and y-intercept",
            "minutes": 25,
            "deps": [
              "syllabus--9-3-intercept-form-1-x-y-a-b"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 71
            }
          },
          {
            "id": "syllabus--the-cartesian-system",
            "name": "The Cartesian System",
            "minutes": 15,
            "deps": [
              "syllabus--a-straight-line-passes-through-the-point-3-2-the-x-intercept-a-and-y-intercept"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 72
            }
          },
          {
            "id": "syllabus--the-concept-of-slope-m",
            "name": "The Concept of Slope (m)",
            "minutes": 20,
            "deps": [
              "syllabus--the-cartesian-system"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 72
            }
          },
          {
            "id": "syllabus--key-line-relationships",
            "name": "Key Line Relationships",
            "minutes": 15,
            "deps": [
              "syllabus--the-concept-of-slope-m"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 72
            }
          },
          {
            "id": "syllabus--intercepts",
            "name": "Intercepts",
            "minutes": 10,
            "deps": [
              "syllabus--key-line-relationships"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 73
            }
          },
          {
            "id": "syllabus--forms-of-the-equation-of-a-line-a-straight-line-can-be-written-in-three-primary-",
            "name": "Forms of the Equation of a Line A straight line can be written in three primary algebraic forms:",
            "minutes": 25,
            "deps": [
              "syllabus--intercepts"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 73
            }
          },
          {
            "id": "syllabus--a-restaurant-offers-4-starters-5-main-courses-and-3-desserts-in-how-many-ways-ca",
            "name": "A restaurant offers 4 starters, 5 main courses, and 3 desserts. In how many ways can a 3-course meal be ordered?",
            "minutes": 25,
            "deps": [
              "syllabus--forms-of-the-equation-of-a-line-a-straight-line-can-be-written-in-three-primary-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 77
            }
          },
          {
            "id": "syllabus--there-are-5-doors-to-enter-a-hall-and-3-different-doors-to-exit-in-how-many-ways",
            "name": "There are 5 doors to enter a hall and 3 different doors to exit. In how many ways can a person enter and exit the hall?",
            "minutes": 25,
            "deps": [
              "syllabus--a-restaurant-offers-4-starters-5-main-courses-and-3-desserts-in-how-many-ways-ca"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 77
            }
          },
          {
            "id": "syllabus--a-bicycle-lock-has-3-dials-each-with-digits-0-to-9-how-many-different-lock-combi",
            "name": "A bicycle lock has 3 dials, each with digits 0 to 9. How many different lock combinations are possible if a digit can be repeated?",
            "minutes": 25,
            "deps": [
              "syllabus--there-are-5-doors-to-enter-a-hall-and-3-different-doors-to-exit-in-how-many-ways"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 77
            }
          },
          {
            "id": "syllabus--how-many-numbers-between-2000-and-3000-can-be-formed-from-the-digits-2-3-4-5-6-7",
            "name": "How many numbers between 2000 and 3000 can be formed from the digits 2, 3, 4, 5, 6, 7 when repetition of digits is not allowed?",
            "minutes": 25,
            "deps": [
              "syllabus--a-bicycle-lock-has-3-dials-each-with-digits-0-to-9-how-many-different-lock-combi"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 77
            }
          },
          {
            "id": "syllabus--how-many-3-digit-even-numbers-can-be-formed-from-the-digits-1-2-3-4-6-without-re",
            "name": "How many 3-digit even numbers can be formed from the digits 1, 2, 3, 4, 6 without repetition? What if the repetition of digits is allowed?",
            "minutes": 25,
            "deps": [
              "syllabus--how-many-numbers-between-2000-and-3000-can-be-formed-from-the-digits-2-3-4-5-6-7"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 77
            }
          },
          {
            "id": "syllabus--find-the-hcf-and-lcm-of-6-5",
            "name": "Find the HCF and LCM of 6! , 5!",
            "minutes": 25,
            "deps": [
              "syllabus--how-many-3-digit-even-numbers-can-be-formed-from-the-digits-1-2-3-4-6-without-re"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 80
            }
          },
          {
            "id": "syllabus--find-n-if",
            "name": "Find n if",
            "minutes": 15,
            "deps": [
              "syllabus--find-the-hcf-and-lcm-of-6-5"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 80
            }
          },
          {
            "id": "syllabus--find-x-if-1-1",
            "name": "Find x, if 1 1",
            "minutes": 20,
            "deps": [
              "syllabus--find-n-if"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 80
            }
          },
          {
            "id": "syllabus--find-the-value-s-of-x-in-each-of-the-following-here-x-0",
            "name": "Find the value(s) of x in each of the following: (Here, x  0)",
            "minutes": 25,
            "deps": [
              "syllabus--find-x-if-1-1"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 80
            }
          },
          {
            "id": "syllabus--4-1-the-permutation-formula-the-number-of-permutations-of-n-distinct-objects-tak",
            "name": "4.1 The Permutation Formula The number of permutations of n distinct objects taken r at a time is given by:",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-value-s-of-x-in-each-of-the-following-here-x-0"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 80
            }
          },
          {
            "id": "syllabus--in-how-many-ways-can-4-distinct-cars-be-parked-in-6-empty-spaces",
            "name": "In how many ways can 4 distinct cars be parked in 6 empty spaces?",
            "minutes": 25,
            "deps": [
              "syllabus--4-1-the-permutation-formula-the-number-of-permutations-of-n-distinct-objects-tak"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 82
            }
          },
          {
            "id": "syllabus--how-many-3-letter-words-with-or-without-meaning-can-be-formed-using-the-letters-",
            "name": "How many 3-letter words (with or without meaning) can be formed using the letters of the word “LOGIC”?",
            "minutes": 25,
            "deps": [
              "syllabus--in-how-many-ways-can-4-distinct-cars-be-parked-in-6-empty-spaces"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 82
            }
          },
          {
            "id": "syllabus--in-how-many-ways-can-5-boys-and-2-girls-be-seated-in-a-row-of-7-chairs-if-the-2-",
            "name": "In how many ways can 5 boys and 2 girls be seated in a row of 7 chairs if the 2 girls must always sit together?",
            "minutes": 25,
            "deps": [
              "syllabus--how-many-3-letter-words-with-or-without-meaning-can-be-formed-using-the-letters-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 82
            }
          },
          {
            "id": "syllabus--how-many-4-digit-numbers-can-be-formed-using-the-digits-2-4-6-8-9-without-repeti",
            "name": "How many 4-digit numbers can be formed using the digits 2, 4, 6, 8, 9 (without repetition) if the number must be strictly greater than 6000?",
            "minutes": 25,
            "deps": [
              "syllabus--in-how-many-ways-can-5-boys-and-2-girls-be-seated-in-a-row-of-7-chairs-if-the-2-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 82
            }
          },
          {
            "id": "syllabus--how-many-words-with-or-without-meaning-can-be-formed-from-the-letters-of-the-wor",
            "name": "How many words (with or without meaning) can be formed from the letters of the word, ‘DAUGHTER’, so that:",
            "minutes": 25,
            "deps": [
              "syllabus--how-many-4-digit-numbers-can-be-formed-using-the-digits-2-4-6-8-9-without-repeti"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 82
            }
          },
          {
            "id": "syllabus--5-1-the-combination-formula-the-number-of-combinations-selections-of-n-distinct-",
            "name": "5.1 The Combination Formula The number of combinations (selections) of n distinct objects taken r at a time is given by: C n r =",
            "minutes": 25,
            "deps": [
              "syllabus--how-many-words-with-or-without-meaning-can-be-formed-from-the-letters-of-the-wor"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 82
            }
          },
          {
            "id": "syllabus--in-how-many-ways-can-3-students-be-chosen-from-a-class-of-12-to-represent-the-sc",
            "name": "In how many ways can 3 students be chosen from a class of 12 to represent the school?",
            "minutes": 25,
            "deps": [
              "syllabus--5-1-the-combination-formula-the-number-of-combinations-selections-of-n-distinct-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 84
            }
          },
          {
            "id": "syllabus--how-many-triangles-can-be-formed-from-12-points-in-a-plane-of-which-5-are-collin",
            "name": "How many triangles can be formed from 12 points in a plane, of which 5 are collinear?",
            "minutes": 25,
            "deps": [
              "syllabus--in-how-many-ways-can-3-students-be-chosen-from-a-class-of-12-to-represent-the-sc"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 84
            }
          },
          {
            "id": "syllabus--how-many-diagonals-does-a-polygon-with-10-sides-have",
            "name": "How many diagonals does a polygon with 10 sides have?",
            "minutes": 25,
            "deps": [
              "syllabus--how-many-triangles-can-be-formed-from-12-points-in-a-plane-of-which-5-are-collin"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 84
            }
          },
          {
            "id": "syllabus--if-you-invite-15-of-your-friends-to-a-party-and-all-shake-hands-exactly-once-how",
            "name": "If you invite 15 of your friends to a party and all shake hands exactly once, how many handshakes occur?",
            "minutes": 25,
            "deps": [
              "syllabus--how-many-diagonals-does-a-polygon-with-10-sides-have"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 84
            }
          },
          {
            "id": "syllabus--1-introduction-let-us-observe-a-few-examples-of-progressions-below-4-8-16-32-1-1",
            "name": "1 Introduction Let us observe a few examples of Progressions below: 4, 8, 16, 32, … 1 1 3, 1, , , 3 9",
            "minutes": 25,
            "deps": [
              "syllabus--if-you-invite-15-of-your-friends-to-a-party-and-all-shake-hands-exactly-once-how"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 87
            }
          },
          {
            "id": "syllabus--2-t-t-r-t-t",
            "name": "2 , t t r t t",
            "minutes": 20,
            "deps": [
              "syllabus--1-introduction-let-us-observe-a-few-examples-of-progressions-below-4-8-16-32-1-1"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 89
            }
          },
          {
            "id": "syllabus--find-the-sum-of-the-series-0-15-0-015-0-0015-to-15-terms",
            "name": "Find the sum of the series 0.15 + 0.015 + 0.0015 + … to 15 terms",
            "minutes": 25,
            "deps": [
              "syllabus--2-t-t-r-t-t"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 92
            }
          },
          {
            "id": "syllabus--find-the-sum-to-n-terms-of-the-series-0-9-0-99-0-999",
            "name": "Find the sum to n terms of the series 0.9 + 0.99 + 0.999 + …",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-sum-of-the-series-0-15-0-015-0-0015-to-15-terms"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 92
            }
          },
          {
            "id": "syllabus--find-the-sum-to-n-terms-of-the-series-5-55-555",
            "name": "Find the sum to n terms of the series 5 + 55 + 555 + …",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-sum-to-n-terms-of-the-series-0-9-0-99-0-999"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 92
            }
          },
          {
            "id": "syllabus--the-sum-of-the-first-n-terms-of-the-sequence-3-6-12-is-381-find-n-page-90",
            "name": "The sum of the first n terms of the sequence 3, 6, 12, … is 381. Find n.Page | 90",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-sum-to-n-terms-of-the-series-5-55-555"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--find-the-sum-to-n-terms-of-the-series",
            "name": "Find the sum to n terms of the series",
            "minutes": 25,
            "deps": [
              "syllabus--the-sum-of-the-first-n-terms-of-the-sequence-3-6-12-is-381-find-n-page-90"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--find-the-sum-of-the-infinite-terms-of-the-series",
            "name": "Find the sum of the infinite terms of the series",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-sum-to-n-terms-of-the-series"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--the-sum-of-an-infinite-series-of-gp-is-6-and-sum-of-the-squares-of-these-terms-i",
            "name": "The sum of an infinite series of GP is 6 and sum of the squares of these terms is",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-sum-of-the-infinite-terms-of-the-series"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--find-the-common-ratio-of-the-original-gp",
            "name": "Find the common ratio of the original GP",
            "minutes": 25,
            "deps": [
              "syllabus--the-sum-of-an-infinite-series-of-gp-is-6-and-sum-of-the-squares-of-these-terms-i"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--if-the-sum-to-infinity-of-the-series-2-3-1-r-r-r-is-s-given-that-r-1-then-write-",
            "name": "If the sum to infinity of the series     2 3 1 r r r is S, given that |r| < 1 then write r in terms of S",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-common-ratio-of-the-original-gp"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--find-the-value-of-4-1-2-4-1-4-4-1-8-4-1-16-to",
            "name": "Find the value of 4 1 2 ∙ 4 1 4 ∙ 4 1 8 ∙ 4 1 16 … to ",
            "minutes": 25,
            "deps": [
              "syllabus--if-the-sum-to-infinity-of-the-series-2-3-1-r-r-r-is-s-given-that-r-1-then-write-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--the-midpoints-d-e-and-f-of-the-sides-of-an-equilateral-triangle-abc-are-joined-t",
            "name": "The midpoints D, E and F of the sides of an equilateral triangle ABC are joined to form another smaller equilateral triangle. This process is repeated in the",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-value-of-4-1-2-4-1-4-4-1-8-4-1-16-to"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--let-f-x-2x-1-then-find-the-number-of-values-of-x-for-which-f-x-f-2x-f-4x-are-in-",
            "name": "Let f(x) = 2x + 1, then find the number of values of x for which f(x), f(2x), f(4x) are in a GP",
            "minutes": 25,
            "deps": [
              "syllabus--the-midpoints-d-e-and-f-of-the-sides-of-an-equilateral-triangle-abc-are-joined-t"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--if-1-2-3-4-t-t-t-t-are-the-terms-of-a-gp-whose-common-ratio-is-r-such-that",
            "name": "If  1 2 3 4 , , , , t t t t are the terms of a GP whose common ratio is r such that",
            "minutes": 25,
            "deps": [
              "syllabus--let-f-x-2x-1-then-find-the-number-of-values-of-x-for-which-f-x-f-2x-f-4x-are-in-"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--a-particular-ball-rebounds",
            "name": "A particular ball rebounds",
            "minutes": 15,
            "deps": [
              "syllabus--if-1-2-3-4-t-t-t-t-are-the-terms-of-a-gp-whose-common-ratio-is-r-such-that"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 93
            }
          },
          {
            "id": "syllabus--also-find-the-sum-of-the-first-8-terms-using-the-above-formula-solution-the-sequ",
            "name": "Also find the sum of the first 8 terms using the above formula. Solution: The sequence is 3, 7, 13, 21, 31, … in which b = 3, a = 4 and d = 2",
            "minutes": 25,
            "deps": [
              "syllabus--a-particular-ball-rebounds"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 96
            }
          },
          {
            "id": "syllabus--find-the-nth-term-and-the-sum-of-the-first-n-terms-of-the-series-1-9-24-46-75",
            "name": "Find the nth term and the sum of the first n terms of the series 1 + 9 + 24 + 46 + 75 + …",
            "minutes": 25,
            "deps": [
              "syllabus--also-find-the-sum-of-the-first-8-terms-using-the-above-formula-solution-the-sequ"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          },
          {
            "id": "syllabus--find-the-10th-term-and-the-sum-of-the-first-10-terms-of-the-series-4-5-9-16-26",
            "name": "Find the 10th term and the sum of the first 10 terms of the series 4 + 5 + 9 + 16 + 26 + ⋯",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-nth-term-and-the-sum-of-the-first-n-terms-of-the-series-1-9-24-46-75"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          },
          {
            "id": "syllabus--find-the-nth-term-and-the-sum-of-the-first-12-terms-of-the-series-3-6-11-18-27",
            "name": "Find the nth term and the sum of the first 12 terms of the series 3 + 6 + 11 + 18 + 27 + ⋯",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-10th-term-and-the-sum-of-the-first-10-terms-of-the-series-4-5-9-16-26"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          },
          {
            "id": "syllabus--find-the-8th-term-and-the-sum-of-the-first-8-terms-of-the-series-4-13-28-49-76-s",
            "name": "Find the 8th term and the sum of the first 8 terms of the series 4 + 13 + 28 + 49 + 76 + ⋯ Summary",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-nth-term-and-the-sum-of-the-first-12-terms-of-the-series-3-6-11-18-27"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          },
          {
            "id": "syllabus--the-sum-of-the-first-n-terms-of-a-gp-is-given-by",
            "name": "The sum of the first n terms of a GP is given by",
            "minutes": 25,
            "deps": [
              "syllabus--find-the-8th-term-and-the-sum-of-the-first-8-terms-of-the-series-4-13-28-49-76-s"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          },
          {
            "id": "syllabus--the-sum-to-infinite-terms-of-a-gp-is-given-by",
            "name": "The sum to infinite terms of a GP is given by  ",
            "minutes": 25,
            "deps": [
              "syllabus--the-sum-of-the-first-n-terms-of-a-gp-is-given-by"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          },
          {
            "id": "syllabus--the-nth-term-of-a-series-in-which-the-subsequent-differences-form-an-ap-is-given",
            "name": "The nth term of a series in which the subsequent differences form an AP is given by n t = b ∙ C(n – 1, 0) + a ∙ C(n – 1, 1) + d ∙ C(n – 1, 2)",
            "minutes": 25,
            "deps": [
              "syllabus--the-sum-to-infinite-terms-of-a-gp-is-given-by"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          },
          {
            "id": "syllabus--the-sum-of-the-first-n-term-of-a-series-in-which-the-subsequent-differences-form",
            "name": "The sum of the first n term of a series in which the subsequent differences form an AP is given by Sn = b ∙ C(n, 1) + a ∙ C(n, 2) + d ∙ C(n, 3)",
            "minutes": 25,
            "deps": [
              "syllabus--the-nth-term-of-a-series-in-which-the-subsequent-differences-form-an-ap-is-given"
            ],
            "source": {
              "pdf": "maths-advanced",
              "page": 97
            }
          }
        ]
      }
    ]
  },
  {
    "id": "science",
    "name": "Science",
    "chapters": [
      {
        "id": "tissues",
        "name": "Tissues",
        "concepts": [
          {
            "id": "tissues--importance-meristematic-and-permanent-tissues",
            "name": "importance meristematic and permanent tissues",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-ix-x",
              "page": 5
            }
          },
          {
            "id": "tissues--parenchyma",
            "name": "parenchyma",
            "minutes": 10,
            "deps": [
              "tissues--importance-meristematic-and-permanent-tissues"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 5
            }
          },
          {
            "id": "tissues--collenchyma-and-the-living-organisms-sclerenchyma",
            "name": "collenchyma and the living organisms sclerenchyma",
            "minutes": 20,
            "deps": [
              "tissues--parenchyma"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 5
            }
          },
          {
            "id": "tissues--xylem-and-phloem",
            "name": "xylem and phloem",
            "minutes": 15,
            "deps": [
              "tissues--collenchyma-and-the-living-organisms-sclerenchyma"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "earth-as-a-system",
        "name": "Earth as a System",
        "concepts": [
          {
            "id": "earth-as-a-system--energy",
            "name": "Energy",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-ix-x",
              "page": 13
            }
          },
          {
            "id": "earth-as-a-system--12-key-concepts-learning-outcomes",
            "name": "12 Key Concepts Learning Outcomes",
            "minutes": 20,
            "deps": [
              "earth-as-a-system--energy"
            ],
            "source": {
              "pdf": "science-ix-x",
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
            "id": "syllabus--verification-of-the-law-of-conservation-of-mass-in-a-chemical-reaction-ch-9",
            "name": "Verification of the law of conservation of mass in a chemical reaction. Ch. 9",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--preparation-of-stained-temporary-mounts-of-a-onion-peel-rhoeo-leaf-b-human-cheek",
            "name": "Preparation of stained temporary mounts of (a) onion peel/ Rhoeo leaf (b) human cheek cells to record observations and drawtheir labeled diagrams. Ch. 2",
            "minutes": 25,
            "deps": [
              "syllabus--verification-of-the-law-of-conservation-of-mass-in-a-chemical-reaction-ch-9"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--to-study-a-budding-in-yeast-and-hydra-b-spore-formation-in-bread-mold-with-the-h",
            "name": "To study (a) budding in yeast and Hydra (b) spore formation in bread mold with the help of prepared slides Ch. 11",
            "minutes": 25,
            "deps": [
              "syllabus--preparation-of-stained-temporary-mounts-of-a-onion-peel-rhoeo-leaf-b-human-cheek"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--to-study-and-identify-different-parts-of-a-typical-bisexual-flower-draw-labeled-",
            "name": "To study and identify different parts of a typical bisexual flower. Draw labeled diagrams. Ch. 11",
            "minutes": 25,
            "deps": [
              "syllabus--to-study-a-budding-in-yeast-and-hydra-b-spore-formation-in-bread-mold-with-the-h"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--to-study-the-specimens-virtual-specimens-slides-models-for-identification-ch-12",
            "name": "To study the Specimens/virtual specimens/slides/models for identification– Ch. 12",
            "minutes": 25,
            "deps": [
              "syllabus--to-study-and-identify-different-parts-of-a-typical-bisexual-flower-draw-labeled-"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--verification-of-law-of-conservation-of-energy-using-a-simple-pendulum-ch-7",
            "name": "Verification of law of conservation of energy using a simple pendulum. Ch. 7",
            "minutes": 25,
            "deps": [
              "syllabus--to-study-the-specimens-virtual-specimens-slides-models-for-identification-ch-12"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--determination-of-speed-of-a-pulse-propagated-through-a-stretched-string-slinky-h",
            "name": "Determination of speed of a pulse propagated through a stretched string/ slinky (helical spring). Ch.10",
            "minutes": 25,
            "deps": [
              "syllabus--verification-of-law-of-conservation-of-energy-using-a-simple-pendulum-ch-7"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--calculation-of-mechanical-advantage-of-a-lever-using-the-formula-m-a-load-effort",
            "name": "Calculation of Mechanical Advantage of a lever using the formula M.A= Load /Effort. Ch. 7",
            "minutes": 25,
            "deps": [
              "syllabus--determination-of-speed-of-a-pulse-propagated-through-a-stretched-string-slinky-h"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--verification-of-newtons-second-law-of-motion-using-a-trolley-pulley-and-hanging-",
            "name": "Verification of Newton’s Second Law of Motion using a trolley, pulley and hanging masses. Ch. 6",
            "minutes": 25,
            "deps": [
              "syllabus--calculation-of-mechanical-advantage-of-a-lever-using-the-formula-m-a-load-effort"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 19
            }
          },
          {
            "id": "syllabus--plotting-of-distance-time-and-velocity-time-graphs-using-an-inclined-plane-ch-4p",
            "name": "Plotting of distance-time and velocity time graphs using an inclined plane. Ch. 4PRESCRIBED BOOKS:",
            "minutes": 25,
            "deps": [
              "syllabus--verification-of-newtons-second-law-of-motion-using-a-trolley-pulley-and-hanging-"
            ],
            "source": {
              "pdf": "science-ix-x",
              "page": 20
            }
          }
        ]
      },
      {
        "id": "chemical-reactions-and-equations",
        "name": "Chemical Reactions and Equations",
        "concepts": [
          {
            "id": "chemical-reactions-and-equations--chemical-reactions",
            "name": "Chemical reactions",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--chemical-equation",
            "name": "Chemical equation",
            "minutes": 10,
            "deps": [
              "chemical-reactions-and-equations--chemical-reactions"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--balanced-chemical-equation",
            "name": "Balanced chemical equation",
            "minutes": 15,
            "deps": [
              "chemical-reactions-and-equations--chemical-equation"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--combination",
            "name": "combination",
            "minutes": 10,
            "deps": [
              "chemical-reactions-and-equations--balanced-chemical-equation"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--decomposition",
            "name": "decomposition",
            "minutes": 10,
            "deps": [
              "chemical-reactions-and-equations--combination"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--displacement",
            "name": "displacement",
            "minutes": 10,
            "deps": [
              "chemical-reactions-and-equations--decomposition"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--double-displacement",
            "name": "double displacement",
            "minutes": 10,
            "deps": [
              "chemical-reactions-and-equations--displacement"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--precipitation",
            "name": "precipitation",
            "minutes": 10,
            "deps": [
              "chemical-reactions-and-equations--double-displacement"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--endothermic-exothermic-reactions",
            "name": "endothermic exothermic reactions",
            "minutes": 15,
            "deps": [
              "chemical-reactions-and-equations--precipitation"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "chemical-reactions-and-equations--oxidation-and-reduction",
            "name": "oxidation and reduction",
            "minutes": 15,
            "deps": [
              "chemical-reactions-and-equations--endothermic-exothermic-reactions"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "periodic-classification-of-elements",
        "name": "Periodic Classification of Elements",
        "concepts": [
          {
            "id": "periodic-classification-of-elements--d-bereiners-triads",
            "name": "Döbereiner’s Triads",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "periodic-classification-of-elements--newlands-law-of-octaves",
            "name": "Newlands’ Law of Octaves",
            "minutes": 15,
            "deps": [
              "periodic-classification-of-elements--d-bereiners-triads"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "periodic-classification-of-elements--mendel-evs-periodic-table",
            "name": "Mendeléev’s Periodic Table",
            "minutes": 15,
            "deps": [
              "periodic-classification-of-elements--newlands-law-of-octaves"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "periodic-classification-of-elements--modern-periodic-table-and-the-modern",
            "name": "Modern Periodic Table and the Modern",
            "minutes": 20,
            "deps": [
              "periodic-classification-of-elements--mendel-evs-periodic-table"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "periodic-classification-of-elements--metallic-and-non-metallic-properties",
            "name": "Metallic and Non- metallic Properties",
            "minutes": 20,
            "deps": [
              "periodic-classification-of-elements--modern-periodic-table-and-the-modern"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "acids-bases-and-salts",
        "name": "Acids, Bases and Salts",
        "concepts": [
          {
            "id": "acids-bases-and-salts--acids-and-bases-definitions-in-terms-of-furnishing-of-h-and-oh-ions",
            "name": "Acids and Bases – definitions in terms of furnishing of H+ and OH– ions",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "acids-bases-and-salts--identification-using-indicators",
            "name": "identification using indicators",
            "minutes": 15,
            "deps": [
              "acids-bases-and-salts--acids-and-bases-definitions-in-terms-of-furnishing-of-h-and-oh-ions"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "acids-bases-and-salts--chemical-properties",
            "name": "chemical properties",
            "minutes": 10,
            "deps": [
              "acids-bases-and-salts--identification-using-indicators"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "acids-bases-and-salts--examples-and-uses",
            "name": "examples and uses",
            "minutes": 15,
            "deps": [
              "acids-bases-and-salts--chemical-properties"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "acids-bases-and-salts--neutralization",
            "name": "neutralization",
            "minutes": 10,
            "deps": [
              "acids-bases-and-salts--examples-and-uses"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "acids-bases-and-salts--concept-of-ph-scale-definition-relating-to-logarithm-not-required",
            "name": "concept of pH scale (Definition relating to logarithm not required)",
            "minutes": 25,
            "deps": [
              "acids-bases-and-salts--neutralization"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          },
          {
            "id": "acids-bases-and-salts--importance",
            "name": "importance",
            "minutes": 10,
            "deps": [
              "acids-bases-and-salts--concept-of-ph-scale-definition-relating-to-logarithm-not-required"
            ],
            "source": {
              "pdf": "science-x",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "metals-and-non-metals",
        "name": "Metals and Non-metals",
        "concepts": [
          {
            "id": "metals-and-non-metals--properties-of-metals-and-non-metals",
            "name": "Properties of metals and non-metals",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "metals-and-non-metals--reactivity-series",
            "name": "Reactivity series",
            "minutes": 10,
            "deps": [
              "metals-and-non-metals--properties-of-metals-and-non-metals"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "metals-and-non-metals--formation-and-properties-of-ionic-compounds",
            "name": "Formation and properties of ionic compounds",
            "minutes": 20,
            "deps": [
              "metals-and-non-metals--reactivity-series"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "metals-and-non-metals--basic-metallurgical-processes",
            "name": "Basic metallurgical processes",
            "minutes": 15,
            "deps": [
              "metals-and-non-metals--formation-and-properties-of-ionic-compounds"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "metals-and-non-metals--corrosion-and-its-prevention",
            "name": "Corrosion and its prevention",
            "minutes": 15,
            "deps": [
              "metals-and-non-metals--basic-metallurgical-processes"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "carbon-and-its-compounds",
        "name": "Carbon and its Compounds",
        "concepts": [
          {
            "id": "carbon-and-its-compounds--covalent-bonds-formation-and-properties-of-covalent-compounds",
            "name": "Covalent bonds – formation and properties of covalent compounds",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "carbon-and-its-compounds--versatile-nature-of-carbon",
            "name": "Versatile nature of carbon",
            "minutes": 15,
            "deps": [
              "carbon-and-its-compounds--covalent-bonds-formation-and-properties-of-covalent-compounds"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "carbon-and-its-compounds--hydrocarbons-saturated-and-unsaturated-homologous-series-nomenclature-of-alkanes",
            "name": "Hydrocarbons – saturated and unsaturated Homologous series. Nomenclature of alkanes",
            "minutes": 25,
            "deps": [
              "carbon-and-its-compounds--versatile-nature-of-carbon"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "carbon-and-its-compounds--alkenes",
            "name": "alkenes",
            "minutes": 10,
            "deps": [
              "carbon-and-its-compounds--hydrocarbons-saturated-and-unsaturated-homologous-series-nomenclature-of-alkanes"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "carbon-and-its-compounds--soaps-and-detergents",
            "name": "soaps and detergents",
            "minutes": 15,
            "deps": [
              "carbon-and-its-compounds--alkenes"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "theme",
        "name": "Theme",
        "concepts": [
          {
            "id": "theme--the-world-of-the-living",
            "name": "The World of the Living",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "life-processes",
        "name": "Life processes",
        "concepts": [
          {
            "id": "life-processes--living-being-basic-concept-of-nutrition",
            "name": "‘Living Being’. Basic concept of nutrition",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "life-processes--respiration",
            "name": "respiration",
            "minutes": 10,
            "deps": [
              "life-processes--living-being-basic-concept-of-nutrition"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "life-processes--transport-and-excretion-in-plants-and-animals",
            "name": "transport and excretion in plants and animals",
            "minutes": 20,
            "deps": [
              "life-processes--respiration"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "control-and-co-ordination-in-animals-and-plants",
        "name": "Control and co-ordination in animals and plants",
        "concepts": [
          {
            "id": "control-and-co-ordination-in-animals-and-plants--tropic-movements-in-plants",
            "name": "Tropic movements in plants",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "control-and-co-ordination-in-animals-and-plants--introduction-of-plant-hormones",
            "name": "Introduction of plant hormones",
            "minutes": 15,
            "deps": [
              "control-and-co-ordination-in-animals-and-plants--tropic-movements-in-plants"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "control-and-co-ordination-in-animals-and-plants--nervous-system",
            "name": "Nervous system",
            "minutes": 10,
            "deps": [
              "control-and-co-ordination-in-animals-and-plants--introduction-of-plant-hormones"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "control-and-co-ordination-in-animals-and-plants--voluntary",
            "name": "Voluntary",
            "minutes": 10,
            "deps": [
              "control-and-co-ordination-in-animals-and-plants--nervous-system"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "control-and-co-ordination-in-animals-and-plants--involuntary-and-reflex-action",
            "name": "involuntary and reflex action",
            "minutes": 15,
            "deps": [
              "control-and-co-ordination-in-animals-and-plants--voluntary"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "control-and-co-ordination-in-animals-and-plants--animal-hormones",
            "name": "animal hormones",
            "minutes": 10,
            "deps": [
              "control-and-co-ordination-in-animals-and-plants--involuntary-and-reflex-action"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "heredity",
        "name": "Heredity",
        "concepts": [
          {
            "id": "heredity--heredity",
            "name": "Heredity",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "heredity--sex-determination",
            "name": "Sex determination",
            "minutes": 10,
            "deps": [
              "heredity--heredity"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "heredity--brief-introduction",
            "name": "brief introduction",
            "minutes": 10,
            "deps": [
              "heredity--sex-determination"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "evolution",
        "name": "Evolution",
        "concepts": [
          {
            "id": "evolution--acquired-and-inherited-traits",
            "name": "Acquired and Inherited Traits",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "evolution--speciation",
            "name": "Speciation",
            "minutes": 10,
            "deps": [
              "evolution--acquired-and-inherited-traits"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "evolution--evolution-and-classification",
            "name": "Evolution and Classification",
            "minutes": 15,
            "deps": [
              "evolution--speciation"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "evolution--tracing-evolutionary-relationships",
            "name": "Tracing Evolutionary Relationships",
            "minutes": 15,
            "deps": [
              "evolution--evolution-and-classification"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "evolution--fossils",
            "name": "Fossils",
            "minutes": 10,
            "deps": [
              "evolution--tracing-evolutionary-relationships"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "evolution--evolution-by-stages",
            "name": "Evolution by Stages",
            "minutes": 15,
            "deps": [
              "evolution--fossils"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          },
          {
            "id": "evolution--human-evolution",
            "name": "Human Evolution",
            "minutes": 10,
            "deps": [
              "evolution--evolution-by-stages"
            ],
            "source": {
              "pdf": "science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "magnetic-effects-of-current",
        "name": "Magnetic effects of current",
        "concepts": [
          {
            "id": "magnetic-effects-of-current--magnetic-field",
            "name": "Magnetic field",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "magnetic-effects-of-current--field-lines",
            "name": "field lines",
            "minutes": 10,
            "deps": [
              "magnetic-effects-of-current--magnetic-field"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "magnetic-effects-of-current--field-due-to-a-current-carrying-conductor",
            "name": "field due to a current carrying conductor",
            "minutes": 20,
            "deps": [
              "magnetic-effects-of-current--field-lines"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "magnetic-effects-of-current--field-due-to-current-carrying-coil-or-solenoid",
            "name": "field due to current carrying coil or solenoid",
            "minutes": 25,
            "deps": [
              "magnetic-effects-of-current--field-due-to-a-current-carrying-conductor"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "magnetic-effects-of-current--force-on-current-carrying-conductor",
            "name": "Force on current carrying conductor",
            "minutes": 20,
            "deps": [
              "magnetic-effects-of-current--field-due-to-current-carrying-coil-or-solenoid"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "magnetic-effects-of-current--flemings-left-hand-rule",
            "name": "Fleming’s Left Hand Rule",
            "minutes": 15,
            "deps": [
              "magnetic-effects-of-current--force-on-current-carrying-conductor"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "magnetic-effects-of-current--frequency-of-ac-advantage-of-ac-over-dc-domestic-electric-circuits",
            "name": "frequency of AC. Advantage of AC over DC. Domestic electric circuits",
            "minutes": 25,
            "deps": [
              "magnetic-effects-of-current--flemings-left-hand-rule"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "our-environment",
        "name": "Our environment",
        "concepts": [
          {
            "id": "our-environment--eco-system",
            "name": "Eco-system",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "our-environment--environmental-problems",
            "name": "Environmental problems",
            "minutes": 10,
            "deps": [
              "our-environment--eco-system"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "our-environment--ozone-depletion",
            "name": "Ozone depletion",
            "minutes": 10,
            "deps": [
              "our-environment--environmental-problems"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          },
          {
            "id": "our-environment--waste-production-and-their-solutions-biodegradable-and-non-biodegradable-substan",
            "name": "waste production and their solutions. Biodegradable and non-biodegradable substances",
            "minutes": 25,
            "deps": [
              "our-environment--ozone-depletion"
            ],
            "source": {
              "pdf": "science-x",
              "page": 6
            }
          }
        ]
      }
    ]
  },
  {
    "id": "science-at-advanced-level",
    "name": "Science at Advanced Level",
    "chapters": [
      {
        "id": "engineering-life",
        "name": "Engineering Life",
        "concepts": [
          {
            "id": "engineering-life--miracles-in-biotechnology-70-85-10",
            "name": "Miracles in Biotechnology 70-85 10",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 2
            }
          },
          {
            "id": "engineering-life--miracles-in-biotechnology",
            "name": "Miracles in Biotechnology",
            "minutes": 15,
            "deps": [
              "engineering-life--miracles-in-biotechnology-70-85-10"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 70
            }
          }
        ]
      },
      {
        "id": "materials",
        "name": "Materials",
        "concepts": [
          {
            "id": "materials--notebook",
            "name": "Notebook",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 10
            }
          },
          {
            "id": "materials--stopwatch-mobile-timer",
            "name": "stopwatch (mobile timer)",
            "minutes": 15,
            "deps": [
              "materials--notebook"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 10
            }
          },
          {
            "id": "materials--chalk",
            "name": "Chalk",
            "minutes": 10,
            "deps": [
              "materials--stopwatch-mobile-timer"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "materials--graph-paper",
            "name": "Graph paper",
            "minutes": 10,
            "deps": [
              "materials--chalk"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 12
            }
          },
          {
            "id": "materials--ruler",
            "name": "ruler",
            "minutes": 10,
            "deps": [
              "materials--graph-paper"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 12
            }
          },
          {
            "id": "materials--1-on-a-graph-paper",
            "name": "1. On a graph paper",
            "minutes": 20,
            "deps": [
              "materials--ruler"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 12
            }
          },
          {
            "id": "materials--draw-a-vector-representing-4-units-towards-the-east-2-from-the-head-end-of-this-",
            "name": "draw a vector representing 4 units towards the east. 2. From the head (end) of this vector",
            "minutes": 25,
            "deps": [
              "materials--1-on-a-graph-paper"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 12
            }
          },
          {
            "id": "materials--toy-car-or-small-wheeled-object",
            "name": "Toy car (or small wheeled object)",
            "minutes": 20,
            "deps": [
              "materials--draw-a-vector-representing-4-units-towards-the-east-2-from-the-head-end-of-this-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "materials--smooth-floor",
            "name": "smooth floor",
            "minutes": 10,
            "deps": [
              "materials--toy-car-or-small-wheeled-object"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "materials--measuring-tape",
            "name": "measuring tape",
            "minutes": 10,
            "deps": [
              "materials--smooth-floor"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "discussion",
        "name": "Discussion",
        "concepts": [
          {
            "id": "discussion--when-both-students-walk-together-at-the-same-speed",
            "name": "- When both students walk together at the same speed",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "discussion--they-appear-at-rest-relative-to-each-other-but-moving-relative-to-the-classroom",
            "name": "they appear ‘at rest’ relative to each other but ‘moving’ relative to the classroom",
            "minutes": 25,
            "deps": [
              "discussion--when-both-students-walk-together-at-the-same-speed"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "discussion--the-froth-is-co2",
            "name": "The froth is CO2",
            "minutes": 15,
            "deps": [
              "discussion--they-appear-at-rest-relative-to-each-other-but-moving-relative-to-the-classroom"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 74
            }
          }
        ]
      },
      {
        "id": "scalars",
        "name": "Scalars",
        "concepts": [
          {
            "id": "scalars--quantities-having-magnitude-only-distance-time-mass-speed-and-work",
            "name": "Quantities having magnitude only (distance, time, mass, speed and work)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "vectors",
        "name": "Vectors",
        "concepts": [
          {
            "id": "vectors--quantities-having-both-magnitude-and-direction-displacement-velocity-force",
            "name": "Quantities having both magnitude and direction (displacement, velocity, force)",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          }
        ]
      },
      {
        "id": "observation",
        "name": "Observation",
        "concepts": [
          {
            "id": "observation--distance-changes-but-displacement-becomes-zero-when-returning-to-the-starting-po",
            "name": "- Distance changes but displacement becomes zero when returning to the starting point",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "observation--the-distance-travelled-in-successive-intervals-increases",
            "name": "The distance travelled in successive intervals increases",
            "minutes": 20,
            "deps": [
              "observation--distance-changes-but-displacement-becomes-zero-when-returning-to-the-starting-po"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "observation--the-motion-is-accelerated-motion",
            "name": "The motion is accelerated motion",
            "minutes": 20,
            "deps": [
              "observation--the-distance-travelled-in-successive-intervals-increases"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "observation--milk-turns-into-curd",
            "name": "Milk turns into curd",
            "minutes": 15,
            "deps": [
              "observation--the-motion-is-accelerated-motion"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          },
          {
            "id": "observation--record-your-observations-and-results-in-the-following-table",
            "name": "Record your observations and results in the following table",
            "minutes": 25,
            "deps": [
              "observation--milk-turns-into-curd"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 72
            }
          },
          {
            "id": "observation--you-will-observe-frothing-and-a-pungent-odour-emerging",
            "name": "You will observe frothing and a pungent odour emerging",
            "minutes": 25,
            "deps": [
              "observation--record-your-observations-and-results-in-the-following-table"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 74
            }
          }
        ]
      },
      {
        "id": "now-understanding-the-scenario",
        "name": "Now understanding the scenario",
        "concepts": [
          {
            "id": "now-understanding-the-scenario--why-does-a-passenger-fall-backwards-when-a-bus-starts-suddenly",
            "name": "Why does a passenger fall backwards when a bus starts suddenly?",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 16
            }
          }
        ]
      },
      {
        "id": "orbital-motion",
        "name": "Orbital Motion",
        "concepts": [
          {
            "id": "orbital-motion--why-the-earth-and-moon-do-not-fall-despite-gravity",
            "name": "Why the Earth and Moon Do Not Fall Despite Gravity?",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 18
            }
          }
        ]
      },
      {
        "id": "let-us-calculate",
        "name": "Let us Calculate",
        "concepts": [
          {
            "id": "let-us-calculate--string-and-simple-pulley-as-shown",
            "name": "string and simple pulley as shown",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          }
        ]
      },
      {
        "id": "examples",
        "name": "Examples",
        "concepts": [
          {
            "id": "examples--friction-solid-and-drag-when-you-slide-a-book-across-a-table",
            "name": "Friction (solid and drag) When you slide a book across a table",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 31
            }
          },
          {
            "id": "examples--if-there-were-no-friction",
            "name": "● If there were no friction",
            "minutes": 20,
            "deps": [
              "examples--friction-solid-and-drag-when-you-slide-a-book-across-a-table"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 31
            }
          },
          {
            "id": "examples--would-a-moving-object-ever-stop-why-do-pendulums-slowly-stop-after-some-time",
            "name": "would a moving object ever stop? ● Why do pendulums slowly stop after some time?",
            "minutes": 25,
            "deps": [
              "examples--if-there-were-no-friction"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 31
            }
          },
          {
            "id": "examples--production-of-insulin-using-bacteria",
            "name": "Production of insulin using bacteria",
            "minutes": 20,
            "deps": [
              "examples--would-a-moving-object-ever-stop-why-do-pendulums-slowly-stop-after-some-time"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 72
            }
          },
          {
            "id": "examples--preparing-probiotic-kanji-prepare-kanji",
            "name": "Preparing Probiotic Kanji Prepare kanji",
            "minutes": 20,
            "deps": [
              "examples--production-of-insulin-using-bacteria"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 72
            }
          },
          {
            "id": "examples--salt",
            "name": "salt",
            "minutes": 10,
            "deps": [
              "examples--preparing-probiotic-kanji-prepare-kanji"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 72
            }
          },
          {
            "id": "examples--colour",
            "name": "colour",
            "minutes": 10,
            "deps": [
              "examples--salt"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 72
            }
          }
        ]
      },
      {
        "id": "example",
        "name": "Example",
        "concepts": [
          {
            "id": "example--a-using-the-graph",
            "name": "(a) Using the graph",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 34
            }
          },
          {
            "id": "example--calculate-the-maximum-speed-of-a-body-of-mass-0-5-kg-attached-to-the-spring",
            "name": "calculate the maximum speed of a body of mass 0.5 kg attached to the spring",
            "minutes": 25,
            "deps": [
              "example--a-using-the-graph"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 34
            }
          },
          {
            "id": "example--production-of-using-bacteria",
            "name": "Production of __________ using bacteria",
            "minutes": 20,
            "deps": [
              "example--calculate-the-maximum-speed-of-a-body-of-mass-0-5-kg-attached-to-the-spring"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 73
            }
          }
        ]
      },
      {
        "id": "reason",
        "name": "Reason",
        "concepts": [
          {
            "id": "reason--sulphur-can-accommodate-more-than-eight-electrons-a-assertion-and-reason",
            "name": "Sulphur can accommodate more than eight electrons. A. Assertion and reason",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "reason--components-move-at-different-speeds-in-the-column-a-assertion-and-reason",
            "name": "Components move at different speeds in the column. A. Assertion and reason",
            "minutes": 25,
            "deps": [
              "reason--sulphur-can-accommodate-more-than-eight-electrons-a-assertion-and-reason"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "reason--it-involves-repeated-condensation-and-vaporization-a-assertion-and-reason",
            "name": "It involves repeated condensation and vaporization. A. Assertion and reason",
            "minutes": 25,
            "deps": [
              "reason--components-move-at-different-speeds-in-the-column-a-assertion-and-reason"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 55
            }
          },
          {
            "id": "reason--both-are-correct",
            "name": "both are correct",
            "minutes": 15,
            "deps": [
              "reason--it-involves-repeated-condensation-and-vaporization-a-assertion-and-reason"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 55
            }
          }
        ]
      },
      {
        "id": "reason-r",
        "name": "Reason (R)",
        "concepts": [
          {
            "id": "reason-r--metallic-bonds-are-non-directional",
            "name": "Metallic bonds are non-directional",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "reason-r--electrons-in-metals-are-localised-between-two-atoms-a-assertion-and-reason",
            "name": "Electrons in metals are localised between two atoms. A. Assertion and reason",
            "minutes": 25,
            "deps": [
              "reason-r--metallic-bonds-are-non-directional"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "reason-r--metals-are-malleable",
            "name": "Metals are malleable",
            "minutes": 15,
            "deps": [
              "reason-r--electrons-in-metals-are-localised-between-two-atoms-a-assertion-and-reason"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "reason-r--both-are-correct-and-reason-is-the-correct-explanation-of-the-assertion",
            "name": "both are correct and reason is the correct explanation of the assertion",
            "minutes": 25,
            "deps": [
              "reason-r--metals-are-malleable"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "reason-r--modern-biotechnology-allows-production-of-insulin-using-bacteria",
            "name": "Modern biotechnology allows production of insulin using bacteria",
            "minutes": 25,
            "deps": [
              "reason-r--both-are-correct-and-reason-is-the-correct-explanation-of-the-assertion"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 84
            }
          }
        ]
      },
      {
        "id": "application",
        "name": "Application",
        "concepts": [
          {
            "id": "application--today",
            "name": "Today",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 51
            }
          },
          {
            "id": "application--chromatography-is-widely-used-in-chemistry",
            "name": "chromatography is widely used in chemistry",
            "minutes": 20,
            "deps": [
              "application--today"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 51
            }
          },
          {
            "id": "application--biology",
            "name": "biology",
            "minutes": 10,
            "deps": [
              "application--chromatography-is-widely-used-in-chemistry"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 51
            }
          }
        ]
      },
      {
        "id": "procedure",
        "name": "Procedure",
        "concepts": [
          {
            "id": "procedure--in-this-technique",
            "name": "In this technique",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 51
            }
          },
          {
            "id": "procedure--a-long-glass-tube-having-a-stop-cock-near-the-bottom",
            "name": "a long glass tube having a stop cock near the bottom",
            "minutes": 25,
            "deps": [
              "procedure--in-this-technique"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 51
            }
          },
          {
            "id": "procedure--the-crude-oil-is-heated",
            "name": "the crude oil is heated",
            "minutes": 20,
            "deps": [
              "procedure--a-long-glass-tube-having-a-stop-cock-near-the-bottom"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 53
            }
          }
        ]
      },
      {
        "id": "materials-required",
        "name": "Materials Required",
        "concepts": [
          {
            "id": "materials-required--warm-milk",
            "name": "Warm milk",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          },
          {
            "id": "materials-required--a-spoon-of-curd",
            "name": "a spoon of curd",
            "minutes": 15,
            "deps": [
              "materials-required--warm-milk"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          }
        ]
      },
      {
        "id": "conclusion",
        "name": "Conclusion",
        "concepts": [
          {
            "id": "conclusion--traditional-vs-modern",
            "name": "Traditional vs Modern",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          }
        ]
      },
      {
        "id": "lag-phase",
        "name": "Lag Phase",
        "concepts": [
          {
            "id": "lag-phase--the-new-inoculum-is-added-to-the-nutrients-in-the-fermenter",
            "name": "The new inoculum is added to the nutrients in the fermenter",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          }
        ]
      },
      {
        "id": "log-phase",
        "name": "Log Phase",
        "concepts": [
          {
            "id": "log-phase--during-this-phase",
            "name": "During this phase",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          },
          {
            "id": "log-phase--microbial-growth-curve",
            "name": "Microbial growth curve",
            "minutes": 15,
            "deps": [
              "log-phase--during-this-phase"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          }
        ]
      },
      {
        "id": "stationary-phase",
        "name": "Stationary Phase",
        "concepts": [
          {
            "id": "stationary-phase--this-phase-is-also-known-as-the-survival-phase",
            "name": "This phase is also known as the Survival Phase",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          },
          {
            "id": "stationary-phase--wherein-nutrients-in-the-fermenters-start-depleting",
            "name": "wherein nutrients in the fermenters start depleting",
            "minutes": 20,
            "deps": [
              "stationary-phase--this-phase-is-also-known-as-the-survival-phase"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          },
          {
            "id": "stationary-phase--an-equal-number-of-cells-are-dying",
            "name": "an equal number of cells are dying",
            "minutes": 20,
            "deps": [
              "stationary-phase--wherein-nutrients-in-the-fermenters-start-depleting"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          }
        ]
      },
      {
        "id": "decline-death-phase-or-the-end-phase",
        "name": "Decline (Death) Phase or The End phase",
        "concepts": [
          {
            "id": "decline-death-phase-or-the-end-phase--the-toxic-waste-levels-become-too-high-in-the-fermenter",
            "name": "The toxic waste levels become too high in the fermenter",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          },
          {
            "id": "decline-death-phase-or-the-end-phase--engineers-use-a-continuous-culture-system-instead-of-a-closed-batch",
            "name": "engineers use a Continuous Culture system. Instead of a closed \"batch",
            "minutes": 25,
            "deps": [
              "decline-death-phase-or-the-end-phase--the-toxic-waste-levels-become-too-high-in-the-fermenter"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          },
          {
            "id": "decline-death-phase-or-the-end-phase--nutrient-replenishment-and-waste-removal-keep-the-microbes-locked-in-the-log-pha",
            "name": "Nutrient replenishment and waste removal keep the microbes locked in the Log Phase",
            "minutes": 25,
            "deps": [
              "decline-death-phase-or-the-end-phase--engineers-use-a-continuous-culture-system-instead-of-a-closed-batch"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          },
          {
            "id": "decline-death-phase-or-the-end-phase--sensors-detect-changes-in-ph-and-temperature-if-acidic-waste-builds-up",
            "name": "Sensors detect changes in pH and temperature. If acidic waste builds up",
            "minutes": 25,
            "deps": [
              "decline-death-phase-or-the-end-phase--nutrient-replenishment-and-waste-removal-keep-the-microbes-locked-in-the-log-pha"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          },
          {
            "id": "decline-death-phase-or-the-end-phase--a-base-is-automatically-added-to-maintain-a-stable",
            "name": "a base is automatically added to maintain a stable",
            "minutes": 25,
            "deps": [
              "decline-death-phase-or-the-end-phase--sensors-detect-changes-in-ph-and-temperature-if-acidic-waste-builds-up"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          },
          {
            "id": "decline-death-phase-or-the-end-phase--life-supporting-environment",
            "name": "life- supporting environment",
            "minutes": 15,
            "deps": [
              "decline-death-phase-or-the-end-phase--a-base-is-automatically-added-to-maintain-a-stable"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--measurement-foundation-of-science-4-9",
            "name": "Measurement – Foundation of Science 4-9",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 2
            }
          },
          {
            "id": "syllabus--divide-students-in-3-groups-and-hand-over-one-stick-to-each-group",
            "name": "Divide students in 3 groups and hand over one stick to each group",
            "minutes": 25,
            "deps": [
              "syllabus--measurement-foundation-of-science-4-9"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 4
            }
          },
          {
            "id": "syllabus--estimate-the-length-of-the-blackboard-without-measuring",
            "name": "Estimate the length of the blackboard without measuring",
            "minutes": 25,
            "deps": [
              "syllabus--divide-students-in-3-groups-and-hand-over-one-stick-to-each-group"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 5
            }
          },
          {
            "id": "syllabus--then-measure-its-length-using-a-meter-scale",
            "name": "Then measure its length using a meter scale",
            "minutes": 25,
            "deps": [
              "syllabus--estimate-the-length-of-the-blackboard-without-measuring"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 5
            }
          },
          {
            "id": "syllabus--compare-the-estimated-and-measured-values-now-calculate-the-inaccuracy",
            "name": "Compare the estimated and measured values. Now, calculate the inaccuracy",
            "minutes": 25,
            "deps": [
              "syllabus--then-measure-its-length-using-a-meter-scale"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 5
            }
          },
          {
            "id": "syllabus--2-different-systems-of-units-in-earlier-times-different-regions-places-used-thei",
            "name": "2 Different Systems of Units In earlier times, different regions/places used their own units of measurement, which often led to confusion and errors",
            "minutes": 25,
            "deps": [
              "syllabus--compare-the-estimated-and-measured-values-now-calculate-the-inaccuracy"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 5
            }
          },
          {
            "id": "syllabus--measure-the-length-of-a-book-using-both-cm-and-inches",
            "name": "Measure the length of a book using both cm and inches",
            "minutes": 25,
            "deps": [
              "syllabus--2-different-systems-of-units-in-earlier-times-different-regions-places-used-thei"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 6
            }
          },
          {
            "id": "syllabus--compare-the-values-and-find-the-relation-between-them",
            "name": "Compare the values and find the relation between them",
            "minutes": 25,
            "deps": [
              "syllabus--measure-the-length-of-a-book-using-both-cm-and-inches"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 6
            }
          },
          {
            "id": "syllabus--name-any-two-systems-of-units",
            "name": "Name any two systems of units",
            "minutes": 20,
            "deps": [
              "syllabus--compare-the-values-and-find-the-relation-between-them"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 7
            }
          },
          {
            "id": "syllabus--why-is-si-system-preferred-over-other-systems",
            "name": "Why is SI system preferred over other systems?",
            "minutes": 25,
            "deps": [
              "syllabus--name-any-two-systems-of-units"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 7
            }
          },
          {
            "id": "syllabus--convert-250-n-into-gcm-s2",
            "name": "Convert 250 N into gcm/s2",
            "minutes": 20,
            "deps": [
              "syllabus--why-is-si-system-preferred-over-other-systems"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 7
            }
          },
          {
            "id": "syllabus--convert-1000-kg-l-into-kg-m3-check-your-understanding",
            "name": "Convert 1000 kg/L into kg/m3. Check Your Understanding",
            "minutes": 25,
            "deps": [
              "syllabus--convert-250-n-into-gcm-s2"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 7
            }
          },
          {
            "id": "syllabus--which-of-the-following-is-not-an-si-unit-a-meter-b-kilogram-c-second8-d-foot",
            "name": "Which of the following is not an SI unit? a) Meter b) Kilogram c) Second8 d) foot",
            "minutes": 25,
            "deps": [
              "syllabus--convert-1000-kg-l-into-kg-m3-check-your-understanding"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 7
            }
          },
          {
            "id": "syllabus--the-si-unit-of-mass-is-a-gram-b-kilogram-c-pound-d-tonne",
            "name": "The SI unit of mass is: a) Gram b) Kilogram c) Pound d) tonne",
            "minutes": 25,
            "deps": [
              "syllabus--which-of-the-following-is-not-an-si-unit-a-meter-b-kilogram-c-second8-d-foot"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--name-the-system-of-units-used-internationally",
            "name": "Name the system of units used internationally",
            "minutes": 20,
            "deps": [
              "syllabus--the-si-unit-of-mass-is-a-gram-b-kilogram-c-pound-d-tonne"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--why-is-a-common-system-of-units-necessary",
            "name": "Why is a common system of units necessary?",
            "minutes": 25,
            "deps": [
              "syllabus--name-the-system-of-units-used-internationally"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--why-is-measurement-necessary-in-physics",
            "name": "Why is measurement necessary in physics?",
            "minutes": 20,
            "deps": [
              "syllabus--why-is-a-common-system-of-units-necessary"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--why-was-there-a-need-for-a-common-system-of-units",
            "name": "Why was there a need for a common system of units?",
            "minutes": 25,
            "deps": [
              "syllabus--why-is-measurement-necessary-in-physics"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--explain-the-relation-magnitude-numerical-value-unit",
            "name": "Explain the relation: Magnitude = Numerical value × Unit",
            "minutes": 25,
            "deps": [
              "syllabus--why-was-there-a-need-for-a-common-system-of-units"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--why-are-numerical-values-different",
            "name": "Why are numerical values different?",
            "minutes": 20,
            "deps": [
              "syllabus--explain-the-relation-magnitude-numerical-value-unit"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--is-the-actual-size-of-the-classroom-different-why-or-why-not",
            "name": "Is the actual size of the classroom different? Why or Why not?",
            "minutes": 25,
            "deps": [
              "syllabus--why-are-numerical-values-different"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--what-conclusion-can-you-draw-about-units-and-measurement-from-this-activity",
            "name": "What conclusion can you draw about units and measurement from this activity?",
            "minutes": 25,
            "deps": [
              "syllabus--is-the-actual-size-of-the-classroom-different-why-or-why-not"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 8
            }
          },
          {
            "id": "syllabus--match-the-following-column-a-column-b-cgs-kelvin-fps-pound-si-international-syst",
            "name": "Match the following: Column A Column B CGS Kelvin FPS Pound SI International system MKS Meter-Kilogram-Second",
            "minutes": 25,
            "deps": [
              "syllabus--what-conclusion-can-you-draw-about-units-and-measurement-from-this-activity"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--what-problems-might-occur-if-every-country-used-its-own-system-of-units-for-meas",
            "name": "What problems might occur if every country used its own system of units for measurement?",
            "minutes": 25,
            "deps": [
              "syllabus--match-the-following-column-a-column-b-cgs-kelvin-fps-pound-si-international-syst"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--a-scientist-measures-length-in-feet-and-another-in-meters-what-difficulties-may-",
            "name": "A scientist measures length in feet and another in meters. What difficulties may it lead to?",
            "minutes": 25,
            "deps": [
              "syllabus--what-problems-might-occur-if-every-country-used-its-own-system-of-units-for-meas"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--if-1-meter-was-defined-differently-in-different-countries-what-would-happen-to-i",
            "name": "If 1 meter was defined differently in different countries, what would happen to international trade?",
            "minutes": 25,
            "deps": [
              "syllabus--a-scientist-measures-length-in-feet-and-another-in-meters-what-difficulties-may-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 9
            }
          },
          {
            "id": "syllabus--mark-two-points-5-meters-apart-in-the-classroom-corridor-or-playground",
            "name": "Mark two points 5 meters apart in the classroom corridor or playground",
            "minutes": 25,
            "deps": [
              "syllabus--if-1-meter-was-defined-differently-in-different-countries-what-would-happen-to-i"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 10
            }
          },
          {
            "id": "syllabus--ask-one-student-to-walk-normally-from-one-point-to-another-while-another-student",
            "name": "Ask one student to walk normally from one point to another while another student measures the time taken using a stopwatch",
            "minutes": 25,
            "deps": [
              "syllabus--mark-two-points-5-meters-apart-in-the-classroom-corridor-or-playground"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 10
            }
          },
          {
            "id": "syllabus--repeat-the-experiment-with-the-student-running",
            "name": "Repeat the experiment with the student running",
            "minutes": 20,
            "deps": [
              "syllabus--ask-one-student-to-walk-normally-from-one-point-to-another-while-another-student"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 10
            }
          },
          {
            "id": "syllabus--let-one-student-stand-still-while-another-walks-past-him",
            "name": "Let one student stand still while another walks past him",
            "minutes": 25,
            "deps": [
              "syllabus--repeat-the-experiment-with-the-student-running"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "syllabus--ask-each-student-to-describe-the-motion-of-the-other-student",
            "name": "Ask each student to describe the motion of the other student",
            "minutes": 25,
            "deps": [
              "syllabus--let-one-student-stand-still-while-another-walks-past-him"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "syllabus--draw-a-straight-5-metre-line-on-the-ground-and-mark-the-starting-point-as-a-and-",
            "name": "Draw a straight 5‑metre line on the ground and mark the starting point as A and the end as B",
            "minutes": 25,
            "deps": [
              "syllabus--ask-each-student-to-describe-the-motion-of-the-other-student"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "syllabus--walk-from-a-to-b-and-note-the-distance-covered",
            "name": "Walk from A to B and note the distance covered",
            "minutes": 25,
            "deps": [
              "syllabus--draw-a-straight-5-metre-line-on-the-ground-and-mark-the-starting-point-as-a-and-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "syllabus--next-walk-from-a-to-b-and-then-back-to-a",
            "name": "Next walk from A to B and then back to A",
            "minutes": 25,
            "deps": [
              "syllabus--walk-from-a-to-b-and-note-the-distance-covered"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "syllabus--compare-the-distance-travelled-and-displacement-observation-distance-changes-but",
            "name": "Compare the distance travelled and displacement. Observation: - Distance changes but displacement becomes zero when returning to the starting point",
            "minutes": 25,
            "deps": [
              "syllabus--next-walk-from-a-to-b-and-then-back-to-a"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 11
            }
          },
          {
            "id": "syllabus--on-a-graph-paper-draw-a-vector-representing-4-units-towards-the-east",
            "name": "On a graph paper, draw a vector representing 4 units towards the east",
            "minutes": 25,
            "deps": [
              "syllabus--compare-the-distance-travelled-and-displacement-observation-distance-changes-but"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 12
            }
          },
          {
            "id": "syllabus--from-the-head-end-of-this-vector-draw-another-vector-representing-3-units-toward",
            "name": "From the head (end) of this vector, draw another vector representing 3 units towards the north",
            "minutes": 25,
            "deps": [
              "syllabus--on-a-graph-paper-draw-a-vector-representing-4-units-towards-the-east"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 12
            }
          },
          {
            "id": "syllabus--5-equations-of-motion-when-an-object-moves-with-constant-acceleration-its-motion",
            "name": "5. Equations of Motion When an object moves with constant acceleration, its motion can be described using equations which are given as: V = u + at S = ut + 1 2",
            "minutes": 25,
            "deps": [
              "syllabus--from-the-head-end-of-this-vector-draw-another-vector-representing-3-units-toward"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "syllabus--mark-a-straight-line-on-the-floor-and-label-the-starting-point-as-o",
            "name": "Mark a straight line on the floor and label the starting point as O",
            "minutes": 25,
            "deps": [
              "syllabus--5-equations-of-motion-when-an-object-moves-with-constant-acceleration-its-motion"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "syllabus--place-the-toy-car-at-point-o-and-give-it-a-gentle-push-so-that-it-moves-forward",
            "name": "Place the toy car at point O and give it a gentle push so that it moves forward",
            "minutes": 25,
            "deps": [
              "syllabus--mark-a-straight-line-on-the-floor-and-label-the-starting-point-as-o"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "syllabus--use-a-stopwatch-and-note-the-position-of-the-car-at-equal-time-intervals",
            "name": "Use a stopwatch and note the position of the car at equal time intervals",
            "minutes": 25,
            "deps": [
              "syllabus--place-the-toy-car-at-point-o-and-give-it-a-gentle-push-so-that-it-moves-forward"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "syllabus--mark-these-positions-on-the-floor-using-chalk-or-tape",
            "name": "Mark these positions on the floor using chalk or tape",
            "minutes": 25,
            "deps": [
              "syllabus--use-a-stopwatch-and-note-the-position-of-the-car-at-equal-time-intervals"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 13
            }
          },
          {
            "id": "syllabus--6-reflect-and-discuss",
            "name": "6 Reflect and Discuss",
            "minutes": 15,
            "deps": [
              "syllabus--mark-these-positions-on-the-floor-using-chalk-or-tape"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 14
            }
          },
          {
            "id": "syllabus--define-a-frame-of-reference-in-your-own-words",
            "name": "Define a frame of reference in your own words",
            "minutes": 25,
            "deps": [
              "syllabus--6-reflect-and-discuss"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 14
            }
          },
          {
            "id": "syllabus--give-two-real-life-examples-where-motion-depends-on-the-observer",
            "name": "Give two real-life examples where motion depends on the observer",
            "minutes": 25,
            "deps": [
              "syllabus--define-a-frame-of-reference-in-your-own-words"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 14
            }
          },
          {
            "id": "syllabus--why-does-a-person-sitting-in-a-moving-train-appear-at-rest-to-another-passenger",
            "name": "Why does a person sitting in a moving train appear at rest to another passenger?",
            "minutes": 25,
            "deps": [
              "syllabus--give-two-real-life-examples-where-motion-depends-on-the-observer"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 14
            }
          },
          {
            "id": "syllabus--classify-the-following-as-scalar-or-vector-quantities-speed-velocity-displacemen",
            "name": "Classify the following as scalar or vector quantities: speed, velocity, displacement, distance, acceleration and mass",
            "minutes": 25,
            "deps": [
              "syllabus--why-does-a-person-sitting-in-a-moving-train-appear-at-rest-to-another-passenger"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 14
            }
          },
          {
            "id": "syllabus--explain-the-difference-between-distance-and-displacement-with-an-activity-diagra",
            "name": "Explain the difference between distance and displacement with an activity diagram.15",
            "minutes": 25,
            "deps": [
              "syllabus--classify-the-following-as-scalar-or-vector-quantities-speed-velocity-displacemen"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 14
            }
          },
          {
            "id": "syllabus--give-two-everyday-examples-of-vector-quantities",
            "name": "Give two everyday examples of vector quantities",
            "minutes": 20,
            "deps": [
              "syllabus--explain-the-difference-between-distance-and-displacement-with-an-activity-diagra"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 15
            }
          },
          {
            "id": "syllabus--draw-two-vectors-of-4-units-east-and-3-units-north-and-find-the-resultant-using-",
            "name": "Draw two vectors of 4 units east and 3 units north and find the resultant using the triangle method",
            "minutes": 25,
            "deps": [
              "syllabus--give-two-everyday-examples-of-vector-quantities"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 15
            }
          },
          {
            "id": "syllabus--explain-how-vector-subtraction-is-performed-graphically",
            "name": "Explain how vector subtraction is performed graphically",
            "minutes": 20,
            "deps": [
              "syllabus--draw-two-vectors-of-4-units-east-and-3-units-north-and-find-the-resultant-using-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 15
            }
          },
          {
            "id": "syllabus--draw-two-opposite-vectors-of-equal-magnitude-calculate-its-resultant",
            "name": "Draw two opposite vectors of equal magnitude. Calculate its resultant",
            "minutes": 25,
            "deps": [
              "syllabus--explain-how-vector-subtraction-is-performed-graphically"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 15
            }
          },
          {
            "id": "syllabus--a-body-starts-from-rest-and-accelerates-at-4-m-s-find-the-distance-travelled-in-",
            "name": "A body starts from rest and accelerates at 4 m/s². Find the distance travelled in the 6th second",
            "minutes": 25,
            "deps": [
              "syllabus--draw-two-opposite-vectors-of-equal-magnitude-calculate-its-resultant"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 15
            }
          },
          {
            "id": "syllabus--a-car-with-initial-velocity-8-m-s-accelerates-at-2-m-s-find-the-distance-covered",
            "name": "A car with initial velocity 8 m/s accelerates at 2 m/s². Find the distance covered in the 5th second",
            "minutes": 25,
            "deps": [
              "syllabus--a-body-starts-from-rest-and-accelerates-at-4-m-s-find-the-distance-travelled-in-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 15
            }
          },
          {
            "id": "syllabus--1-limitations-of-newtons-laws-in-accelerating-frames-activity-3-1-let-us-observe",
            "name": "1 Limitations of Newton’s Laws in Accelerating Frames Activity 3.1: Let us observe Consider the following situations:",
            "minutes": 25,
            "deps": [
              "syllabus--a-car-with-initial-velocity-8-m-s-accelerates-at-2-m-s-find-the-distance-covered"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 16
            }
          },
          {
            "id": "syllabus--in-which-type-of-reference-frame-are-newtons-laws-valid",
            "name": "In which type of reference frame are Newton’s laws valid?",
            "minutes": 25,
            "deps": [
              "syllabus--1-limitations-of-newtons-laws-in-accelerating-frames-activity-3-1-let-us-observe"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 18
            }
          },
          {
            "id": "syllabus--define-pseudo-force-and-write-its-formula",
            "name": "Define pseudo force and write its formula",
            "minutes": 20,
            "deps": [
              "syllabus--in-which-type-of-reference-frame-are-newtons-laws-valid"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 18
            }
          },
          {
            "id": "syllabus--a-lift-accelerates-upward-at-4-5-2",
            "name": "A lift accelerates upward at 4.5𝑚 𝑠−2",
            "minutes": 20,
            "deps": [
              "syllabus--define-pseudo-force-and-write-its-formula"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 18
            }
          },
          {
            "id": "syllabus--why-does-pseudo-force-disappear-in-an-inertial-frame",
            "name": "Why does pseudo force disappear in an inertial frame?",
            "minutes": 25,
            "deps": [
              "syllabus--a-lift-accelerates-upward-at-4-5-2"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 18
            }
          },
          {
            "id": "syllabus--tie-the-ring-bob-securely-to-one-end-of-the-thread-of-length-approx-1-m",
            "name": "Tie the ring/bob securely to one end of the thread of length approx. 1 m",
            "minutes": 25,
            "deps": [
              "syllabus--why-does-pseudo-force-disappear-in-an-inertial-frame"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 18
            }
          },
          {
            "id": "syllabus--hold-the-other-end-of-the-thread-firmly-with-your-finger",
            "name": "Hold the other end of the thread firmly with your finger",
            "minutes": 25,
            "deps": [
              "syllabus--tie-the-ring-bob-securely-to-one-end-of-the-thread-of-length-approx-1-m"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 18
            }
          },
          {
            "id": "syllabus--swing-the-ring-bob-in-a-horizontal-circle-at-a-steady-speed-19",
            "name": "Swing the ring/bob in a horizontal circle at a steady speed.19",
            "minutes": 25,
            "deps": [
              "syllabus--hold-the-other-end-of-the-thread-firmly-with-your-finger"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 19
            }
          },
          {
            "id": "syllabus--observe-how-the-bob-moves-in-a-circular-path",
            "name": "Observe how the bob moves in a circular path",
            "minutes": 25,
            "deps": [
              "syllabus--swing-the-ring-bob-in-a-horizontal-circle-at-a-steady-speed-19"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 19
            }
          },
          {
            "id": "syllabus--now-slowly-reduce-the-speed-of-rotation",
            "name": "Now slowly reduce the speed of rotation",
            "minutes": 20,
            "deps": [
              "syllabus--observe-how-the-bob-moves-in-a-circular-path"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 19
            }
          },
          {
            "id": "syllabus--where-does-the-acceleration-due-to-gravity-reach-its-maximum-value-on-the-surfac",
            "name": "Where does the acceleration due to gravity reach its maximum value—on the surface, above, or below the Earth?",
            "minutes": 25,
            "deps": [
              "syllabus--now-slowly-reduce-the-speed-of-rotation"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 23
            }
          },
          {
            "id": "syllabus--what-happens-to-g-at-the-centre-of-the-earth",
            "name": "What happens to g at the centre of the Earth?",
            "minutes": 25,
            "deps": [
              "syllabus--where-does-the-acceleration-due-to-gravity-reach-its-maximum-value-on-the-surfac"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 23
            }
          },
          {
            "id": "syllabus--calculate-g-at-a-height-of-400-km-if-r-6400-km",
            "name": "Calculate g at a height of 400 km if R = 6400 km",
            "minutes": 25,
            "deps": [
              "syllabus--what-happens-to-g-at-the-centre-of-the-earth"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 23
            }
          },
          {
            "id": "syllabus--at-what-depth-will-g-become-half-of-its-surface-value",
            "name": "At what depth will g become half of its surface value?",
            "minutes": 25,
            "deps": [
              "syllabus--calculate-g-at-a-height-of-400-km-if-r-6400-km"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 23
            }
          },
          {
            "id": "syllabus--why-does-gravity-decrease-both-above-and-below-the-surface-of-the-earth-24",
            "name": "Why does gravity decrease both above and below the surface of the earth?24",
            "minutes": 25,
            "deps": [
              "syllabus--at-what-depth-will-g-become-half-of-its-surface-value"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 24
            }
          },
          {
            "id": "syllabus--why-is-it-easier-to-open-a-door-when-you-push-at-the-handle-rather-than-near-the",
            "name": "Why is it easier to open a door when you push at the handle rather than near the hinges?",
            "minutes": 25,
            "deps": [
              "syllabus--why-does-gravity-decrease-both-above-and-below-the-surface-of-the-earth-24"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 25
            }
          },
          {
            "id": "syllabus--is-it-possible-for-a-force-to-act-on-a-body-and-still-produce-zero-turning-about",
            "name": "Is it possible for a force to act on a body and still produce zero turning about a given fixed point? Give a real-life example",
            "minutes": 25,
            "deps": [
              "syllabus--why-is-it-easier-to-open-a-door-when-you-push-at-the-handle-rather-than-near-the"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 25
            }
          },
          {
            "id": "syllabus--how-can-a-mechanic-loosen-a-tight-bolt-using-a-long-spanner-instead-of-applying-",
            "name": "How can a mechanic loosen a tight bolt using a long spanner instead of applying a very large force? Explain using the torque formula",
            "minutes": 25,
            "deps": [
              "syllabus--is-it-possible-for-a-force-to-act-on-a-body-and-still-produce-zero-turning-about"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 25
            }
          },
          {
            "id": "syllabus--a-force-of-20-n-is-applied-to-a-door-at-0-8-m-from-the-hinge-calculate-the-torqu",
            "name": "A force of 20 N is applied to a door at 0.8 m from the hinge. Calculate the torque when the force is applied at (a) 90°, (b) 60° (c) 30° to the door surface",
            "minutes": 25,
            "deps": [
              "syllabus--how-can-a-mechanic-loosen-a-tight-bolt-using-a-long-spanner-instead-of-applying-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 25
            }
          },
          {
            "id": "syllabus--2-wheel-and-axle-the-steering-mastery-activity-4-2-think-and-answer",
            "name": "2 Wheel and Axle – The Steering Mastery Activity 4.2: Think and Answer",
            "minutes": 25,
            "deps": [
              "syllabus--a-force-of-20-n-is-applied-to-a-door-at-0-8-m-from-the-hinge-calculate-the-torqu"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 26
            }
          },
          {
            "id": "syllabus--if-the-seconds-gear-is-2-mm-how-large-would-the-hour-gear-be-in-meters",
            "name": "If the seconds gear is 2 mm, how large would the hour gear be in meters?",
            "minutes": 25,
            "deps": [
              "syllabus--2-wheel-and-axle-the-steering-mastery-activity-4-2-think-and-answer"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 27
            }
          },
          {
            "id": "syllabus--which-of-the-three-hands-gear-should-be-directly-connected-to-the-motor-why-28",
            "name": "Which of the three hands gear should be directly connected to the motor? Why?28",
            "minutes": 25,
            "deps": [
              "syllabus--if-the-seconds-gear-is-2-mm-how-large-would-the-hour-gear-be-in-meters"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 27
            }
          },
          {
            "id": "syllabus--do-the-setup-of-weights-string-and-simple-pulley-as-shown",
            "name": "Do the setup of weights, string and simple pulley as shown",
            "minutes": 25,
            "deps": [
              "syllabus--which-of-the-three-hands-gear-should-be-directly-connected-to-the-motor-why-28"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--for-0-55-kg-mass-moving-downward-a-downward-force-weight-b-upward-force-tension-",
            "name": "For 0.55 kg mass (moving downward): a. Downward force = Weight = ___________ b. Upward force = Tension (T)",
            "minutes": 25,
            "deps": [
              "syllabus--do-the-setup-of-weights-string-and-simple-pulley-as-shown"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--net-force-0-55-0-55",
            "name": "Net force: 0.55𝑔 − 𝑇 = 0.55𝑎",
            "minutes": 20,
            "deps": [
              "syllabus--for-0-55-kg-mass-moving-downward-a-downward-force-weight-b-upward-force-tension-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--for-0-5-kg-mass-moving-upward-a-downward-force-weight-b-upward-force-tension-t",
            "name": "For 0.5 kg mass (moving upward): a. Downward force = Weight = ___________ b. Upward force = Tension (T)",
            "minutes": 25,
            "deps": [
              "syllabus--net-force-0-55-0-55"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--net-force-0-5-0-5",
            "name": "Net force: 𝑇 − 0.5𝑔 = 0.5𝑎",
            "minutes": 20,
            "deps": [
              "syllabus--for-0-5-kg-mass-moving-upward-a-downward-force-weight-b-upward-force-tension-t"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--add-both-equations",
            "name": "Add both equations: ________________________________",
            "minutes": 15,
            "deps": [
              "syllabus--net-force-0-5-0-5"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--acceleration-of-the-system",
            "name": "Acceleration of the system: ________________",
            "minutes": 20,
            "deps": [
              "syllabus--add-both-equations"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--find-tension-examples",
            "name": "Find Tension: __________________ Examples:",
            "minutes": 15,
            "deps": [
              "syllabus--acceleration-of-the-system"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--a-5kg-object-is-suspended-stationary-from-a-rope-calculate-the-tension-ans-the-w",
            "name": "A 5kg object is suspended stationary from a rope. Calculate the tension. Ans: The weight of the object is: 𝑇 = 𝑚 × 𝑔 = 5 × 9.8 = 49𝑁",
            "minutes": 25,
            "deps": [
              "syllabus--find-tension-examples"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--a-4-kg-mass-is-lifted-upward-with-an-acceleration-of-2-m-s-calculate-the-tension",
            "name": "A 4 kg mass is lifted upward with an acceleration of 2 m/s². Calculate the tension. Ans: Using Newton’s Second Law",
            "minutes": 25,
            "deps": [
              "syllabus--a-5kg-object-is-suspended-stationary-from-a-rope-calculate-the-tension-ans-the-w"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 29
            }
          },
          {
            "id": "syllabus--show-the-direction-of-weight-and-tension-for-both-objects-m1-and-m2",
            "name": "Show the direction of weight and tension for both objects m1 and m2",
            "minutes": 25,
            "deps": [
              "syllabus--a-4-kg-mass-is-lifted-upward-with-an-acceleration-of-2-m-s-calculate-the-tension"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 30
            }
          },
          {
            "id": "syllabus--an-8-kg-mass-hangs-freely-from-a-single-fixed-pulley-the-system-is-at-rest-find-",
            "name": "An 8 kg mass hangs freely from a single fixed pulley. The system is at rest. Find the tension in the rope",
            "minutes": 25,
            "deps": [
              "syllabus--show-the-direction-of-weight-and-tension-for-both-objects-m1-and-m2"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 30
            }
          },
          {
            "id": "syllabus--observe-the-given-diagram-find-out-in-which-direction-the-rope-will-move-what-wi",
            "name": "Observe the given diagram. Find out in which direction the rope will move? What will be the net downward force?",
            "minutes": 25,
            "deps": [
              "syllabus--an-8-kg-mass-hangs-freely-from-a-single-fixed-pulley-the-system-is-at-rest-find-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 30
            }
          },
          {
            "id": "syllabus--a-6-kg-mass-hangs-freely-from-a-single-fixed-pulley-the-system-is-at-rest-find-t",
            "name": "A 6 kg mass hangs freely from a single fixed pulley. The system is at rest. Find the tension in the rope",
            "minutes": 25,
            "deps": [
              "syllabus--observe-the-given-diagram-find-out-in-which-direction-the-rope-will-move-what-wi"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 30
            }
          },
          {
            "id": "syllabus--two-objects-having-masses-2-kg-and-6-kg-are-connected-over-a-frictionless-pulley",
            "name": "Two objects having masses 2 kg and 6 kg are connected over a frictionless pulley with the help of rope. Find acceleration and tension in the rope",
            "minutes": 25,
            "deps": [
              "syllabus--a-6-kg-mass-hangs-freely-from-a-single-fixed-pulley-the-system-is-at-rest-find-t"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 30
            }
          }
        ]
      },
      {
        "id": "1-conservative-and-non-conservative-forces",
        "name": "1 CONSERVATIVE AND NON-CONSERVATIVE FORCES",
        "concepts": [
          {
            "id": "1-conservative-and-non-conservative-forces--define-a-conservative-force-with-one-example",
            "name": "Define a conservative force with one example",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-is-gravitational-force-called-a-conservative-force",
            "name": "Why is gravitational force called a conservative force?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--define-a-conservative-force-with-one-example"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-is-friction-called-a-non-conservative-force",
            "name": "Why is friction called a non-conservative force?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-is-gravitational-force-called-a-conservative-force"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-happens-to-energy-when-a-non-conservative-force-acts-on-an-object",
            "name": "What happens to energy when a non-conservative force acts on an object?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-is-friction-called-a-non-conservative-force"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--if-there-were-no-friction-on-earth-how-would-motion-be-different-explain",
            "name": "If there were no friction on Earth, how would motion be different? Explain",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-happens-to-energy-when-a-non-conservative-force-acts-on-an-object"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--2-potential-energy-of-a-spring-activity-5-1-collect-the-following-items-a-spring",
            "name": "2 Potential Energy of a Spring Activity 5.1: Collect the following items: A spring, a stand, a weight hanger, slotted weights, a ruler",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--if-there-were-no-friction-on-earth-how-would-motion-be-different-explain"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--suspend-a-spring-vertically-from-a-rigid-support",
            "name": "Suspend a spring vertically from a rigid support",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--2-potential-energy-of-a-spring-activity-5-1-collect-the-following-items-a-spring"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--attach-a-weight-hanger-to-the-free-end-of-the-spring-and-note-the-initial-length",
            "name": "Attach a weight hanger to the free end of the spring and note the initial length of the spring",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--suspend-a-spring-vertically-from-a-rigid-support"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--add-a-known-weight-to-the-hanger-and-measure-the-extension-produced-in-the-sprin",
            "name": "Add a known weight to the hanger and measure the extension produced in the spring",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--attach-a-weight-hanger-to-the-free-end-of-the-spring-and-note-the-initial-length"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--increase-the-weight-gradually-and-note-the-corresponding-extension-each-time",
            "name": "Increase the weight gradually and note the corresponding extension each time",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--add-a-known-weight-to-the-hanger-and-measure-the-extension-produced-in-the-sprin"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--repeat-the-experiment-using-springs-made-of-different-materials-or-thickness-obs",
            "name": "Repeat the experiment using springs made of different materials or thickness. Observation:",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--increase-the-weight-gradually-and-note-the-corresponding-extension-each-time"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 32
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-do-cathode-rays-bend-towards-the-positive-plate",
            "name": "Why do cathode rays bend towards the positive plate?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--repeat-the-experiment-using-springs-made-of-different-materials-or-thickness-obs"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 39
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-conclusion-did-thomson-draw-from-using-different-gases-in-discharge-tubes",
            "name": "What conclusion did Thomson draw from using different gases in discharge tubes?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-do-cathode-rays-bend-towards-the-positive-plate"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 39
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-are-canal-rays-different-from-cathode-rays-in-nature",
            "name": "Why are canal rays different from cathode rays in nature?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-conclusion-did-thomson-draw-from-using-different-gases-in-discharge-tubes"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 39
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-was-the-discovery-of-neutron-necessary",
            "name": "Why was the discovery of neutron necessary?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-are-canal-rays-different-from-cathode-rays-in-nature"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 39
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--in-a-cathode-ray-experiment-it-was-observed-that-the-rays-bend-towards-a-positiv",
            "name": "In a cathode ray experiment, it was observed that the rays bend towards a positively charged plate. What can we conclude about the nature of these rays?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-was-the-discovery-of-neutron-necessary"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 39
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--if-cathode-rays-were-neutral-instead-of-being-negatively-charged-how-would-their",
            "name": "If cathode rays were neutral instead of being negatively charged, how would their behaviour differ in an electric field?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--in-a-cathode-ray-experiment-it-was-observed-that-the-rays-bend-towards-a-positiv"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 39
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--4-limitation-of-rutheford-model-of-atom",
            "name": "4 Limitation of Rutheford Model of Atom",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--if-cathode-rays-were-neutral-instead-of-being-negatively-charged-how-would-their"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 41
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-1-achivement-of-bohr-model",
            "name": "5.1 Achivement of Bohr Model",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--4-limitation-of-rutheford-model-of-atom"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-2-limitations-of-bohrs-model-bohr-model-was-unable-to-explain",
            "name": "5.2 Limitations of Bohr’s model Bohr model was unable to explain:",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-1-achivement-of-bohr-model"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--6-check-your-understanding",
            "name": "6 Check Your Understanding",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-2-limitations-of-bohrs-model-bohr-model-was-unable-to-explain"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-why-would-rutherfords-model-predict-a-continuous-spectrum-rather-than-a-",
            "name": "Explain why would Rutherford’s model predict a continuous spectrum rather than a line spectrum",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--6-check-your-understanding"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--a-discharge-tube-filled-with-an-unknown-gas-produces-a-line-spectrum-identical-t",
            "name": "A discharge tube filled with an unknown gas produces a line spectrum identical to hydrogen. What can you conclude about the gas? Give reason",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-why-would-rutherfords-model-predict-a-continuous-spectrum-rather-than-a-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--if-electrons-in-an-atom-were-allowed-to-have-a-continuous-set-of-energy-values-w",
            "name": "If electrons in an atom were allowed to have a continuous set of energy values, what kind of spectrum would you expect? Why is this not observed?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--a-discharge-tube-filled-with-an-unknown-gas-produces-a-line-spectrum-identical-t"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--bohrs-model-solved-all-problems-of-atomic-structure-comment",
            "name": "“Bohr’s model solved all problems of atomic structure.” Comment",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--if-electrons-in-an-atom-were-allowed-to-have-a-continuous-set-of-energy-values-w"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--how-does-the-concept-of-fixed-energy-levels-explain-the-stability-of-atoms",
            "name": "How does the concept of fixed energy levels explain the stability of atoms?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--bohrs-model-solved-all-problems-of-atomic-structure-comment"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-do-different-elements-produce-different-line-spectra-give-a-conceptual-expla",
            "name": "Why do different elements produce different line spectra? Give a conceptual explanation.43",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--how-does-the-concept-of-fixed-energy-levels-explain-the-stability-of-atoms"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 42
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-why-bohrs-model-works-well-for-hydrogen-but-not-for-multi-electron-atoms",
            "name": "Explain why Bohr’s model works well for hydrogen but not for multi-electron atoms",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-do-different-elements-produce-different-line-spectra-give-a-conceptual-expla"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--state-two-limitations-of-rutherfords-model",
            "name": "State two limitations of Rutherford’s model",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-why-bohrs-model-works-well-for-hydrogen-but-not-for-multi-electron-atoms"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--rutherfords-model-explained-the-structure-of-the-atom-but-failed-to-explain-atom",
            "name": "Rutherford’s model explained the structure of the atom but failed to explain atomic stability and spectra. Discuss",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--state-two-limitations-of-rutherfords-model"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-was-the-main-drawback-of-rutherfords-model-regarding-electron-motion-what-a",
            "name": "What was the main drawback of Rutherford’s model regarding electron motion? What assumption was made by Bohr to overcome this problem",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--rutherfords-model-explained-the-structure-of-the-atom-but-failed-to-explain-atom"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--how-does-bohrs-model-explain-line-spectrum-of-hydrogen",
            "name": "How does Bohr’s model explain line spectrum of hydrogen?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-was-the-main-drawback-of-rutherfords-model-regarding-electron-motion-what-a"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--outline-the-limitations-of-bohrs-model",
            "name": "Outline the limitations of Bohr’s model",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--how-does-bohrs-model-explain-line-spectrum-of-hydrogen"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--define-line-spectrum-and-continuous-spectrum-with-one-example-each",
            "name": "Define line spectrum and continuous spectrum with one example each",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--outline-the-limitations-of-bohrs-model"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--write-two-main-postulates-of-bohrs-model",
            "name": "Write two main postulates of Bohr’s model",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--define-line-spectrum-and-continuous-spectrum-with-one-example-each"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-meant-by-fine-structure-in-hydrogen-spectrum",
            "name": "What is meant by fine structure in hydrogen spectrum?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--write-two-main-postulates-of-bohrs-model"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 43
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-the-significance-of-rydberg-equation-44",
            "name": "What is the significance of Rydberg equation?44",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-meant-by-fine-structure-in-hydrogen-spectrum"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 44
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-meant-by-the-octet-rule",
            "name": "What is meant by the octet rule?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-the-significance-of-rydberg-equation-44"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-does-hydrogen-not-follow-the-octet-rule",
            "name": "Why does hydrogen not follow the octet rule?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-meant-by-the-octet-rule"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--give-one-example-each-of-the-molecule-with-a-incomplete-octet-b-expanded-octet-c",
            "name": "Give one example each of the molecule with a) incomplete octet b) expanded octet c) an odd electron",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-does-hydrogen-not-follow-the-octet-rule"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-can-boron-form-compounds-with-only-six-electrons-around-it",
            "name": "Why can boron form compounds with only six electrons around it?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--give-one-example-each-of-the-molecule-with-a-incomplete-octet-b-expanded-octet-c"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-meant-by-a-duplet-configuration",
            "name": "What is meant by a duplet configuration?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-can-boron-form-compounds-with-only-six-electrons-around-it"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-is-no-considered-an-exception-to-the-octet-rule",
            "name": "Why is NO considered an exception to the octet rule?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-meant-by-a-duplet-configuration"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--draw-the-lewis-dot-structure-of-bf-and-explain-why-boron-does-not-complete-its-o",
            "name": "Draw the Lewis dot structure of BF₃ and explain why boron does not complete its octet",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-is-no-considered-an-exception-to-the-octet-rule"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 46
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-meant-by-the-term-electron-sea-in-metals",
            "name": "What is meant by the term “electron sea” in metals?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--draw-the-lewis-dot-structure-of-bf-and-explain-why-boron-does-not-complete-its-o"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 48
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-type-of-particles-are-in-a-fixed-position-in-a-metal-according-to-the-elect",
            "name": "What type of particles are in a fixed position in a metal according to the Electron sea model?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-meant-by-the-term-electron-sea-in-metals"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 48
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--define-metallic-bonding",
            "name": "Define metallic bonding",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-type-of-particles-are-in-a-fixed-position-in-a-metal-according-to-the-elect"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 48
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-are-metallic-bonds-called-non-directional",
            "name": "Why are metallic bonds called non-directional?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--define-metallic-bonding"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 48
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--name-two-properties-of-metals-explained-by-the-electron-sea-model-49",
            "name": "Name two properties of metals explained by the electron sea model.49",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-are-metallic-bonds-called-non-directional"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-how-the-electron-sea-model-accounts-for-electrical-conductivity-in-metal",
            "name": "Explain how the electron sea model accounts for electrical conductivity in metals",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--name-two-properties-of-metals-explained-by-the-electron-sea-model-49"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--how-does-the-electron-sea-model-explain-thermal-conductivity-in-metals",
            "name": "How does the electron sea model explain thermal conductivity in metals?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-how-the-electron-sea-model-accounts-for-electrical-conductivity-in-metal"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-can-metals-be-beaten-into-thin-sheets-explain-using-the-electron-sea-model",
            "name": "Why can metals be beaten into thin sheets? Explain using the Electron sea model",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--how-does-the-electron-sea-model-explain-thermal-conductivity-in-metals"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-meant-by-ductility-how-is-it-explained-by-the-electron-sea-model",
            "name": "What is meant by ductility? How is it explained by the electron sea model?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-can-metals-be-beaten-into-thin-sheets-explain-using-the-electron-sea-model"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--how-is-metallic-bonding-different-from-covalent-bonding",
            "name": "How is metallic bonding different from covalent bonding?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-meant-by-ductility-how-is-it-explained-by-the-electron-sea-model"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-the-structure-of-a-metal-according-to-the-electron-sea-model",
            "name": "Explain the structure of a metal according to the electron sea model",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--how-is-metallic-bonding-different-from-covalent-bonding"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--if-electrons-in-a-metal-were-not-free-to-move-which-property-would-be-most-affec",
            "name": "If electrons in a metal were not free to move, which property would be most affected? Explain",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-the-structure-of-a-metal-according-to-the-electron-sea-model"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-why-metals-do-not-break-when-hammered-but-instead-change-shape",
            "name": "Explain why metals do not break when hammered but instead change shape",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--if-electrons-in-a-metal-were-not-free-to-move-which-property-would-be-most-affec"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--copper-is-used-for-electrical-wiring-while-rubber-is-not-explain-using-the-elect",
            "name": "Copper is used for electrical wiring, while rubber is not. Explain using the electron sea model",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-why-metals-do-not-break-when-hammered-but-instead-change-shape"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-are-metals-generally-good-conductors-of-heat-as-compared-to-non-metals",
            "name": "Why are metals generally good conductors of heat as compared to non- metals?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--copper-is-used-for-electrical-wiring-while-rubber-is-not-explain-using-the-elect"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 49
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--2-2-how-is-it-different-from-simple-distillation",
            "name": "2.2 How is it different from simple distillation?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-are-metals-generally-good-conductors-of-heat-as-compared-to-non-metals"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 53
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-chromatography-mention-its-two-main-phases",
            "name": "What is chromatography? Mention its two main phases",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--2-2-how-is-it-different-from-simple-distillation"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--who-discovered-chromatography-and-in-which-year",
            "name": "Who discovered chromatography and in which year?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-chromatography-mention-its-two-main-phases"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-meant-by-stationary-phase-and-mobile-phase",
            "name": "What is meant by stationary phase and mobile phase?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--who-discovered-chromatography-and-in-which-year"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--name-two-common-adsorbents-used-in-column-chromatography",
            "name": "Name two common adsorbents used in column chromatography",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-meant-by-stationary-phase-and-mobile-phase"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-an-eluent-in-column-chromatography",
            "name": "What is an eluent in column chromatography?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--name-two-common-adsorbents-used-in-column-chromatography"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-do-different-substances-move-at-different-speeds-in-column-chromatography",
            "name": "Why do different substances move at different speeds in column chromatography?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-an-eluent-in-column-chromatography"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-fractional-distillation",
            "name": "What is fractional distillation?",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-do-different-substances-move-at-different-speeds-in-column-chromatography"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--when-is-fractional-distillation-preferred-over-simple-distillation",
            "name": "When is fractional distillation preferred over simple distillation?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-fractional-distillation"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-the-role-of-the-fractionating-column",
            "name": "What is the role of the fractionating column?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--when-is-fractional-distillation-preferred-over-simple-distillation"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--in-column-chromatography-a-mixture-of-two-compounds-a-and-b-is-separated-a-comes",
            "name": "In column chromatography, a mixture of two compounds A and B is separated. A comes out first. What can you say about its interaction with the stationary phase?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-the-role-of-the-fractionating-column"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--a-mixture-of-ethanol-b-p-78-c-and-water-b-p-100-c-is-to-be-separated-which-metho",
            "name": "A mixture of ethanol (b.p. 78°C) and water (b.p. 100°C) is to be separated. Which method will you use and why?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--in-column-chromatography-a-mixture-of-two-compounds-a-and-b-is-separated-a-comes"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-why-repeated-condensation-and-vaporization-improve-separation-in-fractio",
            "name": "Explain why repeated condensation and vaporization improve separation in fractional distillation",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--a-mixture-of-ethanol-b-p-78-c-and-water-b-p-100-c-is-to-be-separated-which-metho"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--in-a-fractional-distillation-column-why-does-temperature-decrease-from-bottom-to",
            "name": "In a fractional distillation column, why does temperature decrease from bottom to top?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-why-repeated-condensation-and-vaporization-improve-separation-in-fractio"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-is-simple-distillation-not-suitable-for-separating-liquids-with-close-boilin",
            "name": "Why is simple distillation not suitable for separating liquids with close boiling points?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--in-a-fractional-distillation-column-why-does-temperature-decrease-from-bottom-to"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 54
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--in-column-chromatography-the-solid-substance-that-is-filled-in-the-column-is-cal",
            "name": "In column chromatography, the solid substance that is filled in the column is called the: A. Mobile phase B. Solvent C. Stationary phase D. Mixture",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-is-simple-distillation-not-suitable-for-separating-liquids-with-close-boilin"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 55
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--2-a-quick-historical-journey-of-microscopes-let-us-walk-through-time-and-see-how",
            "name": "2. A Quick historical Journey of Microscopes Let us walk through time and see how microscopes evolved:",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--in-column-chromatography-the-solid-substance-that-is-filled-in-the-column-is-cal"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 57
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--3-1-types-of-light-microscope-light-optical-microscopes-rely-on-visible-light-an",
            "name": "3.1 Types of Light microscope Light (Optical) microscopes rely on visible light and glass lenses to enlarge and view specimens. Basic Classification -",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--2-a-quick-historical-journey-of-microscopes-let-us-walk-through-time-and-see-how"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 58
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--3-2-parts-of-a-compound-microscope-core-components-and-their-roles",
            "name": "3.2 Parts of a Compound microscope Core Components and their Roles",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--3-1-types-of-light-microscope-light-optical-microscopes-rely-on-visible-light-an"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 59
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--light-source-provides-illumination-led-or-halogen-lamp",
            "name": "Light Source; Provides illumination (LED or halogen lamp)",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--3-2-parts-of-a-compound-microscope-core-components-and-their-roles"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 59
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--condenser-lens-focuses-light-onto-the-specimen-to-optimize-numerical-aperture-an",
            "name": "Condenser Lens: Focuses light onto the specimen to optimize numerical aperture and contrast",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--light-source-provides-illumination-led-or-halogen-lamp"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 59
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--specimen-stage-holds-the-slide-containing-the-specimen",
            "name": "Specimen Stage: Holds the slide containing the specimen",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--condenser-lens-focuses-light-onto-the-specimen-to-optimize-numerical-aperture-an"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 59
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--objective-lens-the-primary-magnifying-lens-e-g-4x-10x-40x-100x-it-forms-an-enlar",
            "name": "Objective Lens: The primary magnifying lens (e.g., 4X, 10X, 40X, 100X). It forms an enlarged, inverted image of the specimen that is real in nature",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--specimen-stage-holds-the-slide-containing-the-specimen"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 59
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--4-microscopy-skills",
            "name": "4. Microscopy Skills",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--objective-lens-the-primary-magnifying-lens-e-g-4x-10x-40x-100x-it-forms-an-enlar"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 61
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--if-a-cell-measures-5-mm-on-100x-image-calculate-its-actual-size",
            "name": "If a cell measures 5 mm on 100X image, calculate its actual size",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--4-microscopy-skills"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 62
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--if-you-use-a-15x-eyepiece-and-10x-objective-what-will-be-the-total-magnification",
            "name": "If you use a 15X eyepiece and 10X objective, what will be the total magnification?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--if-a-cell-measures-5-mm-on-100x-image-calculate-its-actual-size"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 62
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--if-4-cells-fit-across-a-0-8-mm-field-of-view-what-will-be-the-approximate-size-o",
            "name": "If 4 cells fit across a 0.8 mm field of view, what will be the approximate size of one cell?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--if-you-use-a-15x-eyepiece-and-10x-objective-what-will-be-the-total-magnification"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 62
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-1-magnification-vs-resolution-big-vs-sharp-image-generally-students-think-more",
            "name": "5.1 Magnification vs. Resolution – Big vs. Sharp image Generally, students think: “More magnification is always better.” Not always true!",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--if-4-cells-fit-across-a-0-8-mm-field-of-view-what-will-be-the-approximate-size-o"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 63
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-2-light-compound-microscope-this-is-the-microscope-you-generally-use-in-school",
            "name": "5.2 Light (Compound) Microscope This is the microscope you generally use in school laboratories",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-1-magnification-vs-resolution-big-vs-sharp-image-generally-students-think-more"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 63
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-3-electron-microscopes",
            "name": "5.3. Electron Microscopes",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-2-light-compound-microscope-this-is-the-microscope-you-generally-use-in-school"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 63
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-3-1-transmission-electron-microscope-tem-it-is-much-more-powerful-as-compared-",
            "name": "5.3.1 Transmission Electron Microscope (TEM) It is much more powerful as compared to the light microscope because it has better magnification and resolution",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-3-electron-microscopes"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 64
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-3-2-scanning-electron-microscope-sem",
            "name": "5.3.2 Scanning Electron Microscope (SEM)",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-3-1-transmission-electron-microscope-tem-it-is-much-more-powerful-as-compared-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 64
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--illumination-source-visible-light-electron-beam-broad-electron-beam",
            "name": "Illumination source Visible light Electron beam (broad) Electron beam",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-3-2-scanning-electron-microscope-sem"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 65
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--types-of-lenses-glass-convex-achromatic-electromagnetic-coils",
            "name": "Types of lenses Glass (convex, achromatic) Electromagnetic coils",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--illumination-source-visible-light-electron-beam-broad-electron-beam"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 65
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--staining-basic-dyes",
            "name": "Staining Basic dyes",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--types-of-lenses-glass-convex-achromatic-electromagnetic-coils"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 65
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--observing-living-cells-yes-e-g-pond-life-cheek-cells-no-vacuum-kills-cells-no-va",
            "name": "Observing living cells Yes (e.g., pond life, cheek cells) No (vacuum kills cells) No (vacuum and the coating kills cells)",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--staining-basic-dyes"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 65
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--resolution-0-2-m-0-1-nm-or-better-1-10-nm",
            "name": "Resolution ~0.2 μm ~0.1 nm or better ~1-10 nm",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--observing-living-cells-yes-e-g-pond-life-cheek-cells-no-vacuum-kills-cells-no-va"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 65
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--magnification-up-to-1-500x-up-to-50-million-x-up-to-2-million-x",
            "name": "Magnification Up to 1,500x Up to 50 million x Up to 2 million x",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--resolution-0-2-m-0-1-nm-or-better-1-10-nm"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 65
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--sample-preparation-time-minutes",
            "name": "Sample preparation time Minutes",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--magnification-up-to-1-500x-up-to-50-million-x-up-to-2-million-x"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 65
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--cost-low",
            "name": "Cost Low",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--sample-preparation-time-minutes"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 66
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--vacuum-required-no-yes-yes-reflect-why-do-you-think-electron-microscopes-are-usu",
            "name": "Vacuum required No Yes Yes Reflect Why do you think electron microscopes are usually found in big research centres and not in school laboratories?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--cost-low"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 66
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--6-what-is-new-in-microscopy-what-are-the-limits",
            "name": "6. What is new in Microscopy? What are the limits?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--vacuum-required-no-yes-yes-reflect-why-do-you-think-electron-microscopes-are-usu"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 66
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--6-2-limitations",
            "name": "6.2 Limitations",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--6-what-is-new-in-microscopy-what-are-the-limits"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 66
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--7-where-do-we-use-microscopes-you-might-be-surprised-how-often-microscopes-quiet",
            "name": "7. Where do we use Microscopes? You might be surprised how often microscopes quietly support our lives",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--6-2-limitations"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 66
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--a-you-want-to-watch-live-protozoa-moving-in-pond-water-which-microscope",
            "name": "a) You want to watch live protozoa moving in pond water. Which microscope",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--7-where-do-we-use-microscopes-you-might-be-surprised-how-often-microscopes-quiet"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--draw-a-ray-diagram-of-a-compound-microscope",
            "name": "Draw a ray diagram of a compound microscope",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--a-you-want-to-watch-live-protozoa-moving-in-pond-water-which-microscope"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--design-a-simple-poster-how-to-take-care-of-a-microscope-with-three-dos-and-three",
            "name": "Design a simple poster “How to take care of a microscope?” with three do’s and three don’ts",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--draw-a-ray-diagram-of-a-compound-microscope"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--at-40x-total-magnification-the-field-diameter-is-4-mm-predict-the-field-diameter",
            "name": "At 40X total magnification, the field diameter is 4 mm. Predict the field diameter at 400X magnification (assume it is inversely proportional to magnification)",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--design-a-simple-poster-how-to-take-care-of-a-microscope-with-three-dos-and-three"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--a-student-accidentally-traps-many-air-bubbles-while-placing-the-cover-slip-how-w",
            "name": "A student accidentally traps many air bubbles while placing the cover slip. How will this affect observation? Suggest two ways to avoid bubbles next time",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--at-40x-total-magnification-the-field-diameter-is-4-mm-predict-the-field-diameter"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--compare-tem-and-sem-in-terms-of",
            "name": "Compare TEM and SEM in terms of:",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--a-student-accidentally-traps-many-air-bubbles-while-placing-the-cover-slip-how-w"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--can-we-rely-on-electron-microscopes-for-studying-living-cells-explain-the-reason",
            "name": "Can we rely on electron microscopes for studying living cells? Explain the reason",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--compare-tem-and-sem-in-terms-of"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--list-two-ways-how-microscopes-are-used-in-hospitals-and-one-way-they-are-used-in",
            "name": "List two ways how microscopes are used in hospitals and one way they are used in industries that manufacture mobile phones",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--can-we-rely-on-electron-microscopes-for-studying-living-cells-explain-the-reason"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--imagine-you-are-robert-hooke-write-a-5-6-lines-diary-entry-about-what-you-felt-w",
            "name": "Imagine you are Robert Hooke. Write a 5–6 lines diary entry about what you felt when you first saw “little boxes” (cells) in cork",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--list-two-ways-how-microscopes-are-used-in-hospitals-and-one-way-they-are-used-in"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 68
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--cell-and-molecular-biology-p-k-gupta",
            "name": "Cell and Molecular Biology: P.K. Gupta",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--imagine-you-are-robert-hooke-write-a-5-6-lines-diary-entry-about-what-you-felt-w"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--laboratory-manual-of-cell-biology-rina-majumdar-and-rama-sisodia",
            "name": "Laboratory Manual of Cell Biology: Rina Majumdar and Rama Sisodia",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--cell-and-molecular-biology-p-k-gupta"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--microbiology-an-introduction-gerrard-j-tortora-berdell-r-funke-and-christine-l-c",
            "name": "Microbiology – An introduction: Gerrard J. Tortora, Berdell R. Funke and Christine L. Case",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--laboratory-manual-of-cell-biology-rina-majumdar-and-rama-sisodia"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-ucmp-berkeley-edu-history-hooke-html-text-hooke-20had-20discovered",
            "name": "https://ucmp.berkeley.edu/history/hooke.html#:~:text=Hooke%20had%20discovered",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--microbiology-an-introduction-gerrard-j-tortora-berdell-r-funke-and-christine-l-c"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-microscope-com-education-center-microscopes-101-compound-microscope-pa",
            "name": "https://www.microscope.com/education-center/microscopes-101/compound- microscope-parts",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-ucmp-berkeley-edu-history-hooke-html-text-hooke-20had-20discovered"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-pmc-ncbi-nlm-nih-gov-articles-pmc6111892",
            "name": "https://pmc.ncbi.nlm.nih.gov/articles/PMC6111892/",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-microscope-com-education-center-microscopes-101-compound-microscope-pa"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-fizzicseducation-com-au-articles-digital-microscopy-teaching-students-",
            "name": "https://www.fizzicseducation.com.au/articles/digital-microscopy-teaching-students- biology-their-way/",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-pmc-ncbi-nlm-nih-gov-articles-pmc6111892"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-microscope-com-education-center-articles-history-of-microscopes",
            "name": "https://www.microscope.com/education-center/articles/history-of-microscopes",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-fizzicseducation-com-au-articles-digital-microscopy-teaching-students-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-bio-libretexts-org-bookshelves-microbiology-microbiology-boundless-03-mi-c",
            "name": "https://bio.libretexts.org/Bookshelves/Microbiology/Microbiology_(Boundless)/03:_Mi croscopy/3.01:_Looking_at_Microbes/3.1D:_Magnification_and_Resolution",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-microscope-com-education-center-articles-history-of-microscopes"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-jeolusa-com-resources-electron-optics-documents-downloads-sample-prepa",
            "name": "https://www.jeolusa.com/RESOURCES/Electron-Optics/Documents- Downloads/sample-preparation-techniques-conductive-coatings1",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-bio-libretexts-org-bookshelves-microbiology-microbiology-boundless-03-mi-c"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-leica-microsystems-com-science-lab-life-science-brief-introduction-to-",
            "name": "https://www.leica-microsystems.com/science-lab/life-science/brief-introduction-to- coating-technology-for-electron-microscopy/",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-jeolusa-com-resources-electron-optics-documents-downloads-sample-prepa"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-ntnu-edu-documents-139994-141053151-tem-sample-preparation-pdf-eb6c557",
            "name": "https://www.ntnu.edu/documents/139994/141053151/TEM+sample+preparation.pdf/ eb6c557f-8243-4923-9135-cc8f8fa5c37f",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-leica-microsystems-com-science-lab-life-science-brief-introduction-to-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-researchgate-net-figure-tfp-treatment-followed-by-ca-2-ionophore-a2318",
            "name": "https://www.researchgate.net/figure/TFP-treatment-followed-by-Ca-2-ionophore- A23187-TFP-exposure-was-carried-out-at-the_fig5_16791858",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-ntnu-edu-documents-139994-141053151-tem-sample-preparation-pdf-eb6c557"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-researchgate-net-figure-scanning-electron-micrographs-of-normal-a-and-",
            "name": "https://www.researchgate.net/figure/Scanning-electron-micrographs-of-normal-a- and-deciliated-b-paramecia-Note-that-the_fig5_1583989770",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-researchgate-net-figure-tfp-treatment-followed-by-ca-2-ionophore-a2318"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 69
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--pour-warm-milk-into-a-bowl",
            "name": "Pour warm milk into a bowl",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-researchgate-net-figure-scanning-electron-micrographs-of-normal-a-and-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--add-a-spoonful-of-curd-into-it",
            "name": "Add a spoonful of curd into it",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--pour-warm-milk-into-a-bowl"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-is-biotechnology",
            "name": "What is biotechnology?",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--add-a-spoonful-of-curd-into-it"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--give-two-examples-from-your-daily-life-demonstrating-the-use-of-biotechnology",
            "name": "Give two examples from your daily life demonstrating the use of biotechnology",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-is-biotechnology"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-are-microorganisms-important-in-biotechnology",
            "name": "Why are microorganisms important in biotechnology?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--give-two-examples-from-your-daily-life-demonstrating-the-use-of-biotechnology"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 71
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--3-microbes-as-tools-in-biotechnology-microorganisms-such-as-bacteria-yeast-and-f",
            "name": "3 Microbes as Tools in Biotechnology Microorganisms such as bacteria, yeast and fungi are widely used in biotechnology. Why is the reason for this?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-are-microorganisms-important-in-biotechnology"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 73
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--crop-production-and-agriculture",
            "name": "Crop production and agriculture",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--3-microbes-as-tools-in-biotechnology-microorganisms-such-as-bacteria-yeast-and-f"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 74
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--medicine-and-health-care",
            "name": "Medicine and Health Care",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--crop-production-and-agriculture"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 74
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--food-processing",
            "name": "Food processing",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--medicine-and-health-care"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 74
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--bio-enzymes-revolutionizing-household-cleaning",
            "name": "Bio-Enzymes: Revolutionizing Household Cleaning",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--food-processing"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 74
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--environmental-protection",
            "name": "Environmental protection",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--bio-enzymes-revolutionizing-household-cleaning"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 74
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-1-parts-of-fermenter",
            "name": "5.1 Parts of fermenter-",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--environmental-protection"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 78
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--5-2-fermentation-process-preparation-of-culture-medium",
            "name": "5.2 Fermentation Process Preparation of Culture Medium",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-1-parts-of-fermenter"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-is-temperature-control-important-in-fermenters",
            "name": "Why is temperature control important in fermenters?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--5-2-fermentation-process-preparation-of-culture-medium"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--what-happens-if-contamination-occurs",
            "name": "What happens if contamination occurs?",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-is-temperature-control-important-in-fermenters"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-sterilization-and-its-importance-in-microbial-growth",
            "name": "Explain sterilization and its importance in microbial growth",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--what-happens-if-contamination-occurs"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 79
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--using-the-above-data-plot-a-graph-using-time-hours-on-the-x-axis-and-number-of-m",
            "name": "Using the above data, plot a graph using time (hours) on the X-axis and number of microorganisms on the Y-axis",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-sterilization-and-its-importance-in-microbial-growth"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--identify-and-label-the-following-growth-phases-on-the-graph",
            "name": "Identify and label the following growth phases on the graph:",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--using-the-above-data-plot-a-graph-using-time-hours-on-the-x-axis-and-number-of-m"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 80
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--during-which-time-period-do-microorganisms-grow-most-rapidly",
            "name": "During which time period do microorganisms grow most rapidly?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--identify-and-label-the-following-growth-phases-on-the-graph"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 81
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--suggest-one-reason-why-the-population-decreases-after-a-certain-time",
            "name": "Suggest one reason why the population decreases after a certain time",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--during-which-time-period-do-microorganisms-grow-most-rapidly"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 81
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--6-ethical-issues-in-biotechnology",
            "name": "6 Ethical Issues in Biotechnology",
            "minutes": 20,
            "deps": [
              "1-conservative-and-non-conservative-forces--suggest-one-reason-why-the-population-decreases-after-a-certain-time"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 81
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--define-biotechnology-explain-how-microorganisms-act-as-lifes-engineers-giving-tw",
            "name": "Define biotechnology. Explain how microorganisms act as “life’s engineers” giving two examples",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--6-ethical-issues-in-biotechnology"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 82
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--differentiate-between-traditional-biotechnology-and-modern-biotechnology-using-s",
            "name": "Differentiate between traditional biotechnology and modern biotechnology using suitable examples",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--define-biotechnology-explain-how-microorganisms-act-as-lifes-engineers-giving-tw"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 82
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--why-are-fermenters-used-instead-of-open-containers-for-industrial-production-of-",
            "name": "Why are fermenters used instead of open containers for industrial production of useful substances? Give any two reasons",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--differentiate-between-traditional-biotechnology-and-modern-biotechnology-using-s"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 82
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--explain-the-importance-of-maintaining-sterility-inside-a-fermenter-what-problems",
            "name": "Explain the importance of maintaining sterility inside a fermenter. What problems may arise if sterility is not maintained?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--why-are-fermenters-used-instead-of-open-containers-for-industrial-production-of-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 82
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--microbes-are-used-in-food-production-medicine-and-environmental-protection-analy",
            "name": "Microbes are used in food production, medicine and environmental protection. Analyse how biotechnology helps improve human life using any three examples",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--explain-the-importance-of-maintaining-sterility-inside-a-fermenter-what-problems"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 83
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--a-scientist-wants-to-produce-insulin-using-bacteria-explain-how-modern-biotechno",
            "name": "A scientist wants to produce insulin using bacteria. Explain how modern biotechnology makes this possible. Why has traditional biotechnology not achieved this?",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--microbes-are-used-in-food-production-medicine-and-environmental-protection-analy"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 83
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--biotechnology-has-helped-increase-food-production-but-some-people-have-ethical-c",
            "name": "Biotechnology has helped increase food production, but some people have ethical concerns regarding GM crops. Evaluate both advantages and concerns",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--a-scientist-wants-to-produce-insulin-using-bacteria-explain-how-modern-biotechno"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 83
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--design-a-simple-biotechnology-product-that-can-help-solve-an-environmental-probl",
            "name": "Design a simple biotechnology product that can help solve an environmental problem in your community. Describe:",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--biotechnology-has-helped-increase-food-production-but-some-people-have-ethical-c"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 83
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--which-microorganism-is-commonly-used-in-bread-making-a-bacteria-b-virus-c-yeast-",
            "name": "Which microorganism is commonly used in bread making? a) Bacteria b) Virus c) Yeast d) Algae84",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--design-a-simple-biotechnology-product-that-can-help-solve-an-environmental-probl"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 83
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--during-which-phase-do-microorganisms-show-maximum-growth-a-lag-phase-b-log-phase",
            "name": "During which phase do microorganisms show maximum growth? a) Lag phase b) Log phase c) Stationary phase d) Death phase",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--which-microorganism-is-commonly-used-in-bread-making-a-bacteria-b-virus-c-yeast-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 84
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-britannica-com-technology-biotechnology",
            "name": "https://www.britannica.com/technology/biotechnology",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--during-which-phase-do-microorganisms-show-maximum-growth-a-lag-phase-b-log-phase"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 84
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-researchgate-net-figure-there-are-four-ethical-principles-that-may-be-",
            "name": "https://www.researchgate.net/figure/There-are-four-ethical-principles-that- may-be-used-as-guidelines-to-assess-the-ethical_fig3_316067580",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-britannica-com-technology-biotechnology"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 84
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-agritech-tnau-ac-in-bio-tech-biotech-btcotton-env-html",
            "name": "https://agritech.tnau.ac.in/bio-tech/biotech_btcotton_env.html",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-researchgate-net-figure-there-are-four-ethical-principles-that-may-be-"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 84
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-sciencedirect-com-topics-engineering-fermenter",
            "name": "https://www.sciencedirect.com/topics/engineering/fermenter",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-agritech-tnau-ac-in-bio-tech-biotech-btcotton-env-html"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 84
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-sciencedirect-com-topics-engineering-production-fermenter",
            "name": "https://www.sciencedirect.com/topics/engineering/production-fermenter",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-sciencedirect-com-topics-engineering-fermenter"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 84
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-ncert-nic-in-textbook-php-lebt1-2-1385",
            "name": "https://ncert.nic.in/textbook.php?lebt1=2-1385",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-sciencedirect-com-topics-engineering-production-fermenter"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-cambridgeinternational-org-programmes-and-qualifications-cambridge-igc",
            "name": "https://www.cambridgeinternational.org/programmes-and- qualifications/cambridge-igcse-biology-0610/",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-ncert-nic-in-textbook-php-lebt1-2-1385"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-bio-libretexts-org-bookshelves-human-biology-human-biology-waki-m-and-grew",
            "name": "https://bio.libretexts.org/Bookshelves/Human_Biology/Human_Biology_(Waki m_and_Grewal)/06%3A_DNA_and_Protein_Synthesis/6.08%3A_Biotechnol ogy",
            "minutes": 15,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-cambridgeinternational-org-programmes-and-qualifications-cambridge-igc"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-pmc-ncbi-nlm-nih-gov-articles-pmc1868753",
            "name": "https://pmc.ncbi.nlm.nih.gov/articles/PMC1868753/",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-bio-libretexts-org-bookshelves-human-biology-human-biology-waki-m-and-grew"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-cdc-gov-ecoli-about-index-html",
            "name": "https://www.cdc.gov/ecoli/about/index.html",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-pmc-ncbi-nlm-nih-gov-articles-pmc1868753"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-media-sciencephoto-com-f0-30-28-70-f0302870-800px-wm-jpg",
            "name": "https://media.sciencephoto.com/f0/30/28/70/f0302870-800px-wm.jpg",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-cdc-gov-ecoli-about-index-html"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-bbc-co-uk-bitesize-guides-zr3f7nb-revision-2",
            "name": "https://www.bbc.co.uk/bitesize/guides/zr3f7nb/revision/2",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-media-sciencephoto-com-f0-30-28-70-f0302870-800px-wm-jpg"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--https-www-merriam-webster-com-dictionary-biopiracy",
            "name": "https://www.merriam-webster.com/dictionary/biopiracy",
            "minutes": 10,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-bbc-co-uk-bitesize-guides-zr3f7nb-revision-2"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          },
          {
            "id": "1-conservative-and-non-conservative-forces--biotechnology-textbook-for-class-xi-ncert-publication",
            "name": "Biotechnology – Textbook for class XI (NCERT Publication)",
            "minutes": 25,
            "deps": [
              "1-conservative-and-non-conservative-forces--https-www-merriam-webster-com-dictionary-biopiracy"
            ],
            "source": {
              "pdf": "science-advanced",
              "page": 85
            }
          }
        ]
      }
    ]
  },
  {
    "id": "social-science",
    "name": "Social Science",
    "chapters": [
      {
        "id": "economies-and-subtopics",
        "name": "Economies and                   Subtopics",
        "concepts": [
          {
            "id": "economies-and-subtopics--1-to-1-3-pre-modern-world-to-societies-conquest",
            "name": "1 to 1.3 Pre Modern World to Societies Conquest",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 1
            }
          }
        ]
      },
      {
        "id": "history",
        "name": "HISTORY",
        "concepts": [
          {
            "id": "history--india-and-the-contemporary-world-ii",
            "name": "India and the Contemporary World - II",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "inter-disciplinary-project-with-chapter-7-of-geography",
        "name": "Inter disciplinary Project with chapter 7 of Geography",
        "concepts": [
          {
            "id": "inter-disciplinary-project-with-chapter-7-of-geography--lifelines-of-national-economy-and",
            "name": "Lifelines of National Economy and",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "geography",
        "name": "Geography",
        "concepts": [
          {
            "id": "geography--contemporary-india-ii",
            "name": "Contemporary India – II",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "interdisciplinary-project-with-chapter-3-of-history",
        "name": "Interdisciplinary project with chapter 3 of History",
        "concepts": [
          {
            "id": "interdisciplinary-project-with-chapter-3-of-history--the-making-of-a-global-world-and-chapter-4-of",
            "name": "The making of a Global world and chapter 4 of",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "economics",
        "name": "Economics",
        "concepts": [
          {
            "id": "economics--globalisation-and-the-indian-economy",
            "name": "Globalisation and the Indian Economy",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 5
            }
          },
          {
            "id": "economics--understanding-economic-development",
            "name": "Understanding Economic Development",
            "minutes": 15,
            "deps": [
              "economics--globalisation-and-the-indian-economy"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "political-science",
        "name": "Political Science",
        "concepts": [
          {
            "id": "political-science--democratic-politics-ii",
            "name": "Democratic Politics - II",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 5
            }
          }
        ]
      },
      {
        "id": "subtopics",
        "name": "Subtopics",
        "concepts": [
          {
            "id": "subtopics--what-is-globalisation-factors-that-have-enabled-globalisation",
            "name": "What is Globalisation? Factors that have enabled Globalisation",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 6
            }
          }
        ]
      },
      {
        "id": "class-x",
        "name": "Class X",
        "concepts": [
          {
            "id": "class-x--10-day-suggestive-plan-for-interdisciplinary-project",
            "name": "10-day Suggestive plan for Interdisciplinary Project",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "day-1",
        "name": "Day 1",
        "concepts": [
          {
            "id": "day-1--brief-overview-of-the-project-and-its-objectives-to-be-given-by-the-teachers",
            "name": "Brief overview of the project and its objectives to be given by the teachers",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "day-2",
        "name": "Day 2",
        "concepts": [
          {
            "id": "day-2--students-to-watch-a-video-from-the-link",
            "name": "Students to watch a video from the link",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "day-4",
        "name": "Day 4",
        "concepts": [
          {
            "id": "day-4--rebuilding-the-world-economy-and-interlinking-production-across-countries",
            "name": "Rebuilding the World Economy and Interlinking Production across countries",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 13
            }
          }
        ]
      },
      {
        "id": "day-5",
        "name": "Day 5",
        "concepts": [
          {
            "id": "day-5--the-role-of-roadways",
            "name": "The role of roadways",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 14
            }
          },
          {
            "id": "day-5--railways",
            "name": "railways",
            "minutes": 10,
            "deps": [
              "day-5--the-role-of-roadways"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 14
            }
          }
        ]
      },
      {
        "id": "title",
        "name": "Title",
        "concepts": [
          {
            "id": "title--the-role-of-waterways-and-airways-in-post-world-war-ii-world-and-india",
            "name": "The Role of Waterways and Airways in Post-World War II- World and India",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "waterways",
        "name": "Waterways",
        "concepts": [
          {
            "id": "waterways--in-the-post-world-war-ii-era",
            "name": "In the post-World War II era",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 15
            }
          },
          {
            "id": "waterways--combined-with-the-development-of-shipping-technologies",
            "name": "combined with the development of shipping technologies",
            "minutes": 20,
            "deps": [
              "waterways--in-the-post-world-war-ii-era"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 15
            }
          },
          {
            "id": "waterways--including-india-in-india",
            "name": "including India. In India",
            "minutes": 15,
            "deps": [
              "waterways--combined-with-the-development-of-shipping-technologies"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 15
            }
          },
          {
            "id": "waterways--helping-to-spur-economic-growth-and-development",
            "name": "helping to spur economic growth and development",
            "minutes": 20,
            "deps": [
              "waterways--including-india-in-india"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "airways",
        "name": "Airways",
        "concepts": [
          {
            "id": "airways--after-world-war-ii",
            "name": "After World War II",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 15
            }
          }
        ]
      },
      {
        "id": "evidences",
        "name": "Evidences",
        "concepts": [
          {
            "id": "evidences--photos",
            "name": "Photos",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          },
          {
            "id": "evidences--excerpts-from-interviews",
            "name": "Excerpts from Interviews",
            "minutes": 15,
            "deps": [
              "evidences--photos"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          },
          {
            "id": "evidences--observations",
            "name": "observations",
            "minutes": 10,
            "deps": [
              "evidences--excerpts-from-interviews"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          },
          {
            "id": "evidences--videos",
            "name": "Videos",
            "minutes": 10,
            "deps": [
              "evidences--observations"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          },
          {
            "id": "evidences--research-references",
            "name": "Research References",
            "minutes": 10,
            "deps": [
              "evidences--videos"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "overall-presentation",
        "name": "Overall presentation",
        "concepts": [
          {
            "id": "overall-presentation--link-of-ppt",
            "name": "Link of PPT",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          },
          {
            "id": "overall-presentation--shared-documents",
            "name": "shared documents",
            "minutes": 10,
            "deps": [
              "overall-presentation--link-of-ppt"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          },
          {
            "id": "overall-presentation--can-be-digital-handwritten",
            "name": "can be digital/handwritten",
            "minutes": 15,
            "deps": [
              "overall-presentation--shared-documents"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          },
          {
            "id": "overall-presentation--references-websites-books-newspaper-etc-reflections",
            "name": "References (websites, books, newspaper etc.) Reflections:",
            "minutes": 20,
            "deps": [
              "overall-presentation--can-be-digital-handwritten"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 17
            }
          }
        ]
      },
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--items-of-locating-and-labelling-may-also-be-given-for-identification",
            "name": "Items of Locating and Labelling may also be given for Identification",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "social-science-x",
              "page": 8
            }
          },
          {
            "id": "syllabus--the-maps-available-in-the-website-of-govt-of-india-may-be-used-thermal-nuclear",
            "name": "The Maps available in the website of Govt. of India may be used. Thermal Nuclear",
            "minutes": 25,
            "deps": [
              "syllabus--items-of-locating-and-labelling-may-also-be-given-for-identification"
            ],
            "source": {
              "pdf": "social-science-x",
              "page": 8
            }
          }
        ]
      }
    ]
  },
  {
    "id": "english-language-and-literature",
    "name": "English Language and Literature",
    "chapters": [
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--discursive-passage-of-400-450-words-10-marks",
            "name": "Discursive passage of 400-450 words. 10 marks",
            "minutes": 20,
            "deps": [],
            "source": {
              "pdf": "english-x",
              "page": 2
            }
          },
          {
            "id": "syllabus--case-based-factual-passage-with-visual-input-statistical-data-chart-etc-of-200-2",
            "name": "Case-based factual passage (with visual input- statistical data, chart etc.) of 200-250 words. 10 marks",
            "minutes": 25,
            "deps": [
              "syllabus--discursive-passage-of-400-450-words-10-marks"
            ],
            "source": {
              "pdf": "english-x",
              "page": 2
            }
          },
          {
            "id": "syllabus--writing-a-formal-letter-based-on-a-given-situation-in-100-120-words-one-out-of-t",
            "name": "Writing a Formal Letter based on a given situation, in 100-120 words. One out of two questions is to be answered. 5 marks",
            "minutes": 25,
            "deps": [
              "syllabus--case-based-factual-passage-with-visual-input-statistical-data-chart-etc-of-200-2"
            ],
            "source": {
              "pdf": "english-x",
              "page": 3
            }
          },
          {
            "id": "syllabus--one-extract-out-of-two-from-drama-prose",
            "name": "One extract out of two from Drama / Prose",
            "minutes": 25,
            "deps": [
              "syllabus--writing-a-formal-letter-based-on-a-given-situation-in-100-120-words-one-out-of-t"
            ],
            "source": {
              "pdf": "english-x",
              "page": 3
            }
          }
        ]
      },
      {
        "id": "first-flight",
        "name": "FIRST FLIGHT",
        "concepts": [
          {
            "id": "first-flight--a-letter-to-god",
            "name": "A Letter to God",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--nelson-mandela-long-walk-to-freedom",
            "name": "Nelson Mandela - Long Walk to Freedom",
            "minutes": 20,
            "deps": [
              "first-flight--a-letter-to-god"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--stories-about-flying",
            "name": "Stories About Flying",
            "minutes": 15,
            "deps": [
              "first-flight--nelson-mandela-long-walk-to-freedom"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--from-the-diary-of-anne-frank",
            "name": "From the Diary of Anne Frank",
            "minutes": 20,
            "deps": [
              "first-flight--stories-about-flying"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--glimpses-of-india",
            "name": "Glimpses of India",
            "minutes": 15,
            "deps": [
              "first-flight--from-the-diary-of-anne-frank"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--mijbil-the-otter",
            "name": "Mijbil the Otter",
            "minutes": 15,
            "deps": [
              "first-flight--glimpses-of-india"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--madam-rides-the-bus",
            "name": "Madam Rides the Bus",
            "minutes": 15,
            "deps": [
              "first-flight--mijbil-the-otter"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--the-sermon-at-benares",
            "name": "The Sermon at Benares",
            "minutes": 15,
            "deps": [
              "first-flight--madam-rides-the-bus"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--the-proposal-play-b-poems",
            "name": "The Proposal (Play) B. Poems",
            "minutes": 20,
            "deps": [
              "first-flight--the-sermon-at-benares"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--dust-of-snow",
            "name": "Dust of Snow",
            "minutes": 15,
            "deps": [
              "first-flight--the-proposal-play-b-poems"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--fire-and-ice",
            "name": "Fire and Ice",
            "minutes": 15,
            "deps": [
              "first-flight--dust-of-snow"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--a-tiger-in-the-zoo",
            "name": "A Tiger in the Zoo",
            "minutes": 20,
            "deps": [
              "first-flight--fire-and-ice"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--how-to-tell-wild-animals",
            "name": "How to Tell Wild Animals",
            "minutes": 20,
            "deps": [
              "first-flight--a-tiger-in-the-zoo"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--the-ball-poem",
            "name": "The Ball Poem",
            "minutes": 15,
            "deps": [
              "first-flight--how-to-tell-wild-animals"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--amanda",
            "name": "Amanda!",
            "minutes": 10,
            "deps": [
              "first-flight--the-ball-poem"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--the-trees",
            "name": "The Trees",
            "minutes": 10,
            "deps": [
              "first-flight--amanda"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--the-tale-of-custard-the-dragon",
            "name": "The Tale of Custard the Dragon",
            "minutes": 20,
            "deps": [
              "first-flight--the-trees"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "first-flight--for-anne-gregory",
            "name": "For Anne Gregory",
            "minutes": 15,
            "deps": [
              "first-flight--the-tale-of-custard-the-dragon"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          }
        ]
      },
      {
        "id": "footprints-without-feet",
        "name": "FOOTPRINTS WITHOUT FEET",
        "concepts": [
          {
            "id": "footprints-without-feet--a-triumph-of-surgery",
            "name": "A Triumph of Surgery",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--the-thiefs-story",
            "name": "The Thief's Story",
            "minutes": 15,
            "deps": [
              "footprints-without-feet--a-triumph-of-surgery"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--the-midnight-visitor",
            "name": "The Midnight Visitor",
            "minutes": 15,
            "deps": [
              "footprints-without-feet--the-thiefs-story"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--a-question-of-trust",
            "name": "A Question of Trust",
            "minutes": 15,
            "deps": [
              "footprints-without-feet--the-midnight-visitor"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--footprints-without-feet",
            "name": "Footprints Without Feet",
            "minutes": 15,
            "deps": [
              "footprints-without-feet--a-question-of-trust"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--the-making-of-a-scientist",
            "name": "The Making of a Scientist",
            "minutes": 20,
            "deps": [
              "footprints-without-feet--footprints-without-feet"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--the-necklace",
            "name": "The Necklace",
            "minutes": 10,
            "deps": [
              "footprints-without-feet--the-making-of-a-scientist"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--the-book-that-saved-the-earth",
            "name": "The Book that Saved the Earth",
            "minutes": 20,
            "deps": [
              "footprints-without-feet--the-necklace"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--words-and-expressions-ii-workbook-for-class-x-units-1-to-4-and-units-7-to-115-no",
            "name": "WORDS AND EXPRESSIONS – II (WORKBOOK FOR CLASS X) – Units 1 to 4 and Units 7 to 115 Note: Teachers are suggested to:",
            "minutes": 25,
            "deps": [
              "footprints-without-feet--the-book-that-saved-the-earth"
            ],
            "source": {
              "pdf": "english-x",
              "page": 4
            }
          },
          {
            "id": "footprints-without-feet--3-4-5",
            "name": "3. 4. 5",
            "minutes": 15,
            "deps": [
              "footprints-without-feet--words-and-expressions-ii-workbook-for-class-x-units-1-to-4-and-units-7-to-115-no"
            ],
            "source": {
              "pdf": "english-x",
              "page": 7
            }
          }
        ]
      }
    ]
  },
  {
    "id": "computer-applications",
    "name": "Computer Applications",
    "chapters": [
      {
        "id": "syllabus",
        "name": "Syllabus",
        "concepts": [
          {
            "id": "syllabus--understand-the-components-of-computer-networking-including-web-servers-and-netwo",
            "name": "Understand the components of Computer Networking including web servers and network protocols",
            "minutes": 25,
            "deps": [],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "syllabus--explore-the-functionality-and-applications-of-the-services-available-on-the-inte",
            "name": "Explore the functionality and applications of the services available on the Internet",
            "minutes": 25,
            "deps": [
              "syllabus--understand-the-components-of-computer-networking-including-web-servers-and-netwo"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "syllabus--create-simple-web-pages-using-various-html-elements",
            "name": "Create simple web pages using various HTML elements",
            "minutes": 25,
            "deps": [
              "syllabus--explore-the-functionality-and-applications-of-the-services-available-on-the-inte"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "syllabus--implement-links-and-forms-to-create-user-friendly-web-pages-that-facilitate-navi",
            "name": "Implement links and forms to create user-friendly web pages that facilitate navigation and data collection",
            "minutes": 25,
            "deps": [
              "syllabus--create-simple-web-pages-using-various-html-elements"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "syllabus--apply-basic-styling-techniques-using-css-to-improve-the-visual-appearance-and-la",
            "name": "Apply basic styling techniques using CSS to improve the visual appearance and layout of web content",
            "minutes": 25,
            "deps": [
              "syllabus--implement-links-and-forms-to-create-user-friendly-web-pages-that-facilitate-navi"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "syllabus--understand-the-importance-of-netiquettes-intellectual-property-rights-and-respon",
            "name": "Understand the importance of netiquettes, intellectual property rights, and responsible online behaviour Distribution of Marks Unit No. Unit Name Marks",
            "minutes": 25,
            "deps": [
              "syllabus--apply-basic-styling-techniques-using-css-to-improve-the-visual-appearance-and-la"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "syllabus--networking-15",
            "name": "Networking 15",
            "minutes": 10,
            "deps": [
              "syllabus--understand-the-importance-of-netiquettes-intellectual-property-rights-and-respon"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          }
        ]
      },
      {
        "id": "html-25",
        "name": "HTML 25",
        "concepts": [
          {
            "id": "html-25--cyber-ethics-10",
            "name": "Cyber ethics 10",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "html-25--practicals-50-total-100-unit-1-networking",
            "name": "Practicals 50 Total 100 Unit 1: Networking",
            "minutes": 20,
            "deps": [
              "html-25--cyber-ethics-10"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 1
            }
          },
          {
            "id": "html-25--lab-exercises",
            "name": "Lab Exercises",
            "minutes": 10,
            "deps": [
              "html-25--practicals-50-total-100-unit-1-networking"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 2
            }
          },
          {
            "id": "html-25--lab-test",
            "name": "Lab Test",
            "minutes": 10,
            "deps": [
              "html-25--lab-exercises"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 3
            }
          },
          {
            "id": "html-25--report-file-viva",
            "name": "Report File + viva",
            "minutes": 15,
            "deps": [
              "html-25--lab-test"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 3
            }
          },
          {
            "id": "html-25--project-that-uses-most-of-the-concepts-that-have-been-learnt",
            "name": "Project (that uses most of the concepts that have been learnt)",
            "minutes": 25,
            "deps": [
              "html-25--report-file-viva"
            ],
            "source": {
              "pdf": "computer-applications-x",
              "page": 3
            }
          }
        ]
      }
    ]
  },
  {
    "id": "elements-of-business",
    "name": "Elements of Business",
    "chapters": [
      {
        "id": "theory",
        "name": "Theory",
        "concepts": [
          {
            "id": "theory--30-marks",
            "name": "30 Marks",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          }
        ]
      },
      {
        "id": "meaning-and-methods",
        "name": "Meaning and methods",
        "concepts": [
          {
            "id": "meaning-and-methods--letter",
            "name": "letter",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          },
          {
            "id": "meaning-and-methods--e-mail",
            "name": "e-mail",
            "minutes": 10,
            "deps": [
              "meaning-and-methods--letter"
            ],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          },
          {
            "id": "meaning-and-methods--video-conferencing",
            "name": "video conferencing",
            "minutes": 10,
            "deps": [
              "meaning-and-methods--e-mail"
            ],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          },
          {
            "id": "meaning-and-methods--telephone-iv-selling-and-distribution-a-concept-of-purchase-and-sale-b-types-cas",
            "name": "telephone IV Selling and Distribution (a) Concept of purchase and sale (b) Types - Cash",
            "minutes": 25,
            "deps": [
              "meaning-and-methods--video-conferencing"
            ],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          },
          {
            "id": "meaning-and-methods--credit",
            "name": "Credit",
            "minutes": 10,
            "deps": [
              "meaning-and-methods--telephone-iv-selling-and-distribution-a-concept-of-purchase-and-sale-b-types-cas"
            ],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          },
          {
            "id": "meaning-and-methods--tele-shopping",
            "name": "tele-shopping",
            "minutes": 10,
            "deps": [
              "meaning-and-methods--credit"
            ],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          },
          {
            "id": "meaning-and-methods--automated-vending-machines",
            "name": "automated vending machines",
            "minutes": 15,
            "deps": [
              "meaning-and-methods--tele-shopping"
            ],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          },
          {
            "id": "meaning-and-methods--importance-and-media-of-advertising",
            "name": "importance and media of advertising",
            "minutes": 20,
            "deps": [
              "meaning-and-methods--automated-vending-machines"
            ],
            "source": {
              "pdf": "elements-of-business-x",
              "page": 1
            }
          }
        ]
      }
    ]
  },
  {
    "id": "elements-of-book-keeping-accountancy",
    "name": "Elements of Book Keeping & Accountancy",
    "chapters": [
      {
        "id": "capital-and-revenue",
        "name": "Capital and revenue",
        "concepts": [
          {
            "id": "capital-and-revenue--capital-and-revenue-receipts",
            "name": "Capital and revenue receipts",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 1
            }
          }
        ]
      },
      {
        "id": "bill-of-exchange",
        "name": "Bill of Exchange",
        "concepts": [
          {
            "id": "bill-of-exchange--exchange",
            "name": "Exchange",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 2
            }
          }
        ]
      },
      {
        "id": "accounting-from-incomplete-records",
        "name": "Accounting from Incomplete Records",
        "concepts": [
          {
            "id": "accounting-from-incomplete-records--meaning",
            "name": "Meaning",
            "minutes": 10,
            "deps": [],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 2
            }
          },
          {
            "id": "accounting-from-incomplete-records--preparation-of-statement-of-profit",
            "name": "preparation of statement of Profit",
            "minutes": 20,
            "deps": [
              "accounting-from-incomplete-records--meaning"
            ],
            "source": {
              "pdf": "elements-of-accountancy-x",
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
            "id": "prescribed--capital-and-revenue",
            "name": "Capital and Revenue",
            "minutes": 15,
            "deps": [],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 1
            }
          },
          {
            "id": "prescribed--depreciation",
            "name": "Depreciation",
            "minutes": 10,
            "deps": [
              "prescribed--capital-and-revenue"
            ],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 1
            }
          },
          {
            "id": "prescribed--bank-reconciliation-statement",
            "name": "Bank Reconciliation Statement",
            "minutes": 15,
            "deps": [
              "prescribed--depreciation"
            ],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 1
            }
          },
          {
            "id": "prescribed--bills-of-exchange",
            "name": "Bills of Exchange",
            "minutes": 15,
            "deps": [
              "prescribed--bank-reconciliation-statement"
            ],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 1
            }
          },
          {
            "id": "prescribed--final-accounts",
            "name": "Final Accounts",
            "minutes": 10,
            "deps": [
              "prescribed--bills-of-exchange"
            ],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 1
            }
          },
          {
            "id": "prescribed--accounting-from-incomplete-records",
            "name": "Accounting from Incomplete Records",
            "minutes": 15,
            "deps": [
              "prescribed--final-accounts"
            ],
            "source": {
              "pdf": "elements-of-accountancy-x",
              "page": 1
            }
          }
        ]
      }
    ]
  }
]
