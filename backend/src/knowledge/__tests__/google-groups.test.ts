/**
 * Google Groups knowledge-base articles
 *
 * Guards the two Groups for Business articles (settings reference + recipes):
 * they must load, be reachable by the words admins actually type, stay honest
 * about what Helios does and does not manage, and only link to entries that exist.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

process.env.NODE_ENV = 'test';

import { clearKnowledgeCache, loadKnowledgeBase } from '../index';
import { searchKnowledge, getKnowledgeById } from '../search';

const SETTINGS_ID = 'guide-google-groups-settings';
const RECIPES_ID = 'guide-google-groups-recipes';

describe('Google Groups knowledge-base articles', () => {
  beforeEach(() => clearKnowledgeCache());
  afterEach(() => clearKnowledgeCache());

  it('both articles load from google-groups.json', () => {
    const ids = loadKnowledgeBase().map(e => e.id);
    expect(ids).toContain(SETTINGS_ID);
    expect(ids).toContain(RECIPES_ID);
  });

  it('are guides in the groups category with a verification date', () => {
    for (const id of [SETTINGS_ID, RECIPES_ID]) {
      const entry = getKnowledgeById(id);
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('guide');
      expect(entry!.category).toBe('groups');
      expect(entry!.content).toContain('Last verified: September 2026');
    }
  });

  it('state honestly what Helios manages today', () => {
    const settings = getKnowledgeById(SETTINGS_ID)!;
    // Helios creates groups and manages membership; the settings on groups.google.com are not managed.
    expect(settings.content).toContain('Helios does **not** change any of the settings');
  });

  it('cross-link each other and only link to existing entries', () => {
    const settings = getKnowledgeById(SETTINGS_ID)!;
    const recipes = getKnowledgeById(RECIPES_ID)!;
    expect(settings.relatedIds).toContain(RECIPES_ID);
    expect(recipes.relatedIds).toContain(SETTINGS_ID);
    for (const entry of [settings, recipes]) {
      for (const relatedId of entry.relatedIds || []) {
        expect(getKnowledgeById(relatedId)).not.toBeNull();
      }
    }
  });

  it('the settings reference is found by setting names', () => {
    for (const query of ['who can post', 'collaborative inbox', 'message moderation', 'default sender', 'group settings']) {
      const ids = searchKnowledge(query, { limit: 5 }).results.map(r => r.entry.id);
      expect(ids).toContain(SETTINGS_ID);
    }
  });

  it('the recipes article is found by the problems admins describe', () => {
    for (const query of ['shared mailbox', 'security@ group', 'hello@ contact inbox', 'announcement list', 'group not receiving external email']) {
      const ids = searchKnowledge(query, { limit: 5 }).results.map(r => r.entry.id);
      expect(ids).toContain(RECIPES_ID);
    }
  });

  it('the recipes cover every documented use case', () => {
    const recipes = getKnowledgeById(RECIPES_ID)!;
    for (const heading of [
      'Public contact inbox',
      'Shared mailbox replacement',
      'Collaborative Inbox',
      'External client',
      'security@',
      'Announcement',
      'Drive files and calendar',
      'departed',
      'Groups Migration API',
      'Common mistakes',
    ]) {
      expect(recipes.content).toContain(heading);
    }
  });
});
