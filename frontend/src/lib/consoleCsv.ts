/**
 * Running one console command per row of a CSV file.
 *
 *   csv load                                   choose a file
 *   csv preview gw users update ~email --jobTitle=~title
 *   csv run     gw users update ~email --jobTitle=~title
 *
 * `~column` in the command is replaced by that column's value for each row.
 * A column name with spaces is written `~{First Name}`; `~~` is a literal `~`.
 *
 * The file is read in the browser and kept in memory for the page's lifetime.
 * It is not uploaded or stored.
 */
import { tokenizeCommand } from './consoleCommand';

export const CSV_MAX_ROWS = 2000;
export const CSV_MAX_BYTES = 5 * 1024 * 1024;

export interface CsvData {
  columns: string[];
  rows: Record<string, string>[];
}

export type CsvParseResult = { ok: true; data: CsvData } | { ok: false; error: string };

/** Splits CSV text into records. Quoted fields may hold commas, quotes ("") and line breaks. */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let sawAnything = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      sawAnything = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
      sawAnything = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (sawAnything || field !== '') {
        record.push(field);
        records.push(record);
      }
      record = [];
      field = '';
      sawAnything = false;
    } else {
      field += ch;
      sawAnything = true;
    }
  }
  if (sawAnything || field !== '') {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function parseCsv(input: string): CsvParseResult {
  const text = input.replace(/^\uFEFF/, '');
  const records = splitRecords(text);
  if (records.length === 0) return { ok: false, error: 'The file is empty.' };

  const columns = records[0].map((c) => c.trim());
  if (columns.some((c) => c === '')) {
    return { ok: false, error: 'The first line must name every column; one of them is blank.' };
  }
  const seen = new Set<string>();
  for (const c of columns) {
    const key = c.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Column "${c}" appears more than once in the first line.` };
    seen.add(key);
  }

  const body = records.slice(1);
  if (body.length === 0) return { ok: false, error: 'The file has a header line and no rows.' };
  if (body.length > CSV_MAX_ROWS) {
    return { ok: false, error: `The file has ${body.length} rows; the limit is ${CSV_MAX_ROWS}. Split it and run each part.` };
  }

  const rows: Record<string, string>[] = [];
  for (let i = 0; i < body.length; i++) {
    const values = body[i];
    if (values.length !== columns.length) {
      return {
        ok: false,
        error: `Row ${i + 1} has ${values.length} value${values.length === 1 ? '' : 's'}; the header has ${columns.length} columns.`,
      };
    }
    const row: Record<string, string> = {};
    columns.forEach((c, j) => {
      row[c] = values[j].trim();
    });
    rows.push(row);
  }
  return { ok: true, data: { columns, rows } };
}

const PLACEHOLDER = /~~|~\{([^}]+)\}|~([A-Za-z0-9_][A-Za-z0-9_.-]*)/g;

/** Column names a command refers to, in order of first use. */
export function templateColumns(template: string): string[] {
  const names: string[] = [];
  for (const m of template.matchAll(PLACEHOLDER)) {
    const name = m[1] ?? m[2];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function findColumn(columns: string[], name: string): string | undefined {
  return columns.find((c) => c === name) ?? columns.find((c) => c.toLowerCase() === name.toLowerCase());
}

/** Splits a command into arguments, keeping a `~{Column Name}` with spaces in one piece. */
function templateTokens(template: string): string[] {
  const guarded = template.replace(/~\{([^}]+)\}/g, (_m, name: string) => `~{${name.replace(/\s/g, '\u0001')}}`);
  return tokenizeCommand(guarded).map((t) => t.replace(/\u0001/g, ' '));
}

/** A problem with the command before any row runs, or null when it can run. */
export function checkTemplate(template: string, columns: string[]): string | null {
  const tokens = templateTokens(template);
  if (tokens.length === 0) return 'Give the command to run for each row, for example: csv preview gw users get ~email';
  const first = tokens[0].toLowerCase() === 'helios' ? (tokens[1] || '').toLowerCase() : tokens[0].toLowerCase();
  if (first === 'csv') return 'A csv command cannot run another csv command.';
  if (['help', 'examples', 'clear'].includes(first)) return `"${first}" cannot be run for each row.`;

  const used = templateColumns(template);
  if (used.length === 0) {
    return 'The command uses no column. Write ~column where a value from the file belongs, for example ~email.';
  }
  const missing = used.filter((name) => !findColumn(columns, name));
  if (missing.length > 0) {
    return `No column named ${missing.map((m) => `"${m}"`).join(', ')} in the file. Columns: ${columns.join(', ')}.`;
  }
  return null;
}

/** Writes one argument so that the console's tokenizer reads it back unchanged. */
export function quoteToken(token: string): string {
  const flag = /^(--[^=\s"']+=)([\s\S]*)$/.exec(token);
  const head = flag ? flag[1] : '';
  const value = flag ? flag[2] : token;
  // Unquoted is only safe when nothing in the value would be read as a separator or a quote.
  if (value !== '' && !/[\s"'\\]/.test(value)) return head + value;
  return `${head}"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const SECRET_COLUMN = /pass|secret|token|pin/i;

function fill(token: string, row: Record<string, string>, columns: string[], mask: boolean): string {
  return token.replace(PLACEHOLDER, (whole, braced?: string, bare?: string) => {
    if (whole === '~~') return '~';
    const column = findColumn(columns, (braced ?? bare) as string);
    if (!column) return whole;
    return mask && SECRET_COLUMN.test(column) ? '********' : row[column];
  });
}

/**
 * The command for one row. Substitution happens per argument, so a value with
 * spaces or quotes stays one argument and cannot add flags of its own.
 */
export function expandRow(template: string, row: Record<string, string>, columns: string[]): string {
  return templateTokens(template)
    .map((t) => quoteToken(fill(t, row, columns, false)))
    .join(' ');
}

/** The same command for display, with values from password-like columns hidden. */
export function displayRow(template: string, row: Record<string, string>, columns: string[]): string {
  return templateTokens(template)
    .map((t) => quoteToken(fill(t, row, columns, true)))
    .join(' ');
}

/** Splits `csv run [--stop-on-error] <command...>` into its own flags and the command text. */
export function splitCsvRunArgs(rest: string): { stopOnError: boolean; template: string } {
  let template = rest.trim();
  let stopOnError = false;
  const flag = /^--stop-on-error(\s+|$)/i;
  if (flag.test(template)) {
    stopOnError = true;
    template = template.replace(flag, '');
  }
  return { stopOnError, template };
}
