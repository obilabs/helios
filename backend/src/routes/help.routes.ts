/**
 * Help Routes - Context-based help system (independent of AI)
 *
 * Provides help content for each page from the knowledge base.
 * This works without AI - it's static content from features.json, guides.json, etc.
 */

import { Router, Request, Response } from 'express';
import { searchKnowledge, getKnowledgeById } from '../knowledge/search.js';
import { loadKnowledgeBase } from '../knowledge/index.js';
import { KnowledgeEntry } from '../knowledge/types.js';

const router = Router();

// Map pages to relevant knowledge categories and search terms
const PAGE_HELP_MAPPING: Record<string, { searchTerms: string[]; category?: string; type?: string }> = {
  dashboard: {
    searchTerms: ['dashboard', 'getting started', 'overview'],
    category: 'setup'
  },
  users: {
    searchTerms: ['users', 'directory', 'user management'],
    category: 'users'
  },
  'users-active': {
    searchTerms: ['active users', 'user status'],
    category: 'users'
  },
  'users-staged': {
    searchTerms: ['staged users', 'onboarding', 'new users'],
    category: 'users'
  },
  'users-suspended': {
    searchTerms: ['suspended users', 'suspend', 'deactivate'],
    category: 'users'
  },
  'users-deleted': {
    searchTerms: ['deleted users', 'recovery', 'delete'],
    category: 'users'
  },
  groups: {
    searchTerms: ['groups', 'group management', 'teams'],
    category: 'groups'
  },
  settings: {
    searchTerms: ['settings', 'configuration', 'setup'],
    category: 'setup'
  },
  signatures: {
    searchTerms: ['signatures', 'email signatures', 'templates'],
    category: 'signatures'
  },
  'audit-logs': {
    searchTerms: ['audit', 'logs', 'security', 'tracking'],
    category: 'security'
  },
  'security-events': {
    searchTerms: ['security', 'events', 'alerts', 'monitoring'],
    category: 'security'
  },
  'onboarding-templates': {
    searchTerms: ['onboarding', 'new hire', 'templates'],
    category: 'users'
  },
  'offboarding-templates': {
    searchTerms: ['offboarding', 'departure', 'templates'],
    category: 'users'
  },
  console: {
    searchTerms: ['developer', 'console', 'commands', 'api'],
    category: 'administration'
  },
  people: {
    searchTerms: ['directory', 'people', 'search'],
    category: 'directory'
  },
  orgChart: {
    searchTerms: ['org chart', 'hierarchy', 'organization'],
    category: 'directory'
  },
  workspaces: {
    searchTerms: ['workspaces', 'teams', 'microsoft'],
    category: 'integrations'
  },
  'files-assets': {
    searchTerms: ['files', 'assets', 'media', 'upload'],
    category: 'administration'
  },
  'email-security': {
    searchTerms: ['email', 'security', 'mail'],
    category: 'security'
  },
  administrators: {
    searchTerms: ['administrators', 'admin', 'roles'],
    category: 'administration'
  }
};

/**
 * GET /api/v1/help/context/:page
 * Get context-sensitive help for a specific page
 */
router.get('/context/:page', async (req: Request, res: Response) => {
  try {
    const { page } = req.params;
    const { subContext } = req.query;

    // Build the context key (e.g., 'users-staged')
    const contextKey = subContext ? `${page}-${subContext}` : page;

    // Get page mapping or use defaults
    const mapping = PAGE_HELP_MAPPING[contextKey] || PAGE_HELP_MAPPING[page] || {
      searchTerms: [page.replace(/-/g, ' ')],
    };

    // Search for relevant content
    const results: KnowledgeEntry[] = [];

    for (const term of mapping.searchTerms) {
      const searchResult = searchKnowledge(term, {
        type: mapping.type as any,
        category: mapping.category,
        limit: 3
      });

      for (const result of searchResult.results) {
        // Avoid duplicates
        if (!results.some(r => r.id === result.entry.id)) {
          results.push(result.entry);
        }
      }
    }

    // Limit to top 5 most relevant
    const topResults = results.slice(0, 5);

    // Format the response
    const helpContent = topResults.map(entry => ({
      id: entry.id,
      title: entry.title,
      type: entry.type,
      category: entry.category,
      summary: entry.summary,
      content: entry.content,
      keywords: entry.keywords
    }));

    res.json({
      success: true,
      data: {
        page: contextKey,
        articles: helpContent,
        totalFound: results.length
      }
    });
  } catch (error) {
    console.error('Error fetching help content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch help content'
    });
  }
});

/**
 * GET /api/v1/help/search
 * Search the knowledge base
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, type, category, limit = '5' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "q" is required'
      });
    }

    const searchResult = searchKnowledge(q, {
      type: type as any,
      category: category as string,
      limit: parseInt(limit as string, 10)
    });

    const articles = searchResult.results.map(r => ({
      id: r.entry.id,
      title: r.entry.title,
      type: r.entry.type,
      category: r.entry.category,
      summary: r.entry.summary,
      content: r.entry.content,
      score: r.score,
      matchedOn: r.matchedOn
    }));

    res.json({
      success: true,
      data: {
        query: q,
        articles,
        totalFound: searchResult.totalFound
      }
    });
  } catch (error) {
    console.error('Error searching help:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search help content'
    });
  }
});

/**
 * GET /api/v1/help/article/:id
 * Get a specific help article by ID
 */
router.get('/article/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = getKnowledgeById(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: entry.id,
        title: entry.title,
        type: entry.type,
        category: entry.category,
        subcategory: entry.subcategory,
        summary: entry.summary,
        content: entry.content,
        keywords: entry.keywords,
        examples: entry.examples,
        relatedIds: entry.relatedIds
      }
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch article'
    });
  }
});

/**
 * GET /api/v1/help/quick-tips/:page
 * Get quick tips for a page (shorter format for tooltips)
 */
router.get('/quick-tips/:page', async (req: Request, res: Response) => {
  try {
    const { page } = req.params;

    // Get all entries for this page's category
    const mapping = PAGE_HELP_MAPPING[page] || { searchTerms: [page] };
    const allEntries = loadKnowledgeBase();

    // Filter by category and type=guide
    const tips = allEntries
      .filter(e =>
        e.type === 'guide' &&
        (e.category === mapping.category || mapping.searchTerms.some(t =>
          e.keywords.some(k => k.includes(t)) ||
          e.title.toLowerCase().includes(t)
        ))
      )
      .slice(0, 3)
      .map(e => ({
        id: e.id,
        title: e.title,
        summary: e.summary
      }));

    res.json({
      success: true,
      data: { tips }
    });
  } catch (error) {
    console.error('Error fetching quick tips:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quick tips'
    });
  }
});

export default router;
