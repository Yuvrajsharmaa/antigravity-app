# AGENTS.md (CareSpace Capstone)

These are repo-local instructions for Codex when working in this repository.

<INSTRUCTIONS>
## GitHub / Sync Rules (Use Frequently)
- Before starting work (and before opening a PR): run `git fetch origin --prune` and check `git status -sb`.
- Prefer short-lived feature branches named `codex/<topic>`.
- Keep commits small and push frequently to avoid divergence.
- If you need the latest `main`: `git pull --rebase origin main` (only when your working tree is clean).

## Skills
A "skill" here is a folder of repeatable instructions and scripts (usually anchored by a `SKILL.md`) that we can treat as a runbook.

### Repo-managed skills (recommended)
We use Anthropic’s public skills repository as a local, ignored vendor checkout:
- Bootstrap/update it via: `bash scripts/bootstrap-anthropic-skills.sh`
- Location (ignored by git): `vendor/anthropic-skills/`

When you ask for a task that matches one of these skills, Codex should open the relevant `SKILL.md` and follow it, preferring any `scripts/` as black boxes (run `--help` first).

Commonly useful skills for this project (paths are relative to this repo root):
- `frontend-design`: UI/UX guidance and implementation patterns
  - file: `vendor/anthropic-skills/skills/frontend-design/SKILL.md`
- `theme-factory`: consistent themes (palette + typography) for screens and marketing pages
  - file: `vendor/anthropic-skills/skills/theme-factory/SKILL.md`
- `webapp-testing`: Playwright-based testing for web surfaces (Expo web, marketing pages, admin portals)
  - file: `vendor/anthropic-skills/skills/webapp-testing/SKILL.md`
- `web-artifacts-builder`: build a React+TS+Tailwind demo artifact (useful for rapid prototypes)
  - file: `vendor/anthropic-skills/skills/web-artifacts-builder/SKILL.md`
- `slack-gif-creator`: generate short demo GIFs for updates
  - file: `vendor/anthropic-skills/skills/slack-gif-creator/SKILL.md`
- `mcp-builder`: helps scaffold MCP servers (only if we decide to build one)
  - file: `vendor/anthropic-skills/skills/mcp-builder/SKILL.md`
- `brand-guidelines`: keep tone and visual direction consistent across docs and UI
  - file: `vendor/anthropic-skills/skills/brand-guidelines/SKILL.md`

Note: That upstream repo also includes some skills with restrictive licenses (e.g. certain document-editing skills). This repo intentionally keeps the whole vendor checkout out of git to avoid accidental redistribution.

### Codex built-in/session skills (also available)
If a task involves Figma or implementing a Figma design, use the Figma skills:
- `figma`
- `figma-implement-design`

If a task explicitly asks for OpenAI API/product guidance, use:
- `openai-docs`

## Skill Trigger Rules
- If the user names a skill (e.g. "use frontend-design" or "$webapp-testing"), use it.
- If the task obviously matches a skill’s description, use it even if not named.
- If a skill suggests scripts, run the script with `--help` first and treat it as a black box unless customization is required.
</INSTRUCTIONS>

