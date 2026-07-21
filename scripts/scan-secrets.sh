#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
credential_pattern='AKI''A[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|mfa\.[A-Za-z0-9_-]{40,}|BEGIN ([A-Z ]+ )?PRIVATE KEY|your_discord_[a-z_]+|sk-your_[a-z_]+'

scan_result=1
if git -C "$project_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  LC_ALL=C git -C "$project_root" grep -nIE "$credential_pattern" -- . \
    ':(exclude)scripts/scan-secrets.sh' && scan_result=0 || scan_result=$?
else
  LC_ALL=C grep -RInIE \
    --exclude='scan-secrets.sh' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude-dir='.git' \
    --exclude-dir='node_modules' \
    --exclude-dir='coverage' \
    --exclude-dir='dist' \
    "$credential_pattern" "$project_root" && scan_result=0 || scan_result=$?

  if [[ "$scan_result" -eq 1 && -f "$project_root/.env.example" ]]; then
    example_result=1
    LC_ALL=C grep -nIE "$credential_pattern" "$project_root/.env.example" \
      && example_result=0 || example_result=$?
    scan_result=$example_result
  fi
fi

if [[ "$scan_result" -eq 0 ]]; then
  echo "Potential credential material or token-shaped placeholder found." >&2
  exit 1
fi
if [[ "$scan_result" -ne 1 ]]; then
  echo "Secret scan failed to inspect the source tree." >&2
  exit "$scan_result"
fi
echo "No high-signal credentials or token-shaped placeholders found."
