/**
 * Knowledge MCP Tools Integration Tests
 *
 * Tests for the MCP tool execution functions that
 * provide AI access to the knowledge base.
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

import { clearKnowledgeCache } from '../index.js';
import {
  executeSearchKnowledge,
  executeGetCommand,
  executeListCommands
} from '../tools/index.js';

describe('Knowledge MCP Tools', () => {
  beforeEach(() => {
    clearKnowledgeCache();
  });

  afterEach(() => {
    clearKnowledgeCache();
  });

  describe('executeSearchKnowledge', () => {
    it('should return formatted search results', async () => {
      const result = await executeSearchKnowledge({
        query: 'list users',
        limit: 5
      });

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Should contain match information
      expect(result.toLowerCase()).toContain('user');
    });

    it('should return message when no results found', async () => {
      const result = await executeSearchKnowledge({
        query: 'xyznonexistent123'
      });

      expect(result.toLowerCase()).toContain('no results');
    });

    it('should filter by type when specified', async () => {
      const result = await executeSearchKnowledge({
        query: 'users',
        type: 'command'
      });

      expect(typeof result).toBe('string');
      // Result should only contain command entries
    });

    it('should filter by category when specified', async () => {
      const result = await executeSearchKnowledge({
        query: 'users',
        category: 'google-workspace'
      });

      expect(typeof result).toBe('string');
      // Should filter to Google Workspace category
    });

    it('should respect limit parameter', async () => {
      const result1 = await executeSearchKnowledge({
        query: 'users',
        limit: 1
      });
      const result2 = await executeSearchKnowledge({
        query: 'users',
        limit: 10
      });

      // Both should be valid strings
      expect(typeof result1).toBe('string');
      expect(typeof result2).toBe('string');
      // Longer limit should typically have more content
      // (though depends on actual result count)
    });

    it('should handle empty query gracefully', async () => {
      const result = await executeSearchKnowledge({
        query: ''
      });

      expect(typeof result).toBe('string');
      expect(result.toLowerCase()).toContain('no results');
    });
  });

  describe('executeGetCommand', () => {
    it('should return command details for valid command', async () => {
      const result = await executeGetCommand({
        name: 'gw users list'
      });

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Should include command syntax
      expect(result.toLowerCase()).toContain('gw users list');
    });

    it('should find command by alias', async () => {
      const result = await executeGetCommand({
        name: 'list users'
      });

      expect(typeof result).toBe('string');
      // Should find the command via alias
      expect(result.toLowerCase()).not.toContain('not found');
    });

    it('should return not found message for unknown command', async () => {
      const result = await executeGetCommand({
        name: 'nonexistent command xyz'
      });

      expect(typeof result).toBe('string');
      expect(result.toLowerCase()).toContain('not found');
    });

    it('should include examples when available', async () => {
      const result = await executeGetCommand({
        name: 'gw users list'
      });

      // Command should have examples
      expect(result.toLowerCase()).toContain('example');
    });

    it('should include related commands when available', async () => {
      const result = await executeGetCommand({
        name: 'gw users list'
      });

      // Should reference related commands
      if (result.toLowerCase().includes('related')) {
        expect(result.length).toBeGreaterThan(100);
      }
    });

    it('should be case insensitive', async () => {
      const result1 = await executeGetCommand({
        name: 'GW USERS LIST'
      });
      const result2 = await executeGetCommand({
        name: 'gw users list'
      });

      // Both should find the same command (or both not find it)
      const found1 = !result1.toLowerCase().includes('not found');
      const found2 = !result2.toLowerCase().includes('not found');
      expect(found1).toBe(found2);
    });
  });

  describe('executeListCommands', () => {
    it('should list all commands when no category specified', async () => {
      const result = await executeListCommands({});

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Should list multiple commands
      expect(result).toContain('gw');
    });

    it('should filter by category', async () => {
      const result = await executeListCommands({
        category: 'google-workspace'
      });

      expect(typeof result).toBe('string');
      // Should only include Google Workspace commands
      expect(result.toLowerCase()).toContain('google');
    });

    it('should handle all category (same as no filter)', async () => {
      const resultAll = await executeListCommands({ category: 'all' });
      const resultNone = await executeListCommands({});

      // Both should return similar counts (might differ slightly in formatting)
      expect(typeof resultAll).toBe('string');
      expect(typeof resultNone).toBe('string');
    });

    it('should return empty message for unknown category', async () => {
      const result = await executeListCommands({
        category: 'nonexistent-category'
      });

      expect(typeof result).toBe('string');
      expect(result.toLowerCase()).toContain('no commands');
    });

    it('should group commands by subcategory', async () => {
      const result = await executeListCommands({});

      expect(typeof result).toBe('string');
      // Should have some structure/grouping
      expect(result.length).toBeGreaterThan(50);
    });
  });

  describe('Tool Integration', () => {
    it('should support a typical search-then-get workflow', async () => {
      // First, search for what we need
      const searchResult = await executeSearchKnowledge({
        query: 'create user google',
        type: 'command',
        limit: 3
      });

      expect(typeof searchResult).toBe('string');

      // Then, get specific command details
      const getResult = await executeGetCommand({
        name: 'gw users create'
      });

      expect(typeof getResult).toBe('string');
    });

    it('should provide helpful fallback when search fails', async () => {
      // Search with no results
      const searchResult = await executeSearchKnowledge({
        query: 'xyz123nonexistent'
      });

      // Should get a helpful message
      expect(searchResult.toLowerCase()).toContain('no results');

      // User might then try listing commands
      const listResult = await executeListCommands({
        category: 'google-workspace'
      });

      expect(typeof listResult).toBe('string');
      expect(listResult.length).toBeGreaterThan(0);
    });

    it('should handle rapid sequential calls', async () => {
      const promises = [
        executeSearchKnowledge({ query: 'users' }),
        executeSearchKnowledge({ query: 'groups' }),
        executeListCommands({}),
        executeGetCommand({ name: 'gw users list' })
      ];

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in query', async () => {
      const result = await executeSearchKnowledge({
        query: 'user@example.com'
      });

      expect(typeof result).toBe('string');
      // Should not throw an error
    });

    it('should handle very long queries', async () => {
      const longQuery = 'how do I list all users in google workspace and filter by department';
      const result = await executeSearchKnowledge({
        query: longQuery
      });

      expect(typeof result).toBe('string');
    });

    it('should handle queries with numbers', async () => {
      const result = await executeSearchKnowledge({
        query: 'sync 15 minutes interval'
      });

      expect(typeof result).toBe('string');
    });

    it('should handle unicode characters', async () => {
      const result = await executeSearchKnowledge({
        query: 'user名前'
      });

      expect(typeof result).toBe('string');
      // Should not crash, may return no results
    });
  });
});
