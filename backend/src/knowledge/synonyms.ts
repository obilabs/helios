/**
 * Synonyms for forgiving search
 *
 * Maps common terms to their alternatives so users can find
 * commands using natural language variations.
 */

/**
 * Synonym groups - each key maps to related terms
 */
export const SYNONYMS: Record<string, string[]> = {
  // Actions
  'get': ['list', 'show', 'view', 'display', 'retrieve', 'fetch', 'find', 'see'],
  'list': ['get', 'show', 'view', 'display', 'all', 'fetch'],
  'create': ['add', 'new', 'make', 'insert', 'register'],
  'delete': ['remove', 'destroy', 'drop', 'erase', 'unregister'],
  'update': ['edit', 'modify', 'change', 'patch', 'set'],
  'suspend': ['disable', 'deactivate', 'block', 'pause'],
  'restore': ['enable', 'activate', 'unblock', 'resume', 'unsuspend'],
  'move': ['transfer', 'relocate', 'change'],
  'sync': ['synchronize', 'refresh', 'update', 'pull'],

  // Entities
  'users': ['user', 'people', 'members', 'employees', 'staff', 'accounts', 'person'],
  'groups': ['group', 'teams', 'team', 'distribution', 'mailing'],
  'orgunits': ['ou', 'organizational-units', 'org-units', 'departments', 'units'],
  'delegates': ['delegate', 'delegation', 'access', 'permissions'],

  // Platforms
  'gw': ['google', 'google-workspace', 'workspace', 'gsuite'],
  'microsoft': ['ms', 'm365', 'microsoft-365', 'office365', 'azure', 'entra'],

  // General
  'all': ['every', 'entire', 'complete', 'full'],
  'help': ['?', 'commands', 'usage', 'how'],
  'api': ['endpoint', 'rest', 'http', 'request'],
};

/**
 * Expand a single search term to include synonyms
 *
 * @param term - The term to expand
 * @returns Array of the original term plus all synonyms
 */
export function expandTerm(term: string): string[] {
  const lower = term.toLowerCase();
  const expanded = new Set<string>([lower]);

  // Add direct synonyms
  if (SYNONYMS[lower]) {
    SYNONYMS[lower].forEach(syn => expanded.add(syn));
  }

  // Check if term is a synonym of something else
  for (const [key, synonyms] of Object.entries(SYNONYMS)) {
    if (synonyms.includes(lower)) {
      expanded.add(key);
      synonyms.forEach(syn => expanded.add(syn));
    }
  }

  return [...expanded];
}

/**
 * Expand all terms in a query
 *
 * @param terms - Array of search terms
 * @returns Array of all terms plus their synonyms (deduplicated)
 */
export function expandTerms(terms: string[]): string[] {
  const expanded = new Set<string>();

  for (const term of terms) {
    expandTerm(term).forEach(t => expanded.add(t));
  }

  return [...expanded];
}

/**
 * Check if two terms are synonymous
 *
 * @param term1 - First term
 * @param term2 - Second term
 * @returns True if the terms are synonyms
 */
export function areSynonyms(term1: string, term2: string): boolean {
  const lower1 = term1.toLowerCase();
  const lower2 = term2.toLowerCase();

  if (lower1 === lower2) return true;

  const expanded1 = expandTerm(lower1);
  return expanded1.includes(lower2);
}
