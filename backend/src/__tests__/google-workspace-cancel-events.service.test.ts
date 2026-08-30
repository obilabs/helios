import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Unit tests for GoogleWorkspaceService.cancelFutureEvents — the offboarding
 * calendar primitive: page through a departing user's future events (impersonating
 * that user), DELETE the ones they organize, and PATCH the ones they only attend
 * to responseStatus='declined'. The Google Calendar client is mocked; these assert
 * the request shapes, the organizer-vs-attendee branch, pagination, and graceful
 * per-event failure.
 */

// Mock database — getCredentials reads the encrypted service_account_key row.
const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the Calendar API surface cancelFutureEvents uses.
const mockEventsList = jest.fn<(...args: any[]) => Promise<any>>();
const mockEventsDelete = jest.fn<(...args: any[]) => Promise<any>>();
const mockEventsPatch = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('googleapis', () => ({
  google: {
    calendar: jest.fn(() => ({
      events: {
        list: mockEventsList,
        delete: mockEventsDelete,
        patch: mockEventsPatch,
      },
    })),
  },
}));

// Mock google-auth-library
jest.unstable_mockModule('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({
    authorize: jest.fn(async () => ({})),
  })),
}));

const { googleWorkspaceService } = await import('../services/google-workspace.service.js');

// Legacy-plaintext service-account key row (decodeServiceAccountKey accepts JSON
// starting with `{` directly, so no encryption round-trip is needed in tests).
const SA_KEY_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'sa@project.iam.gserviceaccount.com',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
});

describe('GoogleWorkspaceService.cancelFutureEvents', () => {
  const orgId = 'org-1';
  const user = 'departing@obilabs.dev';

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation(async (text: string) => {
      if (typeof text === 'string' && text.includes('service_account_key')) {
        return { rows: [{ service_account_key: SA_KEY_JSON }] };
      }
      return { rows: [] };
    });
  });

  it('deletes organizer events, declines attendee events, and paginates', async () => {
    // Page 1 carries a nextPageToken; page 2 is the last page.
    mockEventsList
      .mockResolvedValueOnce({
        data: {
          items: [
            { id: 'evt-org', organizer: { self: true } },
            {
              id: 'evt-att',
              organizer: { email: 'someone@obilabs.dev' },
              attendees: [
                { email: 'someone@obilabs.dev', responseStatus: 'accepted' },
                { email: user, self: true, responseStatus: 'needsAction' },
              ],
            },
          ],
          nextPageToken: 'page2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            // Already-cancelled instance — skipped, no action.
            { id: 'evt-cancelled', status: 'cancelled', organizer: { self: true } },
            // User is neither organizer nor attendee — nothing to do.
            { id: 'evt-notattendee', organizer: { email: 'x@obilabs.dev' }, attendees: [] },
          ],
        },
      });

    mockEventsDelete.mockResolvedValue({});
    mockEventsPatch.mockResolvedValue({});

    const res = await googleWorkspaceService.cancelFutureEvents(orgId, user);

    expect(res.success).toBe(true);
    expect(res.cancelledCount).toBe(1);
    expect(res.declinedCount).toBe(1);

    // Pagination: two list calls, the second continuing from `page2`.
    expect(mockEventsList).toHaveBeenCalledTimes(2);
    expect(mockEventsList.mock.calls[0][0]).toEqual(
      expect.objectContaining({ calendarId: user, singleEvents: true, maxResults: 250 })
    );
    expect(typeof mockEventsList.mock.calls[0][0].timeMin).toBe('string');
    expect(mockEventsList.mock.calls[1][0].pageToken).toBe('page2');

    // Organizer event deleted on the user's own calendar.
    expect(mockEventsDelete).toHaveBeenCalledTimes(1);
    expect(mockEventsDelete).toHaveBeenCalledWith({ calendarId: user, eventId: 'evt-org' });

    // Attendee event patched: the user's own attendee entry set to declined,
    // the other attendee left untouched.
    expect(mockEventsPatch).toHaveBeenCalledTimes(1);
    const patchArg = mockEventsPatch.mock.calls[0][0];
    expect(patchArg.calendarId).toBe(user);
    expect(patchArg.eventId).toBe('evt-att');
    const patchedSelf = patchArg.requestBody.attendees.find((a: any) => a.self === true);
    expect(patchedSelf.responseStatus).toBe('declined');
    const other = patchArg.requestBody.attendees.find(
      (a: any) => a.email === 'someone@obilabs.dev'
    );
    expect(other.responseStatus).toBe('accepted');
  });

  it('treats an organizer identified by email (not self) as an organizer event to delete', async () => {
    mockEventsList.mockResolvedValueOnce({
      data: {
        items: [{ id: 'evt-1', organizer: { email: user } }],
      },
    });
    mockEventsDelete.mockResolvedValue({});

    const res = await googleWorkspaceService.cancelFutureEvents(orgId, user);

    expect(res.success).toBe(true);
    expect(res.cancelledCount).toBe(1);
    expect(res.declinedCount).toBe(0);
    expect(mockEventsDelete).toHaveBeenCalledWith({ calendarId: user, eventId: 'evt-1' });
    expect(mockEventsPatch).not.toHaveBeenCalled();
  });

  it('returns an error when Google Workspace credentials are missing', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [] }));

    const res = await googleWorkspaceService.cancelFutureEvents(orgId, user);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not configured/i);
    expect(mockEventsList).not.toHaveBeenCalled();
  });

  it('continues the sweep when a single event operation fails', async () => {
    mockEventsList.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'evt-a', organizer: { self: true } },
          { id: 'evt-b', organizer: { self: true } },
        ],
      },
    });
    mockEventsDelete
      .mockRejectedValueOnce(new Error('event gone'))
      .mockResolvedValueOnce({});

    const res = await googleWorkspaceService.cancelFutureEvents(orgId, user);

    // The whole sweep still succeeds; only the event that deleted cleanly counts.
    expect(res.success).toBe(true);
    expect(res.cancelledCount).toBe(1);
    expect(mockEventsDelete).toHaveBeenCalledTimes(2);
  });

  it('returns a failure result when the events.list call itself throws', async () => {
    mockEventsList.mockRejectedValueOnce(new Error('calendar api unavailable'));

    const res = await googleWorkspaceService.cancelFutureEvents(orgId, user);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/calendar api unavailable/);
  });
});
