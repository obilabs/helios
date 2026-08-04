#!/usr/bin/env bash
# Fail the build if any tracked file leaks a developer/user home directory.
# Enforces PRINCIPLES.md #4 (no machine-specific absolute paths — portability + privacy).
#
# Catches:  C:\Users\<name>\ , /home/<name>/ , /Users/<name>/   (any tracked file)
# Ignores:  service/CI accounts (/home/node, /home/runner, ...), Playwright
#           `text=/Users/i` regexes (require a trailing path separator), and data
#           fixtures / test artifacts / lockfiles / agent config (see EXCL below).
#
# Note: a general "any Windows drive path (X:\...)" check is deliberately NOT done —
# escaped content like "step:\n- foo\n" in JSON/markdown is indistinguishable from a
# real path to a line grep, so it produces unfixable false positives. The home-dir
# signature above is the reliably-detectable, privacy-critical core.
set -uo pipefail
cd "${1:-.}" || exit 2

EXCL=(
  ':(exclude)**/node_modules/**' ':(exclude)**/.claude/**'
  ':(exclude)**/scripts/data/**' ':(exclude)**/openspec/testing/**'
  ':(exclude)**/reports/**' ':(exclude)**/*.jsonl'
  ':(exclude)**/*-lock.json' ':(exclude)**/pnpm-lock.yaml'
  ':(exclude)**/check-abspaths.sh'
)
SVC='node|runner|app|appuser|root|ubuntu|vscode|git|ci|circleci|postgres|nonroot|www-data|Shared'

hits=$(mktemp)
git grep -nIE '([A-Za-z]:\\Users\\|/Users/|/home/)[A-Za-z][A-Za-z0-9._-]*[\\/]' -- "${EXCL[@]}" 2>/dev/null \
  | grep -vE "(/home/|/Users/)(${SVC})[\\/]" >> "$hits"
sort -u "$hits" -o "$hits"

if [ -s "$hits" ]; then
  echo "::error:: developer/user home-directory paths found (PRINCIPLES.md #4 — use relative paths or env/config vars):" >&2
  cat "$hits" >&2
  rm -f "$hits"; exit 1
fi
rm -f "$hits"
echo "OK: no machine-specific home-directory paths in tracked files."
