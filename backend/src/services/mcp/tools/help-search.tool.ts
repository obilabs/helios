import { logger } from '../../../utils/logger.js';

/**
 * Help content categories and articles
 */
interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  keywords: string[];
}

/**
 * Search result from help content
 */
export interface HelpSearchResult {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  relevance: number;
}

/**
 * Tool definition for MCP
 */
export const helpSearchToolDefinition = {
  name: 'search_help',
  description: 'Search Helios documentation and guides for help with platform features',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant help articles'
      },
      category: {
        type: 'string',
        enum: ['setup', 'users', 'groups', 'integrations', 'security', 'all'],
        description: 'Optional category to filter results'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
        default: 5
      }
    },
    required: ['query']
  }
};

/**
 * In-app help content database
 * This provides documentation that the AI can search and reference
 */
const HELP_CONTENT: HelpArticle[] = [
  // Setup category
  {
    id: 'setup-getting-started',
    title: 'Getting Started with Helios',
    category: 'setup',
    content: `Welcome to Helios! Here's how to get started:

1. **Complete Initial Setup**: When you first access Helios, you'll be guided through creating your organization and admin account.

2. **Connect Google Workspace**: Navigate to Settings > Modules > Google Workspace to connect your Google Workspace domain. You'll need:
   - A service account JSON key file
   - Domain-wide delegation enabled
   - Admin email address for impersonation

3. **Connect Microsoft 365** (optional): In Settings > Modules > Microsoft 365, you can connect your Microsoft tenant using:
   - Azure AD tenant ID
   - Application client ID
   - Client secret

4. **Review Your Directory**: Once connected, your users and groups will sync automatically. View them in the Directory section.

5. **Set Up Team Members**: Add administrator accounts for your team under Settings > Roles.`,
    keywords: ['getting started', 'setup', 'first time', 'initial', 'configure', 'connect', 'google workspace', 'microsoft 365']
  },
  {
    id: 'setup-google-workspace',
    title: 'Connecting Google Workspace',
    category: 'setup',
    content: `To connect Google Workspace to Helios:

1. **Create a Service Account** in Google Cloud Console:
   - Go to console.cloud.google.com
   - Create a new project or select existing
   - Navigate to IAM & Admin > Service Accounts
   - Create a new service account
   - Generate a JSON key and download it

2. **Enable Domain-Wide Delegation**:
   - In the service account settings, enable "Domain-wide delegation"
   - Copy the Client ID

3. **Authorize in Google Admin**:
   - Go to admin.google.com
   - Navigate to Security > API Controls > Domain-wide Delegation
   - Add the Client ID with required scopes:
     - https://www.googleapis.com/auth/admin.directory.user
     - https://www.googleapis.com/auth/admin.directory.group
     - https://www.googleapis.com/auth/admin.directory.orgunit

4. **Configure in Helios**:
   - Go to Settings > Modules > Google Workspace
   - Upload your service account JSON
   - Enter your admin email (must be a super admin)
   - Test the connection
   - Enable the module`,
    keywords: ['google workspace', 'google', 'service account', 'domain-wide delegation', 'oauth', 'connect', 'api', 'scopes']
  },
  {
    id: 'setup-microsoft-365',
    title: 'Connecting Microsoft 365',
    category: 'setup',
    content: `To connect Microsoft 365 to Helios:

1. **Register an Application** in Azure AD:
   - Go to portal.azure.com
   - Navigate to Azure Active Directory > App registrations
   - Create a new registration
   - Note the Application (client) ID and Directory (tenant) ID

2. **Create a Client Secret**:
   - In your app registration, go to Certificates & secrets
   - Create a new client secret
   - Copy the secret value immediately (shown only once)

3. **Configure API Permissions**:
   - Add Microsoft Graph permissions:
     - User.Read.All (Application)
     - Group.Read.All (Application)
     - Directory.Read.All (Application)
   - Grant admin consent

4. **Configure in Helios**:
   - Go to Settings > Modules > Microsoft 365
   - Enter Tenant ID, Client ID, and Client Secret
   - Test the connection
   - Enable the module`,
    keywords: ['microsoft 365', 'microsoft', 'azure', 'azure ad', 'entra', 'connect', 'client secret', 'tenant', 'graph api']
  },

  // Users category
  {
    id: 'users-overview',
    title: 'Managing Users',
    category: 'users',
    content: `Helios provides comprehensive user management:

**Viewing Users**:
- Navigate to Directory > Users to see all synced users
- Use filters to narrow by status, department, or location
- Search by name or email
- Click any user to see their full profile

**User Details**:
Each user profile shows:
- Basic information (name, email, title, department)
- Group memberships
- License assignments
- Login history and activity
- Custom fields

**Syncing Users**:
Users are automatically synced from connected platforms. Manual sync can be triggered from Settings > Advanced.

**Note**: User creation and modification is done in the source platform (Google Workspace or Microsoft 365). Helios syncs these changes automatically.`,
    keywords: ['users', 'directory', 'profile', 'employee', 'team', 'people', 'view', 'search', 'filter', 'sync']
  },
  {
    id: 'users-onboarding',
    title: 'User Onboarding',
    category: 'users',
    content: `Helios helps streamline new employee onboarding:

**Onboarding Templates**:
Create reusable templates that define:
- Account setup checklist
- Group assignments
- License requirements
- Welcome email content
- Training materials

**Creating an Onboarding**:
1. Navigate to Lifecycle > Onboarding Templates
2. Create a new template or select existing
3. Fill in the required information
4. Review and confirm

**Tracking Progress**:
Monitor onboarding status in the Scheduled Actions section. You can see pending, in-progress, and completed onboardings.

**Automation** (Coming Soon):
Future updates will allow scheduling automatic group assignments and license provisioning based on start dates.`,
    keywords: ['onboarding', 'new hire', 'employee', 'welcome', 'setup', 'template', 'lifecycle', 'start date']
  },
  {
    id: 'users-offboarding',
    title: 'User Offboarding',
    category: 'users',
    content: `Handle departing employees with Helios offboarding:

**Offboarding Templates**:
Define standard procedures for departures:
- Account suspension timeline
- Data transfer requirements
- Group removal
- License recovery
- Email forwarding setup

**Initiating Offboarding**:
1. Navigate to Lifecycle > Offboarding Templates
2. Select the template appropriate for the departure type
3. Configure departure date and options
4. Review and schedule

**Key Features**:
- Schedule future account suspension
- Set up email forwarding
- Transfer Drive/OneDrive files
- Remove from all groups
- Recover licenses

**Audit Trail**:
All offboarding actions are logged in the audit trail for compliance.`,
    keywords: ['offboarding', 'departure', 'leaving', 'terminate', 'suspend', 'deactivate', 'lifecycle', 'last day', 'transfer']
  },

  // Groups category
  {
    id: 'groups-overview',
    title: 'Managing Groups',
    category: 'groups',
    content: `Groups in Helios help organize your users:

**Viewing Groups**:
- Navigate to Directory > Groups
- See all synced groups from Google Workspace and Microsoft 365
- Filter by type (security, distribution, mailing list)
- Search by name or email

**Group Details**:
Click any group to view:
- Member list with roles
- Group settings
- Email aliases
- Nested groups
- Who can join/manage

**Dynamic Groups** (Coming Soon):
Create groups that automatically include users based on attributes like department, location, or job title.

**Note**: Group membership changes are made in the source platform. Helios syncs these changes automatically.`,
    keywords: ['groups', 'teams', 'distribution', 'mailing list', 'security group', 'members', 'membership', 'dynamic']
  },

  // Integrations category
  {
    id: 'integrations-api-keys',
    title: 'Using API Keys',
    category: 'integrations',
    content: `Helios provides API access for custom integrations:

**Creating API Keys**:
1. Go to Settings > Integrations
2. Click "Create API Key"
3. Choose key type:
   - Service Key: Full access for backend integrations
   - Vendor Key: Limited access for third-party tools
4. Set expiration and permissions
5. Copy the key (shown only once!)

**Using API Keys**:
Include in requests as Bearer token:
\`\`\`
Authorization: Bearer hk_xxxxx...
\`\`\`

**Key Management**:
- Rotate keys regularly
- Revoke compromised keys immediately
- Monitor usage in audit logs

**Rate Limits**:
- 100 requests per minute per key
- Higher limits available for Enterprise plans`,
    keywords: ['api', 'api key', 'integration', 'automation', 'rest', 'bearer', 'token', 'developer', 'webhook']
  },
  {
    id: 'integrations-sync',
    title: 'Data Synchronization',
    category: 'integrations',
    content: `Helios keeps your directory data in sync:

**Automatic Sync**:
By default, Helios syncs every 15 minutes from:
- Google Workspace
- Microsoft 365

**Manual Sync**:
Trigger immediate sync from Settings > Advanced or the dashboard widget.

**Sync Settings**:
Configure in Settings > Advanced:
- Sync interval (5 min to daily)
- Enable/disable auto-sync
- Conflict resolution preferences

**What Syncs**:
- Users and their attributes
- Groups and memberships
- Organizational units
- Licenses (availability)

**Sync History**:
View past syncs and any errors in Settings > Advanced > Sync History.`,
    keywords: ['sync', 'synchronize', 'update', 'refresh', 'automatic', 'manual', 'interval', 'schedule', 'data']
  },

  // Security category
  {
    id: 'security-audit-logs',
    title: 'Audit Logs',
    category: 'security',
    content: `Helios maintains comprehensive audit logs:

**What's Logged**:
- User logins and logouts
- Admin actions
- Configuration changes
- API key usage
- Sync events
- Security events

**Viewing Logs**:
Navigate to Security > Audit Logs to:
- Search by user, action, or time
- Filter by event type
- Export to CSV

**Retention**:
Logs are retained for 90 days by default. Enterprise plans support longer retention.

**Compliance**:
Audit logs help with:
- SOC 2 compliance
- Security investigations
- Access reviews
- Change management`,
    keywords: ['audit', 'logs', 'activity', 'history', 'compliance', 'tracking', 'security', 'events', 'export']
  },
  {
    id: 'security-roles',
    title: 'Roles and Permissions',
    category: 'security',
    content: `Control access with Helios roles:

**Built-in Roles**:
- **Admin**: Full access to all features
- **Manager**: View and manage their department
- **User**: Self-service access only

**Role Capabilities**:
Admins can:
- Manage all users and groups
- Configure integrations
- Access audit logs
- Manage settings

Managers can:
- View their team members
- Run department reports
- Limited bulk operations

Users can:
- View their own profile
- See their groups
- Self-service password reset

**Assigning Roles**:
Go to Settings > Roles to assign roles to platform users.`,
    keywords: ['roles', 'permissions', 'access', 'admin', 'manager', 'user', 'security', 'rbac', 'authorization']
  },
  {
    id: 'security-authentication',
    title: 'Authentication',
    category: 'security',
    content: `Helios authentication options:

**Password Authentication**:
- Email and password login
- Password requirements configurable
- Account lockout after failed attempts

**Session Management**:
- Access tokens expire after 8 hours
- Refresh tokens valid for 7 days
- Sessions tracked and can be revoked

**Two-Factor Authentication** (Coming Soon):
- TOTP authenticator apps
- SMS verification

**Single Sign-On** (Coming Soon):
- Google OAuth
- Microsoft Azure AD
- SAML 2.0

**Password Reset**:
Users can reset passwords via email link from the login page.`,
    keywords: ['login', 'password', 'authentication', 'sso', '2fa', 'mfa', 'session', 'security', 'sign in']
  }
];

/**
 * Search help content
 */
export async function searchHelp(
  query: string,
  category: string = 'all',
  limit: number = 5
): Promise<HelpSearchResult[]> {
  try {
    const normalizedQuery = query.toLowerCase().trim();
    const queryTerms = normalizedQuery.split(/\s+/);

    // Filter by category if specified
    let articlesToSearch = HELP_CONTENT;
    if (category !== 'all') {
      articlesToSearch = HELP_CONTENT.filter(a => a.category === category);
    }

    // Score each article by relevance
    const scoredArticles = articlesToSearch.map(article => {
      let score = 0;

      // Check title match (high weight)
      if (article.title.toLowerCase().includes(normalizedQuery)) {
        score += 10;
      }
      queryTerms.forEach(term => {
        if (article.title.toLowerCase().includes(term)) {
          score += 3;
        }
      });

      // Check keywords match (medium weight)
      article.keywords.forEach(keyword => {
        if (keyword.includes(normalizedQuery)) {
          score += 5;
        }
        queryTerms.forEach(term => {
          if (keyword.includes(term)) {
            score += 2;
          }
        });
      });

      // Check content match (lower weight but still important)
      const contentLower = article.content.toLowerCase();
      if (contentLower.includes(normalizedQuery)) {
        score += 3;
      }
      queryTerms.forEach(term => {
        const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
        score += Math.min(matches, 5); // Cap at 5 matches per term
      });

      return { article, score };
    });

    // Sort by score and take top results
    const results = scoredArticles
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        id: item.article.id,
        title: item.article.title,
        category: item.article.category,
        excerpt: generateExcerpt(item.article.content, queryTerms),
        relevance: item.score
      }));

    logger.debug('Help search completed', { query, category, resultsCount: results.length });

    return results;
  } catch (error) {
    logger.error('Error searching help content:', error);
    return [];
  }
}

/**
 * Get a specific help article by ID
 */
export function getHelpArticle(id: string): HelpArticle | null {
  return HELP_CONTENT.find(a => a.id === id) || null;
}

/**
 * Get all articles in a category
 */
export function getArticlesByCategory(category: string): HelpArticle[] {
  if (category === 'all') {
    return HELP_CONTENT;
  }
  return HELP_CONTENT.filter(a => a.category === category);
}

/**
 * Generate an excerpt from content highlighting query terms
 */
function generateExcerpt(content: string, queryTerms: string[], maxLength: number = 200): string {
  // Find the first paragraph that contains a query term
  const paragraphs = content.split('\n\n');
  let bestParagraph = paragraphs[0];
  let bestScore = 0;

  for (const para of paragraphs) {
    const paraLower = para.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (paraLower.includes(term)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestParagraph = para;
    }
  }

  // Clean up markdown and truncate
  let excerpt = bestParagraph
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/#{1,6}\s/g, '')
    .trim();

  if (excerpt.length > maxLength) {
    excerpt = excerpt.substring(0, maxLength).trim() + '...';
  }

  return excerpt;
}

/**
 * Execute the help search tool (MCP format)
 */
export async function executeHelpSearchTool(params: {
  query: string;
  category?: string;
  limit?: number;
}): Promise<string> {
  const results = await searchHelp(
    params.query,
    params.category || 'all',
    params.limit || 5
  );

  if (results.length === 0) {
    return `No help articles found for "${params.query}". Try different keywords or check the category.`;
  }

  let response = `Found ${results.length} help article(s) for "${params.query}":\n\n`;

  results.forEach((result, index) => {
    response += `${index + 1}. **${result.title}** (${result.category})\n`;
    response += `   ${result.excerpt}\n\n`;
  });

  response += `\nFor detailed information, ask me about any specific topic.`;

  return response;
}
