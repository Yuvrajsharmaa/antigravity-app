#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${ROOT_DIR}/vendor/anthropic-skills"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not found on PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "${DEST_DIR}")"

if [[ -d "${DEST_DIR}/.git" ]]; then
  echo "Updating existing Anthropic skills checkout at: ${DEST_DIR}"
  git -C "${DEST_DIR}" fetch --prune origin
  # Keep it simple: fast-forward only; if you have local changes, resolve manually.
  git -C "${DEST_DIR}" pull --ff-only origin main
else
  echo "Cloning Anthropic skills into: ${DEST_DIR}"
  git clone --depth 1 https://github.com/anthropics/skills.git "${DEST_DIR}"
fi

echo "Ready. Skill entrypoints live under:"
echo "  ${DEST_DIR}/skills/*/SKILL.md"
