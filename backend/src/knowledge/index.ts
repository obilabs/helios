/**
 * Helios Knowledge Base
 *
 * Single source of truth for AI assistant documentation.
 * Provides searchable commands, API docs, guides, and features.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeEntry } from './types.js';
import { logger } from '../utils/logger.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export types and search functions
export * from './types.js';
export * from './search.js';
export * from './synonyms.js';

// Cache for loaded knowledge base
let knowledgeCache: KnowledgeEntry[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60 * 1000; // Refresh cache every minute in dev

/**
 * Load the knowledge base from JSON files
 */
export function loadKnowledgeBase(): KnowledgeEntry[] {
  // Return cache if still valid
  const now = Date.now();
  if (knowledgeCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return knowledgeCache;
  }

  const contentDir = path.join(__dirname, 'content');
  const entries: KnowledgeEntry[] = [];

  // Content files to load
  const contentFiles = [
    'commands.json',
    'guides.json',
    'features.json',
    'settings.json',
    'troubleshooting.json',
    'api-endpoints.json'
  ];

  for (const filename of contentFiles) {
    const filepath = path.join(contentDir, filename);
    try {
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf-8');
        const parsed = JSON.parse(content);

        if (Array.isArray(parsed)) {
          entries.push(...parsed);
        } else if (parsed.entries && Array.isArray(parsed.entries)) {
          entries.push(...parsed.entries);
        }

        logger.debug(`Loaded ${filename}`, { count: parsed.length || parsed.entries?.length });
      }
    } catch (error) {
      logger.error(`Failed to load ${filename}:`, error);
    }
  }

  // Update cache
  knowledgeCache = entries;
  cacheTimestamp = now;

  logger.info(`Knowledge base loaded`, { totalEntries: entries.length });

  return entries;
}

/**
 * Clear the knowledge base cache (useful for testing or hot reload)
 */
export function clearKnowledgeCache(): void {
  knowledgeCache = null;
  cacheTimestamp = 0;
}

/**
 * Get knowledge base statistics
 */
export function getKnowledgeStats(): {
  totalEntries: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const entries = loadKnowledgeBase();

  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const entry of entries) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
  }

  return {
    totalEntries: entries.length,
    byType,
    byCategory
  };
}
