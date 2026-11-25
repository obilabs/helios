/**
 * Splitting a console command line into arguments.
 *
 * A plain split on spaces breaks every value that contains one:
 * `--name="Sales Team"` became `--name="Sales` and `Team"`. This tokenizer keeps
 * a quoted run together and drops the quotes, the way a shell does, so the
 * handlers receive `--name=Sales Team` as one argument.
 *
 * Rules:
 *  - whitespace separates arguments, except inside single or double quotes;
 *  - a quote opens a quoted run only at the start of an argument or straight
 *    after `=` (`"a b"`, `--name="a b"`); anywhere else it is an ordinary
 *    character, so an unquoted JSON body such as `{"name":"A"}` survives;
 *  - inside double quotes, `\"` and `\\` are escapes; single quotes are literal;
 *  - a quote that is never closed runs to the end of the line.
 */
export function tokenizeCommand(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (quote === '"' && ch === '\\' && (line[i + 1] === '"' || line[i + 1] === '\\')) {
        current += line[i + 1];
        i++;
      } else {
        current += ch;
      }
      continue;
    }

    if ((ch === '"' || ch === "'") && (!inToken || current.endsWith('='))) {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current);
        current = '';
        inToken = false;
      }
    } else {
      current += ch;
      inToken = true;
    }
  }

  if (inToken) tokens.push(current);
  return tokens;
}

/** Words that may start a command without the leading `helios`. */
export const CONSOLE_MODULES = [
  'api',
  'gw',
  'google-workspace',
  'm365',
  'microsoft-365',
  'users',
  'groups',
  'password',
  'pwd',
];

export const CONSOLE_VERBS = [
  'create',
  'list',
  'get',
  'update',
  'delete',
  'generate',
  'set',
  'show',
  'sync',
  'export',
  'revoke',
];

/**
 * Lower-cases the command words (the leading `helios` and up to three words after
 * it, stopping at the first flag, email or path) so `LIST USERS` works, and leaves every
 * later argument exactly as typed: emails, names and passwords keep their case.
 */
export function normalizeCommandWords(tokens: string[]): string[] {
  const out = [...tokens];
  let i = 0;
  if (out[0]?.toLowerCase() === 'helios') {
    out[0] = 'helios';
    i = 1;
  }
  for (let n = 0; n < 3 && i < out.length; n++, i++) {
    if (out[i].startsWith('--') || out[i].includes('@') || out[i].startsWith('/')) break;
    out[i] = out[i].toLowerCase();
  }
  return out;
}

/** True when the first word is one the console knows how to route. */
export function isKnownCommandWord(word: string): boolean {
  return CONSOLE_MODULES.includes(word) || CONSOLE_VERBS.includes(word);
}

/** `--confirm` given, with or without a value. */
export function isConfirmed(params: Record<string, string | undefined>): boolean {
  return params.confirm === '' || params.confirm === 'true';
}

/**
 * Body for a Google user PATCH from console flags, and the names of the fields
 * it changes. An empty `fields` means the command named nothing to change.
 *
 * Job title and department sit in the user's `organizations` list. The primary
 * entry (or the first one) is edited in place so its other fields survive.
 */
export function buildUserUpdate(
  params: Record<string, string | undefined>,
  existingOrganizations?: Array<Record<string, unknown>>
): { body: Record<string, unknown>; fields: string[] } {
  const body: Record<string, unknown> = {};
  const fields: string[] = [];

  const name: Record<string, string> = {};
  if (params.firstName) {
    name.givenName = params.firstName;
    fields.push('first name');
  }
  if (params.lastName) {
    name.familyName = params.lastName;
    fields.push('last name');
  }
  if (Object.keys(name).length) body.name = name;

  const ou = params.ou ?? params.orgunit ?? params.orgUnit;
  if (ou) {
    body.orgUnitPath = ou;
    fields.push('org unit');
  }

  const title = params.jobTitle ?? params.title;
  const department = params.department;
  if (title !== undefined || department !== undefined) {
    const list = (existingOrganizations ?? []).map((o) => ({ ...o }));
    let index = list.findIndex((o) => o.primary === true);
    if (index < 0) index = list.length ? 0 : -1;
    if (index < 0) {
      list.push({ primary: true });
      index = 0;
    }
    if (title !== undefined) {
      list[index].title = title;
      fields.push('job title');
    }
    if (department !== undefined) {
      list[index].department = department;
      fields.push('department');
    }
    body.organizations = list;
  }

  return { body, fields };
}

/** `/Staff/Sales` -> { parent: '/Staff', name: 'Sales' }; `/Sales` -> { parent: '/', name: 'Sales' }. */
export function splitOrgUnitPath(path: string | undefined): { parent: string; name: string } | null {
  if (!path || !path.startsWith('/')) return null;
  const trimmed = path.replace(/\/+$/, '');
  const cut = trimmed.lastIndexOf('/');
  const name = trimmed.slice(cut + 1);
  if (!name) return null;
  return { parent: cut === 0 ? '/' : trimmed.slice(0, cut), name };
}

/**
 * Last sign-in time for display. Google reports "never signed in" as the Unix
 * epoch (1970-01-01T00:00:00Z), which would otherwise print as a date in 1969
 * or 1970 depending on the viewer's time zone.
 */
export function formatLastLogin(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return 'Never';
  return date.toLocaleString();
}
