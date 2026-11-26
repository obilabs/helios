#!/usr/bin/env node
// Compare the SQL the backend runs with the schema a fresh install has.
//
// A fresh install's database is the seed plus every migration. Several times a
// table or column the code needs has existed only on a developer's database or
// in an archived migration, and the first sign was a 500 on a customer path.
// The hand-kept contract in ci.yml only knows the objects someone listed.
//
// This reads every SQL string in backend/src and reports:
//   - tables named after FROM / JOIN / INTO / UPDATE that do not exist
//   - columns written by INSERT (...) or UPDATE ... SET that do not exist
//
// It is a text scan, not a SQL parser. It does not check columns that are only
// read, and it skips SQL assembled from variables. Known gaps live in
// schema-gap-baseline.txt. The check fails on a gap that is not in the
// baseline, and on a baseline entry that is no longer a gap, so the list can
// only shrink.
//
// Usage: node check-sql-against-schema.mjs <columns-file> [--write-baseline]
//   <columns-file>: one "table.column" per line, from information_schema.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..', '..', 'src');
const baselinePath = join(here, 'schema-gap-baseline.txt');

const [columnsFile, flag] = process.argv.slice(2);
if (!columnsFile) {
  console.error('usage: check-sql-against-schema.mjs <columns-file> [--write-baseline]');
  process.exit(2);
}

const schema = new Map();
for (const line of readFileSync(columnsFile, 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('.');
  if (i < 1) continue;
  const table = line.slice(0, i).trim();
  if (!schema.has(table)) schema.set(table, new Set());
  schema.get(table).add(line.slice(i + 1).trim());
}
if (schema.size === 0) {
  console.error(`no columns read from ${columnsFile}`);
  process.exit(2);
}

// Words that follow FROM/JOIN/INTO/UPDATE without being a table of ours.
const NOT_A_TABLE = new Set([
  'select', 'set', 'values', 'where', 'only', 'lateral', 'unnest', 'timestamp',
  'information_schema', 'pg_namespace', 'pg_proc', 'pg_class', 'pg_tables',
]);

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      yield* sourceFiles(p);
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      yield p;
    }
  }
}

const gaps = new Set();

for (const file of sourceFiles(srcRoot)) {
  const rel = relative(srcRoot, file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/`([^`]*)`/g)) {
    const sql = m[1];
    if (!/\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/.test(sql)) continue;

    const ctes = new Set(
      [...sql.matchAll(/\b([a-z_][a-z0-9_]*)\s*(?:\([^)]*\))?\s+AS\s+(?:(?:NOT\s+)?MATERIALIZED\s+)?\(/gi)]
        .map((c) => c[1].toLowerCase())
    );

    for (const t of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:public\.)?([a-z_][a-z0-9_]*)\b(?!\s*[(.])/g)) {
      const table = t[1];
      if (NOT_A_TABLE.has(table) || ctes.has(table) || schema.has(table)) continue;
      gaps.add(`table ${table} <- ${rel}`);
    }

    for (const ins of sql.matchAll(/INSERT INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
      const cols = schema.get(ins[1]);
      if (!cols) continue;
      for (const raw of ins[2].split(',')) {
        const col = raw.trim().replace(/"/g, '');
        if (/^[a-z_][a-z0-9_]*$/.test(col) && !cols.has(col)) {
          gaps.add(`column ${ins[1]}.${col} <- ${rel}`);
        }
      }
    }

    for (const upd of sql.matchAll(/UPDATE\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+(?:[a-z]+\s+)?SET\s+([\s\S]*?)(?=\bWHERE\b|\bRETURNING\b|\bFROM\b|$)/gi)) {
      const cols = schema.get(upd[1]);
      if (!cols) continue;
      for (const c of upd[2].matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=/g)) {
        if (!cols.has(c[1])) gaps.add(`column ${upd[1]}.${c[1]} <- ${rel}`);
      }
    }
  }
}

const found = [...gaps].sort();

if (flag === '--write-baseline') {
  const header = [
    '# Tables and columns the backend names in SQL that a fresh install does not have.',
    '# Written by check-sql-against-schema.mjs --write-baseline. Remove a line when',
    '# its gap is closed (by a migration, or by deleting the code). Do not add lines',
    '# to make a new failure pass: fix the schema or the query instead.',
    '',
  ];
  writeFileSync(baselinePath, header.concat(found).join('\n') + '\n');
  console.log(`baseline written: ${found.length} known gap(s)`);
  process.exit(0);
}

const baseline = new Set(
  readFileSync(baselinePath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
);

const fresh = found.filter((g) => !baseline.has(g));
const closed = [...baseline].filter((g) => !gaps.has(g)).sort();

if (fresh.length) {
  console.error('SQL in backend/src names objects a fresh install does not have:');
  for (const g of fresh) console.error(`  ${g}`);
  console.error('Add a migration, or correct the query.');
}
if (closed.length) {
  console.error('These baseline entries are no longer gaps. Remove them from schema-gap-baseline.txt:');
  for (const g of closed) console.error(`  ${g}`);
}
if (fresh.length || closed.length) process.exit(1);
console.log(`SQL matches the schema, apart from ${baseline.size} known gap(s) in the baseline.`);
