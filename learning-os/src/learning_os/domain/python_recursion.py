"""The V1 subject: recursion, in Python.

WHY THIS SUBJECT
----------------
Programming was chosen as the first domain because a claim about it can be
CHECKED. Code runs, tests pass or fail, and transfer can be measured by handing
the learner a genuinely different problem and executing their answer. Most
subjects cannot do that, and a system whose first domain cannot be verified
learns nothing about whether its own decisions were any good.

Recursion specifically, because it decomposes into subskills that come apart in
practice. A learner who can trace a recursive call is not thereby able to write
one; a learner who writes one often cannot say why it terminates. Those splits
are what the bottleneck engine exists to find, and a concept whose subskills
always move together would not exercise it.

THIS FILE IS CONTENT, NOT CODE
------------------------------
Nothing here decides how to teach. No representation, no ordering, no
difficulty curve. Those depend on the learner and belong to the policy layer.
What is fixed here is what the subject IS -- so that the LLM generates inside a
definition rather than inventing one per conversation.
"""

from __future__ import annotations

from learning_os.domain.knowledge import (
    CognitiveOperation,
    Concept,
    ForbiddenSimplification,
    KnowledgeGraph,
    Misconception,
    Subskill,
)
from learning_os.models.contracts import Verifiability

KNOWLEDGE_VERSION = "python_recursion_v1"

_BASE_CASE_OPTIONAL = Misconception(
    misconception_id="python.recursion.thinks_base_case_is_optional",
    statement="Believes a recursive function will stop on its own once the input gets small.",
    predicts_error=(
        "Writes a function with a recursive call and no terminating branch, and is "
        "surprised by RecursionError rather than expecting it."
    ),
    repaired_by=(
        "Trace the call stack on an input of 2 and count the frames that never return.",
    ),
)

_RECURSION_IS_A_LOOP = Misconception(
    misconception_id="python.recursion.thinks_it_is_just_a_loop",
    statement="Treats a recursive call as a jump back to the start, with no new frame.",
    predicts_error=(
        "Expects a local variable to keep its value across the recursive call, and "
        "predicts the wrong output for a function that mutates then recurses."
    ),
    repaired_by=(
        "Print the argument at entry and exit of each call and read the order.",
    ),
)

_ACCUMULATOR_CONFUSION = Misconception(
    misconception_id="python.recursion.thinks_return_value_accumulates_itself",
    statement=(
        "Assumes the recursive call's return value is added to a running total "
        "automatically."
    ),
    predicts_error=(
        "Writes the recursive call as a bare statement without returning or combining it, "
        "producing None."
    ),
    repaired_by=("Show the same function with and without the `return`, and run both.",),
)

RECURSION = Concept(
    concept_id="python.recursion",
    name="Recursion",
    definition=(
        "A function that calls itself on a smaller input, together with at least one "
        "branch that returns without calling itself. Each call gets its own frame with "
        "its own local names; the calls resolve in reverse order of their making."
    ),
    core_ideas=(
        "A recursive call is an ordinary call: it creates a new frame with new locals.",
        "Termination requires a branch that returns without recursing, reached by every input.",
        "The recursive case must move strictly toward that branch.",
    ),
    prerequisites=("python.functions",),
    technical_terms=("base case", "recursive case", "call stack", "frame", "stack depth"),
    allowed_simplifications=(
        "Draw the call stack as a vertical list of frames rather than as memory addresses.",
        "Use small inputs so the whole stack fits on one screen.",
    ),
    forbidden_simplifications=(
        # This is the one that keeps the system honest when a learner struggles.
        # Every entry here is something it is tempting to say because it makes
        # the moment easier and leaves the learner holding something false.
        # Each `tells` entry is a phrase that only shows up when the rule has
        # been broken. They are what the validator actually matches; the `rule`
        # is what the model reads. Both are needed and they are not the same text.
        ForbiddenSimplification(
            rule="Do not say recursion 'repeats' the function -- that is the loop misconception.",
            tells=("repeats the function", "repeats itself", "just a loop", "like a loop"),
        ),
        ForbiddenSimplification(
            rule="Do not call the base case optional or 'usually needed'; it is required.",
            tells=(
                "base case is optional", "usually needed", "often leave it out",
                "leave it out", "not always necessary", "usually need a base case",
            ),
        ),
        ForbiddenSimplification(
            rule=(
                "Do not describe the stack as unlimited; Python has a recursion "
                "limit and it matters."
            ),
            tells=("as many calls as you like", "unlimited", "as deep as you want", "no limit"),
        ),
    ),
    misconceptions=(_BASE_CASE_OPTIONAL, _RECURSION_IS_A_LOOP, _ACCUMULATOR_CONFUSION),
    subskills=(
        Subskill(
            skill_id="python.recursion.identify_base_case",
            name="Identify the base case in a given function",
            operation=CognitiveOperation.RECOGNISE,
            # RECOGNISE: the learner points at a base case. Nothing runs, so execution
            # cannot say whether they were right. Conservative default, deliberately.
            criticality=0.8,
            misconceptions=("python.recursion.thinks_base_case_is_optional",),
        ),
        Subskill(
            skill_id="python.recursion.trace_calls",
            name="Predict the output by tracing the calls",
            operation=CognitiveOperation.PREDICT,
            # Predicting output is settled by running it.
            verifiability=Verifiability.VERIFIABLE,
            criticality=0.7,
            prerequisites=("python.recursion.identify_base_case",),
            misconceptions=("python.recursion.thinks_it_is_just_a_loop",),
        ),
        Subskill(
            skill_id="python.recursion.explain_termination",
            name="Explain why a given function terminates",
            operation=CognitiveOperation.EXPLAIN,
            criticality=0.9,
            prerequisites=("python.recursion.identify_base_case",),
            # Not machine-checkable. An explanation in the learner's own words
            # is judged by rubric, and marking it VERIFIABLE would let it borrow
            # the confidence that executing code earns.
            verifiability=Verifiability.HUMAN_REVIEW_REQUIRED,
            misconceptions=("python.recursion.thinks_base_case_is_optional",),
        ),
        Subskill(
            skill_id="python.recursion.repair_missing_base_case",
            name="Repair a function that never terminates",
            operation=CognitiveOperation.DEBUG,
            # The repair terminates or it does not; execution decides.
            verifiability=Verifiability.VERIFIABLE,
            criticality=0.85,
            prerequisites=(
                "python.recursion.identify_base_case",
                "python.recursion.trace_calls",
            ),
            misconceptions=("python.recursion.thinks_base_case_is_optional",),
        ),
        Subskill(
            skill_id="python.recursion.write_recursive_function",
            name="Write a recursive function from a specification",
            operation=CognitiveOperation.CONSTRUCT,
            # Tests run against the learner's code.
            verifiability=Verifiability.VERIFIABLE,
            criticality=0.9,
            prerequisites=(
                "python.recursion.identify_base_case",
                "python.recursion.trace_calls",
            ),
            misconceptions=("python.recursion.thinks_return_value_accumulates_itself",),
        ),
        Subskill(
            skill_id="python.recursion.apply_to_nested_structure",
            name="Apply recursion to a structure of unknown depth",
            operation=CognitiveOperation.TRANSFER,
            # Transfer is executed on a novel structure.
            verifiability=Verifiability.VERIFIABLE,
            criticality=0.75,
            prerequisites=("python.recursion.write_recursive_function",),
            ),
    ),
)

FUNCTIONS = Concept(
    concept_id="python.functions",
    name="Functions",
    definition=(
        "A named block that takes arguments, binds them to local names in a new frame, "
        "and returns a value to its caller."
    ),
    core_ideas=(
        "A call creates a frame; the frame disappears when the call returns.",
        "A function with no explicit return returns None.",
    ),
    technical_terms=("argument", "parameter", "return value", "frame", "scope"),
    forbidden_simplifications=(
        ForbiddenSimplification(
            rule=(
                "Do not say a function 'gives back' a value without naming `return`; the "
                "missing-return bug depends on knowing it is explicit."
            ),
            tells=("gives back a value", "gives you back", "hands back"),
        ),
    ),
    subskills=(
        Subskill(
            skill_id="python.functions.call_and_return",
            name="Predict what a call returns",
            operation=CognitiveOperation.PREDICT,
            # Checked by calling the function.
            verifiability=Verifiability.VERIFIABLE,
            criticality=0.9,
        ),
        Subskill(
            skill_id="python.functions.missing_return_is_none",
            name="Recognise that a function without return yields None",
            operation=CognitiveOperation.RECOGNISE,
            # RECOGNISE, same shape: recognising a rule is not running anything.
            criticality=0.7,
            prerequisites=("python.functions.call_and_return",),
        ),
    ),
)


def _linked() -> Concept:
    """Recursion's first subskill rests on understanding an ordinary call.

    Stated here rather than inline above so the two concepts stay separately
    readable: `python.functions` has to exist before anything can point at it,
    and a forward reference inside the literal would not validate.
    """
    subskills = tuple(
        sub.model_copy(update={"prerequisites": ("python.functions.call_and_return",)})
        if sub.skill_id == "python.recursion.identify_base_case"
        else sub
        for sub in RECURSION.subskills
    )
    return RECURSION.model_copy(update={"subskills": subskills})


GRAPH = KnowledgeGraph(version=KNOWLEDGE_VERSION, concepts=(FUNCTIONS, _linked()))
