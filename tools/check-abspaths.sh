#!/usr/bin/env bash
# Fail the build if any tracked file leaks a developer/user home directory.
# Enforces PRINCIPLES.md #4 (no machine-specific absolute paths — portability + privacy).
#
# Catches:  C:\Users\<name>\ , /home/<name>/ , /Users/<name>/   (any tracked file)
#           X:\Users\... , X:\personal-projects\... on any drive letter, with  (hygiene:allow)
#           either separator (X:/personal-projects/...)
# Ignores:  service/CI accounts (/home/node, /home/runner, ...), Playwright
#           `text=/Users/i` regexes (require a trailing path separator), and data
#           fixtures / test artifacts / lockfiles / agent config (see EXCL below).
#
# Note: a general "any Windows drive path (X:\...)" check is deliberately NOT done —
# escaped content like "step:\n- foo\n" in JSON/markdown is indistinguishable from a
# real path to a line grep, so it produces unfixable false positives. Only drive
# paths into a known user/project root folder are checked; escaping does not
# produce those by accident.
set -uo pipefail
cd "${1:-.}" || exit 2

EXCL=(
  ':(exclude)**/node_modules/**' ':(exclude)**/.claude/**'
  ':(exclude)**/scripts/data/**'
  ':(exclude)**/reports/**' ':(exclude)**/*.jsonl'
  ':(exclude)**/*-lock.json' ':(exclude)**/pnpm-lock.yaml'
  ':(exclude)**/check-abspaths.sh'
)
SVC='node|runner|app|appuser|root|ubuntu|vscode|git|ci|circleci|postgres|nonroot|www-data|Shared'

hits=$(mktemp)
git grep -nIE '([A-Za-z]:\\Users\\|/Users/|/home/)[A-Za-z][A-Za-z0-9._-]*[\\/]' -- "${EXCL[@]}" 2>/dev/null \
  | grep -vE "(/home/|/Users/)(${SVC})[\\/]" >> "$hits"
# Windows drive-letter developer/project roots, either separator style:
#   X:\Users\... , X:/Users/... , X:\personal-projects\... , X:/personal-projects/...  (hygiene:allow)
# The leading non-alphanumeric guard keeps URIs such as "helios://users" out.
git grep -nIiE '(^|[^A-Za-z0-9])[A-Za-z]:[\\/](Users|personal-projects)([\\/]|$)' -- "${EXCL[@]}" 2>/dev/null \
  | grep -viE '[A-Za-z]:[\\/]Users[\\/](Public|Default)[\\/]' >> "$hits"
sort -u "$hits" -o "$hits"

if [ -s "$hits" ]; then
  echo "::error:: developer/user home-directory paths found (PRINCIPLES.md #4 — use relative paths or env/config vars):" >&2
  cat "$hits" >&2
  rm -f "$hits"; exit 1
fi
rm -f "$hits"
echo "OK: no machine-specific home-directory paths in tracked files."
