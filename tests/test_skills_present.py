"""The fixer's instructions have to BE there, and a gate is what makes that true.

`gate.yml`'s `claude-fix` job hands a model a red check and write access to the
branch. What stops it reaching for the cheapest green is `.claude/skills/` --
`systematic-debugging` says reproduce before proposing, and
`verification-before-completion` says run the command before claiming. Delete
either and the job still runs, still has write access, and is now unguided. The
failure is silent: nothing in a workflow notices a missing markdown file.

So the presence of the instructions is itself a gate. The list below is what the
fixer's prompt actually names plus the chaos pair, and each entry is here
because something depends on it -- not because it happened to be installed.
"""

from pathlib import Path

import pytest

SKILLS = Path(__file__).resolve().parents[1] / ".claude" / "skills"

#: Named in gate.yml's fixer prompt, or asserted by its chaos job.
REQUIRED = (
    "systematic-debugging",
    "verification-before-completion",
    "test-driven-development",
    "executing-plans",
    "chaos-engineer",
    "chaos-engineering",
)


def test_the_skills_directory_is_committed() -> None:
    """A directory only on one laptop is a directory CI cannot read."""
    assert SKILLS.is_dir(), f"{SKILLS} is missing entirely"


@pytest.mark.parametrize("name", REQUIRED)
def test_a_required_skill_is_present_and_not_empty(name: str) -> None:
    skill = SKILLS / name / "SKILL.md"
    assert skill.is_file(), (
        f"{name} is named by gate.yml and is not in the repository. "
        f"The fixer would run unguided."
    )
    # A file that exists and says nothing guides nothing. Emptiness is the
    # failure mode a bare `is_file()` cannot see.
    assert len(skill.read_text().strip()) > 200, f"{name}/SKILL.md is effectively empty"


def test_the_fixer_prompt_names_only_skills_that_exist() -> None:
    """The prompt and the directory cannot drift apart unnoticed.

    A prompt that says "read systematic-debugging" against a repository without
    it is an instruction to a model about a file it cannot open, and the model
    will invent a process rather than report the gap.
    """
    gate = (Path(__file__).resolve().parents[1] / ".github" / "workflows" / "gate.yml").read_text()
    named = {n for n in REQUIRED if n in gate}
    assert named, "gate.yml names none of the required skills -- has the prompt changed?"
    for name in sorted(named):
        assert (SKILLS / name / "SKILL.md").is_file(), f"gate.yml names {name}, which does not exist"
