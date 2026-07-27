/**
 * Knowledge Base Types
 *
 * Defines the schema for all knowledge entries in the Helios AI Knowledge Base.
 * This provides a single source of truth for commands, API docs, guides, and features.
 */

/**
 * Type of knowledge entry
 */
export type KnowledgeType = 'command' | 'api' | 'guide' | 'feature' | 'troubleshooting' | 'setting';

/**
 * A usage example for a knowledge entry
 */
export interface Example {
  /** Brief description of what this example demonstrates */
  description: string;
  /** The code/command to run */
  code: string;
  /** Expected output (optional) */
  output?: string;
}

/**
 * A single knowledge entry in the knowledge base
 */
export interface KnowledgeEntry {
  /** Unique identifier (e.g., 'cmd-gw-users-list', 'api-get-users') */
  id: string;

  /** Type of content */
  type: KnowledgeType;

  /** Short title - for commands this is the command itself */
  title: string;

  /** Primary category (e.g., 'developer-console', 'setup', 'security') */
  category: string;

  /** Optional subcategory (e.g., 'google-workspace', 'microsoft-365') */
  subcategory?: string;

  /** Full content in markdown format */
  content: string;

  /** Brief one-line summary for search results */
  summary: string;

  /** Keywords for search matching */
  keywords: string[];

  /** Alternative ways to refer to this (for forgiving search) */
  aliases?: string[];

  /** Usage examples */
  examples?: Example[];

  /** IDs of related entries */
  relatedIds?: string[];

  /** Source of this entry ('manual' or 'auto:filename') */
  source?: string;

  /** ISO timestamp of last update */
  lastUpdated: string;
}

/**
 * Options for searching the knowledge base
 */
export interface SearchOptions {
  /** Filter by entry type */
  type?: KnowledgeType | 'all';

  /** Filter by category */
  category?: string;

  /** Maximum results to return (default: 5) */
  limit?: number;
}

/**
 * A search result with relevance score
 */
export interface SearchResult {
  /** The matching entry */
  entry: KnowledgeEntry;

  /** Relevance score (higher = better match) */
  score: number;

  /** What fields matched (for debugging/transparency) */
  matchedOn: string[];
}

/**
 * Response when search finds no results
 */
export interface NoResultsResponse {
  results: [];
  suggestions?: string[];
  message: string;
}

/**
 * Full search response
 */
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalFound: number;
}
