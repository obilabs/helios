/**
 * Knowledge Base Search Implementation
 *
 * Provides keyword-based search with synonym expansion
 * for finding relevant knowledge entries.
 */

import { KnowledgeEntry, SearchOptions, SearchResult, SearchResponse } from './types.js';
import { expandTerms } from './synonyms.js';
import { loadKnowledgeBase } from './index.js';
import { logger } from '../utils/logger.js';

/**
 * Search the knowledge base
 *
 * @param query - The search query (natural language)
 * @param options - Search options (type, category, limit)
 * @returns Search results sorted by relevance
 */
export function searchKnowledge(
  query: string,
  options: SearchOptions = {}
): SearchResponse {
  const { type = 'all', category, limit = 5 } = options;

  // Tokenize query
  const rawTerms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);

  if (rawTerms.length === 0) {
    return { query, results: [], totalFound: 0 };
  }

  // Expand terms with synonyms
  const expandedTerms = expandTerms(rawTerms);

  // Load knowledge base
  let entries = loadKnowledgeBase();

  // Filter by type
  if (type !== 'all') {
    entries = entries.filter(e => e.type === type);
  }

  // Filter by category
  if (category) {
    entries = entries.filter(e =>
      e.category === category ||
      e.subcategory === category
    );
  }

  // Score each entry
  const results: SearchResult[] = entries.map(entry => {
    const { score, matchedOn } = calculateScore(entry, expandedTerms, rawTerms, query);
    return { entry, score, matchedOn };
  });

  // Sort by score and apply limit
  const sorted = results
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const limited = sorted.slice(0, limit);

  logger.debug('Knowledge search', {
    query,
    rawTerms,
    expandedTermsCount: expandedTerms.length,
    totalMatches: sorted.length,
    returned: limited.length
  });

  return {
    query,
    results: limited,
    totalFound: sorted.length
  };
}

/**
 * Calculate relevance score for an entry
 */
function calculateScore(
  entry: KnowledgeEntry,
  expandedTerms: string[],
  originalTerms: string[],
  fullQuery: string
): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];

  const titleLower = entry.title.toLowerCase();
  const summaryLower = entry.summary.toLowerCase();
  const contentLower = entry.content.toLowerCase();
  const queryLower = fullQuery.toLowerCase();

  // Exact full query match in title (highest priority)
  if (titleLower === queryLower || titleLower.includes(queryLower)) {
    score += 100;
    matchedOn.push('title-exact');
  }

  // Exact alias match (very high priority)
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower === queryLower || aliasLower.includes(queryLower)) {
        score += 80;
        matchedOn.push('alias-exact');
        break;
      }
    }
  }

  // Title contains individual terms
  for (const term of expandedTerms) {
    if (titleLower.includes(term)) {
      score += 15;
      if (!matchedOn.includes('title')) matchedOn.push('title');
    }
  }

  // Alias partial match
  if (entry.aliases && !matchedOn.includes('alias-exact')) {
    for (const alias of entry.aliases) {
      const aliasLower = alias.toLowerCase();
      for (const term of expandedTerms) {
        if (aliasLower.includes(term)) {
          score += 10;
          if (!matchedOn.includes('alias')) matchedOn.push('alias');
          break;
        }
      }
    }
  }

  // Keyword match (medium priority)
  for (const keyword of entry.keywords) {
    const kwLower = keyword.toLowerCase();
    for (const term of expandedTerms) {
      if (kwLower.includes(term) || term.includes(kwLower)) {
        score += 8;
        if (!matchedOn.includes('keyword')) matchedOn.push('keyword');
      }
    }
  }

  // Summary match
  for (const term of expandedTerms) {
    if (summaryLower.includes(term)) {
      score += 3;
      if (!matchedOn.includes('summary')) matchedOn.push('summary');
    }
  }

  // Content match (lowest priority - use original terms only)
  for (const term of originalTerms) {
    const matches = (contentLower.match(new RegExp(escapeRegex(term), 'g')) || []).length;
    score += Math.min(matches, 3); // Cap at 3 matches per term
    if (matches > 0 && !matchedOn.includes('content')) {
      matchedOn.push('content');
    }
  }

  // Boost for command type when query looks like a command
  if (entry.type === 'command' && looksLikeCommand(fullQuery)) {
    score += 20;
  }

  return { score, matchedOn };
}

/**
 * Check if query looks like a command (starts with known prefixes)
 */
function looksLikeCommand(query: string): boolean {
  const lower = query.toLowerCase().trim();
  const commandPrefixes = ['gw', 'api', 'users', 'groups', 'sync', 'help', 'ms', 'm365'];
  return commandPrefixes.some(prefix => lower.startsWith(prefix));
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get a specific knowledge entry by ID
 */
export function getKnowledgeById(id: string): KnowledgeEntry | null {
  const entries = loadKnowledgeBase();
  return entries.find(e => e.id === id) || null;
}

/**
 * Get a command by its exact name/title
 */
export function getCommandByName(name: string): KnowledgeEntry | null {
  const entries = loadKnowledgeBase();
  const nameLower = name.toLowerCase().trim();

  return entries.find(e =>
    e.type === 'command' &&
    (e.title.toLowerCase() === nameLower ||
      e.aliases?.some(a => a.toLowerCase() === nameLower))
  ) || null;
}

/**
 * List all commands, optionally filtered by category
 */
export function listCommands(category?: string): KnowledgeEntry[] {
  let entries = loadKnowledgeBase().filter(e => e.type === 'command');

  if (category && category !== 'all') {
    entries = entries.filter(e =>
      e.category === category ||
      e.subcategory === category
    );
  }

  // Sort by category then title
  return entries.sort((a, b) => {
    const catCompare = (a.subcategory || a.category).localeCompare(b.subcategory || b.category);
    if (catCompare !== 0) return catCompare;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Get suggestions when no results found
 */
export function getSuggestions(query: string): string[] {
  const suggestions: string[] = [];
  const queryLower = query.toLowerCase();

  // Check for common misspellings or variations
  const corrections: Record<string, string> = {
    'user': 'users',
    'group': 'groups',
    'google': 'gw',
    'workspace': 'gw',
    'microsoft': 'ms',
    'azure': 'ms',
    'orgunit': 'orgunits',
    'ou': 'orgunits',
  };

  for (const [wrong, right] of Object.entries(corrections)) {
    if (queryLower.includes(wrong) && !queryLower.includes(right)) {
      const corrected = queryLower.replace(wrong, right);
      const results = searchKnowledge(corrected, { limit: 1 });
      if (results.totalFound > 0) {
        suggestions.push(`Did you mean "${corrected}"?`);
      }
    }
  }

  // Suggest listing commands if query mentions a category
  if (queryLower.includes('gw') || queryLower.includes('google')) {
    suggestions.push('Try: list_commands({ category: "google-workspace" })');
  }
  if (queryLower.includes('ms') || queryLower.includes('microsoft')) {
    suggestions.push('Try: list_commands({ category: "microsoft-365" })');
  }

  return suggestions.slice(0, 3);
}
