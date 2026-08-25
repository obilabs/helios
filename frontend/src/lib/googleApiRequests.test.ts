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
// ---------------------------------------------------------------------------
describe('Gmail delegates', () => {
  it('list -> GET settings/delegates', () => {
    expect(g.gmailListDelegates(USER)).toEqual({
      method: 'GET',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/delegates`,
    });
  });

  it('add -> POST settings/delegates with {delegateEmail}', () => {
    expect(g.gmailAddDelegate(USER, 'boss@corp.com')).toEqual({
      method: 'POST',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/delegates`,
      body: { delegateEmail: 'boss@corp.com' },
    });
  });

  it('remove -> DELETE settings/delegates/{delegateEmail} (encoded)', () => {
    expect(g.gmailRemoveDelegate(USER, 'boss@corp.com')).toEqual({
      method: 'DELETE',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/delegates/boss%40corp.com`,
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
    });
  });

  it('createForwardingAddress -> POST settings/forwardingAddresses with {forwardingEmail}', () => {
    expect(g.gmailCreateForwardingAddress(USER, 'fwd@corp.com')).toEqual({
      method: 'POST',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/forwardingAddresses`,
      body: { forwardingEmail: 'fwd@corp.com' },
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
    });
  });

  it('updateAutoForwarding disable -> PUT with {enabled:false}', () => {
    expect(g.gmailUpdateAutoForwarding(USER, { enabled: false })).toEqual({
      method: 'PUT',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/autoForwarding`,
      body: { enabled: false },
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
    });
  });

  it('listSendAs -> GET settings/sendAs', () => {
    expect(g.gmailListSendAs(USER)).toEqual({
      method: 'GET',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs`,
    });
  });

  it('patchSendAs (signature) -> PATCH settings/sendAs/{sendAsEmail} with {signature}', () => {
    expect(g.gmailPatchSendAs(USER, USER, { signature: '<b>Jane</b>' })).toEqual({
      method: 'PATCH',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs/${USER_ENC}`,
      body: { signature: '<b>Jane</b>' },
    });
  });

  it('createSendAs -> POST settings/sendAs with {sendAsEmail, displayName}', () => {
    expect(g.gmailCreateSendAs(USER, { sendAsEmail: 'alias@corp.com', displayName: 'Alias' })).toEqual({
      method: 'POST',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs`,
      body: { sendAsEmail: 'alias@corp.com', displayName: 'Alias' },
    });
  });

  it('deleteSendAs -> DELETE settings/sendAs/{sendAsEmail}', () => {
    expect(g.gmailDeleteSendAs(USER, 'alias@corp.com')).toEqual({
      method: 'DELETE',
      path: `/api/google/gmail/v1/users/${USER_ENC}/settings/sendAs/alias%40corp.com`,
    });
  });
});

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
describe('Calendar', () => {
  it('list uses the fixed literal `me`, never an email path', () => {
    const req = g.calendarListCalendars();
    expect(req).toEqual({
      method: 'GET',
      path: '/api/google/calendar/v3/users/me/calendarList',
    });
    // Regression: the old path `/users/{email}/calendarList` returns 404.
    expect(req.path).not.toContain('@');
    expect(req.path).toContain('/users/me/calendarList');
  });

  it('listAcl -> GET calendars/{calendarId}/acl', () => {
    expect(g.calendarListAcl(USER)).toEqual({
      method: 'GET',
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/acl`,
    });
  });

  it('insertAcl -> POST calendars/{calendarId}/acl with {role, scope}', () => {
    expect(
      g.calendarInsertAcl(USER, { role: 'reader', scope: { type: 'user', value: 'bob@corp.com' } }),
    ).toEqual({
      method: 'POST',
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/acl`,
      body: { role: 'reader', scope: { type: 'user', value: 'bob@corp.com' } },
    });
  });

  it('deleteAcl -> DELETE calendars/{calendarId}/acl/{ruleId}; ruleId is user:{email}', () => {
    const ruleId = g.calendarUserRuleId('bob@corp.com');
    expect(ruleId).toBe('user:bob@corp.com');
    expect(g.calendarDeleteAcl(USER, ruleId)).toEqual({
      method: 'DELETE',
      // `user:bob@corp.com` fully encoded -> user%3Abob%40corp.com
      path: `/api/google/calendar/v3/calendars/${USER_ENC}/acl/user%3Abob%40corp.com`,
    });
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
