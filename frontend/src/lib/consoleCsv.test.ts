import { describe, it, expect } from 'vitest';
import { tokenizeCommand } from './consoleCommand';
import {
  parseCsv,
  templateColumns,
  checkTemplate,
  quoteToken,
  expandRow,
  displayRow,
  splitCsvRunArgs,
  CSV_MAX_ROWS,
} from './consoleCsv';

describe('parseCsv', () => {
  it('reads a header and rows, trimming values', () => {
    const r = parseCsv('email,title\r\na@x.test, Analyst \r\nb@x.test,Lead\r\n');
    expect(r).toEqual({
      ok: true,
      data: {
        columns: ['email', 'title'],
        rows: [
          { email: 'a@x.test', title: 'Analyst' },
          { email: 'b@x.test', title: 'Lead' },
        ],
      },
    });
  });

  it('keeps commas, quotes and line breaks inside a quoted value', () => {
    const r = parseCsv('email,note\na@x.test,"Sales, ""West""\nfloor 2"\n');
    expect(r.ok && r.data.rows[0].note).toBe('Sales, "West"\nfloor 2');
  });

  it('ignores a byte-order mark and blank lines', () => {
    const r = parseCsv('﻿email\n\na@x.test\n\n');
    expect(r.ok && r.data.rows).toEqual([{ email: 'a@x.test' }]);
  });

  it('keeps an empty value between commas', () => {
    const r = parseCsv('email,title,dept\na@x.test,,Ops\n');
    expect(r.ok && r.data.rows[0]).toEqual({ email: 'a@x.test', title: '', dept: 'Ops' });
  });

  it('rejects an empty file, a header-only file and a short row', () => {
    expect(parseCsv('')).toEqual({ ok: false, error: 'The file is empty.' });
    expect(parseCsv('email\n').ok).toBe(false);
    const short = parseCsv('email,title\na@x.test\n');
    expect(short.ok === false && short.error).toMatch(/Row 1 has 1 value; the header has 2 columns/);
  });

  it('rejects a repeated or blank column name', () => {
    expect(parseCsv('email,Email\na,b\n').ok).toBe(false);
    expect(parseCsv('email,\na,b\n').ok).toBe(false);
  });

  it('rejects a file over the row limit', () => {
    const big = 'email\n' + Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `u${i}@x.test`).join('\n');
    const r = parseCsv(big);
    expect(r.ok === false && r.error).toMatch(/limit is/);
  });
});

describe('templates', () => {
  const columns = ['email', 'title', 'First Name', 'password'];

  it('lists the columns a command uses', () => {
    expect(templateColumns('gw users update ~email --jobTitle=~title --x=~{First Name} ~~ ~email')).toEqual([
      'email',
      'title',
      'First Name',
    ]);
  });

  it('accepts a command whose columns exist, in any letter case', () => {
    expect(checkTemplate('gw users get ~EMAIL', columns)).toBeNull();
  });

  it('explains a missing column, a command with no column, and commands that cannot repeat', () => {
    expect(checkTemplate('gw users get ~mail', columns)).toMatch(/No column named "mail"/);
    expect(checkTemplate('gw users list', columns)).toMatch(/uses no column/);
    expect(checkTemplate('csv run gw users get ~email', columns)).toMatch(/cannot run another csv/);
    expect(checkTemplate('clear ~email', columns)).toMatch(/cannot be run for each row/);
    expect(checkTemplate('', columns)).toMatch(/Give the command/);
  });

  it('expands a row into a command the tokenizer reads back as the same arguments', () => {
    const row = { email: 'a@x.test', title: 'Head of "Ops" \\ West', 'First Name': 'Ana Maria', password: 'p w' };
    const line = expandRow('gw users update ~email --jobTitle=~title --firstName=~{First Name}', row, columns);
    expect(tokenizeCommand(line)).toEqual([
      'gw',
      'users',
      'update',
      'a@x.test',
      '--jobTitle=Head of "Ops" \\ West',
      '--firstName=Ana Maria',
    ]);
  });

  it('does not let a value add an argument of its own', () => {
    const row = { email: 'a@x.test --confirm', title: 'x" --confirm --y="', 'First Name': '', password: '' };
    const tokens = tokenizeCommand(expandRow('gw users delete ~email --note=~title', row, columns));
    expect(tokens).toEqual(['gw', 'users', 'delete', 'a@x.test --confirm', '--note=x" --confirm --y="']);
  });

  it('keeps an empty value as an empty argument', () => {
    const row = { email: 'a@x.test', title: '', 'First Name': '', password: '' };
    expect(tokenizeCommand(expandRow('update user ~email --jobTitle=~title', row, columns))).toEqual([
      'update',
      'user',
      'a@x.test',
      '--jobTitle=',
    ]);
  });

  it('writes ~~ as a literal ~', () => {
    const row = { email: 'a@x.test', title: 't', 'First Name': '', password: '' };
    expect(expandRow('gw users get ~email --note=~~home', row, columns)).toBe('gw users get a@x.test --note=~home');
  });

  it('hides password-like columns in the displayed command only', () => {
    const row = { email: 'a@x.test', title: 't', 'First Name': '', password: 'hunter2hunter2' };
    const template = 'gw users reset-password ~email --password=~password';
    expect(displayRow(template, row, columns)).toBe('gw users reset-password a@x.test --password=********');
    expect(expandRow(template, row, columns)).toContain('hunter2hunter2');
  });
});

describe('quoteToken', () => {
  it.each(['plain', 'a b', '--name=Sales Team', '', '--x=', 'it\'s', '{"name":"A"}', 'back\\slash', '--m=Back "soon"'])(
    'round-trips %j',
    (token) => {
      expect(tokenizeCommand(`cmd ${quoteToken(token)}`)).toEqual(['cmd', token]);
    }
  );
});

describe('splitCsvRunArgs', () => {
  it('separates its own flag from the command', () => {
    expect(splitCsvRunArgs('--stop-on-error gw users get ~email')).toEqual({
      stopOnError: true,
      template: 'gw users get ~email',
    });
    expect(splitCsvRunArgs(' gw users get ~email --confirm ')).toEqual({
      stopOnError: false,
      template: 'gw users get ~email --confirm',
    });
  });
});
