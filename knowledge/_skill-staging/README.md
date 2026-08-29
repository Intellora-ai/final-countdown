# Staging — move this into place yourself

`SKILL.md` here is the `knowledge-research` skill. It is staged rather than
installed because this machine's global settings deny writing under `.claude/`:

```
Edit(.claude/**)
Edit(**/.claude/**)
```

That deny rule is deliberate -- it stops agents editing your skills -- so it was
not worked around. Install the file yourself:

```bash
mkdir -p .claude/skills/knowledge-research
mv knowledge/_skill-staging/SKILL.md .claude/skills/knowledge-research/SKILL.md
rmdir knowledge/_skill-staging 2>/dev/null || rm -rf knowledge/_skill-staging
```

Claude will not load the skill until it sits at
`.claude/skills/knowledge-research/SKILL.md`.
