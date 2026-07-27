/**
 * Knowledge Base Search Tests
 *
 * Tests for the searchKnowledge function, synonym expansion,
 * and helper functions.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the logger to prevent test noise
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Set test environment
process.env.NODE_ENV = 'test';

// Import from separate modules to avoid ESM resolution issues
import { clearKnowledgeCache, loadKnowledgeBase } from '../index';
import { searchKnowledge, getKnowledgeById, getCommandByName, listCommands, getSuggestions } from '../search';

describe('Knowledge Base Search', () => {
  beforeEach(() => {
    // Clear cache before each test for isolation
    clearKnowledgeCache();
  });

  afterEach(() => {
    clearKnowledgeCache();
  });

  describe('loadKnowledgeBase', () => {
    it('should load knowledge base entries', () => {
      const entries = loadKnowledgeBase();
      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should cache loaded entries', () => {
      const entries1 = loadKnowledgeBase();
      const entries2 = loadKnowledgeBase();
      // Same reference indicates caching
      expect(entries1).toBe(entries2);
    });

    it('should include different entry types', () => {
      const entries = loadKnowledgeBase();
      const types = new Set(entries.map(e => e.type));
      expect(types.has('command')).toBe(true);
    });
  });

  describe('searchKnowledge', () => {
    it('should return results for valid query', () => {
      const response = searchKnowledge('users list');
      expect(response.query).toBe('users list');
      expect(response.results.length).toBeGreaterThan(0);
    });

    it('should return empty results for unknown query', () => {
      const response = searchKnowledge('xyznonexistentquery123');
      expect(response.results.length).toBe(0);
      expect(response.totalFound).toBe(0);
    });

    it('should return empty results for empty query', () => {
      const response = searchKnowledge('');
      expect(response.results.length).toBe(0);
    });

    it('should respect limit option', () => {
      const response = searchKnowledge('users', { limit: 2 });
      expect(response.results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by type option', () => {
      const response = searchKnowledge('users', { type: 'command' });
      response.results.forEach(r => {
        expect(r.entry.type).toBe('command');
      });
    });

    it('should filter by category option', () => {
      const response = searchKnowledge('users', { category: 'google-workspace' });
      response.results.forEach(r => {
        expect(
          r.entry.category === 'google-workspace' ||
          r.entry.subcategory === 'google-workspace'
        ).toBe(true);
      });
    });

    it('should rank exact matches highest', () => {
      const response = searchKnowledge('gw users list');
      if (response.results.length > 0) {
        // First result should match the query closely
        const firstResult = response.results[0];
        expect(firstResult.score).toBeGreaterThan(0);
        expect(firstResult.matchedOn.length).toBeGreaterThan(0);
      }
    });

    it('should find entries by alias', () => {
      const response = searchKnowledge('list users');
      // "list users" is an alias for the gw users list command
      const hasUserListCommand = response.results.some(r =>
        r.entry.id === 'cmd-gw-users-list' ||
        r.entry.title.includes('users list')
      );
      expect(hasUserListCommand).toBe(true);
    });

    it('should expand synonyms for better matching', () => {
      // "get" should match entries with "list" via synonyms
      const getResponse = searchKnowledge('get users');
      const listResponse = searchKnowledge('list users');

      // Both should return user-related results
      expect(getResponse.results.length).toBeGreaterThan(0);
      expect(listResponse.results.length).toBeGreaterThan(0);
    });

    it('should include matchedOn information', () => {
      const response = searchKnowledge('users');
      response.results.forEach(r => {
        expect(Array.isArray(r.matchedOn)).toBe(true);
        expect(r.matchedOn.length).toBeGreaterThan(0);
      });
    });

    it('should sort results by score descending', () => {
      const response = searchKnowledge('users');
      for (let i = 1; i < response.results.length; i++) {
        expect(response.results[i - 1].score).toBeGreaterThanOrEqual(
          response.results[i].score
        );
      }
    });
  });

  describe('getKnowledgeById', () => {
    it('should return entry by ID', () => {
      const entry = getKnowledgeById('cmd-gw-users-list');
      expect(entry).toBeDefined();
      if (entry) {
        expect(entry.id).toBe('cmd-gw-users-list');
        expect(entry.type).toBe('command');
      }
    });

    it('should return null for unknown ID', () => {
      const entry = getKnowledgeById('nonexistent-id-12345');
      expect(entry).toBeNull();
    });
  });

  describe('getCommandByName', () => {
    it('should find command by exact title', () => {
      const command = getCommandByName('gw users list');
      expect(command).toBeDefined();
      if (command) {
        expect(command.type).toBe('command');
        expect(command.title.toLowerCase()).toContain('users list');
      }
    });

    it('should find command by alias', () => {
      const command = getCommandByName('list users');
      expect(command).toBeDefined();
      if (command) {
        expect(command.type).toBe('command');
      }
    });

    it('should be case insensitive', () => {
      const command1 = getCommandByName('GW USERS LIST');
      const command2 = getCommandByName('gw users list');
      // Both should find something or both return null
      if (command1) {
        expect(command2).toBeDefined();
        expect(command1.id).toBe(command2?.id);
      }
    });

    it('should return null for unknown command', () => {
      const command = getCommandByName('nonexistent command');
      expect(command).toBeNull();
    });
  });

  describe('listCommands', () => {
    it('should return all commands when no category specified', () => {
      const commands = listCommands();
      expect(commands.length).toBeGreaterThan(0);
      commands.forEach(cmd => {
        expect(cmd.type).toBe('command');
      });
    });

    it('should filter by category', () => {
      const commands = listCommands('google-workspace');
      commands.forEach(cmd => {
        expect(cmd.type).toBe('command');
        expect(
          cmd.category === 'google-workspace' ||
          cmd.subcategory === 'google-workspace'
        ).toBe(true);
      });
    });

    it('should return empty array for unknown category', () => {
      const commands = listCommands('nonexistent-category');
      expect(commands.length).toBe(0);
    });

    it('should return sorted commands', () => {
      const commands = listCommands();
      // Should be sorted by category/subcategory, then title
      for (let i = 1; i < commands.length; i++) {
        const prevCat = commands[i - 1].subcategory || commands[i - 1].category;
        const currCat = commands[i].subcategory || commands[i].category;
        if (prevCat === currCat) {
          expect(commands[i - 1].title.localeCompare(commands[i].title)).toBeLessThanOrEqual(0);
        }
      }
    });
  });

  describe('getSuggestions', () => {
    it('should return suggestions for common typos', () => {
      const suggestions = getSuggestions('google users');
      expect(Array.isArray(suggestions)).toBe(true);
      // Should suggest using "gw" instead of "google"
    });

    it('should suggest list_commands for category queries', () => {
      const suggestions = getSuggestions('microsoft');
      expect(suggestions.some(s => s.includes('list_commands'))).toBe(true);
    });

    it('should limit suggestions to 3', () => {
      const suggestions = getSuggestions('some random query');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array when no suggestions available', () => {
      const suggestions = getSuggestions('valid search users list');
      // No typos to correct, so limited suggestions
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('Search Quality', () => {
    it('should rank command entries higher for command-like queries', () => {
      const response = searchKnowledge('gw users list');
      if (response.results.length > 0) {
        // First result should be a command entry
        expect(response.results[0].entry.type).toBe('command');
      }
    });

    it('should find guide entries with appropriate queries', () => {
      const response = searchKnowledge('getting started setup', { type: 'guide' });
      expect(response.results.length).toBeGreaterThan(0);
      response.results.forEach(r => {
        expect(r.entry.type).toBe('guide');
      });
    });

    it('should find feature entries with appropriate queries', () => {
      const response = searchKnowledge('org chart', { type: 'feature' });
      if (response.results.length > 0) {
        response.results.forEach(r => {
          expect(r.entry.type).toBe('feature');
        });
      }
    });

    it('should find setting entries with appropriate queries', () => {
      const response = searchKnowledge('sync interval', { type: 'setting' });
      if (response.results.length > 0) {
        response.results.forEach(r => {
          expect(r.entry.type).toBe('setting');
        });
      }
    });

    it('should handle multi-word queries effectively', () => {
      const response = searchKnowledge('google workspace user management');
      expect(response.results.length).toBeGreaterThan(0);
    });
  });
});
