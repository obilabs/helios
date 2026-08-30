/**
 * Google API request builders (pure, side-effect free).
 *
 * The Helios "transparent proxy" (backend/src/middleware/transparent-proxy.ts on
 * feat/helios-proxy-generic-host-scopes) is now GENERIC: it strips the
 * `/api/google/` prefix and routes the remaining path to the correct Google host
 * by prefix (`googleHostForPath`):
 *
 *   gmail/...                    -> https://gmail.googleapis.com
 *   calendar/...                 -> https://www.googleapis.com   (Calendar API)
 *   drive/...                    -> https://www.googleapis.com   (Drive API)
 *   apps/licensing/ | licensing/ -> https://licensing.googleapis.com
 *   everything else              -> https://admin.googleapis.com (Directory, DataTransfer)
 *
 * Because the proxy is generic, correctness now lives entirely in how the
 * FRONTEND builds each request: the HTTP method, the URL path (including query
 * string), and the JSON body must match Google's published REST API exactly.
 * The proxy forwards `req.query` to Google as query params and forwards the JSON
 * body only for POST/PUT/PATCH — so anything Google expects as a query parameter
 * MUST be encoded into the path here, never passed as a body (a GET with a body
 * is rejected by `fetch`, and Google ignores stray body fields on writes).
 *
 * These builders are the single source of truth used by DeveloperConsole.tsx and
 * are unit-tested in googleApiRequests.test.ts.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface GoogleApiRequest {
  method: HttpMethod;
  /** Relative path passed straight to authFetch, e.g. `/api/google/gmail/v1/...`. Includes query string for GETs. */
  path: string;
  /** JSON body for POST/PUT/PATCH. Omitted for GET/DELETE. */
  body?: unknown;
  /**
   * The user the proxy should act AS via domain-wide delegation (sent as the
   * `X-Impersonate-User` request header). Per-user Gmail/Calendar settings for
   * user X (forwarding, vacation, signature, delegates, calendar sharing) only
   * work when the proxy impersonates X rather than the admin. Populated by the
   * per-user builders below from the target they already carry; omitted (and no
   * header sent) for admin-context calls (Directory, Data Transfer, Drive).
   */
  impersonate?: string;
}

/**
 * Normalize a builder's target into an impersonation subject: a real email is
 * returned as-is; the Gmail literal `me` and any non-email value yield
 * `undefined` (no impersonation header). The backend independently rejects any
 * target outside the org's domain, so this is only about WHEN to send a header.
 */
function impersonationSubject(userId?: string): string | undefined {
  if (!userId || userId === 'me') return undefined;
  return userId.includes('@') ? userId : undefined;
}

type QueryValue = string | number | boolean | undefined | null;

/** Append an encoded query string, skipping undefined/null values and preserving insertion order. */
function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
}

/** Encode a single URL path segment (email addresses contain `@`, `+`, `.`). */
function seg(value: string): string {
  return encodeURIComponent(value);
}

const GMAIL_BASE = '/api/google/gmail/v1';
const CALENDAR_BASE = '/api/google/calendar/v3';
const DRIVE_BASE = '/api/google/drive/v3';
const DATATRANSFER_BASE = '/api/google/admin/datatransfer/v1';

// ===========================================================================
// Gmail  (gmail.googleapis.com / gmail/v1)
// userId accepts an email address or the literal `me` (Gmail API supports both).
// ===========================================================================

/** Gmail: users.settings.delegates.list — GET /gmail/v1/users/{userId}/settings/delegates */
export function gmailListDelegates(userId: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/delegates`,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.delegates.create — POST /gmail/v1/users/{userId}/settings/delegates */
export function gmailAddDelegate(userId: string, delegateEmail: string): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/delegates`,
    body: { delegateEmail },
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.delegates.delete — DELETE /gmail/v1/users/{userId}/settings/delegates/{delegateEmail} */
export function gmailRemoveDelegate(userId: string, delegateEmail: string): GoogleApiRequest {
  return {
    method: 'DELETE',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/delegates/${seg(delegateEmail)}`,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.getAutoForwarding — GET /gmail/v1/users/{userId}/settings/autoForwarding */
export function gmailGetAutoForwarding(userId: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/autoForwarding`,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.forwardingAddresses.create — POST /gmail/v1/users/{userId}/settings/forwardingAddresses */
export function gmailCreateForwardingAddress(userId: string, forwardingEmail: string): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/forwardingAddresses`,
    body: { forwardingEmail },
    impersonate: impersonationSubject(userId),
  };
}

export interface AutoForwardingSettings {
  enabled: boolean;
  emailAddress?: string;
  /** leaveInInbox | archive | trash | markRead */
  disposition?: string;
}

/** Gmail: users.settings.updateAutoForwarding — PUT /gmail/v1/users/{userId}/settings/autoForwarding */
export function gmailUpdateAutoForwarding(userId: string, settings: AutoForwardingSettings): GoogleApiRequest {
  return {
    method: 'PUT',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/autoForwarding`,
    body: settings,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.getVacation — GET /gmail/v1/users/{userId}/settings/vacation */
export function gmailGetVacation(userId: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/vacation`,
    impersonate: impersonationSubject(userId),
  };
}

export interface VacationSettings {
  enableAutoReply: boolean;
  responseSubject?: string;
  responseBodyPlainText?: string;
  responseBodyHtml?: string;
  restrictToContacts?: boolean;
  restrictToDomain?: boolean;
  /** epoch millis as a string, per Gmail API */
  startTime?: string;
  endTime?: string;
}

/** Gmail: users.settings.updateVacation — PUT /gmail/v1/users/{userId}/settings/vacation */
export function gmailUpdateVacation(userId: string, settings: VacationSettings): GoogleApiRequest {
  return {
    method: 'PUT',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/vacation`,
    body: settings,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.sendAs.get — GET /gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail} */
export function gmailGetSendAs(userId: string, sendAsEmail: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/sendAs/${seg(sendAsEmail)}`,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.sendAs.list — GET /gmail/v1/users/{userId}/settings/sendAs */
export function gmailListSendAs(userId: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/sendAs`,
    impersonate: impersonationSubject(userId),
  };
}

/**
 * Gmail: users.settings.sendAs.patch — PATCH /gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail}
 * Used for reading/writing the signature (and other SendAs fields).
 */
export function gmailPatchSendAs(
  userId: string,
  sendAsEmail: string,
  patch: Record<string, unknown>,
): GoogleApiRequest {
  return {
    method: 'PATCH',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/sendAs/${seg(sendAsEmail)}`,
    body: patch,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.sendAs.create — POST /gmail/v1/users/{userId}/settings/sendAs */
export function gmailCreateSendAs(
  userId: string,
  sendAs: { sendAsEmail: string; displayName?: string },
): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/sendAs`,
    body: sendAs,
    impersonate: impersonationSubject(userId),
  };
}

/** Gmail: users.settings.sendAs.delete — DELETE /gmail/v1/users/{userId}/settings/sendAs/{sendAsEmail} */
export function gmailDeleteSendAs(userId: string, sendAsEmail: string): GoogleApiRequest {
  return {
    method: 'DELETE',
    path: `${GMAIL_BASE}/users/${seg(userId)}/settings/sendAs/${seg(sendAsEmail)}`,
    impersonate: impersonationSubject(userId),
  };
}

// ===========================================================================
// Gmail — message import  (M365 -> Google migration)
// ===========================================================================

/**
 * Gmail: users.messages.import —
 * POST /gmail/v1/users/{userId}/messages/import?internalDateSource=dateHeader&neverMarkSpam=true
 *
 * Replays a single migrated RFC822 message straight into {userId}'s mailbox
 * WITHOUT sending it — the write-path primitive for an M365 -> Google mailbox
 * migration. `raw` is the base64url-encoded RFC822 message.
 *
 * Query params (per Google's REST API) — folded into the PATH, not passed as a
 * separate field:
 *   - internalDateSource=dateHeader → Gmail takes each message's internal date
 *     from its own `Date:` header, so the migrated copy keeps its ORIGINAL
 *     received date instead of the import time ("now").
 *   - neverMarkSpam=true            → a migrated message is never diverted to
 *     Spam by import-time classification.
 *
 * WHY the query lives in the path: the transparent proxy and `runGoogle` forward
 * only `path` + `body` + the `X-Impersonate-User` header (see the module header
 * and DeveloperConsole.runGoogle). A stray `query` field would be silently
 * dropped and never reach Google — the same trap that made Drive options no-ops
 * before. `withQuery` encodes them into the path exactly like the Drive builders.
 *
 * Import runs in the TARGET user's own context, so the proxy impersonates
 * {userId} (domain-wide delegation `sub`); the message then lands in — and is
 * owned by — that user's own mailbox.
 */
export function gmailImport(userId: string, raw: string): GoogleApiRequest {
  return {
    method: 'POST',
    path: withQuery(`${GMAIL_BASE}/users/${seg(userId)}/messages/import`, {
      internalDateSource: 'dateHeader',
      neverMarkSpam: true,
    }),
    body: { raw },
    impersonate: impersonationSubject(userId),
  };
}

// ===========================================================================
// Calendar  (www.googleapis.com / calendar/v3)
// ===========================================================================

/**
 * Calendar: calendarList.list — GET /calendar/v3/users/me/calendarList
 *
 * The Calendar API only exposes the *authenticated* user's calendar list under
 * the fixed literal `me`; there is no `/users/{email}/calendarList` form (an
 * email there returns 404). Listing another user's calendars requires the proxy
 * to impersonate that user (domain-wide delegation `sub`), not a different path —
 * so the target is passed as `impersonateUser` rather than in the path.
 */
export function calendarListCalendars(impersonateUser?: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${CALENDAR_BASE}/users/me/calendarList`,
    impersonate: impersonationSubject(impersonateUser),
  };
}

/**
 * Calendar: acl.list — GET /calendar/v3/calendars/{calendarId}/acl
 * ACL operations run in the calendar owner's context, so the proxy impersonates
 * that owner. `calendarId` is usually the owner's email (their primary
 * calendar); pass `impersonateUser` to override for group/resource calendars.
 */
export function calendarListAcl(calendarId: string, impersonateUser?: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${CALENDAR_BASE}/calendars/${seg(calendarId)}/acl`,
    impersonate: impersonationSubject(impersonateUser ?? calendarId),
  };
}

export interface CalendarAclScope {
  /** default | user | group | domain */
  type: string;
  value?: string;
}

/**
 * Calendar: acl.insert — POST /calendar/v3/calendars/{calendarId}/acl
 * Runs in the calendar owner's context (impersonate `calendarId`, or override).
 */
export function calendarInsertAcl(
  calendarId: string,
  rule: { role: string; scope: CalendarAclScope },
  impersonateUser?: string,
): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${CALENDAR_BASE}/calendars/${seg(calendarId)}/acl`,
    body: rule,
    impersonate: impersonationSubject(impersonateUser ?? calendarId),
  };
}

/**
 * Calendar: acl.delete — DELETE /calendar/v3/calendars/{calendarId}/acl/{ruleId}
 * ACL rule id for a user is `user:{email}` (built by the caller / helper below).
 * Runs in the calendar owner's context (impersonate `calendarId`, or override).
 */
export function calendarDeleteAcl(
  calendarId: string,
  ruleId: string,
  impersonateUser?: string,
): GoogleApiRequest {
  return {
    method: 'DELETE',
    path: `${CALENDAR_BASE}/calendars/${seg(calendarId)}/acl/${seg(ruleId)}`,
    impersonate: impersonationSubject(impersonateUser ?? calendarId),
  };
}

/** Build the Calendar ACL rule id for a user scope: `user:{email}`. */
export function calendarUserRuleId(email: string): string {
  return `user:${email}`;
}

// ----- Calendar: events (offboarding — cancel/decline future events) -----
// Events run in the calendar owner's context, so the proxy impersonates the
// calendarId (usually the owner's email), like the ACL builders above. Query
// params are folded into the PATH — the proxy forwards no separate `query` field.
// The params type is written inline (not a named interface) so it carries the
// implicit index signature `withQuery` needs, exactly like `driveListFiles`.

/**
 * Calendar: events.list —
 * GET /calendar/v3/calendars/{calendarId}/events?{timeMin,singleEvents,maxResults,pageToken}
 * Runs in the calendar owner's context (impersonate `calendarId`, or override).
 *   - timeMin: RFC3339 lower bound (e.g. now) — only events ending after it.
 *   - singleEvents: expand recurring series into individual instances.
 *   - pageToken: continuation token from a prior page's `nextPageToken`.
 *   - orderBy: startTime | updated (startTime requires singleEvents=true).
 */
export function calendarEventsList(
  calendarId: string,
  params: {
    timeMin?: string;
    singleEvents?: boolean;
    maxResults?: number;
    pageToken?: string;
    orderBy?: string;
  } = {},
  impersonateUser?: string,
): GoogleApiRequest {
  return {
    method: 'GET',
    path: withQuery(`${CALENDAR_BASE}/calendars/${seg(calendarId)}/events`, params),
    impersonate: impersonationSubject(impersonateUser ?? calendarId),
  };
}

/**
 * Calendar: events.delete —
 * DELETE /calendar/v3/calendars/{calendarId}/events/{eventId}
 * Deletes (cancels) an event the impersonated user organizes.
 */
export function calendarEventsDelete(
  calendarId: string,
  eventId: string,
  impersonateUser?: string,
): GoogleApiRequest {
  return {
    method: 'DELETE',
    path: `${CALENDAR_BASE}/calendars/${seg(calendarId)}/events/${seg(eventId)}`,
    impersonate: impersonationSubject(impersonateUser ?? calendarId),
  };
}

/**
 * Calendar: events.patch —
 * PATCH /calendar/v3/calendars/{calendarId}/events/{eventId}
 * Partial update — used during offboarding to set the departing user's own
 * attendee `responseStatus` to `declined` on events they don't organize.
 */
export function calendarEventsPatch(
  calendarId: string,
  eventId: string,
  patch: Record<string, unknown>,
  impersonateUser?: string,
): GoogleApiRequest {
  return {
    method: 'PATCH',
    path: `${CALENDAR_BASE}/calendars/${seg(calendarId)}/events/${seg(eventId)}`,
    body: patch,
    impersonate: impersonationSubject(impersonateUser ?? calendarId),
  };
}

// ===========================================================================
// Drive  (www.googleapis.com / drive/v3)
// NOTE: Drive puts almost every non-resource option in the QUERY STRING, not the
// body. The previous code passed these as a JSON body, which (a) makes `fetch`
// throw on GET requests and (b) is silently ignored by Google on writes.
// ===========================================================================

/** Drive: files.list — GET /drive/v3/files?{q,fields,pageSize,...} */
export function driveListFiles(params: {
  q?: string;
  fields?: string;
  pageSize?: number;
  supportsAllDrives?: boolean;
  includeItemsFromAllDrives?: boolean;
  corpora?: string;
}): GoogleApiRequest {
  return { method: 'GET', path: withQuery(`${DRIVE_BASE}/files`, params) };
}

/**
 * Drive: permissions.create with ownership transfer —
 * POST /drive/v3/files/{fileId}/permissions?transferOwnership=true
 * Body is the Permission resource; `transferOwnership` is a QUERY param.
 */
export function driveTransferFileOwnership(fileId: string, newOwnerEmail: string): GoogleApiRequest {
  return {
    method: 'POST',
    path: withQuery(`${DRIVE_BASE}/files/${seg(fileId)}/permissions`, { transferOwnership: true }),
    body: { role: 'owner', type: 'user', emailAddress: newOwnerEmail },
  };
}

/**
 * Drive: drives.create — POST /drive/v3/drives?requestId={requestId}
 * `requestId` is a REQUIRED query param; body is the Drive resource `{name}`.
 */
export function driveCreateSharedDrive(requestId: string, name: string): GoogleApiRequest {
  return {
    method: 'POST',
    path: withQuery(`${DRIVE_BASE}/drives`, { requestId }),
    body: { name },
  };
}

/** Drive: drives.list — GET /drive/v3/drives?pageSize={n} */
export function driveListSharedDrives(pageSize = 100): GoogleApiRequest {
  return { method: 'GET', path: withQuery(`${DRIVE_BASE}/drives`, { pageSize }) };
}

/** Drive: drives.get — GET /drive/v3/drives/{driveId} */
export function driveGetSharedDrive(driveId: string): GoogleApiRequest {
  return { method: 'GET', path: `${DRIVE_BASE}/drives/${seg(driveId)}` };
}

/**
 * Drive: permissions.create on a shared drive —
 * POST /drive/v3/files/{fileId}/permissions?supportsAllDrives=true
 * `supportsAllDrives` is a QUERY param; body is the Permission resource.
 */
export function driveAddPermission(
  fileId: string,
  permission: { role: string; type: string; emailAddress: string },
): GoogleApiRequest {
  return {
    method: 'POST',
    path: withQuery(`${DRIVE_BASE}/files/${seg(fileId)}/permissions`, { supportsAllDrives: true }),
    body: permission,
  };
}

/**
 * Drive: permissions.list on a shared drive —
 * GET /drive/v3/files/{fileId}/permissions?supportsAllDrives=true&fields=...
 */
export function driveListPermissions(
  fileId: string,
  fields = 'permissions(emailAddress,displayName,role,type)',
): GoogleApiRequest {
  return {
    method: 'GET',
    path: withQuery(`${DRIVE_BASE}/files/${seg(fileId)}/permissions`, {
      supportsAllDrives: true,
      fields,
    }),
  };
}

/** Drive: drives.delete — DELETE /drive/v3/drives/{driveId} */
export function driveDeleteSharedDrive(driveId: string): GoogleApiRequest {
  return { method: 'DELETE', path: `${DRIVE_BASE}/drives/${seg(driveId)}` };
}

// ===========================================================================
// Admin SDK Data Transfer  (admin.googleapis.com / admin/datatransfer/v1)
// ===========================================================================

/**
 * Canonical Google application IDs for the Data Transfer API.
 *
 * FIX: `drive` and `calendar` were previously swapped in DeveloperConsole.tsx
 * (and are still swapped in backend/src/services/data-transfer.service.ts).
 * The authoritative in-repo reference — google-workspace.service.ts:2482 —
 * documents `55656082996` as the Google Drive application ID, which matches
 * Google's published value. Calendar is `435070579839`. A swap made
 * `gw transfer drive` actually move Calendar data and vice-versa.
 */
export const DATA_TRANSFER_APPLICATION_IDS = {
  drive: '55656082996',
  calendar: '435070579839',
  sites: '529327477839',
  groups: '588034504559',
} as const;

export interface DataTransferInsertParams {
  /** Google user ID or email of the current owner. */
  oldOwnerUserId: string;
  /** Google user ID or email of the new owner. */
  newOwnerUserId: string;
  /** Application IDs to transfer (see DATA_TRANSFER_APPLICATION_IDS). */
  applicationIds: string[];
}

/** DataTransfer: transfers.insert — POST /admin/datatransfer/v1/transfers */
export function dataTransferInsert(params: DataTransferInsertParams): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${DATATRANSFER_BASE}/transfers`,
    body: {
      oldOwnerUserId: params.oldOwnerUserId,
      newOwnerUserId: params.newOwnerUserId,
      applicationDataTransfers: params.applicationIds.map((applicationId) => ({
        applicationId,
        applicationTransferParams: [],
      })),
    },
  };
}

/** DataTransfer: transfers.get — GET /admin/datatransfer/v1/transfers/{transferId} */
export function dataTransferGet(transferId: string): GoogleApiRequest {
  return { method: 'GET', path: `${DATATRANSFER_BASE}/transfers/${seg(transferId)}` };
}

/** DataTransfer: transfers.list — GET /admin/datatransfer/v1/transfers?maxResults={n} */
export function dataTransferList(maxResults = 20): GoogleApiRequest {
  return { method: 'GET', path: withQuery(`${DATATRANSFER_BASE}/transfers`, { maxResults }) };
}

// ===========================================================================
// Admin SDK Directory  (admin.googleapis.com / admin/directory/v1)
//
// These builders cover the directory + lifecycle operations that GAM/PSGSuite
// expose but Helios's DeveloperConsole was previously missing: undeleting a
// recently-deleted user, custom-schema (custom-attribute) CRUD and reading /
// writing a user's schema values, listing user aliases, group aliases, and the
// group-member operations (get + change role) that had no wrapper.
//
// All of these run in the ADMIN context — the Directory API is a domain-admin
// surface — so they never set `impersonate` (no X-Impersonate-User header),
// matching the Drive / Data-Transfer builders above.
// ===========================================================================

const DIRECTORY_BASE = '/api/google/admin/directory/v1';
/** The Directory API accepts the literal `my_customer` for the caller's own account. */
const MY_CUSTOMER = 'my_customer';

// ----- Users: lifecycle -----

/**
 * Directory: users.undelete — POST /admin/directory/v1/users/{userKey}/undelete
 *
 * Restores a user deleted within Google's ~20-day recovery window. This is NOT
 * the same as un-suspending (`{suspended:false}` via users.update): undelete
 * brings back a *deleted* account, and `userKey` must be the user's immutable
 * 21-char ID (the primary email no longer resolves once deleted). The body is a
 * UserUndelete resource whose only field is the OU to restore the user into.
 * GAM equivalent: `gam undelete user <id> [ou </Path>]`.
 */
export function usersUndelete(userKey: string, orgUnitPath = '/'): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${DIRECTORY_BASE}/users/${seg(userKey)}/undelete`,
    body: { orgUnitPath },
  };
}

/**
 * Directory: users.get with custom schema values —
 * GET /admin/directory/v1/users/{userKey}?projection=full
 *   (or `?projection=custom&customFieldMask={schema}` for a single schema)
 *
 * A plain users.get returns `projection=basic`, which OMITS custom schema
 * values entirely, so reading a custom attribute needs an explicit projection.
 * Google only allows `customFieldMask` when `projection=custom`; passing a mask
 * with `projection=full` is rejected — so this picks the projection from whether
 * a mask was supplied. GAM equivalent: `gam info user <email> schemas`.
 */
export function usersGetCustomSchemas(userKey: string, customFieldMask?: string): GoogleApiRequest {
  const projection = customFieldMask ? 'custom' : 'full';
  return {
    method: 'GET',
    path: withQuery(`${DIRECTORY_BASE}/users/${seg(userKey)}`, { projection, customFieldMask }),
  };
}

/**
 * Directory: users.update (custom attributes) —
 * PATCH /admin/directory/v1/users/{userKey}  body {customSchemas:{[schema]:{...}}}
 *
 * Sets one custom schema's field values on a user. `fields` is the map of
 * fieldName -> value inside the named schema (single-valued fields take a
 * scalar; multi-valued fields take an array of `{value, type?}` per Google).
 * GAM equivalent: `gam update user <email> schema <schema>.<field> <value>`.
 */
export function usersSetCustomSchema(
  userKey: string,
  schemaName: string,
  fields: Record<string, unknown>,
): GoogleApiRequest {
  return {
    method: 'PATCH',
    path: `${DIRECTORY_BASE}/users/${seg(userKey)}`,
    body: { customSchemas: { [schemaName]: fields } },
  };
}

// ----- Users: aliases -----

/** Directory: users.aliases.list — GET /admin/directory/v1/users/{userKey}/aliases */
export function userAliasesList(userKey: string): GoogleApiRequest {
  return { method: 'GET', path: `${DIRECTORY_BASE}/users/${seg(userKey)}/aliases` };
}

/** Directory: users.aliases.insert — POST /admin/directory/v1/users/{userKey}/aliases  body {alias} */
export function userAliasesInsert(userKey: string, alias: string): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${DIRECTORY_BASE}/users/${seg(userKey)}/aliases`,
    body: { alias },
  };
}

/** Directory: users.aliases.delete — DELETE /admin/directory/v1/users/{userKey}/aliases/{alias} */
export function userAliasesDelete(userKey: string, alias: string): GoogleApiRequest {
  return {
    method: 'DELETE',
    path: `${DIRECTORY_BASE}/users/${seg(userKey)}/aliases/${seg(alias)}`,
  };
}

// ----- Groups: aliases -----

/** Directory: groups.aliases.list — GET /admin/directory/v1/groups/{groupKey}/aliases */
export function groupAliasesList(groupKey: string): GoogleApiRequest {
  return { method: 'GET', path: `${DIRECTORY_BASE}/groups/${seg(groupKey)}/aliases` };
}

/** Directory: groups.aliases.insert — POST /admin/directory/v1/groups/{groupKey}/aliases  body {alias} */
export function groupAliasesInsert(groupKey: string, alias: string): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${DIRECTORY_BASE}/groups/${seg(groupKey)}/aliases`,
    body: { alias },
  };
}

/** Directory: groups.aliases.delete — DELETE /admin/directory/v1/groups/{groupKey}/aliases/{alias} */
export function groupAliasesDelete(groupKey: string, alias: string): GoogleApiRequest {
  return {
    method: 'DELETE',
    path: `${DIRECTORY_BASE}/groups/${seg(groupKey)}/aliases/${seg(alias)}`,
  };
}

// ----- Groups: members (the ops missing a wrapper) -----

/** Directory: members.get — GET /admin/directory/v1/groups/{groupKey}/members/{memberKey} */
export function groupMembersGet(groupKey: string, memberKey: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${DIRECTORY_BASE}/groups/${seg(groupKey)}/members/${seg(memberKey)}`,
  };
}

/**
 * Directory: members.patch (change role) —
 * PATCH /admin/directory/v1/groups/{groupKey}/members/{memberKey}  body {role}
 * `role` is one of MEMBER | MANAGER | OWNER. GAM equivalent:
 * `gam update group <group> update <role> <member>`.
 */
export function groupMembersSetRole(
  groupKey: string,
  memberKey: string,
  role: string,
): GoogleApiRequest {
  return {
    method: 'PATCH',
    path: `${DIRECTORY_BASE}/groups/${seg(groupKey)}/members/${seg(memberKey)}`,
    body: { role },
  };
}

// ----- Custom schemas (custom attributes) — customer level -----

export interface SchemaFieldSpec {
  fieldName: string;
  /** STRING | INT64 | BOOL | DATE | DOUBLE | EMAIL | PHONE */
  fieldType: string;
  multiValued?: boolean;
  indexed?: boolean;
  /** ADMINS_AND_SELF | ALL_DOMAIN_USERS */
  readAccessType?: string;
}

export interface SchemaResource {
  schemaName: string;
  displayName?: string;
  fields: SchemaFieldSpec[];
}

/** Directory: schemas.list — GET /admin/directory/v1/customer/my_customer/schemas */
export function schemasList(): GoogleApiRequest {
  return { method: 'GET', path: `${DIRECTORY_BASE}/customer/${MY_CUSTOMER}/schemas` };
}

/** Directory: schemas.get — GET /admin/directory/v1/customer/my_customer/schemas/{schemaKey} */
export function schemasGet(schemaKey: string): GoogleApiRequest {
  return {
    method: 'GET',
    path: `${DIRECTORY_BASE}/customer/${MY_CUSTOMER}/schemas/${seg(schemaKey)}`,
  };
}

/**
 * Directory: schemas.insert — POST /admin/directory/v1/customer/my_customer/schemas
 * Body is the Schema resource (schemaName + displayName + fields[]). GAM
 * equivalent: `gam create schema <name> field <field> type <type> ...`.
 */
export function schemasInsert(schema: SchemaResource): GoogleApiRequest {
  return {
    method: 'POST',
    path: `${DIRECTORY_BASE}/customer/${MY_CUSTOMER}/schemas`,
    body: {
      schemaName: schema.schemaName,
      displayName: schema.displayName ?? schema.schemaName,
      fields: schema.fields,
    },
  };
}

/** Directory: schemas.patch — PATCH /admin/directory/v1/customer/my_customer/schemas/{schemaKey} */
export function schemasPatch(schemaKey: string, patch: Record<string, unknown>): GoogleApiRequest {
  return {
    method: 'PATCH',
    path: `${DIRECTORY_BASE}/customer/${MY_CUSTOMER}/schemas/${seg(schemaKey)}`,
    body: patch,
  };
}

/** Directory: schemas.delete — DELETE /admin/directory/v1/customer/my_customer/schemas/{schemaKey} */
export function schemasDelete(schemaKey: string): GoogleApiRequest {
  return {
    method: 'DELETE',
    path: `${DIRECTORY_BASE}/customer/${MY_CUSTOMER}/schemas/${seg(schemaKey)}`,
  };
}
