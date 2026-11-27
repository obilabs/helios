#!/usr/bin/env node
// Keep page styles on the theme tokens.
//
// A theme is one block of colour values in src/styles/themes.css. It only
// reaches styles that read those values. A colour typed into a stylesheet
// ignores the selected theme, which is how the dark theme came to cover the
// frame and nothing else.
//
// This counts the hex colours written directly in each stylesheet under src/
// (the two token files are exempt: that is where colours are defined) and
// compares the counts with theme-colour-baseline.json. It fails when a file
// has more than its baseline, when a new file has any, and when a file has
// fewer than its baseline, so the recorded number can only go down.
//
// Use a token instead: var(--color-gray-N), var(--card-bg),
// var(--theme-primary), var(--color-error) and the others in
// src/styles/tokens.css and src/styles/themes.css.
//
// Usage: node scripts/check-theme-colours.mjs [--write-baseline]

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..', 'src');
const baselinePath = join(here, 'theme-colour-baseline.json');
const EXEMPT = new Set(['styles/themes.css', 'styles/tokens.css']);
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

function* cssFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* cssFiles(p);
    else if (name.endsWith('.css')) yield p;
  }
}

const counts = {};
for (const file of cssFiles(srcRoot)) {
  const rel = relative(srcRoot, file).split(sep).join('/');
  if (EXEMPT.has(rel)) continue;
  // Comments are not styles.
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const n = (css.match(HEX) || []).length;
  if (n > 0) counts[rel] = n;
}

if (process.argv.includes('--write-baseline')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`baseline written: ${total} hardcoded colour(s) in ${Object.keys(counts).length} file(s)`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const over = [];
const under = [];
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) over.push(`  ${file}: ${n} (baseline ${allowed})`);
  else if (n < allowed) under.push(`  ${file}: ${n} (baseline ${allowed})`);
}
for (const [file, allowed] of Object.entries(baseline)) {
  if (!(file in counts)) under.push(`  ${file}: 0 (baseline ${allowed})`);
}

if (over.length) {
  console.error('Hardcoded colours were added to stylesheets. Use a theme token instead:');
  console.error(over.join('\n'));
}
if (under.length) {
  console.error('These files now have fewer hardcoded colours than the baseline. Lower the baseline:');
  console.error(under.join('\n'));
  console.error('  node scripts/check-theme-colours.mjs --write-baseline');
}
if (over.length || under.length) process.exit(1);
const total = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(`Stylesheets match the baseline (${total} hardcoded colour(s) still to convert).`);
