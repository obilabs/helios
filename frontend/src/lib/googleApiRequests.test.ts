import { describe, it, expect } from 'vitest';
import * as g from './googleApiRequests';

/**
 * These tests assert that every Gmail / Calendar / Drive / Data-Transfer command
 * wrapper in DeveloperConsole builds the exact HTTP method, URL path (including
 * query string) and JSON body that Google's REST APIs require. They make no
 * network calls — they only inspect the pure request descriptors.
 *
 * Path prefixes are what the generic transparent proxy uses to pick the Google
 * host (googleHostForPath): gmail/ -> gmail.googleapis.com, calendar/ & drive/
 * -> www.googleapis.com, admin/* -> admin.googleapis.com.
 */

const USER = 'jane@corp.com';
const USER_ENC = 'jane%40corp.com';

// ---------------------------------------------------------------------------
// Gmail — delegates
// Per-user Gmail requests carry `impersonate: <mailbox owner>` so runGoogle
// sends X-Impersonate-User and the proxy acts AS that user (not the admin).
// ---------------------------------------------------------------------------
describe('Gmail delegates', () => {
  it('list -> GET settings/delegates', () => {
    expect(g.gmailListDelegates(USER)).toEqual({
      method: 'GET',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/delegates`,
      impersonate: USER,
    });
  });

  it('add -> POST settings/delegates with {delegateEmail}', () => {
    expect(g.gmailAddDelegate(USER, 'boss@corp.com')).toEqual({
      method: 'POST',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/delegates`,
      body: { delegateEmail: 'boss@corp.com' },
      impersonate: USER,
    });
  });

  it('remove -> DELETE settings/delegates/{delegateEmail} (encoded)', () => {
    expect(g.gmailRemoveDelegate(USER, 'boss@corp.com')).toEqual({
      method: 'DELETE',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/delegates/boss%40corp.com`,
      impersonate: USER,
    });
  });
});

// ---------------------------------------------------------------------------
// Gmail — forwarding
// ---------------------------------------------------------------------------
describe('Gmail forwarding', () => {
  it('getAutoForwarding -> GET settings/autoForwarding', () => {
    expect(g.gmailGetAutoForwarding(USER)).toEqual({
      method: 'GET',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/autoForwarding`,
      impersonate: USER,
    });
  });

  it('createForwardingAddress -> POST settings/forwardingAddresses with {forwardingEmail}', () => {
    expect(g.gmailCreateForwardingAddress(USER, 'fwd@corp.com')).toEqual({
      method: 'POST',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/forwardingAddresses`,
      body: { forwardingEmail: 'fwd@corp.com' },
      impersonate: USER,
    });
  });

  it('updateAutoForwarding -> PUT settings/autoForwarding with AutoForwarding body', () => {
    expect(
      g.gmailUpdateAutoForwarding(USER, {
        enabled: true,
        emailAddress: 'fwd@corp.com',
        disposition: 'leaveInInbox',
      }),
    ).toEqual({
      method: 'PUT',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/autoForwarding`,
      body: { enabled: true, emailAddress: 'fwd@corp.com', disposition: 'leaveInInbox' },
      impersonate: USER,
    });
  });

  it('updateAutoForwarding disable -> PUT with {enabled:false}', () => {
    expect(g.gmailUpdateAutoForwarding(USER, { enabled: false })).toEqual({
      method: 'PUT',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/autoForwarding`,
      body: { enabled: false },
      impersonate: USER,
    });
  });
});

// ---------------------------------------------------------------------------
// Gmail — vacation
// ---------------------------------------------------------------------------
describe('Gmail vacation', () => {
  it('get -> GET settings/vacation', () => {
    expect(g.gmailGetVacation(USER)).toEqual({
      method: 'GET',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/vacation`,
      impersonate: USER,
    });
  });

  it('update -> PUT settings/vacation with VacationSettings body', () => {
    const body = {
      enableAutoReply: true,
      responseSubject: 'OOO',
      responseBodyPlainText: 'Away',
      responseBodyHtml: '<p>Away</p>',
      startTime: '1700000000000',
      endTime: '1700600000000',
    };
    expect(g.gmailUpdateVacation(USER, body)).toEqual({
      method: 'PUT',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/vacation`,
      body,
      impersonate: USER,
    });
  });
});

// ---------------------------------------------------------------------------
// Gmail — send-as / signature
// ---------------------------------------------------------------------------
describe('Gmail sendAs and signature', () => {
  it('getSendAs -> GET settings/sendAs/{sendAsEmail}', () => {
    expect(g.gmailGetSendAs(USER, USER)).toEqual({
      method: 'GET',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs/${USER_ENC}`,
      impersonate: USER,
    });
  });

  it('listSendAs -> GET settings/sendAs', () => {
    expect(g.gmailListSendAs(USER)).toEqual({
      method: 'GET',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs`,
      impersonate: USER,
    });
  });

  it('patchSendAs (signature) -> PATCH settings/sendAs/{sendAsEmail} with {signature}', () => {
    expect(g.gmailPatchSendAs(USER, USER, { signature: '<b>Jane</b>' })).toEqual({
      method: 'PATCH',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs/${USER_ENC}`,
      body: { signature: '<b>Jane</b>' },
      impersonate: USER,
    });
  });

  it('createSendAs -> POST settings/sendAs with {sendAsEmail, displayName}', () => {
    expect(g.gmailCreateSendAs(USER, { sendAsEmail: 'alias@corp.com', displayName: 'Alias' })).toEqual({
      method: 'POST',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs`,
      body: { sendAsEmail: 'alias@corp.com', displayName: 'Alias' },
      impersonate: USER,
    });
  });

  it('deleteSendAs -> DELETE settings/sendAs/{sendAsEmail}', () => {
    expect(g.gmailDeleteSendAs(USER, 'alias@corp.com')).toEqual({
      method: 'DELETE',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs/alias%40corp.com`,
      impersonate: USER,
    });
  });
});

// ---------------------------------------------------------------------------
// Gmail — message import (M365 -> Google migration)
// The `messages.import` write path replays a migrated RFC822 message into the
// TARGET mailbox. Query params (internalDateSource, neverMarkSpam) are folded
// into the PATH per the module convention (runGoogle forwards only path+body,
// so a separate `query` field would be silently dropped) — same as the Drive
// builders. Import impersonates the destination mailbox owner.
// ---------------------------------------------------------------------------
describe('Gmail import (M365 -> Google migration)', () => {
  const IMPORT_PATH =
    `/api/google/gmail/v1/users/${USER_ENC}/messages/import` +
    '?internalDateSource=dateHeader&neverMarkSpam=true';

  it('import -> POST messages/import; query in the path, {raw} body, impersonates the target', () => {
    const req = g.gmailImport(USER, 'UkZDODIyLXJhdw');
    expect(req.method).toBe('POST');
    // internalDateSource=dateHeader keeps the migrated message's original date;
    // neverMarkSpam=true stops import-time spam routing. Both live in the path.
    expect(req.path).toBe(IMPORT_PATH);
    expect(req.body).toEqual({ raw: 'UkZDODIyLXJhdw' });
    // Runs AS the destination mailbox owner via domain-wide delegation:
    // impersonate === userId when the target is a real email.
    expect(req.impersonate).toBe(USER);
  });

  it('import full-shape equality (exact method/path/query/body/impersonate)', () => {
    expect(g.gmailImport(USER, 'RAW')).toEqual({
      method: 'POST',
      path: IMPORT_PATH,
      body: { raw: 'RAW' },
      impersonate: USER,
    });
  });

  it('import query params are encoded into the path (never a separate field)', () => {
    const req = g.gmailImport(USER, 'RAW') as g.GoogleApiRequest & { query?: unknown };
    // The runtime dispatch (runGoogle) forwards only path+body+impersonate; a
    // stray `query` field would be dropped, so there must not be one.
    expect(req.query).toBeUndefined();
    expect(req.path).toContain('internalDateSource=dateHeader');
    expect(req.path).toContain('neverMarkSpam=true');
    expect(req.path.startsWith('/api/google/gmail/v1/')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
describe('Calendar', () => {
  it('list uses the fixed literal `me`, never an email path; impersonates the target', () => {
    const req = g.calendarListCalendars(USER);
    expect(req).toEqual({
      method: 'GET',
      path: '/api/google/calendar/v3/users/me/calendarList',
      impersonate: USER,
    });
    // Regression: the old path `/users/{email}/calendarList` returns 404 — the
    // target is selected via impersonation (`sub`), never a path segment.
    expect(req.path).not.toContain('@');
    expect(req.path).toContain('/users/me/calendarList');
  });

  it('list with no target sends no impersonation header (impersonate undefined)', () => {
    expect(g.calendarListCalendars().impersonate).toBeUndefined();
  });

  it('listAcl -> GET calendars/{calendarId}/acl; impersonates the calendar owner', () => {
    expect(g.calendarListAcl(USER)).toEqual({
      method: 'GET',
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/acl`,
      impersonate: USER,
    });
  });

  it('insertAcl -> POST calendars/{calendarId}/acl with {role, scope}', () => {
    expect(
      g.calendarInsertAcl(USER, { role: 'reader', scope: { type: 'user', value: 'bob@corp.com' } }),
    ).toEqual({
      method: 'POST',
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/acl`,
      body: { role: 'reader', scope: { type: 'user', value: 'bob@corp.com' } },
      impersonate: USER,
    });
  });

  it('deleteAcl -> DELETE calendars/{calendarId}/acl/{ruleId}; ruleId is user:{email}', () => {
    const ruleId = g.calendarUserRuleId('bob@corp.com');
    expect(ruleId).toBe('user:bob@corp.com');
    expect(g.calendarDeleteAcl(USER, ruleId)).toEqual({
      method: 'DELETE',
      // `user:bob@corp.com` fully encoded -> user%3Abob%40corp.com
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/acl/user%3Abob%40corp.com`,
      impersonate: USER,
    });
  });

  it('ACL builders accept an explicit impersonation override (group/resource calendars)', () => {
    const calId = 'room-42@resource.calendar.google.com';
    expect(g.calendarListAcl(calId, USER).impersonate).toBe(USER);
    expect(
      g.calendarInsertAcl(calId, { role: 'reader', scope: { type: 'user', value: 'x@corp.com' } }, USER)
        .impersonate,
    ).toBe(USER);
    expect(g.calendarDeleteAcl(calId, 'user:x@corp.com', USER).impersonate).toBe(USER);
  });

  // --- events (offboarding: cancel/decline future events) ---

  it('eventsList -> GET calendars/{calendarId}/events with query folded into the path; impersonates the owner', () => {
    const req = g.calendarEventsList(USER, {
      timeMin: '2026-01-01T00:00:00.000Z',
      singleEvents: true,
      maxResults: 250,
    });
    expect(req).toEqual({
      method: 'GET',
      path:
        `/api/google/calendar/v3/calendars/${USER_ENC}/events` +
        '?timeMin=2026-01-01T00%3A00%3A00.000Z&singleEvents=true&maxResults=250',
      impersonate: USER,
    });
    // No body on a GET (fetch rejects it) and no stray `query` field.
    expect(req.body).toBeUndefined();
  });

  it('eventsList carries a continuation pageToken when paginating', () => {
    const req = g.calendarEventsList(USER, { pageToken: 'tok-2' });
    expect(req.path).toBe(`/api/google/calendar/v3/calendars/${USER_ENC}/events?pageToken=tok-2`);
  });

  it('eventsDelete -> DELETE calendars/{calendarId}/events/{eventId}; no body', () => {
    const req = g.calendarEventsDelete(USER, 'evt_123');
    expect(req).toEqual({
      method: 'DELETE',
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/events/evt_123`,
      impersonate: USER,
    });
    expect(req.body).toBeUndefined();
  });

  it('eventsPatch -> PATCH calendars/{calendarId}/events/{eventId} with the partial body', () => {
    const body = { attendees: [{ email: USER, self: true, responseStatus: 'declined' }] };
    expect(g.calendarEventsPatch(USER, 'evt_123', body)).toEqual({
      method: 'PATCH',
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/events/evt_123`,
      body,
      impersonate: USER,
    });
  });

  it('event builders accept an explicit impersonation override', () => {
    const calId = 'room-42@resource.calendar.google.com';
    expect(g.calendarEventsList(calId, {}, USER).impersonate).toBe(USER);
    expect(g.calendarEventsDelete(calId, 'e1', USER).impersonate).toBe(USER);
    expect(g.calendarEventsPatch(calId, 'e1', { status: 'cancelled' }, USER).impersonate).toBe(USER);
  });
});

// ---------------------------------------------------------------------------
// Drive — the previous code passed these options as a JSON body (broken).
// ---------------------------------------------------------------------------
describe('Drive', () => {
  it('listFiles -> GET drive/v3/files with q/fields/pageSize in the QUERY STRING (no body)', () => {
    const req = g.driveListFiles({
      q: "'jane@corp.com' in owners and trashed=false",
      fields: 'files(id,name,owners)',
      pageSize: 1000,
    });
    expect(req.method).toBe('GET');
    expect(req.body).toBeUndefined();
    expect(req.path).toBe(
      '/api/google/drive/v3/files' +
        '?q=' + encodeURIComponent("'jane@corp.com' in owners and trashed=false") +
        '&fields=' + encodeURIComponent('files(id,name,owners)') +
        '&pageSize=1000',
    );
  });

  it('transferFileOwnership -> POST permissions?transferOwnership=true, Permission body only', () => {
    const req = g.driveTransferFileOwnership('FILE1', 'new@corp.com');
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/google/drive/v3/files/FILE1/permissions?transferOwnership=true');
    // transferOwnership must NOT be in the body — it is a query param.
    expect(req.body).toEqual({ role: 'owner', type: 'user', emailAddress: 'new@corp.com' });
  });

  it('createSharedDrive -> POST drive/v3/drives?requestId=... with {name} body', () => {
    const req = g.driveCreateSharedDrive('req-123', 'Marketing');
    expect(req).toEqual({
      method: 'POST',
      path: '/api/google/drive/v3/drives?requestId=req-123',
      body: { name: 'Marketing' },
    });
    // requestId is a required QUERY param, never a body field.
    expect(req.body).toEqual({ name: 'Marketing' });
  });

  it('listSharedDrives -> GET drive/v3/drives?pageSize=100 (no body)', () => {
    const req = g.driveListSharedDrives(100);
    expect(req).toEqual({ method: 'GET', path: '/api/google/drive/v3/drives?pageSize=100' });
    expect(req.body).toBeUndefined();
  });

  it('getSharedDrive -> GET drive/v3/drives/{driveId}', () => {
    expect(g.driveGetSharedDrive('D1')).toEqual({
      method: 'GET',
      path: '/api/google/drive/v3/drives/D1',
    });
  });

  it('addPermission -> POST permissions?supportsAllDrives=true with Permission body only', () => {
    const req = g.driveAddPermission('D1', { role: 'writer', type: 'user', emailAddress: 'u@corp.com' });
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/google/drive/v3/files/D1/permissions?supportsAllDrives=true');
    expect(req.body).toEqual({ role: 'writer', type: 'user', emailAddress: 'u@corp.com' });
  });

  it('listPermissions -> GET permissions?supportsAllDrives=true&fields=... (no body)', () => {
    const req = g.driveListPermissions('D1');
    expect(req.method).toBe('GET');
    expect(req.body).toBeUndefined();
    expect(req.path).toBe(
      '/api/google/drive/v3/files/D1/permissions?supportsAllDrives=true&fields=' +
        encodeURIComponent('permissions(emailAddress,displayName,role,type)'),
    );
  });

  it('deleteSharedDrive -> DELETE drive/v3/drives/{driveId}', () => {
    expect(g.driveDeleteSharedDrive('D1')).toEqual({
      method: 'DELETE',
      path: '/api/google/drive/v3/drives/D1',
    });
  });
});

// ---------------------------------------------------------------------------
// Admin SDK Data Transfer
// ---------------------------------------------------------------------------
describe('Data Transfer', () => {
  it('application IDs are correct and NOT swapped (drive=55656082996, calendar=435070579839)', () => {
    // google-workspace.service.ts:2482 documents 55656082996 as Google Drive.
    expect(g.DATA_TRANSFER_APPLICATION_IDS.drive).toBe('55656082996');
    expect(g.DATA_TRANSFER_APPLICATION_IDS.calendar).toBe('435070579839');
    expect(g.DATA_TRANSFER_APPLICATION_IDS.sites).toBe('529327477839');
    expect(g.DATA_TRANSFER_APPLICATION_IDS.groups).toBe('588034504559');
  });

  it('insert -> POST admin/datatransfer/v1/transfers with applicationDataTransfers[]', () => {
    const req = g.dataTransferInsert({
      oldOwnerUserId: 'from@corp.com',
      newOwnerUserId: 'to@corp.com',
      applicationIds: [g.DATA_TRANSFER_APPLICATION_IDS.drive, g.DATA_TRANSFER_APPLICATION_IDS.calendar],
    });
    expect(req).toEqual({
      method: 'POST',
      path: '/api/google/admin/datatransfer/v1/transfers',
      body: {
        oldOwnerUserId: 'from@corp.com',
        newOwnerUserId: 'to@corp.com',
        applicationDataTransfers: [
          { applicationId: '55656082996', applicationTransferParams: [] },
          { applicationId: '435070579839', applicationTransferParams: [] },
        ],
      },
    });
  });

  it('get -> GET admin/datatransfer/v1/transfers/{id}', () => {
    expect(g.dataTransferGet('T1')).toEqual({
      method: 'GET',
      path: '/api/google/admin/datatransfer/v1/transfers/T1',
    });
  });

  it('list -> GET admin/datatransfer/v1/transfers?maxResults=20', () => {
    expect(g.dataTransferList(20)).toEqual({
      method: 'GET',
      path: '/api/google/admin/datatransfer/v1/transfers?maxResults=20',
    });
  });
});

// ---------------------------------------------------------------------------
// Admin SDK Directory — user lifecycle + custom schemas + aliases + members.
// These are admin-context (Directory API) calls: they must NEVER carry an
// `impersonate` field, and query options must live in the path, not a body.
// ---------------------------------------------------------------------------
const GROUP = 'team@corp.com';
const GROUP_ENC = 'team%40corp.com';

describe('Directory — user lifecycle', () => {
  it('undelete -> POST users/{userKey}/undelete with {orgUnitPath}', () => {
    expect(g.usersUndelete('112233445566778899', '/Staff')).toEqual({
      method: 'POST',
      path: '/api/google/admin/directory/v1/users/112233445566778899/undelete',
      body: { orgUnitPath: '/Staff' },
    });
  });

  it('undelete defaults orgUnitPath to root and never impersonates', () => {
    const req = g.usersUndelete('112233445566778899');
    expect(req.body).toEqual({ orgUnitPath: '/' });
    expect(req.impersonate).toBeUndefined();
  });

  it('getCustomSchemas without a mask -> GET users/{key}?projection=full (no body)', () => {
    const req = g.usersGetCustomSchemas(USER);
    expect(req.method).toBe('GET');
    expect(req.body).toBeUndefined();
    expect(req.path).toBe(`/api/google/admin/directory/v1/users/${USER_ENC}?projection=full`);
    expect(req.impersonate).toBeUndefined();
  });

  it('getCustomSchemas WITH a mask -> projection=custom&customFieldMask (Google rejects a mask on full)', () => {
    expect(g.usersGetCustomSchemas(USER, 'HR').path).toBe(
      `/api/google/admin/directory/v1/users/${USER_ENC}?projection=custom&customFieldMask=HR`,
    );
  });

  it('setCustomSchema -> PATCH users/{key} with nested {customSchemas:{[schema]:fields}}', () => {
    expect(g.usersSetCustomSchema(USER, 'HR', { employeeId: 'E-1042', level: 3 })).toEqual({
      method: 'PATCH',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}`,
      body: { customSchemas: { HR: { employeeId: 'E-1042', level: 3 } } },
    });
  });
});

describe('Directory — user aliases', () => {
  it('list -> GET users/{key}/aliases (no body)', () => {
    const req = g.userAliasesList(USER);
    expect(req).toEqual({
      method: 'GET',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/aliases`,
    });
    expect(req.body).toBeUndefined();
  });

  it('insert -> POST users/{key}/aliases with {alias}', () => {
    expect(g.userAliasesInsert(USER, 'johnny@corp.com')).toEqual({
      method: 'POST',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/aliases`,
      body: { alias: 'johnny@corp.com' },
    });
  });

  it('delete -> DELETE users/{key}/aliases/{alias} (encoded)', () => {
    expect(g.userAliasesDelete(USER, 'johnny@corp.com')).toEqual({
      method: 'DELETE',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/aliases/johnny%40corp.com`,
    });
  });
});

describe('Directory — group aliases', () => {
  it('list -> GET groups/{key}/aliases', () => {
    expect(g.groupAliasesList(GROUP)).toEqual({
      method: 'GET',
      path: `/api/google/admin/directory/v1/groups/${GROUP_ENC}/aliases`,
    });
  });

  it('insert -> POST groups/{key}/aliases with {alias}', () => {
    expect(g.groupAliasesInsert(GROUP, 'crew@corp.com')).toEqual({
      method: 'POST',
      path: `/api/google/admin/directory/v1/groups/${GROUP_ENC}/aliases`,
      body: { alias: 'crew@corp.com' },
    });
  });

  it('delete -> DELETE groups/{key}/aliases/{alias} (encoded)', () => {
    expect(g.groupAliasesDelete(GROUP, 'crew@corp.com')).toEqual({
      method: 'DELETE',
      path: `/api/google/admin/directory/v1/groups/${GROUP_ENC}/aliases/crew%40corp.com`,
    });
  });
});

describe('Directory — group members (get + role change)', () => {
  it('get -> GET groups/{key}/members/{memberKey}', () => {
    expect(g.groupMembersGet(GROUP, USER)).toEqual({
      method: 'GET',
      path: `/api/google/admin/directory/v1/groups/${GROUP_ENC}/members/${USER_ENC}`,
    });
  });

  it('setRole -> PATCH groups/{key}/members/{memberKey} with {role}', () => {
    expect(g.groupMembersSetRole(GROUP, USER, 'MANAGER')).toEqual({
      method: 'PATCH',
      path: `/api/google/admin/directory/v1/groups/${GROUP_ENC}/members/${USER_ENC}`,
      body: { role: 'MANAGER' },
    });
  });
});

describe('Directory — custom schemas (customer)', () => {
  it('list -> GET customer/my_customer/schemas', () => {
    expect(g.schemasList()).toEqual({
      method: 'GET',
      path: '/api/google/admin/directory/v1/customer/my_customer/schemas',
    });
  });

  it('get -> GET customer/my_customer/schemas/{schemaKey}', () => {
    expect(g.schemasGet('HR')).toEqual({
      method: 'GET',
      path: '/api/google/admin/directory/v1/customer/my_customer/schemas/HR',
    });
  });

  it('insert -> POST schemas with schemaName + fields; displayName defaults to schemaName', () => {
    expect(
      g.schemasInsert({ schemaName: 'HR', fields: [{ fieldName: 'employeeId', fieldType: 'STRING' }] }),
    ).toEqual({
      method: 'POST',
      path: '/api/google/admin/directory/v1/customer/my_customer/schemas',
      body: {
        schemaName: 'HR',
        displayName: 'HR',
        fields: [{ fieldName: 'employeeId', fieldType: 'STRING' }],
      },
    });
  });

  it('insert passes an explicit displayName + multi-valued field through unchanged', () => {
    const req = g.schemasInsert({
      schemaName: 'HR',
      displayName: 'Human Resources',
      fields: [{ fieldName: 'certifications', fieldType: 'STRING', multiValued: true }],
    });
    expect(req.body).toEqual({
      schemaName: 'HR',
      displayName: 'Human Resources',
      fields: [{ fieldName: 'certifications', fieldType: 'STRING', multiValued: true }],
    });
  });

  it('patch -> PATCH schemas/{schemaKey} (merge patch body passed through)', () => {
    expect(g.schemasPatch('HR', { displayName: 'People Ops' })).toEqual({
      method: 'PATCH',
      path: '/api/google/admin/directory/v1/customer/my_customer/schemas/HR',
      body: { displayName: 'People Ops' },
    });
  });

  it('delete -> DELETE schemas/{schemaKey}', () => {
    expect(g.schemasDelete('HR')).toEqual({
      method: 'DELETE',
      path: '/api/google/admin/directory/v1/customer/my_customer/schemas/HR',
    });
  });
});

describe('Directory — admin-context invariants', () => {
  it('no Directory builder sets an impersonation target', () => {
    const adminContext: g.GoogleApiRequest[] = [
      g.usersUndelete('id'),
      g.usersGetCustomSchemas(USER),
      g.usersGetCustomSchemas(USER, 'HR'),
      g.usersSetCustomSchema(USER, 'HR', { a: 1 }),
      g.userAliasesList(USER),
      g.userAliasesInsert(USER, 'x@corp.com'),
      g.userAliasesDelete(USER, 'x@corp.com'),
      g.groupAliasesList(GROUP),
      g.groupAliasesInsert(GROUP, 'x@corp.com'),
      g.groupAliasesDelete(GROUP, 'x@corp.com'),
      g.groupMembersGet(GROUP, USER),
      g.groupMembersSetRole(GROUP, USER, 'OWNER'),
      g.schemasList(),
      g.schemasGet('HR'),
      g.schemasInsert({ schemaName: 'HR', fields: [{ fieldName: 'f', fieldType: 'STRING' }] }),
      g.schemasPatch('HR', { displayName: 'x' }),
      g.schemasDelete('HR'),
    ];
    for (const req of adminContext) {
      expect(req.impersonate).toBeUndefined();
      expect(req.path.startsWith('/api/google/admin/directory/v1/')).toBe(true);
    }
  });

  it('Directory GET/DELETE builders carry no body', () => {
    const noBody: g.GoogleApiRequest[] = [
      g.usersGetCustomSchemas(USER),
      g.userAliasesList(USER),
      g.userAliasesDelete(USER, 'x@corp.com'),
      g.groupAliasesList(GROUP),
      g.groupAliasesDelete(GROUP, 'x@corp.com'),
      g.groupMembersGet(GROUP, USER),
      g.schemasList(),
      g.schemasGet('HR'),
      g.schemasDelete('HR'),
    ];
    for (const req of noBody) {
      expect(req.method === 'GET' || req.method === 'DELETE').toBe(true);
      expect(req.body).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Impersonation targeting (X-Impersonate-User)
// ---------------------------------------------------------------------------
describe('impersonation targeting', () => {
  it('admin-context builders never set an impersonation target', () => {
    // Directory / Data Transfer / Drive run as the admin, not as a user, so
    // they must NOT carry an `impersonate` field (no X-Impersonate-User header).
    const adminContext: g.GoogleApiRequest[] = [
      g.driveListFiles({ q: 'x' }),
      g.driveTransferFileOwnership('F1', 'new@corp.com'),
      g.driveCreateSharedDrive('r', 'n'),
      g.driveListSharedDrives(),
      g.driveGetSharedDrive('D1'),
      g.driveAddPermission('D1', { role: 'writer', type: 'user', emailAddress: 'u@corp.com' }),
      g.driveListPermissions('D1'),
      g.driveDeleteSharedDrive('D1'),
      g.dataTransferInsert({ oldOwnerUserId: 'a@corp.com', newOwnerUserId: 'b@corp.com', applicationIds: ['55656082996'] }),
      g.dataTransferGet('T1'),
      g.dataTransferList(),
    ];
    for (const req of adminContext) {
      expect(req.impersonate).toBeUndefined();
    }
  });

  it('the Gmail literal `me` yields no impersonation target', () => {
    // Impersonating "me" is meaningless (and would fail the backend domain
    // check); the builder must leave `impersonate` unset for `me`.
    expect(g.gmailListDelegates('me').impersonate).toBeUndefined();
    expect(g.gmailGetVacation('me').impersonate).toBeUndefined();
    expect(g.gmailListSendAs('me').impersonate).toBeUndefined();
  });

  it('a non-email userId yields no impersonation target', () => {
    expect(g.gmailListDelegates('not-an-email').impersonate).toBeUndefined();
  });

  it('per-user Gmail builders impersonate the mailbox owner', () => {
    expect(g.gmailGetVacation(USER).impersonate).toBe(USER);
    expect(g.gmailPatchSendAs(USER, USER, { signature: 'x' }).impersonate).toBe(USER);
    expect(g.gmailAddDelegate(USER, 'boss@corp.com').impersonate).toBe(USER);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants
// ---------------------------------------------------------------------------
describe('invariants', () => {
  it('no GET or DELETE request carries a body (fetch rejects a GET body)', () => {
    const getters: g.GoogleApiRequest[] = [
      g.gmailListDelegates(USER),
      g.gmailGetAutoForwarding(USER),
      g.gmailGetVacation(USER),
      g.gmailGetSendAs(USER, USER),
      g.gmailListSendAs(USER),
      g.gmailRemoveDelegate(USER, 'x@corp.com'),
      g.gmailDeleteSendAs(USER, 'x@corp.com'),
      g.calendarListCalendars(),
      g.calendarListAcl(USER),
      g.calendarDeleteAcl(USER, 'user:x@corp.com'),
      g.calendarEventsList(USER, { timeMin: 'now', singleEvents: true }),
      g.calendarEventsDelete(USER, 'evt_1'),
      g.driveListFiles({ q: 'x' }),
      g.driveListSharedDrives(),
      g.driveGetSharedDrive('D1'),
      g.driveListPermissions('D1'),
      g.driveDeleteSharedDrive('D1'),
      g.dataTransferGet('T1'),
      g.dataTransferList(),
    ];
    for (const req of getters) {
      expect(req.method === 'GET' || req.method === 'DELETE').toBe(true);
      expect(req.body).toBeUndefined();
    }
  });

  it('every path is proxied under /api/google/ so the generic host router can route it', () => {
    const all: g.GoogleApiRequest[] = [
      g.gmailUpdateVacation(USER, { enableAutoReply: false }),
      g.calendarInsertAcl(USER, { role: 'reader', scope: { type: 'user', value: 'x@corp.com' } }),
      g.driveCreateSharedDrive('r', 'n'),
      g.dataTransferInsert({ oldOwnerUserId: 'a', newOwnerUserId: 'b', applicationIds: ['55656082996'] }),
    ];
    for (const req of all) {
      expect(req.path.startsWith('/api/google/')).toBe(true);
    }
  });
});

describe('User security / access revocation', () => {
  it('lists + revokes third-party OAuth tokens', () => {
    expect(g.usersTokensList(USER)).toEqual({
      method: 'GET',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/tokens`,
    });
    expect(g.usersTokensDelete(USER, '12345.apps.googleusercontent.com')).toEqual({
      method: 'DELETE',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/tokens/12345.apps.googleusercontent.com`,
    });
  });

  it('lists + revokes app-specific passwords', () => {
    expect(g.usersAspsList(USER)).toEqual({
      method: 'GET',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/asps`,
    });
    expect(g.usersAspsDelete(USER, '7')).toEqual({
      method: 'DELETE',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/asps/7`,
    });
  });

  it('lists + invalidates 2SV backup codes', () => {
    expect(g.usersVerificationCodesList(USER)).toEqual({
      method: 'GET',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/verificationCodes`,
    });
    expect(g.usersVerificationCodesInvalidate(USER)).toEqual({
      method: 'POST',
      path: `/api/google/admin/directory/v1/users/${USER_ENC}/verificationCodes/invalidate`,
    });
  });

  it('are admin-context (never impersonated)', () => {
    const all = [
      g.usersTokensList(USER),
      g.usersTokensDelete(USER, 'c'),
      g.usersAspsList(USER),
      g.usersAspsDelete(USER, '1'),
      g.usersVerificationCodesList(USER),
      g.usersVerificationCodesInvalidate(USER),
    ];
    for (const req of all) {
      expect((req as any).impersonate).toBeUndefined();
    }
  });
});
