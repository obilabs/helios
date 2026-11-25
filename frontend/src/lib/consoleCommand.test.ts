import { describe, it, expect } from 'vitest';
import { tokenizeCommand, normalizeCommandWords, isKnownCommandWord, isConfirmed, buildUserUpdate, splitOrgUnitPath } from './consoleCommand';

describe('tokenizeCommand', () => {
  it('splits on whitespace and ignores repeated spaces', () => {
    expect(tokenizeCommand('list   users  --status=active')).toEqual(['list', 'users', '--status=active']);
  });

  it('keeps a double-quoted flag value with spaces as one argument', () => {
    expect(tokenizeCommand('create group sales@x.test --name="Sales Team"')).toEqual([
      'create',
      'group',
      'sales@x.test',
      '--name=Sales Team',
    ]);
  });

  it('keeps a single-quoted JSON body intact, inner double quotes included', () => {
    expect(tokenizeCommand(`api POST /api/v1/x '{"name":"Cli Dept"}'`)).toEqual([
      'api',
      'POST',
      '/api/v1/x',
      '{"name":"Cli Dept"}',
    ]);
  });

  it('keeps an unquoted JSON body without spaces intact', () => {
    expect(tokenizeCommand('api POST /x {"name":"A"}')).toEqual(['api', 'POST', '/x', '{"name":"A"}']);
  });

  it('honours escaped quotes inside double quotes', () => {
    expect(tokenizeCommand('gw vacation set a@x.test --message="Back \\"soon\\""')).toEqual([
      'gw',
      'vacation',
      'set',
      'a@x.test',
      '--message=Back "soon"',
    ]);
  });

  it('produces an empty argument for an empty quoted string', () => {
    expect(tokenizeCommand('update user a@x.test --jobTitle=""')).toEqual(['update', 'user', 'a@x.test', '--jobTitle=']);
  });

  it('treats an unclosed quote as running to the end of the line', () => {
    expect(tokenizeCommand('create group g@x.test --name="Sales Team')).toEqual(['create', 'group', 'g@x.test', '--name=Sales Team']);
  });

  it('returns nothing for a blank line', () => {
    expect(tokenizeCommand('   ')).toEqual([]);
  });
});

describe('normalizeCommandWords', () => {
  it('lower-cases the command words only', () => {
    expect(normalizeCommandWords(['LIST', 'Users', '--Status=Active'])).toEqual(['list', 'users', '--Status=Active']);
  });

  it('never changes an email, a path or a value', () => {
    expect(normalizeCommandWords(['GET', 'USER', 'Jane.Doe@X.test'])).toEqual(['get', 'user', 'Jane.Doe@X.test']);
    expect(normalizeCommandWords(['api', 'GET', '/api/v1/Users'])).toEqual(['api', 'get', '/api/v1/Users']);
    expect(normalizeCommandWords(['gw', 'orgunits', 'get', '/Sales/EMEA'])).toEqual(['gw', 'orgunits', 'get', '/Sales/EMEA']);
  });

  it('handles the helios prefix', () => {
    expect(normalizeCommandWords(['Helios', 'GW', 'Users', 'LIST', 'Extra'])).toEqual(['helios', 'gw', 'users', 'list', 'Extra']);
  });
});

describe('isKnownCommandWord', () => {
  it('accepts every documented entry point', () => {
    for (const w of ['list', 'create', 'revoke', 'gw', 'm365', 'password', 'pwd', 'api']) {
      expect(isKnownCommandWord(w)).toBe(true);
    }
    expect(isKnownCommandWord('frobnicate')).toBe(false);
  });
});


describe('isConfirmed', () => {
  it('is true for --confirm and --confirm=true only', () => {
    expect(isConfirmed({ confirm: '' })).toBe(true);
    expect(isConfirmed({ confirm: 'true' })).toBe(true);
    expect(isConfirmed({})).toBe(false);
    expect(isConfirmed({ confirm: 'false' })).toBe(false);
  });
});

describe('buildUserUpdate', () => {
  it('reports no fields when nothing recognised was given', () => {
    expect(buildUserUpdate({ colour: 'blue' }).fields).toEqual([]);
  });

  it('builds the name and org unit', () => {
    expect(buildUserUpdate({ firstName: 'Ada', ou: '/Staff' })).toEqual({
      body: { name: { givenName: 'Ada' }, orgUnitPath: '/Staff' },
      fields: ['first name', 'org unit'],
    });
  });

  it('edits the primary organization entry and keeps its other fields', () => {
    const existing = [
      { title: 'Old', department: 'Eng', costCenter: 'C1', primary: true },
      { title: 'Side', primary: false },
    ];
    const out = buildUserUpdate({ jobTitle: 'New' }, existing);
    expect(out.fields).toEqual(['job title']);
    expect(out.body.organizations).toEqual([
      { title: 'New', department: 'Eng', costCenter: 'C1', primary: true },
      { title: 'Side', primary: false },
    ]);
    expect(existing[0].title).toBe('Old');
  });

  it('creates a primary entry when the user has none', () => {
    expect(buildUserUpdate({ department: 'Ops' }).body.organizations).toEqual([{ primary: true, department: 'Ops' }]);
  });
});

describe('splitOrgUnitPath', () => {
  it('splits a path into parent and name', () => {
    expect(splitOrgUnitPath('/Staff/Sales')).toEqual({ parent: '/Staff', name: 'Sales' });
    expect(splitOrgUnitPath('/Sales')).toEqual({ parent: '/', name: 'Sales' });
    expect(splitOrgUnitPath('/Sales/')).toEqual({ parent: '/', name: 'Sales' });
  });

  it('rejects a path that is not absolute or has no name', () => {
    expect(splitOrgUnitPath('Sales')).toBeNull();
    expect(splitOrgUnitPath('/')).toBeNull();
    expect(splitOrgUnitPath(undefined)).toBeNull();
  });
});

