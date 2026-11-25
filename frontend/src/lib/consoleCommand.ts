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
