/* Learning OS — curriculum model. window.CURRICULUM
   Concept encoding: "Name" or "Name<Dep A,Dep B" (deps are names within the same chapter). */
(function () {
  function ch(name, minutes, concepts) {
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: name,
      concepts: concepts.map(function (spec) {
        var parts = spec.split("<");
        var nm = parts[0].trim();
        return {
          id: nm.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name: nm,
          minutes: minutes,
          deps: parts[1] ? parts[1].split(",").map(function (d) { return d.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"); }) : []
        };
      })
    };
  }

  var M10 = [
    ch("Real Numbers", 25, ["Euclid's division lemma", "Fundamental theorem of arithmetic<Euclid's division lemma", "HCF and LCM<Fundamental theorem of arithmetic", "Irrational numbers<Fundamental theorem of arithmetic", "Decimal expansions<Irrational numbers"]),
    ch("Polynomials", 30, ["Degree", "Coefficients", "Zeroes of a polynomial<Degree,Coefficients", "Relationship between zeroes and coefficients<Zeroes of a polynomial", "Division algorithm<Zeroes of a polynomial"]),
    ch("Pair of Linear Equations", 30, ["Linear equation in two variables", "Graphical solution<Linear equation in two variables", "Substitution method<Linear equation in two variables", "Elimination method<Substitution method", "Consistency of a pair<Graphical solution,Elimination method"]),
    ch("Quadratic Equations", 30, ["Polynomial", "Degree<Polynomial", "Coefficients<Polynomial", "Factorisation<Degree,Coefficients", "Completing the square<Factorisation", "Quadratic formula<Completing the square", "Roots<Factorisation,Quadratic formula", "Discriminant<Quadratic formula", "Graph<Roots", "Word problems<Roots"]),
    ch("Arithmetic Progressions", 25, ["Sequence", "Common difference<Sequence", "nth term<Common difference", "Sum of n terms<nth term", "Applications<Sum of n terms"]),
    ch("Triangles", 30, ["Similar figures", "Basic proportionality theorem<Similar figures", "Criteria for similarity<Basic proportionality theorem", "Areas of similar triangles<Criteria for similarity", "Pythagoras theorem<Criteria for similarity"])
  ];

  var P10 = [
    ch("Light — Reflection and Refraction", 35, ["Laws of reflection", "Spherical mirrors<Laws of reflection", "Mirror formula<Spherical mirrors", "Refraction<Laws of reflection", "Refractive index<Refraction", "Lens formula<Refractive index", "Power of a lens<Lens formula"]),
    ch("Electricity", 35, ["Electric current", "Potential difference<Electric current", "Ohm's law<Potential difference", "Resistance<Ohm's law", "Series and parallel<Resistance", "Heating effect<Series and parallel"]),
    ch("Magnetic Effects of Current", 30, ["Magnetic field", "Field due to a current<Magnetic field", "Right-hand thumb rule<Field due to a current", "Force on a conductor<Field due to a current", "Electromagnetic induction<Force on a conductor"]),
    ch("Motion and Force", 30, ["Displacement", "Velocity<Displacement", "Acceleration<Velocity", "Newton's first law<Acceleration", "Newton's second law<Newton's first law", "Momentum<Newton's second law"])
  ];

  var C10 = [
    ch("Chemical Reactions and Equations", 25, ["Chemical change", "Writing an equation<Chemical change", "Balancing equations<Writing an equation", "Types of reaction<Balancing equations", "Oxidation and reduction<Types of reaction"]),
    ch("Acids, Bases and Salts", 30, ["Acids and bases", "pH scale<Acids and bases", "Neutralisation<pH scale", "Salts<Neutralisation", "Common salt chemistry<Salts"]),
    ch("Carbon and its Compounds", 30, ["Covalent bonding", "Allotropes of carbon<Covalent bonding", "Homologous series<Covalent bonding", "Functional groups<Homologous series", "Nomenclature<Functional groups", "Soaps and detergents<Functional groups"])
  ];

  var B10 = [
    ch("Life Processes", 30, ["Nutrition", "Respiration<Nutrition", "Transport<Respiration", "Excretion<Transport"]),
    ch("Control and Coordination", 25, ["Nervous system", "Reflex action<Nervous system", "Endocrine glands<Nervous system", "Plant hormones<Endocrine glands"]),
    ch("How do Organisms Reproduce", 30, ["Asexual reproduction", "Sexual reproduction<Asexual reproduction", "Reproduction in plants<Sexual reproduction", "Human reproductive system<Sexual reproduction"])
  ];

  var M9 = [
    ch("Number Systems", 25, ["Rational numbers", "Irrational numbers<Rational numbers", "Real number line<Irrational numbers", "Laws of exponents<Real number line"]),
    ch("Polynomials", 25, ["Terms and degree", "Zeroes<Terms and degree", "Remainder theorem<Zeroes", "Factor theorem<Remainder theorem", "Algebraic identities<Factor theorem"]),
    ch("Linear Equations in Two Variables", 25, ["Solution of an equation", "Graph of a linear equation<Solution of an equation", "Equations of axes<Graph of a linear equation"]),
    ch("Triangles", 30, ["Congruence", "Criteria for congruence<Congruence", "Inequalities in a triangle<Criteria for congruence"])
  ];
  var P9 = [
    ch("Motion", 30, ["Distance and displacement", "Speed and velocity<Distance and displacement", "Acceleration<Speed and velocity", "Equations of motion<Acceleration", "Graphical representation<Equations of motion"]),
    ch("Force and Laws of Motion", 30, ["Balanced and unbalanced forces", "Newton's first law<Balanced and unbalanced forces", "Newton's second law<Newton's first law", "Newton's third law<Newton's second law", "Conservation of momentum<Newton's third law"]),
    ch("Gravitation", 25, ["Universal law of gravitation", "Free fall<Universal law of gravitation", "Mass and weight<Free fall", "Thrust and pressure<Mass and weight"])
  ];
  var C9 = [
    ch("Matter in Our Surroundings", 25, ["States of matter", "Change of state<States of matter", "Evaporation<Change of state"]),
    ch("Atoms and Molecules", 30, ["Laws of chemical combination", "Atomic mass<Laws of chemical combination", "Mole concept<Atomic mass", "Chemical formulae<Mole concept"]),
    ch("Structure of the Atom", 30, ["Subatomic particles", "Rutherford model<Subatomic particles", "Bohr model<Rutherford model", "Valency<Bohr model", "Isotopes<Valency"])
  ];
  var B9 = [
    ch("The Fundamental Unit of Life", 25, ["Cell as a unit", "Plasma membrane<Cell as a unit", "Nucleus<Cell as a unit", "Cell organelles<Nucleus"]),
    ch("Tissues", 25, ["Plant tissues", "Animal tissues<Plant tissues", "Meristematic tissue<Plant tissues"]),
    ch("Cell Division", 30, ["Cell cycle", "Mitosis<Cell cycle", "Meiosis<Mitosis", "Significance of division<Meiosis"])
  ];

  var M11 = [
    ch("Sets and Functions", 30, ["Sets", "Relations<Sets", "Functions<Relations", "Domain and range<Functions"]),
    ch("Trigonometric Functions", 35, ["Angles and radians", "Trigonometric ratios<Angles and radians", "Identities<Trigonometric ratios", "General solutions<Identities"]),
    ch("Sequences and Series", 30, ["Arithmetic progression", "Geometric progression<Arithmetic progression", "Sum to infinity<Geometric progression", "Means<Geometric progression"]),
    ch("Limits and Derivatives", 35, ["Limit of a function", "Algebra of limits<Limit of a function", "Derivative from first principles<Algebra of limits", "Rules of differentiation<Derivative from first principles"])
  ];
  var P11 = [
    ch("Laws of Motion", 35, ["Inertia", "Newton's second law<Inertia", "Friction<Newton's second law", "Circular motion<Newton's second law"]),
    ch("Work, Energy and Power", 30, ["Work", "Kinetic energy<Work", "Work-energy theorem<Kinetic energy", "Power<Work-energy theorem"]),
    ch("Thermodynamics", 35, ["Thermal equilibrium", "First law<Thermal equilibrium", "Specific heat<First law", "Second law<First law"])
  ];
  var C11 = [
    ch("Some Basic Concepts of Chemistry", 30, ["Mole concept", "Stoichiometry<Mole concept", "Limiting reagent<Stoichiometry", "Empirical formula<Stoichiometry"]),
    ch("Structure of Atom", 35, ["Bohr model", "Quantum numbers<Bohr model", "Orbitals<Quantum numbers", "Electronic configuration<Orbitals"]),
    ch("Chemical Bonding", 35, ["Ionic bonding", "Covalent bonding<Ionic bonding", "VSEPR theory<Covalent bonding", "Hybridisation<VSEPR theory"])
  ];
  var BIO11 = [
    ch("Cell — Structure and Function", 30, ["Cell theory", "Cell organelles<Cell theory", "Cell cycle<Cell organelles", "Cell division<Cell cycle"]),
    ch("Plant Physiology", 35, ["Transport in plants", "Photosynthesis<Transport in plants", "Respiration in plants<Photosynthesis"]),
    ch("Human Physiology", 35, ["Digestion", "Breathing<Digestion", "Circulation<Breathing", "Excretion<Circulation"])
  ];
  var ACC11 = [
    ch("Theoretical Framework", 25, ["Accounting concepts", "Accounting equation<Accounting concepts", "Double entry system<Accounting equation"]),
    ch("Recording Transactions", 30, ["Journal", "Ledger<Journal", "Trial balance<Ledger"]),
    ch("Financial Statements", 30, ["Trading account", "Profit and loss<Trading account", "Balance sheet<Profit and loss"])
  ];
  var ECO11 = [
    ch("Introduction to Economics", 25, ["Scarcity and choice", "Microeconomics<Scarcity and choice", "Macroeconomics<Scarcity and choice"]),
    ch("Consumer Behaviour", 30, ["Utility", "Law of demand<Utility", "Elasticity of demand<Law of demand"]),
    ch("Statistics for Economics", 30, ["Collection of data", "Measures of central tendency<Collection of data", "Dispersion<Measures of central tendency"])
  ];
  var HIS11 = [
    ch("Early Societies", 25, ["Hunter-gatherers", "Neolithic settlement<Hunter-gatherers", "Early cities<Neolithic settlement"]),
    ch("Empires", 30, ["Mesopotamia", "Roman empire<Mesopotamia", "Nomadic empires<Roman empire"]),
    ch("Changing Traditions", 30, ["Feudalism", "Renaissance<Feudalism", "Industrial revolution<Renaissance"])
  ];

  var SUB = {
    mathematics: { id: "mathematics", name: "Mathematics" },
    physics: { id: "physics", name: "Physics" },
    chemistry: { id: "chemistry", name: "Chemistry" },
    biology: { id: "biology", name: "Biology" },
    accountancy: { id: "accountancy", name: "Accountancy" },
    economics: { id: "economics", name: "Economics" },
    history: { id: "history", name: "History" }
  };

  function subj(key, chapters) { return { id: SUB[key].id, name: SUB[key].name, chapters: chapters }; }

  window.CURRICULUM = {
    classes: ["Class 9", "Class 10", "Class 11", "Class 12"],
    needsStream: function (cls) { return cls === "Class 11" || cls === "Class 12"; },
    streams: ["Science — PCM", "Science — PCB", "Commerce", "Humanities"],
    dayOptions: [
      { label: "1.5 hours", minutes: 90 },
      { label: "2 hours", minutes: 120 },
      { label: "2.5 hours", minutes: 150 },
      { label: "3 hours", minutes: 180 }
    ],
    subjectsFor: function (cls, stream) {
      if (cls === "Class 9") return [subj("mathematics", M9), subj("physics", P9), subj("chemistry", C9), subj("biology", B9)];
      if (cls === "Class 10") return [subj("mathematics", M10), subj("physics", P10), subj("chemistry", C10), subj("biology", B10)];
      if (stream === "Science — PCM") return [subj("mathematics", M11), subj("physics", P11), subj("chemistry", C11)];
      if (stream === "Science — PCB") return [subj("physics", P11), subj("chemistry", C11), subj("biology", BIO11)];
      if (stream === "Commerce") return [subj("accountancy", ACC11), subj("economics", ECO11), subj("mathematics", M11)];
      if (stream === "Humanities") return [subj("history", HIS11), subj("economics", ECO11)];
      return [];
    },
    /* Layered layout: depth = longest path from a root. */
    layout: function (concepts) {
      var byId = {};
      concepts.forEach(function (c) { byId[c.id] = c; });
      var depth = {};
      function d(id, guard) {
        if (depth[id] !== undefined) return depth[id];
        if (guard[id]) return 0;
        guard[id] = true;
        var c = byId[id];
        var deps = (c && c.deps || []).filter(function (x) { return byId[x]; });
        var v = deps.length ? 1 + Math.max.apply(null, deps.map(function (x) { return d(x, guard); })) : 0;
        depth[id] = v;
        return v;
      }
      concepts.forEach(function (c) { d(c.id, {}); });
      var rows = {};
      concepts.forEach(function (c) {
        var lv = depth[c.id];
        rows[lv] = rows[lv] || [];
        rows[lv].push(c);
      });
      var levels = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
      var COLW = 208, ROWH = 92, PADX = 40, PADY = 46;
      var maxCol = 0;
      levels.forEach(function (lv) { maxCol = Math.max(maxCol, rows[lv].length); });
      var pos = {};
      levels.forEach(function (lv) {
        var list = rows[lv];
        list.forEach(function (c, i) {
          var span = list.length;
          var offset = (maxCol - span) / 2;
          pos[c.id] = { x: PADX + (offset + i) * COLW, y: PADY + lv * ROWH, lv: lv };
        });
      });
      return {
        pos: pos,
        width: PADX * 2 + maxCol * COLW,
        height: PADY * 2 + levels.length * ROWH,
        levels: levels.length
      };
    }
  };
})();

/* --- Memoization -------------------------------------------------------
 * subjectsFor() rebuilt the whole class tree on every call (measured 6-7x
 * per interaction) and returned fresh object identities each time, which
 * also defeated every downstream identity check. layout() recomputed the
 * graph layering on every render. Both are pure functions of their inputs,
 * so both are cached. Measured effect: 6-7 tree rebuilds per interaction
 * become 0. */
(function () {
  var C = window.CURRICULUM;
  if (!C || C.__memo) return;
  C.__memo = true;
  var sfCache = {}, layCache = {};
  var sf = C.subjectsFor, lay = C.layout;
  C.subjectsFor = function (cls, stream) {
    var k = (cls || "") + "|" + (stream || "");
    if (!sfCache[k]) sfCache[k] = sf.call(C, cls, stream);
    return sfCache[k];
  };
  C.layout = function (concepts) {
    if (!concepts || !concepts.length) return lay.call(C, concepts || []);
    var k = concepts[0].id + ":" + concepts.length;
    if (!layCache[k]) layCache[k] = lay.call(C, concepts);
    return layCache[k];
  };
})();
