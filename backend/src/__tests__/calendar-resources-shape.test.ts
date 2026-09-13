/**
 * What a bookable resource looks like in Google, captured live from the obilabs.dev
 * trial on 2026-09-12, hours before it was deleted.
 *
 * Recorded so the room- and desk-booking schema can be designed against real payloads
 * instead of guesses — the point being that the shape is expensive to change after
 * installs adopt it, and the trial was the only tenant we could ask.
 *
 * The finding that shapes the model: a DESK is the same object as a ROOM. Both are
 * calendar resources; only `resourceCategory` (CONFERENCE_ROOM vs OTHER) and the free
 * -text `resourceType` differ. So one table serves meeting rooms and desk hotelling,
 * and the booking side is the same calendar event in both cases.
 *
 * Fields Google generates and we must store rather than invent:
 *   resourceEmail          the address a booking invites — the real identity of the resource
 *   generatedResourceName  Google's own display string, "(Desk)-Building-Floor-Section-Name"
 * Fields that are ours to model: check-in, no-show release, who may book, and any
 * photo or map, none of which Google's resource record carries.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(HERE, 'fixtures', 'google', 'admin.directory.resources', `${name}.json`), 'utf8'),
  );

describe('Google calendar resources (recorded live)', () => {
  it('a room and a desk are the same object, differing only in category and type', () => {
    const room = fixture('calendars.insert.room').response.data;
    const desk = fixture('calendars.insert.desk').response.data;

    expect(room.kind).toBe(desk.kind);
    expect(room.resourceCategory).toBe('CONFERENCE_ROOM');
    expect(desk.resourceCategory).toBe('OTHER');
    expect(desk.resourceType).toBe('Desk');

    // Same field set: whatever the booking model stores, it stores it once.
    expect(Object.keys(room).sort()).toEqual(Object.keys(desk).sort());
  });

  it('Google generates the resource address and display name — the model must keep them, not derive them', () => {
    const desk = fixture('calendars.insert.desk').response.data;
    expect(desk.resourceEmail).toMatch(/@resource\.calendar\.google\.com$/);
    expect(desk.generatedResourceName).toContain('Desk 2-14');
    // Our own id is what we sent; Google's address is what a calendar invite uses.
    expect(desk.resourceId).toBe('desk-2-14');
  });

  it('a building carries the location a floor plan would hang off', () => {
    const b = fixture('buildings.insert').response.data;
    expect(b.buildingId).toBe('edmonton-hq');
    expect(b.floorNames).toEqual(['1', '2']);
    expect(b.coordinates).toHaveProperty('latitude');
  });

  it('the resource record has no booking behaviour on it', () => {
    const desk = fixture('calendars.insert.desk').response.data;
    // No check-in, no release policy, no booking window: all of that is ours to model.
    for (const ours of ['checkIn', 'autoRelease', 'bookingWindow', 'noShow']) {
      expect(desk).not.toHaveProperty(ours);
    }
  });

  it('carries no real identifiers', () => {
    const all = ['calendars.insert.room', 'calendars.insert.desk', 'buildings.insert', 'calendars.list']
      .map((n) => JSON.stringify(fixture(n)))
      .join('\n');
    expect(all).not.toMatch(/obilabs|gridworx|tmscanada/i);
  });
});
