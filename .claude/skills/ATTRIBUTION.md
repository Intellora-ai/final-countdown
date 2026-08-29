# Installed skills — provenance

These skills are third-party work, vendored here. **We did not write them.**

| Skill(s) | Upstream | Licence |
|---|---|---|
| the 14 `superpowers` skills (brainstorming, systematic-debugging, test-driven-development, using-git-worktrees, …) | https://github.com/obra/superpowers | MIT |
| `senior-qa` | https://github.com/alirezarezvani/claude-skills (`engineering-team/skills/senior-qa`) | MIT |
| `chaos-engineering` | https://github.com/alirezarezvani/claude-skills (`engineering/skills/chaos-engineering`) | MIT |

Both upstreams are MIT, so vendoring is permitted. The licence files are kept
alongside as `LICENSE-superpowers` and `LICENSE-claude-skills`.

**Vendored, not submoduled, on purpose:** Claude Code loads skills by reading
`.claude/skills/<name>/SKILL.md` directly, and a submodule that has not been
initialised is an empty directory — the skill would silently not exist. Vendoring
trades update convenience for the guarantee that a fresh clone has working skills.

To update, re-copy from the upstream repositories and record the date here.
Installed: 2026-08-26.
