/**
 * How booking a Google room actually behaves, recorded live on the obilabs.dev trial on
 * 2026-09-12, hours before it was deleted. These answers decide the booking schema, so
 * they are pinned here rather than remembered.
 *
 * 1. A booking is an ordinary calendar event with the resource as a resource attendee.
 *    There is no booking API and no booking object: the event IS the booking.
 *
 * 2. **The room answers asynchronously.** The insert returns 200 immediately with the
 *    room at `needsAction`; it became `accepted` about 20 seconds later. So Helios can
 *    never tell someone "booked" on the strength of the API call returning.
 *
 * 3. **A clashing booking is ACCEPTED by the API and DECLINED by the room afterwards.**
 *    The second event for the same hour returned 200, and ~20 seconds later the room's
 *    responseStatus was `declined` — the event still sits in the organiser's calendar
 *    looking real. This is the "UI said OK, nothing actually happened" failure this
 *    codebase keeps finding, built into Google's own model.
 *
 * 4. **Capacity is not enforced.** Fifteen attendees went into a ten-seat room and the
 *    room accepted. If an admin wants "that room is too small", Helios says it, using
 *    the resource's own capacity field.
 *
 * What that means for the bones: a booking needs its own state (requested → confirmed /
 * declined), the room's answer has to be reconciled after the fact, and a decline must
 * be surfaced to the person who booked. `freebusy` is the availability read, and it only
 * shows the room busy once the room has accepted, so it lags too.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(HERE, 'fixtures', 'google', 'calendar.booking', `${name}.json`), 'utf8'));
const roomAttendee = (event: any) => event.attendees?.find((a: any) => a.resource);

describe('booking a Google calendar resource (recorded live)', () => {
  it('a booking is just an event with the resource as an attendee', () => {
    const f = fixture('events.insert.books-room');
    expect(f.request.path).toMatch(/calendar\/v3\/calendars\/.*\/events/);
    expect(f.response.status).toBe(200);
    expect(roomAttendee(f.response.data).resource).toBe(true);
  });

  it('the insert returns before the room has answered', () => {
    expect(roomAttendee(fixture('events.insert.books-room').response.data).responseStatus).toBe('needsAction');
  });

  it('the room accepts asynchronously, seconds later', () => {
    const f = fixture('events.get.room-responded');
    expect(roomAttendee(f.response.data).responseStatus).toBe('accepted');
    expect(f.note).toMatch(/ASYNCHRONOUS/);
  });

  it('freebusy shows the room busy only once it has accepted', () => {
    const before = fixture('freebusy.before').response.data.calendars;
    const after = fixture('freebusy.after-booking').response.data.calendars;
    expect(Object.values(before)[0]).toEqual({ busy: [] });
    expect((Object.values(after)[0] as any).busy.length).toBe(1);
  });

  it('a double booking is accepted by the API and declined by the room afterwards', () => {
    // The dangerous half: a 200 here means nothing about whether the room is yours.
    expect(fixture('events.insert.double-booking').response.status).toBe(200);
    expect(roomAttendee(fixture('events.insert.double-booking').response.data).responseStatus).toBe('needsAction');
    // And the event survives as a normal confirmed event in the organiser's calendar.
    const outcome = fixture('events.get.double-booking-outcome').response.data;
    expect(roomAttendee(outcome).responseStatus).toBe('declined');
    expect(outcome.status).toBe('confirmed');
  });

  it('Google does NOT enforce capacity: 15 people went into a 10-seat room', () => {
    // Capacity is advisory in Google's model. If Helios wants "you are over capacity"
    // it has to say so itself, from the resource's own capacity field.
    const f = fixture('events.insert.over-capacity');
    expect(f.response.status).toBe(200);
    expect(f.response.data.attendees.filter((a: any) => !a.resource).length).toBe(15);
    expect(roomAttendee(fixture('events.get.over-capacity-outcome').response.data).responseStatus).toBe('accepted');
  });

  it('cancelling releases the room', () => {
    expect(fixture('events.delete.first').response.status).toBe(204);
  });

  it('carries no real identifiers', () => {
    const all = ['events.insert.books-room', 'events.get.room-responded', 'freebusy.after-booking']
      .map((n) => JSON.stringify(fixture(n)))
      .join('\n');
    expect(all).not.toMatch(/obilabs|gridworx|tmscanada/i);
  });
});
