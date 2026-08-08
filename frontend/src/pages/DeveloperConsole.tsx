import { useState, useRef, useEffect } from 'react';
import { HelpCircle, BookOpen, Trash2, X, PanelLeftOpen, PanelRightOpen, ExternalLink, Minimize2, Copy, Download, Check } from 'lucide-react';
import { ConsoleHelpPanel } from '../components/ConsoleHelpPanel';
import { authFetch } from '../config/api';
import './DeveloperConsole.css';

interface ConsoleOutput {
  type: 'command' | 'success' | 'error' | 'info';
  content: string;
  timestamp: Date;
}

interface DeveloperConsoleProps {
  organizationId: string;
  isPopup?: boolean;
}

export function DeveloperConsole({ organizationId, isPopup = false }: DeveloperConsoleProps) {
  // Detect popup mode from URL params as well
  const urlParams = new URLSearchParams(window.location.search);
  const isPopupMode = isPopup || urlParams.get('mode') === 'popup';

  const [output, setOutput] = useState<ConsoleOutput[]>([
    {
      type: 'info',
      content: 'Helios Developer Console v1.0.0' + (isPopupMode ? ' (Pop-out Window)' : ''),
      timestamp: new Date()
    },
    {
      type: 'info',
      content: 'Type "help" for available commands or "examples" for usage examples.',
      timestamp: new Date()
    }
  ]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  // Dockable help panel state
  const [showHelpPanel, setShowHelpPanel] = useState(() => {
    return localStorage.getItem('helios_console_help_panel_open') === 'true';
  });
  const [helpPanelDockPosition, setHelpPanelDockPosition] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('helios_console_help_panel_dock') as 'left' | 'right') || 'right';
  });
  const [isHelpPanelPinned, setIsHelpPanelPinned] = useState(() => {
    return localStorage.getItem('helios_console_help_panel_pinned') === 'true';
  });
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new output is added
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Persist help panel settings to localStorage
  useEffect(() => {
    localStorage.setItem('helios_console_help_panel_open', showHelpPanel.toString());
  }, [showHelpPanel]);

  useEffect(() => {
    localStorage.setItem('helios_console_help_panel_dock', helpPanelDockPosition);
  }, [helpPanelDockPosition]);

  useEffect(() => {
    localStorage.setItem('helios_console_help_panel_pinned', isHelpPanelPinned.toString());
  }, [isHelpPanelPinned]);

  // Handler for inserting commands from help panel
  const handleInsertCommand = (command: string) => {
    setCurrentCommand(command);
    inputRef.current?.focus();
  };

  // Toggle help panel
  const toggleHelpPanel = () => {
    setShowHelpPanel(prev => !prev);
  };

  const addOutput = (type: ConsoleOutput['type'], content: string) => {
    setOutput(prev => [...prev, { type, content, timestamp: new Date() }]);
  };

  const downloadJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // State for copy feedback
  const [copied, setCopied] = useState(false);

  // Get console output as text
  const getConsoleText = () => {
    return output.map(item => {
      const timestamp = formatTimestamp(item.timestamp);
      return `[${timestamp}] ${item.content}`;
    }).join('\n');
  };

  // Copy console output to clipboard
  const handleCopyConsole = async () => {
    const text = getConsoleText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Download console output as text file
  const handleDownloadConsole = () => {
    const text = getConsoleText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `helios-console-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ===== PASSWORD GENERATOR (reusable) =====
  const PASSWORD_ADJECTIVES = [
    'Brave', 'Bright', 'Calm', 'Clever', 'Cool', 'Cosmic', 'Daring', 'Dynamic',
    'Epic', 'Fearless', 'Fierce', 'Flying', 'Gentle', 'Gleaming', 'Glorious', 'Golden',
    'Grand', 'Happy', 'Hardy', 'Heroic', 'Honest', 'Humble', 'Keen', 'Kind',
    'Lively', 'Lucky', 'Loyal', 'Lunar', 'Magic', 'Majestic', 'Merry', 'Mighty',
    'Mystic', 'Noble', 'Nimble', 'Ocean', 'Peaceful', 'Perfect', 'Polar', 'Proud',
    'Quick', 'Quiet', 'Radiant', 'Rapid', 'Rising', 'Royal', 'Ruby', 'Rustic',
    'Sacred', 'Serene', 'Sharp', 'Shining', 'Silent', 'Silver', 'Sky', 'Smart',
    'Solar', 'Solid', 'Sonic', 'Spark', 'Speedy', 'Spirit', 'Splash', 'Spring',
    'Starry', 'Steady', 'Storm', 'Strong', 'Summer', 'Summit', 'Super', 'Supreme',
    'Swift', 'Thunder', 'Titan', 'Topaz', 'Tranquil', 'Triumph', 'True', 'Trusty',
    'Turbo', 'Ultra', 'United', 'Valiant', 'Velvet', 'Victory', 'Vivid', 'Warm',
    'Wild', 'Wise', 'Wonder', 'Worthy', 'Zesty', 'Zen', 'Zero', 'Zoom'
  ];

  const PASSWORD_NOUNS = [
    'Anchor', 'Arrow', 'Aurora', 'Badge', 'Bear', 'Beacon', 'Birch', 'Blaze',
    'Bolt', 'Breeze', 'Bridge', 'Brook', 'Canyon', 'Castle', 'Cedar', 'Cheetah',
    'Cloud', 'Cobra', 'Comet', 'Condor', 'Coral', 'Coyote', 'Crane', 'Creek',
    'Crest', 'Crown', 'Cypress', 'Dawn', 'Deer', 'Delta', 'Diamond', 'Dolphin',
    'Dragon', 'Drift', 'Eagle', 'Echo', 'Falcon', 'Fern', 'Finch', 'Flame',
    'Flash', 'Fleet', 'Flint', 'Forest', 'Forge', 'Fox', 'Frost', 'Galaxy',
    'Glacier', 'Glider', 'Grove', 'Harbor', 'Hawk', 'Heron', 'Horizon', 'Husky',
    'Iris', 'Island', 'Jade', 'Jaguar', 'Jasper', 'Jet', 'Jewel', 'Jupiter',
    'Kelp', 'Kite', 'Lake', 'Lark', 'Leaf', 'Ledge', 'Legend', 'Leopard',
    'Light', 'Lion', 'Lotus', 'Lynx', 'Maple', 'Marble', 'Mars', 'Meadow',
    'Mesa', 'Meteor', 'Moon', 'Moose', 'Mountain', 'Neptune', 'Nova', 'Oak',
    'Oasis', 'Ocelot', 'Onyx', 'Orbit', 'Orca', 'Orion', 'Osprey', 'Otter',
    'Owl', 'Palm', 'Panther', 'Peak', 'Pearl', 'Pelican', 'Phoenix', 'Pine',
    'Planet', 'Pluto', 'Prism', 'Puma', 'Quartz', 'Quest', 'Raven', 'Reef',
    'Ridge', 'River', 'Robin', 'Rock', 'Sage', 'Saturn', 'Scout', 'Sequoia',
    'Shadow', 'Shark', 'Shore', 'Shuttle', 'Sierra', 'Slate', 'Snow', 'Sparrow',
    'Sphinx', 'Spirit', 'Spruce', 'Star', 'Stone', 'Storm', 'Stream', 'Summit',
    'Sun', 'Swan', 'Temple', 'Terra', 'Thistle', 'Thunder', 'Tiger', 'Timber',
    'Trail', 'Trout', 'Tulip', 'Tundra', 'Valley', 'Venus', 'Viper', 'Vista',
    'Voyage', 'Walrus', 'Wave', 'Whale', 'Willow', 'Wind', 'Wolf', 'Wren',
    'Zenith', 'Zephyr'
  ];

  const generateMemorablePassword = () => {
    const adj = PASSWORD_ADJECTIVES[Math.floor(Math.random() * PASSWORD_ADJECTIVES.length)];
    const noun = PASSWORD_NOUNS[Math.floor(Math.random() * PASSWORD_NOUNS.length)];
    const num = Math.floor(Math.random() * 900) + 100; // 100-999
    return `${adj}${noun}#${num}`;
  };

  // Store initial passwords for newly created users
  // Persisted to backend API, with local state for session display
  const [initialPasswords, setInitialPasswords] = useState<Record<string, { password: string; createdAt: Date; revealed: boolean }>>({});

  const storeInitialPassword = async (email: string, password: string) => {
    // Store locally for immediate display
    setInitialPasswords(prev => ({
      ...prev,
      [email.toLowerCase()]: { password, createdAt: new Date(), revealed: false }
    }));

    // Persist to backend API (fire and forget, errors logged but not blocking)
    try {
      await authFetch('/api/v1/initial-passwords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
    } catch (err) {
      console.warn('Failed to persist initial password to backend:', err);
    }
  };

  const revealInitialPassword = (email: string): { password: string; createdAt: Date } | null => {
    const entry = initialPasswords[email.toLowerCase()];
    if (entry) {
      setInitialPasswords(prev => ({
        ...prev,
        [email.toLowerCase()]: { ...entry, revealed: true }
      }));
      return { password: entry.password, createdAt: entry.createdAt };
    }
    return null;
  };

  const clearInitialPassword = async (email: string) => {
    // Clear locally
    setInitialPasswords(prev => {
      const updated = { ...prev };
      delete updated[email.toLowerCase()];
      return updated;
    });

    // Clear from backend API
    try {
      await authFetch(`/api/v1/initial-passwords/${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('Failed to clear initial password from backend:', err);
    }
  };

  const getOrganizationId = (): string | null => {
    return organizationId;
  };

  const apiRequest = async (method: string, path: string, body?: any): Promise<any> => {
    const headers: Record<string, string> = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await authFetch(`${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    // Handle empty responses (like DELETE 204 No Content)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return null; // No content to parse
    }

    const data = await response.json();
    if (!response.ok) {
      // Handle various error response formats
      let errorMessage = `HTTP ${response.status}`;

      if (typeof data.error === 'string') {
        // Simple string error
        errorMessage = data.error;
      } else if (data.error?.message) {
        // Google API style: { error: { code: 400, message: "..." } }
        errorMessage = data.error.message;
        if (data.error.code) {
          errorMessage = `[${data.error.code}] ${errorMessage}`;
        }
      } else if (data.message) {
        // Simple message field
        errorMessage = data.message;
      } else if (typeof data.error === 'object') {
        // Unknown object error - stringify it
        errorMessage = JSON.stringify(data.error);
      }

      throw new Error(errorMessage);
    }
    return data;
  };

  // Log command execution to audit log (fire-and-forget)
  const logCommandToAudit = async (
    command: string,
    durationMs: number,
    resultStatus: 'success' | 'error',
    errorMessage?: string
  ) => {
    try {
      // Fire and forget - don't await or block on audit logging
      authFetch('/api/v1/organization/audit-logs/console', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command,
          durationMs,
          resultStatus,
          errorMessage
        })
      }).catch(() => {
        // Silently ignore audit logging failures
      });
    } catch {
      // Silently ignore audit logging failures
    }
  };

  const executeCommand = async (command: string) => {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) return;

    // Add command to output
    addOutput('command', `$ ${trimmedCommand}`);

    // Add to history
    setCommandHistory(prev => [...prev, trimmedCommand]);
    setHistoryIndex(-1);

    setIsExecuting(true);
    const startTime = Date.now();
    let resultStatus: 'success' | 'error' = 'success';
    let errorMessage: string | undefined;

    try {
      // Handle built-in commands (don't audit these)
      if (trimmedCommand === 'help') {
        showHelp();
        return; // Skip audit for help
      } else if (trimmedCommand === 'examples') {
        showExamples();
        return; // Skip audit for examples
      } else if (trimmedCommand === 'clear') {
        setOutput([]);
        return; // Skip audit for clear
      } else {
        // Auto-prepend "helios" if command starts with a known module or verb
        const knownModules = ['api', 'gw', 'google-workspace', 'users', 'groups', 'ms', 'microsoft'];
        const knownVerbs = ['create', 'list', 'get', 'update', 'delete', 'generate', 'set', 'show', 'sync', 'export'];
        const firstWord = trimmedCommand.split(' ')[0];

        let commandToExecute = trimmedCommand;
        if (!trimmedCommand.startsWith('helios ') && (knownModules.includes(firstWord) || knownVerbs.includes(firstWord))) {
          commandToExecute = `helios ${trimmedCommand}`;
        }

        if (commandToExecute.startsWith('helios ')) {
          await executeHeliosCommand(commandToExecute);
        } else {
          resultStatus = 'error';
          errorMessage = `Unknown command: ${trimmedCommand}`;
          addOutput('error', `Unknown command: ${trimmedCommand}. Type "help" for available commands.`);
        }
      }
    } catch (error: any) {
      resultStatus = 'error';
      errorMessage = error.message;
      addOutput('error', `Error: ${error.message}`);
    } finally {
      const durationMs = Date.now() - startTime;

      // Log command to audit trail (fire-and-forget)
      logCommandToAudit(trimmedCommand, durationMs, resultStatus, errorMessage);

      setIsExecuting(false);
      // Re-focus input after command completes
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const executeHeliosCommand = async (command: string) => {
    try {
      // Parse command: helios <verb> <resource> [args] OR helios <module> <resource> <action> [args]
      const parts = command.split(' ').filter(p => p);
      parts.shift(); // Remove 'helios'

      if (parts.length === 0) {
        addOutput('error', 'Usage: <verb> <resource> [options]');
        addOutput('info', 'Examples: create user, list users, get user john@company.com');
        return;
      }

      const firstWord = parts[0];

      // ===== VERB-FIRST COMMANDS (Primary Pattern) =====
      // create user, list users, get user, update user, delete user
      // create group, list groups, get group, delete group
      // generate password, export users, sync gw

      switch (firstWord) {
        // ----- CREATE -----
        case 'create': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'user':
              await handleCreateUser(args);
              break;
            case 'group':
              await handleCreateGroup(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: create user, create group`);
          }
          return;
        }

        // ----- LIST -----
        case 'list': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'users':
              await handleListUsers(args);
              break;
            case 'groups':
              await handleListGroups(args);
              break;
            case '2fa':
              await handleList2FA(args);
              break;
            case 'tokens':
              await handleListTokens(args);
              break;
            case 'audit':
            case 'audit-logs':
              await handleListAuditLogs(args);
              break;
            case 'licenses':
              await handleListLicenses(args);
              break;
            case 'logins':
            case 'login-activity':
              await handleListLoginActivity(args);
              break;
            case 'buildings':
              await handleListBuildings(args);
              break;
            case 'resources':
            case 'rooms':
              await handleListResources(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: list users, groups, 2fa, tokens, audit-logs, licenses, logins, buildings, rooms`);
          }
          return;
        }

        // ----- GET -----
        case 'get': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'user':
              await handleGetUser(args);
              break;
            case 'group':
              await handleGetGroup(args);
              break;
            case '2fa':
              await handleGet2FA(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: get user <email>, get group <email>, get 2fa <email>`);
          }
          return;
        }

        // ----- REVOKE -----
        case 'revoke': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'token':
              await handleRevokeToken(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: revoke token <email> <clientId>`);
          }
          return;
        }

        // ----- UPDATE -----
        case 'update': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'user':
              await handleUpdateUser(args);
              break;
            case 'group':
              await handleUpdateGroup(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: update user, update group`);
          }
          return;
        }

        // ----- DELETE -----
        case 'delete': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'user':
              await handleDeleteUser(args);
              break;
            case 'group':
              await handleDeleteGroup(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: delete user, delete group`);
          }
          return;
        }

        // ----- GENERATE -----
        case 'generate': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'password':
            case 'pwd':
              handlePasswordCommand(['generate', ...args]);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: generate password`);
          }
          return;
        }

        // ----- EXPORT -----
        case 'export': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'users':
              await handleExportUsers(args);
              break;
            case 'groups':
              await handleExportGroups(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: export users, export groups`);
          }
          return;
        }

        // ----- SYNC -----
        case 'sync': {
          const platform = parts[1];
          const args = parts.slice(2);
          switch (platform) {
            case 'gw':
            case 'google':
              await handleSyncGoogleWorkspace(args);
              break;
            case 'm365':
            case 'microsoft':
              addOutput('info', 'Microsoft 365 sync coming soon...');
              break;
            default:
              addOutput('error', `Unknown platform: ${platform}. Use: sync gw, sync m365`);
          }
          return;
        }

        // ----- SHOW (for initial-password, etc.) -----
        case 'show': {
          const resource = parts[1];
          const args = parts.slice(2);
          switch (resource) {
            case 'initial-password':
            case 'password':
              await handleShowInitialPassword(args);
              break;
            default:
              addOutput('error', `Unknown resource: ${resource}. Use: show initial-password <email>`);
          }
          return;
        }
      }

      // ===== LEGACY MODULE-BASED COMMANDS =====
      // Still support: gw, api, etc. but show deprecation for user CRUD

      switch (firstWord) {
        case 'api':
          await handleApiCommand(parts.slice(1));
          break;
        case 'password':
        case 'pwd':
          handlePasswordCommand(parts.slice(1));
          break;
        case 'gw':
        case 'google-workspace':
          await handleGoogleWorkspaceCommand(parts.slice(1));
          break;
        case 'm365':
        case 'microsoft-365':
          await handleMicrosoft365Command(parts.slice(1));
          break;
        case 'users':
          // Deprecation notice
          addOutput('info', '💡 Tip: Use "list users", "create user", "get user" instead of "users list/create/get"');
          await handleUsersCommand(parts.slice(1));
          break;
        case 'groups':
          // Deprecation notice
          addOutput('info', '💡 Tip: Use "list groups", "create group" instead of "groups list/create"');
          await handleGroupsCommand(parts.slice(1));
          break;
        default:
          addOutput('error', `Unknown command: ${firstWord}`);
          addOutput('info', 'Available commands: create, list, get, update, delete, generate, export, sync');
          addOutput('info', 'Platform commands: gw <command>, api <method> <path>');
      }
    } catch (error: any) {
      addOutput('error', `Command failed: ${error.message}`);
    }
  };

  // =============================================================================
  // VERB-FIRST COMMAND HANDLERS (Primary Pattern)
  // =============================================================================

  // ===== CREATE USER =====
  const handleCreateUser = async (args: string[]) => {
    if (args.length < 1) {
      addOutput('error', 'Usage: create user <email> --firstName=<name> --lastName=<name> [options]');
      addOutput('info', '');
      addOutput('info', 'Options:');
      addOutput('info', '  --firstName=X       First name (required)');
      addOutput('info', '  --lastName=Y        Last name (required)');
      addOutput('info', '  --password=auto     Auto-generate memorable password (AdjectiveNoun#XXX)');
      addOutput('info', '  --password=<pwd>    Set specific password');
      addOutput('info', '  --department=X      Department name');
      addOutput('info', '  --jobTitle=X        Job title');
      addOutput('info', '  --role=user|manager|admin  Role (default: user)');
      addOutput('info', '  --gw                Also create in Google Workspace');
      addOutput('info', '  --m365              Also create in Microsoft 365');
      addOutput('info', '  --ou=/Path          Organizational unit (for Google/M365)');
      addOutput('info', '');
      addOutput('info', 'Examples:');
      addOutput('info', '  create user john@company.com --firstName=John --lastName=Doe --password=auto');
      addOutput('info', '  create user john@company.com --firstName=John --lastName=Doe --password=auto --gw --ou=/Staff');
      return;
    }

    const email = args[0];
    const params = parseArgs(args.slice(1));

    if (!params.firstName || !params.lastName) {
      addOutput('error', 'Required: --firstName and --lastName');
      return;
    }

    // Handle password
    let password = params.password;
    let isAutoGenerated = false;
    if (password === 'auto' || password === '') {
      password = generateMemorablePassword();
      isAutoGenerated = true;
    }

    const createInGoogle = params.gw !== undefined || params.google !== undefined;
    const createInM365 = params.m365 !== undefined || params.microsoft !== undefined;

    // Step 1: Create user in Helios
    addOutput('info', `Creating user in Helios: ${email}`);

    const heliosBody: any = {
      email,
      firstName: params.firstName,
      lastName: params.lastName,
      department: params.department || null,
      jobTitle: params.jobTitle || null,
      role: params.role || 'user',
      userType: (createInGoogle || createInM365) ? 'synced' : 'local'
    };

    if (password) {
      heliosBody.password = password;
    }

    try {
      const heliosResult = await apiRequest('POST', '/api/v1/organization/users', heliosBody);

      if (heliosResult.success) {
        addOutput('success', `  ✓ Created in Helios`);

        if (isAutoGenerated && password) {
          await storeInitialPassword(email, password);
        }

        // Step 2: Create in Google Workspace if requested
        if (createInGoogle) {
          addOutput('info', `Creating user in Google Workspace...`);
          try {
            const gwBody = {
              primaryEmail: email,
              name: { givenName: params.firstName, familyName: params.lastName },
              password: password || generateMemorablePassword(),
              orgUnitPath: params.ou || '/',
              changePasswordAtNextLogin: true
            };
            await apiRequest('POST', '/api/google/admin/directory/v1/users', gwBody);
            addOutput('success', `  ✓ Created in Google Workspace`);
          } catch (gwError: any) {
            addOutput('error', `  ✗ Google Workspace: ${gwError.message}`);
          }
        }

        // Step 3: Create in M365 if requested
        if (createInM365) {
          addOutput('info', `Creating user in Microsoft 365...`);
          addOutput('info', `  (M365 provisioning not yet implemented)`);
        }

        // Summary
        addOutput('info', '');
        addOutput('success', `User created: ${email}`);

        if (isAutoGenerated && password) {
          addOutput('info', '');
          addOutput('info', 'Initial Password (auto-generated):');
          addOutput('info', '='.repeat(50));
          addOutput('success', `  ${password}`);
          addOutput('info', '='.repeat(50));
          addOutput('info', '');
          addOutput('info', 'To retrieve later: show initial-password ' + email);
        }

        const platforms = ['Helios'];
        if (createInGoogle) platforms.push('Google Workspace');
        if (createInM365) platforms.push('Microsoft 365');
        addOutput('info', `Platforms: ${platforms.join(', ')}`);

      } else {
        addOutput('error', `Failed to create user: ${heliosResult.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      addOutput('error', `Failed to create user: ${error.message}`);
    }
  };

  // ===== LIST USERS =====
  const handleListUsers = async (args: string[]) => {
    const params = parseArgs(args);
    const status = params.status || 'all';
    const filter = params.filter;

    let url = `/api/v1/organization/users?status=${status}`;
    const data = await apiRequest('GET', url);

    if (data.success) {
      let users = data.data;

      // Apply filter if provided
      if (filter) {
        const filterLower = filter.toLowerCase();
        let filterField = 'email';
        let filterValue = filterLower;

        if (filter.includes(':')) {
          const [field, ...valueParts] = filter.split(':');
          filterField = field.toLowerCase();
          filterValue = valueParts.join(':').toLowerCase();
        }

        const pattern = filterValue.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}`, 'i');

        users = users.filter((u: any) => {
          const email = (u.email || '').toLowerCase();
          const dept = (u.department || '').toLowerCase();
          const uStatus = (u.status || 'active').toLowerCase();

          switch (filterField) {
            case 'email': return regex.test(email);
            case 'department': case 'dept': return dept.includes(filterValue) || regex.test(dept);
            case 'status': return uStatus === filterValue;
            default: return regex.test(email);
          }
        });
      }

      const output = users.map((u: any) => {
        const email = (u.email || '').padEnd(30);
        const firstName = (u.firstName || u.first_name || '').substring(0, 15).padEnd(15);
        const lastName = (u.lastName || u.last_name || '').substring(0, 15).padEnd(15);
        const platforms = u.platforms || [];
        let platformStr = 'Local';
        if (platforms.includes('google_workspace') && platforms.includes('microsoft_365')) {
          platformStr = 'GW, M365';
        } else if (platforms.includes('google_workspace')) {
          platformStr = 'GW';
        } else if (platforms.includes('microsoft_365')) {
          platformStr = 'M365';
        }
        const platformDisplay = platformStr.padEnd(12);
        const statusDisplay = (u.status || 'active').padEnd(10);
        return `${email} ${firstName} ${lastName} ${platformDisplay} ${statusDisplay}`;
      }).join('\n');

      addOutput('success', `\nEMAIL${' '.repeat(25)}FIRST NAME${' '.repeat(5)}LAST NAME${' '.repeat(6)}PLATFORMS    STATUS\n${'='.repeat(90)}\n${output}`);
      addOutput('info', `\nTotal: ${users.length} user(s)`);
    }
  };

  // ===== GET USER =====
  const handleGetUser = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: get user <email>');
      return;
    }
    const email = args[0];
    try {
      const data = await apiRequest('GET', `/api/v1/organization/users?email=${encodeURIComponent(email)}`);
      if (data.success && data.data && data.data.length > 0) {
        const user = data.data[0];
        addOutput('info', '');
        addOutput('info', `User: ${user.email}`);
        addOutput('info', '='.repeat(60));
        addOutput('info', `  Name: ${user.firstName || ''} ${user.lastName || ''}`);
        addOutput('info', `  Role: ${user.role || 'user'}`);
        addOutput('info', `  Status: ${user.status || 'active'}`);
        addOutput('info', `  Department: ${user.department || '-'}`);
        addOutput('info', `  Job Title: ${user.jobTitle || '-'}`);
        addOutput('info', `  Platforms: ${(user.platforms || ['Local']).join(', ')}`);
        addOutput('info', `  Created: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : '-'}`);
        addOutput('info', '='.repeat(60));
      } else {
        addOutput('error', `User not found: ${email}`);
      }
    } catch (error: any) {
      addOutput('error', `Failed to get user: ${error.message}`);
    }
  };

  // ===== UPDATE USER =====
  const handleUpdateUser = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: update user <email> [options]');
      addOutput('info', '');
      addOutput('info', 'Options:');
      addOutput('info', '  --firstName=X       Update first name');
      addOutput('info', '  --lastName=Y        Update last name');
      addOutput('info', '  --department=X      Update department');
      addOutput('info', '  --jobTitle=X        Update job title');
      addOutput('info', '  --role=user|manager|admin  Update role');
      return;
    }
    const email = args[0];
    const params = parseArgs(args.slice(1));

    const body: any = {};
    if (params.firstName) body.firstName = params.firstName;
    if (params.lastName) body.lastName = params.lastName;
    if (params.department) body.department = params.department;
    if (params.jobTitle) body.jobTitle = params.jobTitle;
    if (params.role) body.role = params.role;

    if (Object.keys(body).length === 0) {
      addOutput('error', 'No fields to update. Use --firstName, --lastName, --department, --jobTitle, or --role');
      return;
    }

    try {
      await apiRequest('PATCH', `/api/v1/organization/users/by-email/${encodeURIComponent(email)}`, body);
      addOutput('success', `User updated: ${email}`);
    } catch (error: any) {
      addOutput('error', `Failed to update user: ${error.message}`);
    }
  };

  // ===== DELETE USER =====
  const handleDeleteUser = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: delete user <email> [--gw] [--confirm]');
      addOutput('info', '  --gw       Also delete from Google Workspace');
      addOutput('info', '  --confirm  Skip confirmation prompt');
      return;
    }
    const email = args[0];
    const params = parseArgs(args.slice(1));
    const deleteFromGW = params.gw !== undefined;
    const confirmed = params.confirm !== undefined;

    if (!confirmed) {
      addOutput('error', `This will delete user ${email}. Add --confirm to proceed.`);
      return;
    }

    try {
      // Delete from Helios
      await apiRequest('DELETE', `/api/v1/organization/users/by-email/${encodeURIComponent(email)}`);
      addOutput('success', `  ✓ Deleted from Helios: ${email}`);

      // Delete from Google Workspace if requested
      if (deleteFromGW) {
        try {
          await apiRequest('DELETE', `/api/google/admin/directory/v1/users/${email}`);
          addOutput('success', `  ✓ Deleted from Google Workspace`);
        } catch (gwError: any) {
          addOutput('error', `  ✗ Google Workspace: ${gwError.message}`);
        }
      }

      addOutput('info', '');
      addOutput('success', `User deleted: ${email}`);
    } catch (error: any) {
      addOutput('error', `Failed to delete user: ${error.message}`);
    }
  };

  // ===== CREATE GROUP =====
  const handleCreateGroup = async (args: string[]) => {
    if (args.length < 1) {
      addOutput('error', 'Usage: create group <email> --name="Group Name" [options]');
      addOutput('info', '');
      addOutput('info', 'Options:');
      addOutput('info', '  --name=X            Group name (required)');
      addOutput('info', '  --description=X     Group description');
      addOutput('info', '  --gw                Also create in Google Workspace');
      return;
    }
    const email = args[0];
    const params = parseArgs(args.slice(1));

    if (!params.name) {
      addOutput('error', 'Required: --name="Group Name"');
      return;
    }

    const createInGoogle = params.gw !== undefined;

    // Create in Helios
    addOutput('info', `Creating group in Helios: ${email}`);
    try {
      await apiRequest('POST', '/api/v1/organization/groups', {
        email,
        name: params.name,
        description: params.description || ''
      });
      addOutput('success', `  ✓ Created in Helios`);

      if (createInGoogle) {
        addOutput('info', `Creating group in Google Workspace...`);
        try {
          await apiRequest('POST', '/api/google/admin/directory/v1/groups', {
            email,
            name: params.name,
            description: params.description || ''
          });
          addOutput('success', `  ✓ Created in Google Workspace`);
        } catch (gwError: any) {
          addOutput('error', `  ✗ Google Workspace: ${gwError.message}`);
        }
      }

      addOutput('info', '');
      addOutput('success', `Group created: ${email}`);
    } catch (error: any) {
      addOutput('error', `Failed to create group: ${error.message}`);
    }
  };

  // ===== LIST GROUPS =====
  const handleListGroups = async (_args: string[]) => {
    // Future: support --source=all|helios|gw filtering with parseArgs(_args)

    try {
      // Get Helios groups
      const data = await apiRequest('GET', '/api/v1/organization/groups');
      if (data.success && data.data) {
        const groups = data.data.map((g: any) => {
          const email = (g.email || '').padEnd(35);
          const name = (g.name || '').substring(0, 30).padEnd(31);
          const memberCount = String(g.memberCount || 0).padEnd(8);
          return `${email} ${name} ${memberCount}`;
        }).join('\n');
        addOutput('success', `\nEMAIL${' '.repeat(30)}NAME${' '.repeat(27)}MEMBERS\n${'='.repeat(80)}\n${groups}`);
        addOutput('info', `\nTotal: ${data.data.length} group(s)`);
      } else {
        addOutput('info', 'No groups found');
      }
    } catch (error: any) {
      addOutput('error', `Failed to list groups: ${error.message}`);
    }
  };

  // ===== GET GROUP =====
  const handleGetGroup = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: get group <email>');
      return;
    }
    const email = args[0];
    try {
      const data = await apiRequest('GET', `/api/v1/organization/groups/${encodeURIComponent(email)}`);
      if (data.success && data.data) {
        const group = data.data;
        addOutput('info', '');
        addOutput('info', `Group: ${group.email}`);
        addOutput('info', '='.repeat(60));
        addOutput('info', `  Name: ${group.name || '-'}`);
        addOutput('info', `  Description: ${group.description || '-'}`);
        addOutput('info', `  Members: ${group.memberCount || 0}`);
        addOutput('info', '='.repeat(60));
      } else {
        addOutput('error', `Group not found: ${email}`);
      }
    } catch (error: any) {
      addOutput('error', `Failed to get group: ${error.message}`);
    }
  };

  // ===== UPDATE GROUP =====
  const handleUpdateGroup = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: update group <email> --name="New Name" [--description="..."]');
      return;
    }
    const email = args[0];
    const params = parseArgs(args.slice(1));

    const body: any = {};
    if (params.name) body.name = params.name;
    if (params.description) body.description = params.description;

    if (Object.keys(body).length === 0) {
      addOutput('error', 'No fields to update. Use --name or --description');
      return;
    }

    try {
      await apiRequest('PATCH', `/api/v1/organization/groups/${encodeURIComponent(email)}`, body);
      addOutput('success', `Group updated: ${email}`);
    } catch (error: any) {
      addOutput('error', `Failed to update group: ${error.message}`);
    }
  };

  // ===== DELETE GROUP =====
  const handleDeleteGroup = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: delete group <email> [--gw] [--confirm]');
      return;
    }
    const email = args[0];
    const params = parseArgs(args.slice(1));
    const deleteFromGW = params.gw !== undefined;
    const confirmed = params.confirm !== undefined;

    if (!confirmed) {
      addOutput('error', `This will delete group ${email}. Add --confirm to proceed.`);
      return;
    }

    try {
      await apiRequest('DELETE', `/api/v1/organization/groups/${encodeURIComponent(email)}`);
      addOutput('success', `  ✓ Deleted from Helios: ${email}`);

      if (deleteFromGW) {
        try {
          await apiRequest('DELETE', `/api/google/admin/directory/v1/groups/${email}`);
          addOutput('success', `  ✓ Deleted from Google Workspace`);
        } catch (gwError: any) {
          addOutput('error', `  ✗ Google Workspace: ${gwError.message}`);
        }
      }

      addOutput('success', `Group deleted: ${email}`);
    } catch (error: any) {
      addOutput('error', `Failed to delete group: ${error.message}`);
    }
  };

  // ===== EXPORT USERS =====
  const handleExportUsers = async (args: string[]) => {
    const params = parseArgs(args);
    const format = params.format || 'csv';

    addOutput('info', 'Exporting users...');

    try {
      const data = await apiRequest('GET', '/api/v1/organization/users?status=all');
      if (data.success && data.data) {
        const users = data.data;

        if (format === 'csv') {
          const headers = ['Email', 'First Name', 'Last Name', 'Department', 'Job Title', 'Role', 'Status', 'Platforms'];
          const rows = users.map((u: any) => [
            u.email || '',
            u.firstName || '',
            u.lastName || '',
            u.department || '',
            u.jobTitle || '',
            u.role || 'user',
            u.status || 'active',
            (u.platforms || []).join(';')
          ]);

          const csv = [headers.join(','), ...rows.map((r: string[]) => r.map(v => `"${v}"`).join(','))].join('\n');

          // Download CSV
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          addOutput('success', `Exported ${users.length} users to CSV`);
        } else if (format === 'json') {
          downloadJSON(users, `users-export-${new Date().toISOString().slice(0, 10)}.json`);
          addOutput('success', `Exported ${users.length} users to JSON`);
        }
      }
    } catch (error: any) {
      addOutput('error', `Failed to export users: ${error.message}`);
    }
  };

  // ===== EXPORT GROUPS =====
  const handleExportGroups = async (args: string[]) => {
    const params = parseArgs(args);
    const format = params.format || 'csv';

    addOutput('info', 'Exporting groups...');

    try {
      const data = await apiRequest('GET', '/api/v1/organization/groups');
      if (data.success && data.data) {
        const groups = data.data;

        if (format === 'csv') {
          const headers = ['Email', 'Name', 'Description', 'Member Count'];
          const rows = groups.map((g: any) => [
            g.email || '',
            g.name || '',
            g.description || '',
            String(g.memberCount || 0)
          ]);

          const csv = [headers.join(','), ...rows.map((r: string[]) => r.map(v => `"${v}"`).join(','))].join('\n');

          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `groups-export-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          addOutput('success', `Exported ${groups.length} groups to CSV`);
        } else if (format === 'json') {
          downloadJSON(groups, `groups-export-${new Date().toISOString().slice(0, 10)}.json`);
          addOutput('success', `Exported ${groups.length} groups to JSON`);
        }
      }
    } catch (error: any) {
      addOutput('error', `Failed to export groups: ${error.message}`);
    }
  };

  // ===== SYNC GOOGLE WORKSPACE =====
  const handleSyncGoogleWorkspace = async (_args: string[]) => {
    addOutput('info', 'Starting Google Workspace sync...');
    try {
      const result = await apiRequest('POST', '/api/v1/google-workspace/sync');
      if (result.success) {
        addOutput('success', 'Sync completed successfully');
        addOutput('info', `  Users synced: ${result.data?.usersCreated || 0} created, ${result.data?.usersUpdated || 0} updated`);
      } else {
        addOutput('error', `Sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      addOutput('error', `Sync failed: ${error.message}`);
    }
  };

  // ===== SHOW INITIAL PASSWORD =====
  const handleShowInitialPassword = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: show initial-password <email>');
      return;
    }
    const email = args[0];

    // Try local state first
    let entry = revealInitialPassword(email);

    // If not in local state, try fetching from backend API
    if (!entry) {
      try {
        const response = await authFetch(`/api/v1/initial-passwords/${encodeURIComponent(email)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            entry = {
              password: data.data.password,
              createdAt: new Date(data.data.createdAt)
            };
            setInitialPasswords(prev => ({
              ...prev,
              [email.toLowerCase()]: { ...entry!, revealed: true }
            }));
          }
        }
      } catch (err) {
        // Silent fail
      }
    }

    if (entry) {
      addOutput('info', '');
      addOutput('info', `Initial Password for ${email}`);
      addOutput('info', '='.repeat(50));
      addOutput('success', `  ${entry.password}`);
      addOutput('info', '='.repeat(50));
      addOutput('info', `Created: ${entry.createdAt.toLocaleString()}`);
    } else {
      addOutput('error', `No initial password stored for ${email}`);
    }
  };

  // =============================================================================
  // SECURITY COMMAND HANDLERS (2FA status, OAuth tokens)
  // =============================================================================

  // ===== LIST 2FA STATUS =====
  const handleList2FA = async (args: string[]) => {
    try {
      addOutput('info', 'Fetching 2FA status for all users...');

      const response = await authFetch('/api/v1/security/2fa-status');
      if (!response.ok) {
        throw new Error('Failed to fetch 2FA status');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch 2FA status');
      }

      const summary = data.data.summary;
      const users = data.data.users || [];

      // Parse filter args
      const enrolledOnly = args.includes('--enrolled');
      const notEnrolledOnly = args.includes('--not-enrolled');
      const enforcedOnly = args.includes('--enforced');

      addOutput('info', '');
      addOutput('info', '2FA Status Summary');
      addOutput('info', '═'.repeat(60));
      addOutput('info', `  Total Users:        ${summary.total_users}`);
      addOutput('success', `  2FA Enrolled:       ${summary.enrolled_count} (${summary.enrollment_rate}%)`);
      addOutput('info', `  2FA Enforced:       ${summary.enforced_count}`);
      addOutput('error', `  Not Enrolled:       ${summary.not_enrolled_count}`);
      addOutput('info', '═'.repeat(60));
      addOutput('info', '');

      // Filter users based on args
      let filteredUsers = users;
      if (enrolledOnly) {
        filteredUsers = users.filter((u: { is_enrolled_in_2sv: boolean }) => u.is_enrolled_in_2sv);
        addOutput('info', 'Showing only enrolled users:');
      } else if (notEnrolledOnly) {
        filteredUsers = users.filter((u: { is_enrolled_in_2sv: boolean }) => !u.is_enrolled_in_2sv);
        addOutput('info', 'Showing users NOT enrolled in 2FA:');
      } else if (enforcedOnly) {
        filteredUsers = users.filter((u: { is_enforced_in_2sv: boolean }) => u.is_enforced_in_2sv);
        addOutput('info', 'Showing users with 2FA enforced:');
      } else {
        addOutput('info', 'User 2FA Status:');
      }

      addOutput('info', '─'.repeat(60));

      if (filteredUsers.length === 0) {
        addOutput('info', '  No users match the filter criteria');
      } else {
        for (const user of filteredUsers.slice(0, 50)) { // Limit to 50
          const status = user.is_enrolled_in_2sv ? '✓ Enrolled' : '✗ Not Enrolled';
          const enforced = user.is_enforced_in_2sv ? ' [Enforced]' : '';
          const statusType = user.is_enrolled_in_2sv ? 'success' : 'error';
          addOutput(statusType, `  ${user.primary_email.padEnd(35)} ${status}${enforced}`);
        }
        if (filteredUsers.length > 50) {
          addOutput('info', `  ... and ${filteredUsers.length - 50} more users`);
        }
      }

      addOutput('info', '');
      addOutput('info', 'Filters: --enrolled, --not-enrolled, --enforced');
      addOutput('info', 'Get details: get 2fa <email>');
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch 2FA status'}`);
    }
  };

  // ===== LIST OAUTH TOKENS/APPS =====
  const handleListTokens = async (args: string[]) => {
    try {
      // Check for --user filter
      const userIndex = args.indexOf('--user');
      const userEmail = userIndex >= 0 && args[userIndex + 1] ? args[userIndex + 1] : null;

      if (userEmail) {
        // List tokens for specific user
        addOutput('info', `Fetching OAuth tokens for ${userEmail}...`);

        const response = await authFetch(`/api/v1/security/users/${encodeURIComponent(userEmail)}/oauth-tokens`);
        if (!response.ok) {
          throw new Error('Failed to fetch user tokens');
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch user tokens');
        }

        const tokens = data.data || [];

        addOutput('info', '');
        addOutput('info', `OAuth Tokens for ${userEmail}`);
        addOutput('info', '═'.repeat(70));

        if (tokens.length === 0) {
          addOutput('info', '  No OAuth tokens found for this user');
        } else {
          for (const token of tokens) {
            const riskColor = token.risk_level === 'high' ? 'error' :
                              token.risk_level === 'medium' ? 'info' : 'success';
            addOutput('info', `  ${token.display_text || token.client_id}`);
            addOutput(riskColor, `    Risk: ${token.risk_level?.toUpperCase() || 'UNKNOWN'}`);
            addOutput('info', `    Scopes: ${token.scopes?.slice(0, 3).join(', ')}${token.scopes?.length > 3 ? '...' : ''}`);
            addOutput('info', '');
          }
        }

        addOutput('info', 'To revoke: revoke token <email> <clientId>');
      } else {
        // List all OAuth apps across organization
        addOutput('info', 'Fetching OAuth apps across organization...');

        const response = await authFetch('/api/v1/security/oauth-apps');
        if (!response.ok) {
          throw new Error('Failed to fetch OAuth apps');
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch OAuth apps');
        }

        const apps = data.data || [];

        // Parse filter args
        const highRiskOnly = args.includes('--high-risk');

        let filteredApps = apps;
        if (highRiskOnly) {
          filteredApps = apps.filter((a: { risk_level: string }) => a.risk_level === 'high');
        }

        addOutput('info', '');
        addOutput('info', 'OAuth Apps in Organization');
        addOutput('info', '═'.repeat(70));
        addOutput('info', `  Total Apps: ${apps.length}`);
        addOutput('info', '─'.repeat(70));
        addOutput('info', '');

        if (filteredApps.length === 0) {
          addOutput('info', '  No OAuth apps found');
        } else {
          // Sort by user count descending
          filteredApps.sort((a: { user_count: number }, b: { user_count: number }) => b.user_count - a.user_count);

          for (const app of filteredApps.slice(0, 30)) { // Limit to 30
            const riskColor = app.risk_level === 'high' ? 'error' :
                              app.risk_level === 'medium' ? 'info' : 'success';
            const appName = (app.display_text || app.client_id).substring(0, 40);
            addOutput('info', `  ${appName.padEnd(42)} ${String(app.user_count).padStart(3)} users`);
            addOutput(riskColor, `    Risk: ${app.risk_level?.toUpperCase() || 'UNKNOWN'}`);
          }
          if (filteredApps.length > 30) {
            addOutput('info', `  ... and ${filteredApps.length - 30} more apps`);
          }
        }

        addOutput('info', '');
        addOutput('info', 'Filters: --high-risk, --user <email>');
      }
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch tokens'}`);
    }
  };

  // ===== LIST AUDIT LOGS =====
  const handleListAuditLogs = async (args: string[]) => {
    try {
      const params = parseArgs(args);
      const limit = params.limit || 50;
      const action = params.action || '';
      const user = params.user || '';

      addOutput('info', 'Fetching audit logs...');

      let endpoint = `/api/v1/organization/audit-logs?limit=${limit}`;
      if (action) endpoint += `&action=${encodeURIComponent(action)}`;
      if (user) endpoint += `&actor=${encodeURIComponent(user)}`;

      const data = await apiRequest('GET', endpoint);

      if (data.success && data.data?.logs) {
        const logs = data.data.logs;

        addOutput('info', '');
        addOutput('info', 'Audit Logs');
        addOutput('info', '═'.repeat(100));
        addOutput('info', `TIMESTAMP${' '.repeat(14)}ACTION${' '.repeat(20)}ACTOR${' '.repeat(25)}OUTCOME`);
        addOutput('info', '─'.repeat(100));

        if (logs.length === 0) {
          addOutput('info', '  No audit logs found');
        } else {
          for (const log of logs) {
            const timestamp = new Date(log.timestamp).toLocaleString().padEnd(22);
            const action = (log.action || 'unknown').substring(0, 25).padEnd(26);
            const actor = (log.actor_email || log.actor_identifier || 'system').substring(0, 28).padEnd(30);
            const outcome = log.outcome || 'unknown';
            const outcomeType = outcome === 'success' ? 'success' : 'error';
            addOutput(outcomeType, `${timestamp}${action}${actor}${outcome}`);
          }
        }

        addOutput('info', '');
        addOutput('info', `Showing ${logs.length} of ${data.data.total || logs.length} logs`);
        addOutput('info', 'Filters: --limit=N, --action=<action>, --user=<email>');
        addOutput('info', 'Export: Use Audit Logs page for CSV export');
      } else {
        addOutput('error', 'Failed to fetch audit logs');
      }
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch audit logs'}`);
    }
  };

  // ===== LIST LICENSES =====
  const handleListLicenses = async (args: string[]) => {
    try {
      const params = parseArgs(args);
      const provider = params.provider || 'all'; // google, microsoft, all

      addOutput('info', 'Fetching licenses...');

      const data = await apiRequest('GET', '/api/v1/organization/licenses');

      if (data.success && data.data?.licenses) {
        let licenses = data.data.licenses;

        if (provider !== 'all') {
          licenses = licenses.filter((l: any) => l.provider === provider);
        }

        addOutput('info', '');
        addOutput('info', 'Organization Licenses');
        addOutput('info', '═'.repeat(90));
        addOutput('info', `PROVIDER${' '.repeat(4)}LICENSE NAME${' '.repeat(28)}TOTAL${' '.repeat(5)}USED${' '.repeat(6)}AVAILABLE`);
        addOutput('info', '─'.repeat(90));

        if (licenses.length === 0) {
          addOutput('info', '  No licenses found');
        } else {
          for (const lic of licenses) {
            const provider = lic.provider.padEnd(12);
            const name = (lic.displayName || lic.skuId).substring(0, 38).padEnd(40);
            const total = lic.totalUnits === -1 ? 'N/A'.padStart(8) : String(lic.totalUnits).padStart(8);
            const used = lic.consumedUnits === -1 ? 'N/A'.padStart(8) : String(lic.consumedUnits).padStart(8);
            const available = lic.availableUnits === -1 ? 'N/A'.padStart(10) : String(lic.availableUnits).padStart(10);
            addOutput('info', `${provider}${name}${total}${used}${available}`);
          }
        }

        addOutput('info', '');
        addOutput('info', `Summary: ${data.data.summary.googleLicenses} Google, ${data.data.summary.microsoftLicenses} Microsoft`);
        addOutput('info', 'Filter: --provider=google|microsoft');
        addOutput('info', 'Note: Google license counts require Enterprise API access');
      } else {
        addOutput('error', 'Failed to fetch licenses');
      }
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch licenses'}`);
    }
  };

  // ===== LIST LOGIN ACTIVITY =====
  const handleListLoginActivity = async (args: string[]) => {
    try {
      const params = parseArgs(args);
      const limit = params.limit || 50;
      const user = params.user || '';

      addOutput('info', 'Fetching login activity...');

      let endpoint = `/api/v1/login-activity?limit=${limit}`;
      if (user) endpoint += `&email=${encodeURIComponent(user)}`;

      const data = await apiRequest('GET', endpoint);

      if (data.success && data.data) {
        const logins = data.data;

        addOutput('info', '');
        addOutput('info', 'Login Activity');
        addOutput('info', '═'.repeat(100));
        addOutput('info', `TIMESTAMP${' '.repeat(14)}USER${' '.repeat(31)}IP ADDRESS${' '.repeat(8)}COUNTRY${' '.repeat(5)}STATUS`);
        addOutput('info', '─'.repeat(100));

        if (logins.length === 0) {
          addOutput('info', '  No login activity found. Run: list logins --sync to fetch from Google.');
        } else {
          for (const login of logins) {
            const timestamp = new Date(login.timestamp || login.login_time).toLocaleString().padEnd(22);
            const email = (login.user_email || login.email || 'unknown').substring(0, 33).padEnd(35);
            const ip = (login.ip_address || 'N/A').padEnd(18);
            const country = (login.country_name || login.country_code || 'N/A').substring(0, 10).padEnd(12);
            const success = login.is_successful !== false;
            const status = success ? 'OK' : 'FAILED';
            const statusType = success ? 'success' : 'error';
            addOutput(statusType, `${timestamp}${email}${ip}${country}${status}`);
          }
        }

        addOutput('info', '');
        addOutput('info', `Showing ${logins.length} logins`);
        addOutput('info', 'Filters: --limit=N, --user=<email>');
        addOutput('info', 'Sync: POST /api/v1/login-activity/sync to fetch latest from Google');
      } else {
        addOutput('error', 'Failed to fetch login activity');
      }
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch login activity'}`);
    }
  };

  // ===== LIST BUILDINGS (Google Workspace Resources) =====
  const handleListBuildings = async (_args: string[]) => {
    const orgId = getOrganizationId();

    try {
      addOutput('info', 'Fetching buildings...');

      const data = await apiRequest('GET', `/api/google-workspace/resources/buildings/${orgId}`);

      if (data.success && data.data?.buildings) {
        const buildings = data.data.buildings;

        addOutput('info', '');
        addOutput('info', 'Google Workspace Buildings');
        addOutput('info', '═'.repeat(90));
        addOutput('info', `BUILDING ID${' '.repeat(24)}NAME${' '.repeat(26)}FLOORS${' '.repeat(5)}ADDRESS`);
        addOutput('info', '─'.repeat(90));

        if (buildings.length === 0) {
          addOutput('info', '  No buildings configured');
        } else {
          for (const building of buildings) {
            const id = (building.buildingId || '').substring(0, 33).padEnd(35);
            const name = (building.buildingName || 'Unnamed').substring(0, 28).padEnd(30);
            const floors = String(building.floorNames?.length || 0).padStart(6);
            const address = (building.address?.addressLines?.[0] || 'No address').substring(0, 30);
            addOutput('info', `${id}${name}${floors}   ${address}`);
          }
        }

        addOutput('info', '');
        addOutput('info', 'Use: list rooms --building=<id> to see resources');
      } else if (data.error) {
        addOutput('error', `Error: ${data.error}`);
        addOutput('info', 'Buildings require admin.directory.resource.readonly scope');
      } else {
        addOutput('info', 'No buildings found or API not available');
      }
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch buildings'}`);
      addOutput('info', 'Note: This requires Google Admin SDK Resources API access');
    }
  };

  // ===== LIST CALENDAR RESOURCES (Rooms, Equipment) =====
  const handleListResources = async (args: string[]) => {
    const orgId = getOrganizationId();
    const params = parseArgs(args);
    const buildingId = params.building || '';
    const resourceType = params.type || ''; // room, equipment

    try {
      addOutput('info', 'Fetching calendar resources...');

      let endpoint = `/api/google-workspace/resources/calendars/${orgId}`;
      const queryParams: string[] = [];
      if (buildingId) queryParams.push(`buildingId=${encodeURIComponent(buildingId)}`);
      if (resourceType) queryParams.push(`resourceType=${encodeURIComponent(resourceType)}`);
      if (queryParams.length > 0) endpoint += `?${queryParams.join('&')}`;

      const data = await apiRequest('GET', endpoint);

      if (data.success && data.data?.resources) {
        const resources = data.data.resources;

        addOutput('info', '');
        addOutput('info', 'Calendar Resources (Rooms & Equipment)');
        addOutput('info', '═'.repeat(100));
        addOutput('info', `RESOURCE NAME${' '.repeat(27)}TYPE${' '.repeat(8)}CAPACITY${' '.repeat(4)}BUILDING${' '.repeat(17)}EMAIL`);
        addOutput('info', '─'.repeat(100));

        if (resources.length === 0) {
          addOutput('info', '  No calendar resources found');
        } else {
          for (const resource of resources) {
            const name = (resource.resourceName || resource.generatedResourceName || 'Unnamed').substring(0, 38).padEnd(40);
            const type = (resource.resourceType || 'Room').padEnd(12);
            const capacity = String(resource.capacity || '-').padStart(8);
            const building = (resource.buildingId || 'N/A').substring(0, 23).padEnd(25);
            const email = (resource.resourceEmail || '').substring(0, 30);
            addOutput('info', `${name}${type}${capacity}   ${building}${email}`);
          }
        }

        addOutput('info', '');
        addOutput('info', `Total: ${resources.length} resources`);
        addOutput('info', 'Filters: --building=<id>, --type=room|equipment');
      } else if (data.error) {
        addOutput('error', `Error: ${data.error}`);
        addOutput('info', 'Calendar resources require admin.directory.resource.calendar.readonly scope');
      } else {
        addOutput('info', 'No calendar resources found or API not available');
      }
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch resources'}`);
      addOutput('info', 'Note: This requires Google Admin SDK Resources API access');
    }
  };

  // ===== GET 2FA STATUS FOR USER =====
  const handleGet2FA = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: get 2fa <email>');
      return;
    }

    const email = args[0];

    try {
      addOutput('info', `Fetching 2FA status for ${email}...`);

      const response = await authFetch(`/api/v1/security/2fa-status/${encodeURIComponent(email)}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`User not found: ${email}`);
        }
        throw new Error('Failed to fetch 2FA status');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch 2FA status');
      }

      const status = data.data;

      addOutput('info', '');
      addOutput('info', `2FA Status for ${email}`);
      addOutput('info', '═'.repeat(50));

      const enrolledStatus = status.is_enrolled_in_2sv ? 'Yes ✓' : 'No ✗';
      const enrolledType = status.is_enrolled_in_2sv ? 'success' : 'error';
      addOutput(enrolledType, `  Enrolled in 2FA:    ${enrolledStatus}`);

      const enforcedStatus = status.is_enforced_in_2sv ? 'Yes' : 'No';
      addOutput('info', `  2FA Enforced:       ${enforcedStatus}`);

      if (status.last_login_time) {
        addOutput('info', `  Last Login:         ${new Date(status.last_login_time).toLocaleString()}`);
      }

      addOutput('info', '═'.repeat(50));

      if (!status.is_enrolled_in_2sv) {
        addOutput('info', '');
        addOutput('info', 'Recommendation: Enable 2FA for this user for better security');
      }
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to fetch 2FA status'}`);
    }
  };

  // ===== REVOKE OAUTH TOKEN =====
  const handleRevokeToken = async (args: string[]) => {
    if (args.length < 2) {
      addOutput('error', 'Usage: revoke token <email> <clientId>');
      addOutput('info', 'Example: revoke token user@example.com 123456789.apps.googleusercontent.com');
      return;
    }

    const email = args[0];
    const clientId = args[1];

    try {
      addOutput('info', `Revoking token ${clientId} from ${email}...`);

      const response = await authFetch(`/api/v1/security/users/${encodeURIComponent(email)}/oauth-tokens/${encodeURIComponent(clientId)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Token not found for user: ${email}`);
        }
        throw new Error('Failed to revoke token');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to revoke token');
      }

      addOutput('success', `✓ Successfully revoked token from ${email}`);
      addOutput('info', `  Client ID: ${clientId}`);
      addOutput('info', '');
      addOutput('info', 'The user will need to re-authorize this app to use it again.');
    } catch (err) {
      addOutput('error', `Error: ${err instanceof Error ? err.message : 'Failed to revoke token'}`);
    }
  };

  // =============================================================================
  // LEGACY COMMAND HANDLERS (For backwards compatibility)
  // =============================================================================

  // ===== API COMMAND HANDLER =====
  const handleApiCommand = async (args: string[]) => {
    if (args.length < 2) {
      addOutput('error', 'Usage: helios api <METHOD> <PATH> [JSON_BODY]');
      return;
    }

    const method = args[0].toUpperCase();
    const path = args[1];
    const body = args[2] ? JSON.parse(args[2]) : undefined;

    const data = await apiRequest(method, path, body);
    addOutput('success', JSON.stringify(data, null, 2));
  };

  // ===== PASSWORD GENERATOR COMMAND =====
  const handlePasswordCommand = (args: string[]) => {
    // Uses shared PASSWORD_ADJECTIVES and PASSWORD_NOUNS from above

    const generateRandom = (length: number = 16) => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
      let password = '';
      for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const generatePassphrase = () => {
      const words = [];
      for (let i = 0; i < 3; i++) {
        words.push(PASSWORD_NOUNS[Math.floor(Math.random() * PASSWORD_NOUNS.length)].toLowerCase());
      }
      return words.join('-');
    };

    const generatePin = (length: number = 6) => {
      let pin = '';
      for (let i = 0; i < length; i++) {
        pin += Math.floor(Math.random() * 10).toString();
      }
      return pin;
    };

    const action = args[0] || 'generate';
    const params = parseArgs(args.slice(1));

    switch (action) {
      case 'generate':
      case 'gen': {
        const count = parseInt(params.count || '1', 10);
        const style = params.style || 'memorable';

        addOutput('info', `\nGenerated Password${count > 1 ? 's' : ''} (${style}):`);
        addOutput('info', '='.repeat(40));

        const passwords: string[] = [];
        for (let i = 0; i < Math.min(count, 20); i++) {
          let pwd: string;
          switch (style) {
            case 'random':
              pwd = generateRandom(parseInt(params.length || '16', 10));
              break;
            case 'passphrase':
            case 'phrase':
              pwd = generatePassphrase();
              break;
            case 'pin':
              pwd = generatePin(parseInt(params.length || '6', 10));
              break;
            case 'memorable':
            default:
              pwd = generateMemorablePassword();
              break;
          }
          passwords.push(pwd);
          addOutput('success', `  ${pwd}`);
        }
        addOutput('info', '='.repeat(40));

        if (count === 1) {
          addOutput('info', '\nTip: Use with user creation:');
          addOutput('info', `  gw users create user@domain.com --password="${passwords[0]}"`);
          addOutput('info', '  gw users create user@domain.com --password=auto  (auto-generate & store)');
        }
        break;
      }

      case 'styles': {
        addOutput('info', '\nAvailable Password Styles:');
        addOutput('info', '='.repeat(50));
        addOutput('info', '  memorable   AdjectiveNoun#XXX (default)');
        addOutput('info', `              Example: ${generateMemorablePassword()}`);
        addOutput('info', '');
        addOutput('info', '  random      Random characters (16 chars)');
        addOutput('info', `              Example: ${generateRandom()}`);
        addOutput('info', '');
        addOutput('info', '  passphrase  Three random words');
        addOutput('info', `              Example: ${generatePassphrase()}`);
        addOutput('info', '');
        addOutput('info', '  pin         Numeric PIN (6 digits)');
        addOutput('info', `              Example: ${generatePin()}`);
        addOutput('info', '='.repeat(50));
        break;
      }

      default:
        addOutput('error', 'Usage: helios password generate [--count=N] [--style=memorable|random|passphrase|pin]');
        addOutput('info', '       helios password styles    Show available styles with examples');
    }
  };

  // ===== GOOGLE WORKSPACE COMMAND HANDLER =====
  const handleGoogleWorkspaceCommand = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: helios gw <resource> <action> [options]');
      addOutput('info', 'Resources: users, groups, orgunits, domains, delegates, drive, shared-drives, transfer, forwarding, vacation, sync');
      return;
    }

    const resource = args[0];
    const action = args[1] || 'list';
    const restArgs = args.slice(2);

    switch (resource) {
      case 'users':
        await handleGWUsers(action, restArgs);
        break;
      case 'groups':
        await handleGWGroups(action, restArgs);
        break;
      case 'orgunits':
        await handleGWOrgUnits(action, restArgs);
        break;
      case 'delegates':
        await handleGWDelegates(action, restArgs);
        break;
      case 'drive':
        await handleGWDrive(action, restArgs);
        break;
      case 'shared-drives':
        await handleGWSharedDrives(action, restArgs);
        break;
      case 'transfer':
        await handleGWTransfer(action, restArgs);
        break;
      case 'forwarding':
        await handleGWForwarding(action, restArgs);
        break;
      case 'vacation':
        await handleGWVacation(action, restArgs);
        break;
      case 'signature':
      case 'sig':
        await handleGWSignature(action, restArgs);
        break;
      case 'sendas':
      case 'send-as':
        await handleGWSendAs(action, restArgs);
        break;
      case 'calendar':
      case 'cal':
        await handleGWCalendar(action, restArgs);
        break;
      case 'sync':
        await handleGWSync(action, restArgs);
        break;
      case 'domains':
        await handleGWDomains(action, restArgs);
        break;
      default:
        addOutput('error', `Unknown resource: ${resource}`);
    }
  };

  // ----- Google Workspace: Users -----
  const handleGWUsers = async (action: string, args: string[]) => {
    const orgId = getOrganizationId();

    switch (action) {
      case 'list': {
        const params = parseArgs(args);
        const filter = params.filter || '';

        const data = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
        if (data.success && data.data?.users) {
          let filteredUsers = data.data.users;

          // Apply filter if provided
          if (filter) {
            const filterLower = filter.toLowerCase();
            // Support patterns: "email:test*", "orgUnit:/Test", "status:suspended", or just "test*"
            let filterField = 'email';
            let filterValue = filterLower;

            if (filter.includes(':')) {
              const [field, ...valueParts] = filter.split(':');
              filterField = field.toLowerCase();
              filterValue = valueParts.join(':').toLowerCase();
            }

            // Convert glob pattern to regex (simple * support)
            const pattern = filterValue.replace(/\*/g, '.*');
            const regex = new RegExp(`^${pattern}`, 'i');

            filteredUsers = data.data.users.filter((u: any) => {
              const email = (u.email || u.primaryEmail || '').toLowerCase();
              const orgUnit = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();
              const status = (u.isSuspended || u.is_suspended || u.suspended) ? 'suspended' : 'active';
              const firstName = (u.givenName || u.given_name || u.name?.givenName || u.firstName || u.first_name || '').toLowerCase();
              const lastName = (u.familyName || u.family_name || u.name?.familyName || u.lastName || u.last_name || '').toLowerCase();

              switch (filterField) {
                case 'email': return regex.test(email);
                case 'orgunit': case 'ou': return orgUnit.includes(filterValue) || regex.test(orgUnit);
                case 'status': return status === filterValue;
                case 'firstname': case 'first': return regex.test(firstName);
                case 'lastname': case 'last': return regex.test(lastName);
                default: return regex.test(email); // Default to email matching
              }
            });

            if (filteredUsers.length === 0) {
              addOutput('info', `No users match filter: ${filter}`);
              return;
            }
            addOutput('info', `Found ${filteredUsers.length} user(s) matching: ${filter}`);
          }

          const users = filteredUsers.map((u: any) => {
            const email = (u.email || u.primaryEmail || '').padEnd(30);
            const firstName = (u.givenName || u.given_name || u.name?.givenName || u.firstName || u.first_name || '').substring(0, 15).padEnd(15);
            const lastName = (u.familyName || u.family_name || u.name?.familyName || u.lastName || u.last_name || '').substring(0, 15).padEnd(15);
            const orgUnit = (u.orgUnitPath || u.org_unit_path || '/').substring(0, 25).padEnd(25);
            const status = (u.isSuspended || u.is_suspended || u.suspended) ? 'suspended' : 'active';
            return `${email} ${firstName} ${lastName} ${orgUnit} ${status}`;
          }).join('\n');
          addOutput('success', `\nEMAIL${' '.repeat(25)}FIRST NAME${' '.repeat(5)}LAST NAME${' '.repeat(6)}ORG UNIT${' '.repeat(17)}STATUS\n${'='.repeat(110)}\n${users}`);
        } else {
          addOutput('error', 'No users found or invalid response format');
        }
        break;
      }

      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw users get <email> [--format=table|json] [--download]');
          return;
        }
        const params = parseArgs(args.slice(1));
        const format = params.format || 'table';
        const shouldDownload = params.download === 'true' || params.download === '';
        const email = args[0];
        const data = await apiRequest('GET', `/api/google/admin/directory/v1/users/${email}`);

        if (shouldDownload) {
          downloadJSON(data, `user-${email.replace('@', '-')}.json`);
          addOutput('success', `Downloaded user data to user-${email.replace('@', '-')}.json`);
        } else if (format === 'json') {
          addOutput('success', JSON.stringify(data, null, 2));
        } else {
          // Format as readable table
          const formatField = (label: string, value: any) => {
            return value ? `  ${label.padEnd(20)}: ${value}` : '';
          };

          const output = [
            '\nUser Details:',
            '='.repeat(80),
            formatField('Email', data.primaryEmail),
            formatField('Name', data.name?.fullName),
            formatField('First Name', data.name?.givenName),
            formatField('Last Name', data.name?.familyName),
            formatField('Organizational Unit', data.orgUnitPath),
            formatField('Status', data.suspended ? 'Suspended' : 'Active'),
            formatField('Admin', data.isAdmin ? 'Yes' : 'No'),
            formatField('Created', data.creationTime ? new Date(data.creationTime).toLocaleString() : ''),
            formatField('Last Login', data.lastLoginTime ? new Date(data.lastLoginTime).toLocaleString() : ''),
            formatField('Recovery Email', data.recoveryEmail),
            formatField('Recovery Phone', data.recoveryPhone),
            formatField('2SV Enrolled', data.isEnrolledIn2Sv ? 'Yes' : 'No'),
            formatField('Mailbox Setup', data.isMailboxSetup ? 'Yes' : 'No'),
            '='.repeat(80),
            '',
            'Use --format=json for full details'
          ].filter(line => line).join('\n');

          addOutput('success', output);
        }
        break;
      }

      case 'create': {
        // Show deprecation notice for verb-first pattern
        addOutput('info', '💡 Tip: Prefer "create user <email> --gw" for the new verb-first syntax');
        addOutput('info', '');

        if (args.length < 1) {
          addOutput('error', 'Usage: helios gw users create <email> --firstName=<name> --lastName=<name> --password=<pwd|auto>');
          addOutput('info', '       Use --password=auto to generate a memorable password (AdjectiveNoun#XXX)');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));

        // Validate required fields
        if (!params.firstName || !params.lastName) {
          addOutput('error', 'Required: --firstName and --lastName');
          return;
        }

        // Handle password: auto-generate if "auto", otherwise use provided
        let password = params.password;
        let isAutoGenerated = false;
        if (password === 'auto' || password === '') {
          password = generateMemorablePassword();
          isAutoGenerated = true;
        }

        if (!password) {
          addOutput('error', 'Required: --password=<password> or --password=auto');
          return;
        }

        // Step 1: Create user in Helios first (source of truth)
        addOutput('info', `Creating user in Helios: ${email}`);
        let heliosCreated = false;
        try {
          const heliosBody = {
            email,
            firstName: params.firstName,
            lastName: params.lastName,
            department: params.department || null,
            jobTitle: params.jobTitle || null,
            role: 'user',
            userType: 'synced' // Mark as synced since we're creating in GW
          };
          if (password) {
            (heliosBody as any).password = password;
          }
          await apiRequest('POST', '/api/v1/organization/users', heliosBody);
          addOutput('success', `  ✓ Created in Helios`);
          heliosCreated = true;
        } catch (heliosError: any) {
          // User might already exist in Helios - that's OK
          if (heliosError.message?.includes('already exists') || heliosError.message?.includes('duplicate')) {
            addOutput('info', `  → User already exists in Helios`);
            heliosCreated = true;
          } else {
            addOutput('error', `  ✗ Helios: ${heliosError.message}`);
            addOutput('info', '  Continuing with Google Workspace creation...');
          }
        }

        // Step 2: Create in Google Workspace
        addOutput('info', `Creating user in Google Workspace: ${email}`);
        const body = {
          primaryEmail: email,
          name: {
            givenName: params.firstName,
            familyName: params.lastName
          },
          password: password,
          orgUnitPath: params.ou || '/',
          changePasswordAtNextLogin: params.changePassword !== 'false'
        };

        await apiRequest('POST', '/api/google/admin/directory/v1/users', body);
        addOutput('success', `  ✓ Created in Google Workspace`);

        if (isAutoGenerated) {
          // Store the initial password for later retrieval
          await storeInitialPassword(email, password);
          addOutput('info', '');
          addOutput('success', `User created: ${email}`);
          addOutput('info', `Platforms: ${heliosCreated ? 'Helios, ' : ''}Google Workspace`);
          addOutput('info', '');
          addOutput('info', 'Initial Password (auto-generated):');
          addOutput('info', '='.repeat(50));
          addOutput('success', `  ${password}`);
          addOutput('info', '='.repeat(50));
          addOutput('info', '');
          addOutput('info', 'To retrieve later: helios users initial-password ' + email);
          addOutput('info', 'Or view in User Slideout > Settings > Password');
        } else {
          addOutput('info', '');
          addOutput('success', `User created: ${email}`);
          addOutput('info', `Platforms: ${heliosCreated ? 'Helios, ' : ''}Google Workspace`);
        }
        break;
      }

      case 'update': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw users update <email> --firstName=<name> --lastName=<name>');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));

        const body: any = {};
        if (params.firstName || params.lastName) {
          body.name = {
            givenName: params.firstName,
            familyName: params.lastName
          };
        }
        if (params.ou) body.orgUnitPath = params.ou;

        await apiRequest('PATCH', `/api/google/admin/directory/v1/users/${email}`, body);
        addOutput('success', `User updated: ${email}`);
        break;
      }

      case 'suspend': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw users suspend <email>');
          return;
        }
        const email = args[0];
        await apiRequest('PATCH', `/api/google/admin/directory/v1/users/${email}`, { suspended: true });
        addOutput('success', `User suspended: ${email}`);
        break;
      }

      case 'restore': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw users restore <email>');
          return;
        }
        const email = args[0];
        await apiRequest('PATCH', `/api/google/admin/directory/v1/users/${email}`, { suspended: false });
        addOutput('success', `User restored: ${email}`);
        break;
      }

      case 'delete': {
        // Show deprecation notice for verb-first pattern
        addOutput('info', '💡 Tip: Prefer "delete user <email> --gw" for the new verb-first syntax');
        addOutput('info', '');

        const params = parseArgs(args);
        const filter = params.filter;
        const confirmed = params.confirm === 'true' || params.confirm === '';
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Batch delete with filter
        if (filter) {
          const data = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
          if (!data.success || !data.data?.users) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          // Apply same filter logic as list
          const filterLower = filter.toLowerCase();
          let filterField = 'email';
          let filterValue = filterLower;

          if (filter.includes(':')) {
            const [field, ...valueParts] = filter.split(':');
            filterField = field.toLowerCase();
            filterValue = valueParts.join(':').toLowerCase();
          }

          const pattern = filterValue.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}`, 'i');

          const matchingUsers = data.data.users.filter((u: any) => {
            const email = (u.email || u.primaryEmail || '').toLowerCase();
            const orgUnit = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();
            const status = (u.isSuspended || u.is_suspended || u.suspended) ? 'suspended' : 'active';

            switch (filterField) {
              case 'email': return regex.test(email);
              case 'orgunit': case 'ou': return orgUnit.includes(filterValue) || regex.test(orgUnit);
              case 'status': return status === filterValue;
              default: return regex.test(email);
            }
          });

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          // Show preview
          addOutput('info', `\nBatch Delete Preview - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.forEach((u: any) => {
            const email = u.email || u.primaryEmail;
            const name = `${u.givenName || u.firstName || ''} ${u.familyName || u.lastName || ''}`.trim();
            addOutput('info', `  ${email} (${name || 'No name'})`);
          });
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', '\n[DRY RUN] No users were deleted. Remove --dry-run to execute.');
            return;
          }

          if (!confirmed) {
            addOutput('error', `\n⚠️  This will PERMANENTLY DELETE ${matchingUsers.length} user(s)!`);
            addOutput('info', 'To proceed, run the same command with --confirm:');
            addOutput('info', `  helios gw users delete --filter="${filter}" --confirm`);
            addOutput('info', '\nOr preview first with --dry-run');
            return;
          }

          // Execute batch delete
          addOutput('info', `\nDeleting ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('DELETE', `/api/google/admin/directory/v1/users/${email}`);
              addOutput('success', `  ✓ Deleted: ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ Failed: ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch delete complete: ${successCount} deleted, ${errorCount} failed`);
          return;
        }

        // Single user delete (original behavior)
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: helios gw users delete <email>');
          addOutput('info', '       helios gw users delete --filter="email:test*" [--dry-run] [--confirm]');
          return;
        }
        const email = args[0];
        await apiRequest('DELETE', `/api/google/admin/directory/v1/users/${email}`);
        addOutput('success', `User deleted: ${email}`);
        break;
      }

      case 'move': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw users move <email> --ou=</Staff/Sales>');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));
        await apiRequest('PATCH', `/api/google/admin/directory/v1/users/${email}`, { orgUnitPath: params.ou });
        addOutput('success', `User moved to ${params.ou}: ${email}`);
        break;
      }

      case 'groups': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw users groups <email>');
          return;
        }
        const email = args[0];
        const data = await apiRequest('GET', `/api/google/admin/directory/v1/groups?userKey=${email}`);
        if (data.groups) {
          const groups = data.groups.map((g: any) => `${g.email.padEnd(40)} ${g.name}`).join('\n');
          addOutput('success', `\nGroups for ${email}:\n${groups}`);
        } else {
          addOutput('info', `No groups found for ${email}`);
        }
        break;
      }

      case 'reset-password': {
        const params = parseArgs(args);
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Generate random password
        const generatePassword = () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
          let password = '';
          for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return password;
        };

        // Batch reset with filter
        if (filter) {
          const userData = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
          if (!userData.success || !userData.data?.users) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          // Apply filter
          const filterLower = filter.toLowerCase();
          let filterField = 'email';
          let filterValue = filterLower;

          if (filter.includes(':')) {
            const [field, ...valueParts] = filter.split(':');
            filterField = field.toLowerCase();
            filterValue = valueParts.join(':').toLowerCase();
          }

          const pattern = filterValue.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}`, 'i');

          const matchingUsers = userData.data.users.filter((u: any) => {
            const email = (u.email || u.primaryEmail || '').toLowerCase();
            const ouPath = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();
            const status = (u.isSuspended || u.is_suspended) ? 'suspended' : 'active';

            switch (filterField) {
              case 'email': return regex.test(email);
              case 'orgunit': case 'ou': return ouPath.includes(filterValue) || regex.test(ouPath);
              case 'status': return status === filterValue;
              default: return regex.test(email);
            }
          });

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Password Reset - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No passwords were reset. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nResetting passwords for ${matchingUsers.length} users...`);
          const results: { email: string; password: string }[] = [];
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            const password = generatePassword();
            try {
              await apiRequest('PATCH', `/api/google/admin/directory/v1/users/${email}`, {
                password: password
              });
              addOutput('success', `  ✓ ${email}`);
              results.push({ email, password });
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${results.length} reset, ${errorCount} failed`);
          if (results.length > 0) {
            addOutput('info', '\n[KEY]Generated passwords:');
            addOutput('info', '-'.repeat(60));
            results.forEach(r => {
              addOutput('info', `  ${r.email.padEnd(35)} ${r.password}`);
            });
            addOutput('info', '-'.repeat(60));
            addOutput('info', 'Copy the above before navigating away!');
          }
          return;
        }

        // Single user reset (original behavior)
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: gw users reset-password <email> [--password=X]');
          addOutput('info', '       gw users reset-password --filter="orgunit:/Contractors" [--dry-run]');
          return;
        }
        const email = args[0];

        const password = params.password || generatePassword();

        await apiRequest('PATCH', `/api/google/admin/directory/v1/users/${email}`, {
          password: password
        });

        addOutput('success', `[OK]Password reset for ${email}`);
        if (!params.password) {
          addOutput('info', `[KEY]Generated password: ${password}`);
          addOutput('info', '[INFO]User will be prompted to change on first login');
        }
        break;
      }

      case 'add-alias': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw users add-alias <email> <alias>');
          addOutput('info', 'Example: gw users add-alias john@company.com johnny@company.com');
          return;
        }
        const email = args[0];
        const alias = args[1];

        await apiRequest('POST', `/api/google/admin/directory/v1/users/${email}/aliases`, {
          alias: alias
        });

        addOutput('success', `[OK]Added alias ${alias} to ${email}`);
        break;
      }

      case 'remove-alias': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw users remove-alias <email> <alias>');
          return;
        }
        const email = args[0];
        const alias = args[1];

        await apiRequest('DELETE', `/api/google/admin/directory/v1/users/${email}/aliases/${alias}`);

        addOutput('success', `[OK]Removed alias ${alias} from ${email}`);
        break;
      }

      case 'initial-password': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw users initial-password <email>');
          addOutput('info', 'Reveals the auto-generated initial password for a newly created user.');
          addOutput('info', '');
          addOutput('info', 'Note: Initial passwords are persisted and can also be revealed in the User Slideout.');
          addOutput('info', 'Use "gw users list-initial-passwords" to see all stored passwords.');
          return;
        }
        const email = args[0];

        // Try local state first
        let entry = revealInitialPassword(email);

        // If not in local state, try fetching from backend API
        if (!entry) {
          try {
            const response = await authFetch(`/api/v1/initial-passwords/${encodeURIComponent(email)}`);
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data) {
                entry = {
                  password: data.data.password,
                  createdAt: new Date(data.data.createdAt)
                };
                // Cache locally
                setInitialPasswords(prev => ({
                  ...prev,
                  [email.toLowerCase()]: { ...entry!, revealed: true }
                }));
              }
            }
          } catch (err) {
            // Silent fail, will show "not found" message below
          }
        }

        if (entry) {
          addOutput('info', '');
          addOutput('info', `Initial Password for ${email}`);
          addOutput('info', '='.repeat(50));
          addOutput('success', `  ${entry.password}`);
          addOutput('info', '='.repeat(50));
          addOutput('info', `Created: ${entry.createdAt.toLocaleString()}`);
          addOutput('info', '');
          addOutput('info', 'Once the user has changed their password, clear this with:');
          addOutput('info', `  gw users clear-initial-password ${email}`);
        } else {
          addOutput('error', `No initial password stored for ${email}`);
          addOutput('info', 'Initial passwords are only stored when using --password=auto during user creation.');
        }
        break;
      }

      case 'clear-initial-password': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw users clear-initial-password <email|--all>');
          addOutput('info', 'Clears the stored initial password for a user after they have set their own.');
          return;
        }
        const target = args[0];

        if (target === '--all') {
          const count = Object.keys(initialPasswords).length;
          if (count === 0) {
            addOutput('info', 'No initial passwords are currently stored.');
          } else {
            Object.keys(initialPasswords).forEach(email => clearInitialPassword(email));
            addOutput('success', `Cleared ${count} stored initial password(s).`);
          }
        } else {
          if (initialPasswords[target.toLowerCase()]) {
            clearInitialPassword(target);
            addOutput('success', `Cleared initial password for ${target}`);
          } else {
            addOutput('error', `No initial password stored for ${target}`);
          }
        }
        break;
      }

      case 'list-initial-passwords': {
        const entries = Object.entries(initialPasswords);

        if (entries.length === 0) {
          addOutput('info', 'No initial passwords are currently stored.');
          addOutput('info', '');
          addOutput('info', 'Initial passwords are stored when creating users with --password=auto:');
          addOutput('info', '  gw users create john@company.com --firstName=John --lastName=Doe --password=auto');
          return;
        }

        addOutput('info', '');
        addOutput('info', `Stored Initial Passwords (${entries.length}):`);
        addOutput('info', '='.repeat(80));
        addOutput('info', 'Email'.padEnd(40) + 'Password'.padEnd(25) + 'Created');
        addOutput('info', '-'.repeat(80));

        entries.forEach(([email, entry]) => {
          const created = entry.createdAt.toLocaleString();
          const password = entry.revealed ? entry.password : '********** (use initial-password to reveal)';
          addOutput('info', `${email.padEnd(40)}${password.padEnd(25)}${created}`);
        });

        addOutput('info', '='.repeat(80));
        addOutput('info', '');
        addOutput('info', 'To reveal a password: gw users initial-password <email>');
        addOutput('info', 'To clear after user sets password: gw users clear-initial-password <email|--all>');
        break;
      }

      case 'make-admin': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw users make-admin <email>');
          return;
        }
        const email = args[0];

        await apiRequest('POST', `/api/google/admin/directory/v1/users/${email}/makeAdmin`, {
          status: true
        });

        addOutput('success', `[OK]Granted super admin privileges to ${email}`);
        addOutput('info', '[WARN]User now has full administrative access to the organization');
        break;
      }

      case 'offboard': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw users offboard <email> [options]');
          addOutput('info', '');
          addOutput('info', 'Offboard a user with optional data transfer and access revocation.');
          addOutput('info', '');
          addOutput('info', 'Options:');
          addOutput('info', '  --transfer-to=<email>     Transfer Drive/Calendar data to this user');
          addOutput('info', '  --forward-to=<email>      Forward emails to this user');
          addOutput('info', '  --suspend                 Suspend the user after offboarding');
          addOutput('info', '  --delete                  Delete the user after offboarding');
          addOutput('info', '  --vacation="message"      Set vacation responder before offboarding');
          addOutput('info', '  --revoke-access           Sign out sessions, revoke OAuth tokens');
          addOutput('info', '');
          addOutput('info', 'Example:');
          addOutput('info', '  gw users offboard john@company.com --transfer-to=manager@company.com --forward-to=support@company.com --suspend');
          return;
        }

        const email = args[0];
        const params = parseArgs(args.slice(1));

        addOutput('info', `[OFFBOARD]Starting offboarding for ${email}...`);
        addOutput('info', '');

        const APPLICATION_IDS: Record<string, string> = {
          drive: '435070579839',
          calendar: '55656082996',
          sites: '529327477839'
        };

        let stepNum = 0;
        const results: { step: string; success: boolean; message: string }[] = [];

        try {
          // Step 1: Set vacation responder if requested
          if (params.vacation) {
            stepNum++;
            addOutput('info', `[STEP]Step ${stepNum}: Setting vacation responder...`);
            try {
              await apiRequest('PUT', `/api/google/gmail/v1/users/${email}/settings/vacation`, {
                enableAutoReply: true,
                responseBodyPlainText: params.vacation,
                responseBodyHtml: `<p>${params.vacation.replace(/\n/g, '<br>')}</p>`
              });
              results.push({ step: 'Vacation responder', success: true, message: 'Enabled' });
              addOutput('success', `   Vacation responder set`);
            } catch (e: any) {
              results.push({ step: 'Vacation responder', success: false, message: e.message });
              addOutput('error', `   Failed: ${e.message}`);
            }
          }

          // Step 2: Data transfer if requested
          if (params['transfer-to'] || params.transferTo) {
            const transferTo = params['transfer-to'] || params.transferTo;
            stepNum++;
            addOutput('info', `[STEP]Step ${stepNum}: Initiating data transfer to ${transferTo}...`);
            try {
              const transferResponse = await apiRequest('POST', '/api/google/admin/datatransfer/v1/transfers', {
                oldOwnerUserId: email,
                newOwnerUserId: transferTo,
                applicationDataTransfers: [
                  { applicationId: APPLICATION_IDS.drive, applicationTransferParams: [] },
                  { applicationId: APPLICATION_IDS.calendar, applicationTransferParams: [] },
                  { applicationId: APPLICATION_IDS.sites, applicationTransferParams: [] }
                ]
              });
              results.push({ step: 'Data transfer', success: true, message: `Transfer ID: ${transferResponse.id}` });
              addOutput('success', `   Transfer initiated (ID: ${transferResponse.id})`);
            } catch (e: any) {
              results.push({ step: 'Data transfer', success: false, message: e.message });
              addOutput('error', `   Failed: ${e.message}`);
            }
          }

          // Step 3: Email forwarding if requested
          if (params['forward-to'] || params.forwardTo) {
            const forwardTo = params['forward-to'] || params.forwardTo;
            stepNum++;
            addOutput('info', `[STEP]Step ${stepNum}: Setting up email forwarding to ${forwardTo}...`);
            try {
              // Add forwarding address first
              try {
                await apiRequest('POST', `/api/google/gmail/v1/users/${email}/settings/forwardingAddresses`, {
                  forwardingEmail: forwardTo
                });
              } catch {
                // May already exist, ignore
              }

              // Enable auto-forwarding
              await apiRequest('PUT', `/api/google/gmail/v1/users/${email}/settings/autoForwarding`, {
                enabled: true,
                emailAddress: forwardTo,
                disposition: 'leaveInInbox'
              });
              results.push({ step: 'Email forwarding', success: true, message: `Forwarding to ${forwardTo}` });
              addOutput('success', `   Forwarding enabled`);
            } catch (e: any) {
              results.push({ step: 'Email forwarding', success: false, message: e.message });
              addOutput('error', `   Failed: ${e.message}`);
            }
          }

          // Step 4: Revoke access if requested
          if (params['revoke-access'] !== undefined || params.revokeAccess !== undefined) {
            stepNum++;
            addOutput('info', `[STEP]Step ${stepNum}: Revoking access...`);
            try {
              // Sign out all sessions
              await apiRequest('POST', `/api/google/admin/directory/v1/users/${email}/signOut`, {});
              addOutput('info', `   Signed out all sessions`);

              // Revoke OAuth tokens (requires Admin SDK with user management scope)
              try {
                const tokens = await apiRequest('GET', `/api/google/admin/directory/v1/users/${email}/tokens`);
                if (tokens.items) {
                  for (const token of tokens.items) {
                    await apiRequest('DELETE', `/api/google/admin/directory/v1/users/${email}/tokens/${token.clientId}`);
                  }
                  addOutput('info', `   Revoked ${tokens.items.length} OAuth tokens`);
                }
              } catch {
                addOutput('info', `   No OAuth tokens to revoke`);
              }

              results.push({ step: 'Revoke access', success: true, message: 'Sessions signed out' });
            } catch (e: any) {
              results.push({ step: 'Revoke access', success: false, message: e.message });
              addOutput('error', `   Failed: ${e.message}`);
            }
          }

          // Step 5: Suspend user if requested
          if (params.suspend !== undefined) {
            stepNum++;
            addOutput('info', `[STEP]Step ${stepNum}: Suspending user...`);
            try {
              await apiRequest('PATCH', `/api/google/admin/directory/v1/users/${email}`, { suspended: true });
              results.push({ step: 'Suspend user', success: true, message: 'User suspended' });
              addOutput('success', `   User suspended`);
            } catch (e: any) {
              results.push({ step: 'Suspend user', success: false, message: e.message });
              addOutput('error', `   Failed: ${e.message}`);
            }
          }

          // Step 6: Delete user if requested (mutually exclusive with suspend)
          if (params.delete !== undefined && params.suspend === undefined) {
            stepNum++;
            addOutput('info', `[STEP]Step ${stepNum}: Deleting user...`);
            addOutput('info', '[WARN]This action is IRREVERSIBLE!');
            try {
              await apiRequest('DELETE', `/api/google/admin/directory/v1/users/${email}`);
              results.push({ step: 'Delete user', success: true, message: 'User deleted' });
              addOutput('success', `   User deleted`);
            } catch (e: any) {
              results.push({ step: 'Delete user', success: false, message: e.message });
              addOutput('error', `   Failed: ${e.message}`);
            }
          }

          // Summary
          addOutput('info', '');
          addOutput('info', '='.repeat(60));
          addOutput('success', `[OK]Offboarding complete for ${email}`);
          addOutput('info', '');
          addOutput('info', 'Summary:');
          for (const result of results) {
            const icon = result.success ? '[✓]' : '[✗]';
            addOutput(result.success ? 'info' : 'error', `  ${icon} ${result.step}: ${result.message}`);
          }

          if (results.some(r => !r.success)) {
            addOutput('info', '');
            addOutput('error', '[WARN]Some steps failed. Review the errors above.');
          }

        } catch (error: any) {
          addOutput('error', `Offboarding failed: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: list, get, create, update, suspend, restore, delete, move, groups, reset-password, add-alias, remove-alias, make-admin, offboard`);
    }
  };

  // ----- Google Workspace: Groups -----
  const handleGWGroups = async (action: string, args: string[]) => {
    const orgId = getOrganizationId();

    switch (action) {
      case 'list': {
        const params = parseArgs(args);
        const filter = params.filter || '';

        const data = await apiRequest('GET', `/api/google-workspace/groups/${orgId}`);
        if (data.success && data.data?.groups) {
          let filteredGroups = data.data.groups;

          // Apply filter if provided
          if (filter) {
            const filterLower = filter.toLowerCase();
            let filterField = 'email';
            let filterValue = filterLower;

            if (filter.includes(':')) {
              const [field, ...valueParts] = filter.split(':');
              filterField = field.toLowerCase();
              filterValue = valueParts.join(':').toLowerCase();
            }

            const pattern = filterValue.replace(/\*/g, '.*');
            const regex = new RegExp(`^${pattern}`, 'i');

            filteredGroups = data.data.groups.filter((g: any) => {
              const email = (g.email || '').toLowerCase();
              const name = (g.name || '').toLowerCase();

              switch (filterField) {
                case 'email': return regex.test(email);
                case 'name': return regex.test(name) || name.includes(filterValue);
                default: return regex.test(email);
              }
            });
          }

          if (filteredGroups.length === 0) {
            addOutput('info', filter ? `No groups match filter: ${filter}` : 'No groups found');
            return;
          }

          const groups = filteredGroups.map((g: any) => {
            const email = (g.email || '').padEnd(40);
            const name = (g.name || '').padEnd(30);
            const members = (g.directMembersCount || 0).toString().padStart(7);
            return `${email} ${name} ${members}`;
          }).join('\n');
          addOutput('success', `\nEMAIL${' '.repeat(35)}NAME${' '.repeat(26)}MEMBERS\n${'='.repeat(85)}\n${groups}`);
          if (filter) {
            addOutput('info', `\nFiltered: ${filteredGroups.length} of ${data.data.groups.length} groups`);
          }
        }
        break;
      }

      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw groups get <group-email> [--format=table|json]');
          return;
        }
        const params = parseArgs(args.slice(1));
        const format = params.format || 'table';
        const groupEmail = args[0];
        const data = await apiRequest('GET', `/api/google/admin/directory/v1/groups/${groupEmail}`);

        if (format === 'json') {
          addOutput('success', JSON.stringify(data, null, 2));
        } else {
          // Format as readable table
          const formatField = (label: string, value: any) => {
            return value ? `  ${label.padEnd(20)}: ${value}` : '';
          };

          const output = [
            '\nGroup Details:',
            '='.repeat(80),
            formatField('Email', data.email),
            formatField('Name', data.name),
            formatField('Description', data.description),
            formatField('Direct Members', data.directMembersCount),
            formatField('Admin Created', data.adminCreated ? 'Yes' : 'No'),
            formatField('Group ID', data.id),
            '='.repeat(80),
            '',
            'Use --format=json for full details'
          ].filter(line => line).join('\n');

          addOutput('success', output);
        }
        break;
      }

      case 'create': {
        // Show deprecation notice for verb-first pattern
        addOutput('info', '💡 Tip: Prefer "create group <email> --gw" for the new verb-first syntax');
        addOutput('info', '');

        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw groups create <email> --name="Group Name" [--description="..."]');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));

        const body = {
          email,
          name: params.name,
          description: params.description || ''
        };

        await apiRequest('POST', '/api/google-workspace/groups', { organizationId: orgId, ...body });
        addOutput('success', `Group created: ${email}`);
        break;
      }

      case 'update': {
        // Show deprecation notice for verb-first pattern
        addOutput('info', '💡 Tip: Prefer "update group <email> ..." for the new verb-first syntax');
        addOutput('info', '');

        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw groups update <group-email> --name="New Name" [--description="..."]');
          return;
        }
        const groupEmail = args[0];
        const params = parseArgs(args.slice(1));

        const body: any = {};
        if (params.name) body.name = params.name;
        if (params.description) body.description = params.description;

        await apiRequest('PATCH', `/api/google-workspace/groups/${groupEmail}`, { organizationId: orgId, ...body });
        addOutput('success', `Group updated: ${groupEmail}`);
        break;
      }

      case 'delete': {
        // Show deprecation notice for verb-first pattern
        addOutput('info', '💡 Tip: Prefer "delete group <email> --gw" for the new verb-first syntax');
        addOutput('info', '');

        const params = parseArgs(args);
        const filter = params.filter;
        const confirmed = params.confirm === 'true' || params.confirm === '';
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Batch delete with filter
        if (filter) {
          const data = await apiRequest('GET', `/api/google-workspace/groups/${orgId}`);
          if (!data.success || !data.data?.groups) {
            addOutput('error', 'Failed to fetch groups');
            return;
          }

          // Apply same filter logic as list
          const filterLower = filter.toLowerCase();
          let filterField = 'email';
          let filterValue = filterLower;

          if (filter.includes(':')) {
            const [field, ...valueParts] = filter.split(':');
            filterField = field.toLowerCase();
            filterValue = valueParts.join(':').toLowerCase();
          }

          const pattern = filterValue.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}`, 'i');

          const matchingGroups = data.data.groups.filter((g: any) => {
            const email = (g.email || '').toLowerCase();
            const name = (g.name || '').toLowerCase();

            switch (filterField) {
              case 'email': return regex.test(email);
              case 'name': return regex.test(name) || name.includes(filterValue);
              default: return regex.test(email);
            }
          });

          if (matchingGroups.length === 0) {
            addOutput('info', `No groups match filter: ${filter}`);
            return;
          }

          // Show preview
          addOutput('info', `\nBatch Delete Preview - ${matchingGroups.length} group(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingGroups.forEach((g: any) => {
            const email = g.email || '';
            const name = g.name || '';
            addOutput('info', `  ${email} (${name || 'No name'})`);
          });
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', '\n[DRY RUN] No groups were deleted. Remove --dry-run to execute.');
            return;
          }

          if (!confirmed) {
            addOutput('error', `\n⚠️  This will PERMANENTLY DELETE ${matchingGroups.length} group(s)!`);
            addOutput('info', 'To proceed, run the same command with --confirm:');
            addOutput('info', `  helios gw groups delete --filter="${filter}" --confirm`);
            addOutput('info', '\nOr preview first with --dry-run');
            return;
          }

          // Execute batch delete
          addOutput('info', `\nDeleting ${matchingGroups.length} groups...`);
          let successCount = 0;
          let errorCount = 0;

          for (const g of matchingGroups) {
            const email = g.email;
            try {
              await apiRequest('DELETE', `/api/google/admin/directory/v1/groups/${email}`);
              addOutput('success', `  ✓ Deleted: ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ Failed: ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch delete complete: ${successCount} deleted, ${errorCount} failed`);
          return;
        }

        // Single group delete (original behavior)
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: helios gw groups delete <group-email>');
          addOutput('info', '       helios gw groups delete --filter="email:test*" [--dry-run] [--confirm]');
          return;
        }
        const groupEmail = args[0];
        await apiRequest('DELETE', `/api/google/admin/directory/v1/groups/${groupEmail}`);
        addOutput('success', `Group deleted: ${groupEmail}`);
        break;
      }

      case 'members': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw groups members <group-email>');
          return;
        }
        const groupEmail = args[0];
        const data = await apiRequest('GET', `/api/google-workspace/groups/${groupEmail}/members?organizationId=${orgId}`);
        if (data.success && data.data?.members) {
          const members = data.data.members.map((m: any) => {
            const email = (m.email || '').padEnd(40);
            const role = (m.role || 'MEMBER').padEnd(10);
            const status = m.status || 'ACTIVE';
            return `${email} ${role} ${status}`;
          }).join('\n');
          addOutput('success', `\nMembers of ${groupEmail}:\n\nEMAIL${' '.repeat(35)}ROLE${' '.repeat(6)}STATUS\n${'='.repeat(60)}\n${members}`);
        } else {
          addOutput('info', `No members in group ${groupEmail}`);
        }
        break;
      }

      case 'add-member': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw groups add-member <group-email> <user-email> [--role=MEMBER|MANAGER|OWNER]');
          addOutput('info', '       helios gw groups add-member <group-email> --filter="email:*@sales.*" [--role=MEMBER] [--dry-run]');
          return;
        }
        const groupEmail = args[0];
        const params = parseArgs(args.slice(1));
        const role = params.role || 'MEMBER';
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Batch add with filter
        if (filter) {
          const userData = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
          if (!userData.success || !userData.data?.users) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          // Apply filter
          const filterLower = filter.toLowerCase();
          let filterField = 'email';
          let filterValue = filterLower;

          if (filter.includes(':')) {
            const [field, ...valueParts] = filter.split(':');
            filterField = field.toLowerCase();
            filterValue = valueParts.join(':').toLowerCase();
          }

          const pattern = filterValue.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}`, 'i');

          const matchingUsers = userData.data.users.filter((u: any) => {
            const email = (u.email || u.primaryEmail || '').toLowerCase();
            const ouPath = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();
            const status = (u.isSuspended || u.is_suspended) ? 'suspended' : 'active';
            const firstName = (u.givenName || u.given_name || u.firstName || '').toLowerCase();
            const lastName = (u.familyName || u.family_name || u.lastName || '').toLowerCase();

            switch (filterField) {
              case 'email': return regex.test(email);
              case 'orgunit': case 'ou': return ouPath.includes(filterValue) || regex.test(ouPath);
              case 'status': return status === filterValue;
              case 'firstname': return regex.test(firstName);
              case 'lastname': return regex.test(lastName);
              default: return regex.test(email);
            }
          });

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Add to ${groupEmail} - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nAdding ${matchingUsers.length} users to ${groupEmail} as ${role}...`);
          let successCount = 0;
          let errorCount = 0;
          let skipCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('POST', `/api/google-workspace/groups/${groupEmail}/members`, {
                organizationId: orgId,
                email,
                role
              });
              addOutput('success', `  ✓ Added: ${email}`);
              successCount++;
            } catch (err: any) {
              if (err.message?.includes('already a member') || err.message?.includes('409')) {
                addOutput('info', `  ○ Already member: ${email}`);
                skipCount++;
              } else {
                addOutput('error', `  ✗ Failed: ${email} - ${err.message}`);
                errorCount++;
              }
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} added, ${skipCount} already members, ${errorCount} failed`);
          return;
        }

        // Single user add (original behavior)
        if (args.length < 2 || args[1].startsWith('--')) {
          addOutput('error', 'Usage: helios gw groups add-member <group-email> <user-email> [--role=MEMBER|MANAGER|OWNER]');
          return;
        }
        const userEmail = args[1];

        await apiRequest('POST', `/api/google-workspace/groups/${groupEmail}/members`, {
          organizationId: orgId,
          email: userEmail,
          role
        });
        addOutput('success', `Added ${userEmail} to ${groupEmail} as ${role}`);
        break;
      }

      case 'remove-member': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw groups remove-member <group-email> <user-email>');
          addOutput('info', '       helios gw groups remove-member <group-email> --filter="email:*@contractors.*" [--dry-run] [--confirm]');
          return;
        }
        const groupEmail = args[0];
        const params = parseArgs(args.slice(1));
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';
        const confirmed = params.confirm === 'true' || params.confirm === '';

        // Batch remove with filter
        if (filter) {
          // First get current group members
          const membersData = await apiRequest('GET', `/api/google-workspace/groups/${groupEmail}/members?organizationId=${orgId}`);
          if (!membersData.success || !membersData.data?.members) {
            addOutput('error', 'Failed to fetch group members');
            return;
          }

          // Apply filter to members
          const filterLower = filter.toLowerCase();
          let filterField = 'email';
          let filterValue = filterLower;

          if (filter.includes(':')) {
            const [field, ...valueParts] = filter.split(':');
            filterField = field.toLowerCase();
            filterValue = valueParts.join(':').toLowerCase();
          }

          const pattern = filterValue.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}`, 'i');

          const matchingMembers = membersData.data.members.filter((m: any) => {
            const email = (m.email || '').toLowerCase();
            const memberRole = (m.role || 'MEMBER').toLowerCase();

            switch (filterField) {
              case 'email': return regex.test(email);
              case 'role': return memberRole === filterValue.toLowerCase();
              default: return regex.test(email);
            }
          });

          if (matchingMembers.length === 0) {
            addOutput('info', `No members match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Remove from ${groupEmail} - ${matchingMembers.length} member(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingMembers.forEach((m: any) => {
            addOutput('info', `  ${m.email} (${m.role || 'MEMBER'})`);
          });
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          if (!confirmed) {
            addOutput('error', `\n⚠️  This will remove ${matchingMembers.length} member(s) from ${groupEmail}!`);
            addOutput('info', 'To proceed, run the same command with --confirm:');
            addOutput('info', `  helios gw groups remove-member ${groupEmail} --filter="${filter}" --confirm`);
            return;
          }

          addOutput('info', `\nRemoving ${matchingMembers.length} members from ${groupEmail}...`);
          let successCount = 0;
          let errorCount = 0;

          for (const m of matchingMembers) {
            const email = m.email;
            try {
              await apiRequest('DELETE', `/api/google-workspace/groups/${groupEmail}/members/${email}?organizationId=${orgId}`);
              addOutput('success', `  ✓ Removed: ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ Failed: ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} removed, ${errorCount} failed`);
          return;
        }

        // Single user remove (original behavior)
        if (args.length < 2 || args[1].startsWith('--')) {
          addOutput('error', 'Usage: helios gw groups remove-member <group-email> <user-email>');
          return;
        }
        const userEmail = args[1];

        await apiRequest('DELETE', `/api/google-workspace/groups/${groupEmail}/members/${userEmail}?organizationId=${orgId}`);
        addOutput('success', `Removed ${userEmail} from ${groupEmail}`);
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: list, get, create, update, delete, members, add-member, remove-member`);
    }
  };

  // ----- Google Workspace: Organizational Units -----
  const handleGWOrgUnits = async (action: string, args: string[]) => {
    const orgId = getOrganizationId();

    switch (action) {
      case 'list': {
        const data = await apiRequest('GET', `/api/google-workspace/org-units/${orgId}`);
        if (data.success && data.data?.orgUnits) {
          const ous = data.data.orgUnits.map((ou: any) => {
            const path = (ou.path || '').padEnd(40);
            const name = (ou.name || '').padEnd(30);
            const users = (ou.userCount || 0).toString().padStart(6);
            return `${path} ${name} ${users}`;
          }).join('\n');
          addOutput('success', `\nPATH${' '.repeat(36)}NAME${' '.repeat(26)}USERS\n${'='.repeat(82)}\n${ous}`);
        }
        break;
      }

      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw orgunits get </Staff/Sales>');
          return;
        }
        const ouPath = args[0];
        const data = await apiRequest('GET', `/api/google/admin/directory/v1/customer/my_customer/orgunits${ouPath}`);
        addOutput('success', JSON.stringify(data, null, 2));
        break;
      }

      case 'create': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw orgunits create <parentPath> --name="Sales" [--description="..."]');
          return;
        }
        const parentPath = args[0];
        const params = parseArgs(args.slice(1));

        const body = {
          name: params.name,
          parentOrgUnitPath: parentPath,
          description: params.description || ''
        };

        await apiRequest('POST', '/api/google/admin/directory/v1/customer/my_customer/orgunits', body);
        addOutput('success', `OU created: ${parentPath}/${params.name}`);
        break;
      }

      case 'update': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw orgunits update </Staff/Sales> --name="New Name"');
          return;
        }
        const ouPath = args[0];
        const params = parseArgs(args.slice(1));

        const body: any = {};
        if (params.name) body.name = params.name;
        if (params.description) body.description = params.description;

        await apiRequest('PUT', `/api/google/admin/directory/v1/customer/my_customer/orgunits${ouPath}`, body);
        addOutput('success', `OU updated: ${ouPath}`);
        break;
      }

      case 'delete': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw orgunits delete </Staff/Sales>');
          return;
        }
        const ouPath = args[0];
        await apiRequest('DELETE', `/api/google/admin/directory/v1/customer/my_customer/orgunits${ouPath}`);
        addOutput('success', `OU deleted: ${ouPath}`);
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: list, get, create, update, delete`);
    }
  };

  // ----- Google Workspace: Email Delegation -----
  const handleGWDelegates = async (action: string, args: string[]) => {
    const orgId = getOrganizationId();

    // Helper to filter users
    const filterUsers = async (filter: string) => {
      const userData = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
      if (!userData.success || !userData.data?.users) return null;

      const filterLower = filter.toLowerCase();
      let filterField = 'email';
      let filterValue = filterLower;

      if (filter.includes(':')) {
        const [field, ...valueParts] = filter.split(':');
        filterField = field.toLowerCase();
        filterValue = valueParts.join(':').toLowerCase();
      }

      const pattern = filterValue.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}`, 'i');

      return userData.data.users.filter((u: any) => {
        const email = (u.email || u.primaryEmail || '').toLowerCase();
        const ouPath = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();
        const status = (u.isSuspended || u.is_suspended) ? 'suspended' : 'active';

        switch (filterField) {
          case 'email': return regex.test(email);
          case 'orgunit': case 'ou': return ouPath.includes(filterValue) || regex.test(ouPath);
          case 'status': return status === filterValue;
          default: return regex.test(email);
        }
      });
    };

    switch (action) {
      case 'list': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios gw delegates list <user-email>');
          return;
        }
        const userEmail = args[0];
        const data = await apiRequest('GET', `/api/google/gmail/v1/users/${userEmail}/settings/delegates`);
        if (data.delegates) {
          const delegates = data.delegates.map((d: any) => d.delegateEmail).join('\n');
          addOutput('success', `\nDelegates for ${userEmail}:\n${delegates}`);
        } else {
          addOutput('info', `No delegates found for ${userEmail}`);
        }
        break;
      }

      case 'add': {
        const params = parseArgs(args);
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Batch add with filter
        if (filter) {
          // The delegate email should be provided with --delegate or as first arg before --filter
          const delegateEmail = params.delegate || (args[0] && !args[0].startsWith('--') ? args[0] : null);

          if (!delegateEmail) {
            addOutput('error', 'Usage: gw delegates add <delegate-email> --filter="orgunit:/Executives" [--dry-run]');
            addOutput('info', '       gw delegates add --delegate=assistant@company.com --filter="orgunit:/Executives"');
            return;
          }

          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Add Delegate - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', `Delegate: ${delegateEmail}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nAdding ${delegateEmail} as delegate for ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;
          let skipCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('POST', `/api/google/gmail/v1/users/${email}/settings/delegates`, {
                delegateEmail: delegateEmail
              });
              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              if (err.message?.includes('already') || err.message?.includes('409')) {
                addOutput('info', `  ○ Already delegated: ${email}`);
                skipCount++;
              } else {
                addOutput('error', `  ✗ ${email} - ${err.message}`);
                errorCount++;
              }
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} added, ${skipCount} already delegated, ${errorCount} failed`);
          return;
        }

        // Single user add (original behavior)
        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw delegates add <user-email> <delegate-email>');
          addOutput('info', '       helios gw delegates add <delegate-email> --filter="orgunit:/Executives" [--dry-run]');
          return;
        }
        const userEmail = args[0];
        const delegateEmail = args[1];

        const body = {
          delegateEmail: delegateEmail
        };

        await apiRequest('POST', `/api/google/gmail/v1/users/${userEmail}/settings/delegates`, body);
        addOutput('success', `Added delegate ${delegateEmail} for ${userEmail}`);
        break;
      }

      case 'remove': {
        const params = parseArgs(args);
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';
        const confirmed = params.confirm === 'true' || params.confirm === '';

        // Batch remove with filter
        if (filter) {
          const delegateEmail = params.delegate || (args[0] && !args[0].startsWith('--') ? args[0] : null);

          if (!delegateEmail) {
            addOutput('error', 'Usage: gw delegates remove <delegate-email> --filter="orgunit:/Executives" [--dry-run] [--confirm]');
            return;
          }

          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Remove Delegate - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', `Delegate to remove: ${delegateEmail}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          if (!confirmed) {
            addOutput('error', `\n⚠️  This will remove ${delegateEmail} as delegate from ${matchingUsers.length} user(s)!`);
            addOutput('info', 'To proceed, run the same command with --confirm');
            return;
          }

          addOutput('info', `\nRemoving ${delegateEmail} as delegate from ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('DELETE', `/api/google/gmail/v1/users/${email}/settings/delegates/${delegateEmail}`);
              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} removed, ${errorCount} failed`);
          return;
        }

        // Single user remove (original behavior)
        if (args.length < 2) {
          addOutput('error', 'Usage: helios gw delegates remove <user-email> <delegate-email>');
          addOutput('info', '       helios gw delegates remove <delegate-email> --filter="..." [--dry-run] [--confirm]');
          return;
        }
        const userEmail = args[0];
        const delegateEmail = args[1];

        await apiRequest('DELETE', `/api/google/gmail/v1/users/${userEmail}/settings/delegates/${delegateEmail}`);
        addOutput('success', `Removed delegate ${delegateEmail} from ${userEmail}`);
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: list, add, remove`);
    }
  };

  // ----- Google Workspace: Sync -----
  const handleGWSync = async (action: string, _args: string[]) => {
    const orgId = getOrganizationId();

    switch (action) {
      case 'users': {
        const _data = await apiRequest('POST', '/api/google-workspace/sync-now', { organizationId: orgId });
        addOutput('success', `User sync completed: ${JSON.stringify(_data)}`);
        break;
      }

      case 'groups': {
        const data = await apiRequest('POST', '/api/google-workspace/sync-groups', { organizationId: orgId });
        addOutput('success', `Groups sync completed: ${JSON.stringify(data)}`);
        break;
      }

      case 'orgunits': {
        const data = await apiRequest('POST', '/api/google-workspace/sync-org-units', { organizationId: orgId });
        addOutput('success', `OU sync completed: ${JSON.stringify(data)}`);
        break;
      }

      case 'all': {
        addOutput('info', 'Starting full sync...');
        const users = await apiRequest('POST', '/api/google-workspace/sync-now', { organizationId: orgId });
        const groups = await apiRequest('POST', '/api/google-workspace/sync-groups', { organizationId: orgId });
        const ous = await apiRequest('POST', '/api/google-workspace/sync-org-units', { organizationId: orgId });
        addOutput('success', `Full sync completed:\nUsers: ${JSON.stringify(users)}\nGroups: ${JSON.stringify(groups)}\nOUs: ${JSON.stringify(ous)}`);
        break;
      }

      default:
        addOutput('error', `Unknown sync target: ${action}. Use: users, groups, orgunits, all`);
    }
  };

  // ----- Google Workspace: Domains -----
  const handleGWDomains = async (action: string, _args: string[]) => {
    const orgId = getOrganizationId();

    switch (action) {
      case 'list':
      default: {
        addOutput('info', 'Fetching domain information...');

        try {
          const status = await apiRequest('GET', `/api/google-workspace/module-status/${orgId}`);

          if (!status.success || !status.data?.isEnabled) {
            addOutput('error', 'Google Workspace module is not enabled');
            addOutput('info', 'Enable the module in Settings > Modules > Google Workspace');
            return;
          }

          const config = status.data.configuration;
          if (!config?.adminEmail) {
            addOutput('error', 'No domain configuration found');
            return;
          }

          // Extract domain from admin email
          const domain = config.adminEmail.split('@')[1];

          addOutput('success', 'Google Workspace Domain Configuration');
          addOutput('info', '─'.repeat(50));
          addOutput('info', `Primary Domain:    ${domain}`);
          addOutput('info', `Admin Email:       ${config.adminEmail}`);
          addOutput('info', `Project ID:        ${config.projectId || 'Not available'}`);
          addOutput('info', `Service Account:   ${config.clientEmail || 'Not available'}`);
          addOutput('info', '─'.repeat(50));
          addOutput('info', `Last Sync:         ${status.data.lastSync ? new Date(status.data.lastSync).toLocaleString() : 'Never'}`);
          addOutput('info', `Synced Users:      ${status.data.userCount || 0}`);

          if (status.data.userCount === 0) {
            addOutput('info', '');
            addOutput('info', 'Tip: Run "gw sync all" to sync users from Google Workspace');
          }
        } catch (error: any) {
          addOutput('error', `Failed to fetch domain info: ${error.message}`);
        }
        break;
      }
    }
  };

  // ----- Google Workspace: Drive -----
  const handleGWDrive = async (action: string, args: string[]) => {
    switch (action) {
      case 'transfer-ownership': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw drive transfer-ownership <from-email> <to-email>');
          addOutput('info', 'Transfers all Drive files from one user to another');
          addOutput('info', '[WARN]This operation may take several minutes for large file collections');
          return;
        }
        const fromEmail = args[0];
        const toEmail = args[1];

        addOutput('info', `[SYNC]Initiating Drive ownership transfer...`);
        addOutput('info', `   From: ${fromEmail}`);
        addOutput('info', `   To: ${toEmail}`);
        addOutput('info', '');

        try {
          // Step 1: Get all files owned by fromEmail
          addOutput('info', '[STEP]Step 1/2: Finding files...');
          const files = await apiRequest('GET', '/api/google/drive/v3/files', {
            q: `'${fromEmail}' in owners and trashed=false`,
            fields: 'files(id,name,owners)',
            pageSize: 1000
          });

          if (!files.files || files.files.length === 0) {
            addOutput('info', `[OK]No files found owned by ${fromEmail}`);
            return;
          }

          addOutput('success', `   Found ${files.files.length} files to transfer`);
          addOutput('info', '');

          // Step 2: Transfer each file
          addOutput('info', `[STEP]Step 2/2: Transferring ownership...`);
          let transferred = 0;
          let errors = 0;

          for (const file of files.files) {
            try {
              await apiRequest('POST', `/api/google/drive/v3/files/${file.id}/permissions`, {
                role: 'owner',
                type: 'user',
                emailAddress: toEmail,
                transferOwnership: true
              });
              transferred++;

              if (transferred % 10 === 0) {
                addOutput('info', `   Progress: ${transferred}/${files.files.length} files...`);
              }
            } catch (error: any) {
              errors++;
              addOutput('error', `   Failed to transfer: ${file.name} - ${error.message}`);
            }
          }

          addOutput('info', '');
          addOutput('success', `[OK]Transfer complete!`);
          addOutput('success', `   Transferred: ${transferred} files`);
          if (errors > 0) {
            addOutput('error', `   Errors: ${errors} files (check permissions)`);
          }

        } catch (error: any) {
          addOutput('error', `Transfer failed: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: transfer-ownership`);
    }
  };

  // ----- Google Workspace: Shared Drives -----
  const handleGWSharedDrives = async (action: string, args: string[]) => {
    switch (action) {
      case 'create': {
        const params = parseArgs(args);
        if (!params.name) {
          addOutput('error', 'Usage: gw shared-drives create --name="Marketing Team"');
          addOutput('info', 'Creates a new shared drive for team collaboration');
          return;
        }

        // Generate unique request ID
        const requestId = `helios-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const data = await apiRequest('POST', '/api/google/drive/v3/drives', {
          requestId: requestId,
          name: params.name
        });

        addOutput('success', `[OK]Created shared drive: ${params.name}`);
        addOutput('info', `   Drive ID: ${data.id}`);
        break;
      }

      case 'list': {
        const data = await apiRequest('GET', '/api/google/drive/v3/drives', {
          pageSize: 100
        });

        if (data.drives && data.drives.length > 0) {
          const drives = data.drives.map((d: any) => {
            const name = (d.name || '').substring(0, 40).padEnd(40);
            const id = (d.id || '').substring(0, 30);
            return `${name} ${id}`;
          }).join('\n');
          addOutput('success', `\nNAME${' '.repeat(36)}DRIVE ID\n${'='.repeat(75)}\n${drives}`);
          addOutput('info', `\nTotal: ${data.drives.length} shared drives`);
        } else {
          addOutput('info', 'No shared drives found');
        }
        break;
      }

      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw shared-drives get <drive-id>');
          return;
        }
        const driveId = args[0];

        const data = await apiRequest('GET', `/api/google/drive/v3/drives/${driveId}`);
        addOutput('success', JSON.stringify(data, null, 2));
        break;
      }

      case 'add-member': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw shared-drives add-member <drive-id> <email> [--role=writer|reader|commenter|organizer]');
          addOutput('info', 'Default role: writer');
          return;
        }
        const driveId = args[0];
        const email = args[1];
        const params = parseArgs(args.slice(2));
        const role = params.role || 'writer';

        await apiRequest('POST', `/api/google/drive/v3/files/${driveId}/permissions`, {
          role: role,
          type: 'user',
          emailAddress: email,
          supportsAllDrives: true
        });

        addOutput('success', `[OK]Added ${email} to shared drive as ${role}`);
        break;
      }

      case 'list-permissions': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw shared-drives list-permissions <drive-id>');
          addOutput('info', 'Shows all users with access to the shared drive');
          return;
        }
        const driveId = args[0];

        const data = await apiRequest('GET', `/api/google/drive/v3/files/${driveId}/permissions`, {
          supportsAllDrives: true,
          fields: 'permissions(emailAddress,displayName,role,type)'
        });

        if (data.permissions && data.permissions.length > 0) {
          const perms = data.permissions.map((p: any) => {
            const email = (p.emailAddress || p.displayName || 'Domain').substring(0, 40).padEnd(40);
            const role = (p.role || '').substring(0, 15).padEnd(15);
            const type = (p.type || '').substring(0, 10).padEnd(10);
            return `${email} ${role} ${type}`;
          }).join('\n');
          addOutput('success', `\nUSER/GROUP${' '.repeat(30)}ROLE${' '.repeat(11)}TYPE\n${'='.repeat(70)}\n${perms}`);
          addOutput('info', `\nTotal: ${data.permissions.length} permissions`);
        } else {
          addOutput('info', 'No permissions found');
        }
        break;
      }

      case 'delete': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw shared-drives delete <drive-id>');
          addOutput('info', '[WARN]This will permanently delete the shared drive and all its contents');
          return;
        }
        const driveId = args[0];

        await apiRequest('DELETE', `/api/google/drive/v3/drives/${driveId}`);
        addOutput('success', `[OK]Shared drive deleted: ${driveId}`);
        addOutput('info', '[WARN]All files in the shared drive have been permanently deleted');
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: create, list, get, add-member, list-permissions, delete`);
    }
  };

  // ----- Google Workspace: Data Transfer -----
  const handleGWTransfer = async (action: string, args: string[]) => {
    // Application IDs for Google Data Transfer API
    const APPLICATION_IDS: Record<string, string> = {
      drive: '435070579839',
      calendar: '55656082996',
      sites: '529327477839',
      groups: '588034504559'
    };

    switch (action) {
      case 'drive': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw transfer drive <from-email> --to=<to-email>');
          addOutput('info', 'Transfers all Drive ownership from one user to another via Google Data Transfer API');
          return;
        }
        const fromEmail = args[0];
        const params = parseArgs(args.slice(1));
        const toEmail = params.to;

        if (!toEmail) {
          addOutput('error', 'Missing --to parameter. Usage: gw transfer drive <from-email> --to=<to-email>');
          return;
        }

        addOutput('info', `[SYNC]Initiating Drive data transfer...`);
        addOutput('info', `   From: ${fromEmail}`);
        addOutput('info', `   To: ${toEmail}`);

        try {
          // Use Google Data Transfer API via transparent proxy
          const response = await apiRequest('POST', '/api/google/admin/datatransfer/v1/transfers', {
            oldOwnerUserId: fromEmail,
            newOwnerUserId: toEmail,
            applicationDataTransfers: [{
              applicationId: APPLICATION_IDS.drive,
              applicationTransferParams: []
            }]
          });

          addOutput('success', `[OK]Drive transfer initiated!`);
          addOutput('info', `   Transfer ID: ${response.id}`);
          addOutput('info', `   Status: ${response.overallTransferStatusCode || 'pending'}`);
          addOutput('info', '');
          addOutput('info', '[INFO]Transfer is running in the background. Use "gw transfer status" to check progress.');
        } catch (error: any) {
          addOutput('error', `Transfer failed: ${error.message}`);
        }
        break;
      }

      case 'calendar': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw transfer calendar <from-email> --to=<to-email>');
          addOutput('info', 'Transfers calendar ownership from one user to another via Google Data Transfer API');
          return;
        }
        const fromEmail = args[0];
        const params = parseArgs(args.slice(1));
        const toEmail = params.to;

        if (!toEmail) {
          addOutput('error', 'Missing --to parameter. Usage: gw transfer calendar <from-email> --to=<to-email>');
          return;
        }

        addOutput('info', `[SYNC]Initiating Calendar data transfer...`);
        addOutput('info', `   From: ${fromEmail}`);
        addOutput('info', `   To: ${toEmail}`);

        try {
          const response = await apiRequest('POST', '/api/google/admin/datatransfer/v1/transfers', {
            oldOwnerUserId: fromEmail,
            newOwnerUserId: toEmail,
            applicationDataTransfers: [{
              applicationId: APPLICATION_IDS.calendar,
              applicationTransferParams: []
            }]
          });

          addOutput('success', `[OK]Calendar transfer initiated!`);
          addOutput('info', `   Transfer ID: ${response.id}`);
          addOutput('info', `   Status: ${response.overallTransferStatusCode || 'pending'}`);
        } catch (error: any) {
          addOutput('error', `Transfer failed: ${error.message}`);
        }
        break;
      }

      case 'all': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw transfer all <from-email> --to=<to-email>');
          addOutput('info', 'Transfers Drive, Calendar, and Sites from one user to another');
          return;
        }
        const fromEmail = args[0];
        const params = parseArgs(args.slice(1));
        const toEmail = params.to;

        if (!toEmail) {
          addOutput('error', 'Missing --to parameter. Usage: gw transfer all <from-email> --to=<to-email>');
          return;
        }

        addOutput('info', `[SYNC]Initiating full data transfer...`);
        addOutput('info', `   From: ${fromEmail}`);
        addOutput('info', `   To: ${toEmail}`);
        addOutput('info', `   Applications: Drive, Calendar, Sites`);

        try {
          const response = await apiRequest('POST', '/api/google/admin/datatransfer/v1/transfers', {
            oldOwnerUserId: fromEmail,
            newOwnerUserId: toEmail,
            applicationDataTransfers: [
              { applicationId: APPLICATION_IDS.drive, applicationTransferParams: [] },
              { applicationId: APPLICATION_IDS.calendar, applicationTransferParams: [] },
              { applicationId: APPLICATION_IDS.sites, applicationTransferParams: [] }
            ]
          });

          addOutput('success', `[OK]Full data transfer initiated!`);
          addOutput('info', `   Transfer ID: ${response.id}`);
          addOutput('info', `   Status: ${response.overallTransferStatusCode || 'pending'}`);
        } catch (error: any) {
          addOutput('error', `Transfer failed: ${error.message}`);
        }
        break;
      }

      case 'status': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw transfer status <transfer-id>');
          addOutput('info', 'Check the status of a data transfer');
          return;
        }
        const transferId = args[0];

        try {
          const response = await apiRequest('GET', `/api/google/admin/datatransfer/v1/transfers/${transferId}`);

          const formatField = (label: string, value: any) => {
            return value ? `  ${label.padEnd(20)}: ${value}` : '';
          };

          const output = [
            '\nData Transfer Status:',
            '='.repeat(60),
            formatField('Transfer ID', response.id),
            formatField('From', response.oldOwnerUserId),
            formatField('To', response.newOwnerUserId),
            formatField('Status', response.overallTransferStatusCode),
            formatField('Request Time', response.requestTime ? new Date(response.requestTime).toLocaleString() : ''),
            '='.repeat(60)
          ].filter(line => line).join('\n');

          addOutput('success', output);

          // Show per-application status
          if (response.applicationDataTransfers) {
            addOutput('info', '\nApplication Details:');
            for (const app of response.applicationDataTransfers) {
              const appName = Object.entries(APPLICATION_IDS).find(([_, id]) => id === app.applicationId)?.[0] || 'Unknown';
              addOutput('info', `  ${appName.padEnd(12)}: ${app.applicationTransferStatus}`);
            }
          }
        } catch (error: any) {
          addOutput('error', `Failed to get transfer status: ${error.message}`);
        }
        break;
      }

      case 'list': {
        addOutput('info', '[SYNC]Fetching recent data transfers...');

        try {
          const response = await apiRequest('GET', '/api/google/admin/datatransfer/v1/transfers?maxResults=20');

          if (response.dataTransfers && response.dataTransfers.length > 0) {
            addOutput('success', '\nRecent Data Transfers:');
            addOutput('success', '='.repeat(100));

            for (const transfer of response.dataTransfers) {
              const from = (transfer.oldOwnerUserId || '').substring(0, 30).padEnd(32);
              const to = (transfer.newOwnerUserId || '').substring(0, 30).padEnd(32);
              const status = (transfer.overallTransferStatusCode || 'unknown').padEnd(12);
              addOutput('info', `${from}→ ${to}${status}`);
            }
          } else {
            addOutput('info', 'No recent data transfers found');
          }
        } catch (error: any) {
          addOutput('error', `Failed to list transfers: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: drive, calendar, all, status, list`);
    }
  };

  // ----- Google Workspace: Email Forwarding -----
  const handleGWForwarding = async (action: string, args: string[]) => {
    const orgId = getOrganizationId();

    // Helper to filter users
    const filterUsers = async (filter: string) => {
      const userData = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
      if (!userData.success || !userData.data?.users) return null;

      const filterLower = filter.toLowerCase();
      let filterField = 'email';
      let filterValue = filterLower;

      if (filter.includes(':')) {
        const [field, ...valueParts] = filter.split(':');
        filterField = field.toLowerCase();
        filterValue = valueParts.join(':').toLowerCase();
      }

      const pattern = filterValue.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}`, 'i');

      return userData.data.users.filter((u: any) => {
        const email = (u.email || u.primaryEmail || '').toLowerCase();
        const ouPath = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();
        const status = (u.isSuspended || u.is_suspended) ? 'suspended' : 'active';

        switch (filterField) {
          case 'email': return regex.test(email);
          case 'orgunit': case 'ou': return ouPath.includes(filterValue) || regex.test(ouPath);
          case 'status': return status === filterValue;
          default: return regex.test(email);
        }
      });
    };

    switch (action) {
      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw forwarding get <user-email>');
          addOutput('info', 'Get forwarding settings for a user');
          return;
        }
        const userEmail = args[0];

        try {
          // Get auto-forwarding settings
          const settings = await apiRequest('GET', `/api/google/gmail/v1/users/${userEmail}/settings/autoForwarding`);

          const formatField = (label: string, value: any) => {
            return value !== undefined ? `  ${label.padEnd(20)}: ${value}` : '';
          };

          const output = [
            `\nForwarding Settings for ${userEmail}:`,
            '='.repeat(60),
            formatField('Enabled', settings.enabled ? 'Yes' : 'No'),
            formatField('Forward To', settings.emailAddress || '(not set)'),
            formatField('Disposition', settings.disposition || '(not set)'),
            '='.repeat(60),
            '',
            'Disposition values:',
            '  leaveInInbox      - Keep copy in inbox',
            '  archive           - Archive original',
            '  trash             - Move original to trash',
            '  markRead          - Mark as read'
          ].filter(line => line !== '').join('\n');

          addOutput('success', output);
        } catch (error: any) {
          addOutput('error', `Failed to get forwarding: ${error.message}`);
        }
        break;
      }

      case 'set': {
        const params = parseArgs(args);
        const filter = params.filter;
        const forwardTo = params.to;
        const disposition = params.disposition || 'leaveInInbox';
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        if (!forwardTo) {
          addOutput('error', 'Usage: gw forwarding set <user-email> --to=<forward-to-email> [--disposition=...]');
          addOutput('info', '       gw forwarding set --filter="orgunit:/Departed" --to=<email> [--dry-run]');
          return;
        }

        // Batch set with filter
        if (filter) {
          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Set Forwarding - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', `Forward to: ${forwardTo}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nSetting forwarding for ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              // Add forwarding address
              try {
                await apiRequest('POST', `/api/google/gmail/v1/users/${email}/settings/forwardingAddresses`, {
                  forwardingEmail: forwardTo
                });
              } catch (e: any) {
                // May already exist, which is fine
                if (!e.message?.includes('already exists') && !e.message?.includes('409')) {
                  throw e;
                }
              }

              // Enable forwarding
              await apiRequest('PUT', `/api/google/gmail/v1/users/${email}/settings/autoForwarding`, {
                enabled: true,
                emailAddress: forwardTo,
                disposition: disposition
              });

              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} set, ${errorCount} failed`);
          return;
        }

        // Single user set (original behavior)
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: gw forwarding set <user-email> --to=<forward-to-email>');
          return;
        }
        const userEmail = args[0];

        try {
          // First, create a forwarding address
          addOutput('info', `[STEP]Step 1/2: Adding forwarding address ${forwardTo}...`);

          try {
            await apiRequest('POST', `/api/google/gmail/v1/users/${userEmail}/settings/forwardingAddresses`, {
              forwardingEmail: forwardTo
            });
            addOutput('success', `   Forwarding address added`);
          } catch (e: any) {
            // May already exist, which is fine
            if (e.message.includes('already exists') || e.message.includes('409')) {
              addOutput('info', `   Forwarding address already exists`);
            } else {
              throw e;
            }
          }

          // Then enable auto-forwarding
          addOutput('info', `[STEP]Step 2/2: Enabling auto-forwarding...`);

          await apiRequest('PUT', `/api/google/gmail/v1/users/${userEmail}/settings/autoForwarding`, {
            enabled: true,
            emailAddress: forwardTo,
            disposition: disposition
          });

          addOutput('success', `[OK]Forwarding enabled for ${userEmail}`);
          addOutput('info', `   Forward to: ${forwardTo}`);
          addOutput('info', `   Disposition: ${disposition}`);
        } catch (error: any) {
          addOutput('error', `Failed to set forwarding: ${error.message}`);
        }
        break;
      }

      case 'disable': {
        const params = parseArgs(args);
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Batch disable with filter
        if (filter) {
          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Disable Forwarding - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nDisabling forwarding for ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('PUT', `/api/google/gmail/v1/users/${email}/settings/autoForwarding`, {
                enabled: false
              });
              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} disabled, ${errorCount} failed`);
          return;
        }

        // Single user disable (original behavior)
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: gw forwarding disable <user-email>');
          addOutput('info', '       gw forwarding disable --filter="status:suspended" [--dry-run]');
          return;
        }
        const userEmail = args[0];

        try {
          await apiRequest('PUT', `/api/google/gmail/v1/users/${userEmail}/settings/autoForwarding`, {
            enabled: false
          });

          addOutput('success', `[OK]Forwarding disabled for ${userEmail}`);
        } catch (error: any) {
          addOutput('error', `Failed to disable forwarding: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: get, set, disable`);
    }
  };

  // ----- Google Workspace: Vacation/Out-of-Office -----
  const handleGWVacation = async (action: string, args: string[]) => {
    const orgId = getOrganizationId();

    // Helper to filter users
    const filterUsers = async (filter: string) => {
      const userData = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
      if (!userData.success || !userData.data?.users) return null;

      const filterLower = filter.toLowerCase();
      let filterField = 'email';
      let filterValue = filterLower;

      if (filter.includes(':')) {
        const [field, ...valueParts] = filter.split(':');
        filterField = field.toLowerCase();
        filterValue = valueParts.join(':').toLowerCase();
      }

      const pattern = filterValue.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}`, 'i');

      return userData.data.users.filter((u: any) => {
        const email = (u.email || u.primaryEmail || '').toLowerCase();
        const ouPath = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();

        switch (filterField) {
          case 'email': return regex.test(email);
          case 'orgunit': case 'ou': return ouPath.includes(filterValue) || regex.test(ouPath);
          default: return regex.test(email);
        }
      });
    };

    switch (action) {
      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw vacation get <user-email>');
          addOutput('info', 'Get vacation/out-of-office settings for a user');
          return;
        }
        const userEmail = args[0];

        try {
          const settings = await apiRequest('GET', `/api/google/gmail/v1/users/${userEmail}/settings/vacation`);

          const formatField = (label: string, value: any) => {
            return value !== undefined ? `  ${label.padEnd(20)}: ${value}` : '';
          };

          const output = [
            `\nVacation Settings for ${userEmail}:`,
            '='.repeat(60),
            formatField('Enabled', settings.enableAutoReply ? 'Yes' : 'No'),
            formatField('Subject', settings.responseSubject || '(default)'),
            formatField('Response Mode', settings.restrictToContacts ? 'Contacts only' : (settings.restrictToDomain ? 'Domain only' : 'Everyone')),
            formatField('Start Time', settings.startTime ? new Date(parseInt(settings.startTime)).toLocaleString() : '(not set)'),
            formatField('End Time', settings.endTime ? new Date(parseInt(settings.endTime)).toLocaleString() : '(not set)'),
            '='.repeat(60),
            '',
            settings.responseBodyPlainText ? `Message:\n${settings.responseBodyPlainText}` : ''
          ].filter(line => line !== '').join('\n');

          addOutput('success', output);
        } catch (error: any) {
          addOutput('error', `Failed to get vacation settings: ${error.message}`);
        }
        break;
      }

      case 'set': {
        const params = parseArgs(args);
        const filter = params.filter;
        const message = params.message;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        if (!message) {
          addOutput('error', 'Usage: gw vacation set <user-email> --message="I am out of office" [--subject="..."]');
          addOutput('info', '       gw vacation set --filter="orgunit:/HR" --message="..." [--dry-run]');
          return;
        }

        const buildBody = () => {
          const body: any = {
            enableAutoReply: true,
            responseBodyPlainText: message,
            responseBodyHtml: `<p>${message.replace(/\n/g, '<br>')}</p>`
          };
          if (params.subject) body.responseSubject = params.subject;
          if (params.start) body.startTime = new Date(params.start).getTime().toString();
          if (params.end) body.endTime = new Date(params.end).getTime().toString();
          if (params.contactsOnly) body.restrictToContacts = true;
          if (params.domainOnly) body.restrictToDomain = true;
          return body;
        };

        // Batch set with filter
        if (filter) {
          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Set Vacation - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nSetting vacation for ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;
          const body = buildBody();

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('PUT', `/api/google/gmail/v1/users/${email}/settings/vacation`, body);
              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} set, ${errorCount} failed`);
          return;
        }

        // Single user set (original behavior)
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: gw vacation set <user-email> --message="..."');
          return;
        }
        const userEmail = args[0];

        try {
          await apiRequest('PUT', `/api/google/gmail/v1/users/${userEmail}/settings/vacation`, buildBody());

          addOutput('success', `[OK]Vacation responder enabled for ${userEmail}`);
          if (params.subject) addOutput('info', `   Subject: ${params.subject}`);
          if (params.start) addOutput('info', `   Start: ${params.start}`);
          if (params.end) addOutput('info', `   End: ${params.end}`);
        } catch (error: any) {
          addOutput('error', `Failed to set vacation: ${error.message}`);
        }
        break;
      }

      case 'disable': {
        const params = parseArgs(args);
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Batch disable with filter
        if (filter) {
          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Disable Vacation - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nDisabling vacation for ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('PUT', `/api/google/gmail/v1/users/${email}/settings/vacation`, {
                enableAutoReply: false
              });
              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} disabled, ${errorCount} failed`);
          return;
        }

        // Single user disable (original behavior)
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: gw vacation disable <user-email>');
          addOutput('info', '       gw vacation disable --filter="status:suspended" [--dry-run]');
          return;
        }
        const userEmail = args[0];

        try {
          await apiRequest('PUT', `/api/google/gmail/v1/users/${userEmail}/settings/vacation`, {
            enableAutoReply: false
          });

          addOutput('success', `[OK]Vacation responder disabled for ${userEmail}`);
        } catch (error: any) {
          addOutput('error', `Failed to disable vacation: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: get, set, disable`);
    }
  };

  // ----- Google Workspace: Email Signature -----
  const handleGWSignature = async (action: string, args: string[]) => {
    const orgId = getOrganizationId();

    // Helper to filter users
    const filterUsers = async (filter: string) => {
      const userData = await apiRequest('GET', `/api/google-workspace/cached-users/${orgId}`);
      if (!userData.success || !userData.data?.users) return null;

      const filterLower = filter.toLowerCase();
      let filterField = 'email';
      let filterValue = filterLower;

      if (filter.includes(':')) {
        const [field, ...valueParts] = filter.split(':');
        filterField = field.toLowerCase();
        filterValue = valueParts.join(':').toLowerCase();
      }

      const pattern = filterValue.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}`, 'i');

      return userData.data.users.filter((u: any) => {
        const email = (u.email || u.primaryEmail || '').toLowerCase();
        const ouPath = (u.orgUnitPath || u.org_unit_path || '/').toLowerCase();

        switch (filterField) {
          case 'email': return regex.test(email);
          case 'orgunit': case 'ou': return ouPath.includes(filterValue) || regex.test(ouPath);
          default: return regex.test(email);
        }
      });
    };

    switch (action) {
      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw signature get <user-email>');
          addOutput('info', 'Get email signature for a user');
          return;
        }
        const userEmail = args[0];

        try {
          const sendAsData = await apiRequest('GET', `/api/google/gmail/v1/users/${userEmail}/settings/sendAs/${userEmail}`);

          addOutput('success', `\nSignature for ${userEmail}:`);
          addOutput('info', '='.repeat(60));
          if (sendAsData.signature) {
            // Strip HTML tags for display
            const plainText = sendAsData.signature.replace(/<[^>]*>/g, '').trim();
            addOutput('info', plainText || '(empty signature)');
          } else {
            addOutput('info', '(no signature set)');
          }
          addOutput('info', '='.repeat(60));
        } catch (error: any) {
          addOutput('error', `Failed to get signature: ${error.message}`);
        }
        break;
      }

      case 'set': {
        const params = parseArgs(args);
        const filter = params.filter;
        const signature = params.signature || params.sig;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        if (!signature) {
          addOutput('error', 'Usage: gw signature set <user-email> --signature="Your signature"');
          addOutput('info', '       gw signature set --filter="orgunit:/Sales" --signature="..." [--dry-run]');
          return;
        }

        // Batch set with filter
        if (filter) {
          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Set Signature - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));
          matchingUsers.slice(0, 10).forEach((u: any) => {
            addOutput('info', `  ${u.email || u.primaryEmail}`);
          });
          if (matchingUsers.length > 10) {
            addOutput('info', `  ... and ${matchingUsers.length - 10} more`);
          }
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          addOutput('info', `\nSetting signature for ${matchingUsers.length} users...`);
          let successCount = 0;
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('PATCH', `/api/google/gmail/v1/users/${email}/settings/sendAs/${email}`, {
                signature: signature
              });
              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} set, ${errorCount} failed`);
          return;
        }

        // Single user set
        if (args.length === 0 || args[0].startsWith('--')) {
          addOutput('error', 'Usage: gw signature set <user-email> --signature="..."');
          return;
        }
        const userEmail = args[0];

        try {
          await apiRequest('PATCH', `/api/google/gmail/v1/users/${userEmail}/settings/sendAs/${userEmail}`, {
            signature: signature
          });

          addOutput('success', `[OK]Signature updated for ${userEmail}`);
        } catch (error: any) {
          addOutput('error', `Failed to set signature: ${error.message}`);
        }
        break;
      }

      case 'clear': {
        const params = parseArgs(args);
        const filter = params.filter;
        const dryRun = params['dry-run'] === 'true' || params['dry-run'] === '';

        // Batch clear with filter
        if (filter) {
          const matchingUsers = await filterUsers(filter);
          if (!matchingUsers) {
            addOutput('error', 'Failed to fetch users');
            return;
          }

          if (matchingUsers.length === 0) {
            addOutput('info', `No users match filter: ${filter}`);
            return;
          }

          addOutput('info', `\nBatch Clear Signature - ${matchingUsers.length} user(s) matching: ${filter}`);
          addOutput('info', '='.repeat(60));

          if (dryRun) {
            addOutput('info', `\n[DRY RUN] No changes made. Remove --dry-run to execute.`);
            return;
          }

          let successCount = 0;
          let errorCount = 0;

          for (const u of matchingUsers) {
            const email = u.email || u.primaryEmail;
            try {
              await apiRequest('PATCH', `/api/google/gmail/v1/users/${email}/settings/sendAs/${email}`, {
                signature: ''
              });
              addOutput('success', `  ✓ ${email}`);
              successCount++;
            } catch (err: any) {
              addOutput('error', `  ✗ ${email} - ${err.message}`);
              errorCount++;
            }
          }

          addOutput('info', `\nBatch complete: ${successCount} cleared, ${errorCount} failed`);
          return;
        }

        // Single user clear
        if (args.length === 0) {
          addOutput('error', 'Usage: gw signature clear <user-email>');
          return;
        }
        const userEmail = args[0];

        try {
          await apiRequest('PATCH', `/api/google/gmail/v1/users/${userEmail}/settings/sendAs/${userEmail}`, {
            signature: ''
          });

          addOutput('success', `[OK]Signature cleared for ${userEmail}`);
        } catch (error: any) {
          addOutput('error', `Failed to clear signature: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: get, set, clear`);
    }
  };

  // ----- Google Workspace: Send-As -----
  const handleGWSendAs = async (action: string, args: string[]) => {
    switch (action) {
      case 'list': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw sendas list <user-email>');
          addOutput('info', 'List all send-as addresses for a user');
          return;
        }
        const userEmail = args[0];

        try {
          const data = await apiRequest('GET', `/api/google/gmail/v1/users/${userEmail}/settings/sendAs`);

          addOutput('success', `\nSend-As Addresses for ${userEmail}:`);
          addOutput('info', '='.repeat(70));
          if (data.sendAs && data.sendAs.length > 0) {
            data.sendAs.forEach((sa: any) => {
              const email = (sa.sendAsEmail || '').padEnd(35);
              const name = (sa.displayName || '').padEnd(20);
              const isPrimary = sa.isPrimary ? '[PRIMARY]' : '';
              const isDefault = sa.isDefault ? '[DEFAULT]' : '';
              addOutput('info', `  ${email} ${name} ${isPrimary}${isDefault}`);
            });
          } else {
            addOutput('info', '  (no send-as addresses)');
          }
          addOutput('info', '='.repeat(70));
        } catch (error: any) {
          addOutput('error', `Failed to list send-as: ${error.message}`);
        }
        break;
      }

      case 'add': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw sendas add <user-email> <send-as-email> [--name="Display Name"]');
          addOutput('info', 'Add a send-as address for a user');
          return;
        }
        const userEmail = args[0];
        const sendAsEmail = args[1];
        const params = parseArgs(args.slice(2));
        const displayName = params.name || sendAsEmail.split('@')[0];

        try {
          await apiRequest('POST', `/api/google/gmail/v1/users/${userEmail}/settings/sendAs`, {
            sendAsEmail: sendAsEmail,
            displayName: displayName
          });

          addOutput('success', `[OK]Added send-as address ${sendAsEmail} for ${userEmail}`);
          addOutput('info', `   Display name: ${displayName}`);
          addOutput('info', '   Note: Verification may be required for external addresses');
        } catch (error: any) {
          addOutput('error', `Failed to add send-as: ${error.message}`);
        }
        break;
      }

      case 'remove': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw sendas remove <user-email> <send-as-email>');
          addOutput('info', 'Remove a send-as address from a user');
          return;
        }
        const userEmail = args[0];
        const sendAsEmail = args[1];

        try {
          await apiRequest('DELETE', `/api/google/gmail/v1/users/${userEmail}/settings/sendAs/${sendAsEmail}`);

          addOutput('success', `[OK]Removed send-as address ${sendAsEmail} from ${userEmail}`);
        } catch (error: any) {
          addOutput('error', `Failed to remove send-as: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: list, add, remove`);
    }
  };

  // ----- Google Workspace: Calendar Sharing -----
  const handleGWCalendar = async (action: string, args: string[]) => {
    switch (action) {
      case 'list': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw calendar list <user-email>');
          addOutput('info', 'List all calendars for a user');
          return;
        }
        const userEmail = args[0];

        try {
          const data = await apiRequest('GET', `/api/google/calendar/v3/users/${userEmail}/calendarList`);

          addOutput('success', `\nCalendars for ${userEmail}:`);
          addOutput('info', '='.repeat(80));
          if (data.items && data.items.length > 0) {
            data.items.forEach((cal: any) => {
              const id = (cal.id || '').substring(0, 40).padEnd(42);
              const summary = (cal.summary || 'Untitled').substring(0, 25).padEnd(27);
              const role = (cal.accessRole || 'unknown').padEnd(10);
              addOutput('info', `  ${id} ${summary} ${role}`);
            });
          } else {
            addOutput('info', '  (no calendars)');
          }
          addOutput('info', '='.repeat(80));
        } catch (error: any) {
          addOutput('error', `Failed to list calendars: ${error.message}`);
        }
        break;
      }

      case 'acl':
      case 'showacl': {
        if (args.length === 0) {
          addOutput('error', 'Usage: gw calendar acl <calendar-id>');
          addOutput('info', 'Show access control list for a calendar');
          addOutput('info', 'Calendar ID is usually the user email or a group calendar ID');
          return;
        }
        const calendarId = args[0];

        try {
          const data = await apiRequest('GET', `/api/google/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl`);

          addOutput('success', `\nCalendar ACL for ${calendarId}:`);
          addOutput('info', '='.repeat(70));
          addOutput('info', `${'USER/GROUP'.padEnd(40)} ${'ROLE'.padEnd(15)} SCOPE`);
          addOutput('info', '-'.repeat(70));
          if (data.items && data.items.length > 0) {
            data.items.forEach((acl: any) => {
              const scopeValue = (acl.scope?.value || acl.scope?.type || '').padEnd(40);
              const role = (acl.role || '').padEnd(15);
              const scopeType = acl.scope?.type || '';
              addOutput('info', `  ${scopeValue} ${role} ${scopeType}`);
            });
          } else {
            addOutput('info', '  (no ACL entries)');
          }
          addOutput('info', '='.repeat(70));
        } catch (error: any) {
          addOutput('error', `Failed to get calendar ACL: ${error.message}`);
        }
        break;
      }

      case 'share': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw calendar share <calendar-id> <user-email> [--role=reader|writer|owner]');
          addOutput('info', 'Share a calendar with another user');
          addOutput('info', 'Roles: freeBusyReader, reader, writer, owner');
          return;
        }
        const calendarId = args[0];
        const shareWith = args[1];
        const params = parseArgs(args.slice(2));
        const role = params.role || 'reader';

        try {
          await apiRequest('POST', `/api/google/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl`, {
            role: role,
            scope: {
              type: 'user',
              value: shareWith
            }
          });

          addOutput('success', `[OK]Shared calendar with ${shareWith} as ${role}`);
        } catch (error: any) {
          addOutput('error', `Failed to share calendar: ${error.message}`);
        }
        break;
      }

      case 'unshare': {
        if (args.length < 2) {
          addOutput('error', 'Usage: gw calendar unshare <calendar-id> <user-email>');
          addOutput('info', 'Remove calendar sharing for a user');
          return;
        }
        const calendarId = args[0];
        const removeUser = args[1];

        try {
          // ACL rule ID format is typically "user:email"
          const ruleId = `user:${removeUser}`;
          await apiRequest('DELETE', `/api/google/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl/${encodeURIComponent(ruleId)}`);

          addOutput('success', `[OK]Removed ${removeUser} from calendar`);
        } catch (error: any) {
          addOutput('error', `Failed to unshare calendar: ${error.message}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Use: list, acl, share, unshare`);
    }
  };

  // ===== MICROSOFT 365 COMMAND HANDLER =====
  const handleMicrosoft365Command = async (args: string[]) => {
    if (args.length === 0) {
      addOutput('error', 'Usage: helios m365 <resource> <action> [options]');
      addOutput('info', 'Resources: users, licenses, groups');
      return;
    }

    const resource = args[0];
    const action = args[1] || 'list';
    const restArgs = args.slice(2);

    switch (resource) {
      case 'users':
        await handleM365Users(action, restArgs);
        break;
      case 'licenses':
        await handleM365Licenses(action, restArgs);
        break;
      case 'groups':
        await handleM365Groups(action, restArgs);
        break;
      default:
        addOutput('error', `Unknown resource: ${resource}. Use: users, licenses, or groups`);
    }
  };

  // ----- Microsoft 365: Users -----
  const handleM365Users = async (action: string, args: string[]) => {
    switch (action) {
      case 'list': {
        const params = parseArgs(args);
        let endpoint = '/api/microsoft/graph/v1.0/users';

        // Add query parameters if provided
        const queryParams: string[] = [];
        if (params.filter) queryParams.push(`$filter=${encodeURIComponent(params.filter)}`);
        if (params.top) queryParams.push(`$top=${params.top}`);
        if (queryParams.length > 0) {
          endpoint += `?${queryParams.join('&')}`;
        }

        const data = await apiRequest('GET', endpoint);

        if (data.value && data.value.length > 0) {
          const users = data.value.map((u: any) => {
            const email = (u.userPrincipalName || '').padEnd(35);
            const displayName = (u.displayName || '').substring(0, 25).padEnd(25);
            const enabled = u.accountEnabled ? 'Enabled ' : 'Disabled';
            const licenses = (u.assignedLicenses?.length || 0).toString().padStart(3);
            return `${email} ${displayName} ${enabled} ${licenses} licenses`;
          }).join('\n');
          addOutput('success', `\nUSER PRINCIPAL NAME${' '.repeat(16)}DISPLAY NAME${' '.repeat(13)}STATUS    LICENSES\n${'='.repeat(95)}\n${users}`);
        } else {
          addOutput('info', 'No users found');
        }
        break;
      }

      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios m365 users get <email> [--format=table|json]');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));
        const format = params.format || 'table';

        const data = await apiRequest('GET', `/api/microsoft/graph/v1.0/users/${email}`);

        if (format === 'json') {
          addOutput('success', JSON.stringify(data, null, 2));
        } else {
          const formatField = (label: string, value: any) => {
            return value !== undefined && value !== null ? `  ${label.padEnd(25)}: ${value}` : '';
          };

          const output = [
            '\nUser Details:',
            '='.repeat(80),
            formatField('User Principal Name', data.userPrincipalName),
            formatField('Display Name', data.displayName),
            formatField('Given Name', data.givenName),
            formatField('Surname', data.surname),
            formatField('Job Title', data.jobTitle),
            formatField('Department', data.department),
            formatField('Office Location', data.officeLocation),
            formatField('Mobile Phone', data.mobilePhone),
            formatField('Business Phones', data.businessPhones?.join(', ')),
            formatField('Account Enabled', data.accountEnabled ? 'Yes' : 'No'),
            formatField('Mail', data.mail),
            formatField('Licenses', data.assignedLicenses?.length || 0),
            formatField('Created', data.createdDateTime ? new Date(data.createdDateTime).toLocaleString() : ''),
            '='.repeat(80),
            '',
            'Use --format=json for full details'
          ].filter(line => line).join('\n');

          addOutput('success', output);
        }
        break;
      }

      case 'create': {
        if (args.length < 3) {
          addOutput('error', 'Usage: helios m365 users create <email> --displayName=<name> --password=<pwd>');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));

        const [mailNickname] = email.split('@');
        const body: {
          accountEnabled: boolean;
          displayName: string;
          mailNickname: string;
          userPrincipalName: string;
          passwordProfile: { forceChangePasswordNextSignIn: boolean; password: string };
          givenName?: string;
          surname?: string;
        } = {
          accountEnabled: params.disabled !== 'true',
          displayName: params.displayName || params.name,
          mailNickname: mailNickname,
          userPrincipalName: email,
          passwordProfile: {
            forceChangePasswordNextSignIn: params.forceChange !== 'false',
            password: params.password
          }
        };

        if (params.firstName) body.givenName = params.firstName;
        if (params.lastName) body.surname = params.lastName;

        await apiRequest('POST', '/api/microsoft/graph/v1.0/users', body);
        addOutput('success', `[OK]User created: ${email}`);
        break;
      }

      case 'update': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios m365 users update <email> --displayName=<name> [--jobTitle=<title>]');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));

        const body: any = {};
        if (params.displayName) body.displayName = params.displayName;
        if (params.firstName) body.givenName = params.firstName;
        if (params.lastName) body.surname = params.lastName;
        if (params.jobTitle) body.jobTitle = params.jobTitle;
        if (params.department) body.department = params.department;
        if (params.officeLocation) body.officeLocation = params.officeLocation;
        if (params.mobilePhone) body.mobilePhone = params.mobilePhone;

        await apiRequest('PATCH', `/api/microsoft/graph/v1.0/users/${email}`, body);
        addOutput('success', `[OK]User updated: ${email}`);
        break;
      }

      case 'delete': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios m365 users delete <email>');
          return;
        }
        const email = args[0];
        await apiRequest('DELETE', `/api/microsoft/graph/v1.0/users/${email}`);
        addOutput('success', `[OK]User deleted: ${email}`);
        break;
      }

      case 'reset-password': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios m365 users reset-password <email> [--password=<pwd>] [--forceChange=true|false]');
          return;
        }
        const email = args[0];
        const params = parseArgs(args.slice(1));

        // Generate random password if not provided
        const generatePassword = () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
          let password = '';
          for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return password;
        };

        const password = params.password || generatePassword();
        const forceChange = params.forceChange !== 'false';

        await apiRequest('PATCH', `/api/microsoft/graph/v1.0/users/${email}`, {
          passwordProfile: {
            forceChangePasswordNextSignIn: forceChange,
            password: password
          }
        });

        addOutput('success', `[OK]Password reset for ${email}`);
        if (!params.password) {
          addOutput('info', `[KEY]Generated password: ${password}`);
        }
        if (forceChange) {
          addOutput('info', '[LOCK]User must change password at next sign-in');
        }
        break;
      }

      case 'enable': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios m365 users enable <email>');
          return;
        }
        const email = args[0];
        await apiRequest('PATCH', `/api/microsoft/graph/v1.0/users/${email}`, { accountEnabled: true });
        addOutput('success', `[OK]User enabled: ${email}`);
        break;
      }

      case 'disable': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios m365 users disable <email>');
          return;
        }
        const email = args[0];
        await apiRequest('PATCH', `/api/microsoft/graph/v1.0/users/${email}`, { accountEnabled: false });
        addOutput('success', `[OK]User disabled: ${email}`);
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Available: list, get, create, update, delete, reset-password, enable, disable`);
    }
  };

  // ----- Microsoft 365: Licenses -----
  const handleM365Licenses = async (action: string, args: string[]) => {
    switch (action) {
      case 'list': {
        const data = await apiRequest('GET', '/api/microsoft/graph/v1.0/subscribedSkus');

        if (data.value && data.value.length > 0) {
          addOutput('success', '\nAvailable License SKUs:');
          addOutput('success', '='.repeat(100));

          data.value.forEach((sku: any) => {
            const skuId = (sku.skuId || '').substring(0, 36).padEnd(37);
            const name = (sku.skuPartNumber || '').substring(0, 30).padEnd(31);
            const enabled = (sku.prepaidUnits?.enabled || 0).toString().padStart(5);
            const consumed = (sku.consumedUnits || 0).toString().padStart(5);
            const available = ((sku.prepaidUnits?.enabled || 0) - (sku.consumedUnits || 0)).toString().padStart(5);

            addOutput('success', `${skuId} ${name} Enabled: ${enabled} Used: ${consumed} Available: ${available}`);
          });
        } else {
          addOutput('info', 'No licenses found');
        }
        break;
      }

      case 'assign': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios m365 licenses assign <email> <skuId>');
          addOutput('info', 'Use "helios m365 licenses list" to see available SKU IDs');
          return;
        }
        const email = args[0];
        const skuId = args[1];

        const body = {
          addLicenses: [
            {
              skuId: skuId
            }
          ],
          removeLicenses: []
        };

        await apiRequest('POST', `/api/microsoft/graph/v1.0/users/${email}/assignLicense`, body);
        addOutput('success', `[OK]License assigned to ${email}`);
        break;
      }

      case 'remove': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios m365 licenses remove <email> <skuId>');
          return;
        }
        const email = args[0];
        const skuId = args[1];

        const body = {
          addLicenses: [],
          removeLicenses: [skuId]
        };

        await apiRequest('POST', `/api/microsoft/graph/v1.0/users/${email}/assignLicense`, body);
        addOutput('success', `[OK]License removed from ${email}`);
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Available: list, assign, remove`);
    }
  };

  // ----- Microsoft 365: Groups -----
  const handleM365Groups = async (action: string, args: string[]) => {
    switch (action) {
      case 'list': {
        const params = parseArgs(args);
        let endpoint = '/api/microsoft/graph/v1.0/groups';

        if (params.filter) {
          endpoint += `?$filter=${encodeURIComponent(params.filter)}`;
        }

        const data = await apiRequest('GET', endpoint);

        if (data.value && data.value.length > 0) {
          const groups = data.value.map((g: any) => {
            const email = (g.mail || 'N/A').padEnd(35);
            const displayName = (g.displayName || '').substring(0, 30).padEnd(31);
            const type = g.groupTypes?.includes('Unified') ? 'M365' : 'Security';
            const typeDisplay = type.padEnd(10);
            return `${email} ${displayName} ${typeDisplay}`;
          }).join('\n');
          addOutput('success', `\nEMAIL${' '.repeat(30)}DISPLAY NAME${' '.repeat(19)}TYPE\n${'='.repeat(85)}\n${groups}`);
        } else {
          addOutput('info', 'No groups found');
        }
        break;
      }

      case 'get': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios m365 groups get <groupId|email>');
          return;
        }
        const groupId = args[0];
        const data = await apiRequest('GET', `/api/microsoft/graph/v1.0/groups/${groupId}`);
        addOutput('success', JSON.stringify(data, null, 2));
        break;
      }

      case 'create': {
        if (args.length < 1) {
          addOutput('error', 'Usage: helios m365 groups create --displayName=<name> --mailNickname=<nickname> [--type=security|m365]');
          return;
        }
        const params = parseArgs(args);

        if (!params.displayName || !params.mailNickname) {
          addOutput('error', 'Both --displayName and --mailNickname are required');
          return;
        }

        const isM365Group = params.type === 'm365';
        const body: any = {
          displayName: params.displayName,
          mailNickname: params.mailNickname,
          mailEnabled: isM365Group,
          securityEnabled: true,
          groupTypes: isM365Group ? ['Unified'] : []
        };

        if (params.description) body.description = params.description;

        await apiRequest('POST', '/api/microsoft/graph/v1.0/groups', body);
        addOutput('success', `[OK]Group created: ${params.displayName}`);
        break;
      }

      case 'add-member': {
        if (args.length < 2) {
          addOutput('error', 'Usage: helios m365 groups add-member <groupId> <userId>');
          return;
        }
        const groupId = args[0];
        const userId = args[1];

        // Get the user's object ID if email was provided
        let userObjectId = userId;
        if (userId.includes('@')) {
          const userData = await apiRequest('GET', `/api/microsoft/graph/v1.0/users/${userId}`);
          userObjectId = userData.id;
        }

        const body = {
          '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userObjectId}`
        };

        await apiRequest('POST', `/api/microsoft/graph/v1.0/groups/${groupId}/members/$ref`, body);
        addOutput('success', `[OK]Member added to group`);
        break;
      }

      case 'list-members': {
        if (args.length === 0) {
          addOutput('error', 'Usage: helios m365 groups list-members <groupId>');
          return;
        }
        const groupId = args[0];
        const data = await apiRequest('GET', `/api/microsoft/graph/v1.0/groups/${groupId}/members`);

        if (data.value && data.value.length > 0) {
          const members = data.value.map((m: any) => {
            const upn = (m.userPrincipalName || 'N/A').padEnd(35);
            const displayName = (m.displayName || '').substring(0, 30).padEnd(31);
            return `${upn} ${displayName}`;
          }).join('\n');
          addOutput('success', `\nUSER PRINCIPAL NAME${' '.repeat(16)}DISPLAY NAME\n${'='.repeat(70)}\n${members}`);
        } else {
          addOutput('info', 'No members found');
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Available: list, get, create, add-member, list-members`);
    }
  };

  // ===== HELIOS USERS COMMAND HANDLER =====
  const handleUsersCommand = async (args: string[]) => {
    const action = args[0] || 'list';
    const restArgs = args.slice(1);

    switch (action) {
      case 'list': {
        const params = parseArgs(restArgs);
        const status = params.status || 'all';
        // Don't filter by userType by default - show all users
        const userType = params.type || '';

        let url = `/api/v1/organization/users?status=${status}`;
        if (userType) url += `&userType=${userType}`;
        const data = await apiRequest('GET', url);
        if (data.success) {
          const users = data.data.map((u: any) => {
            const email = (u.email || '').padEnd(30);
            // Extract first name from email if not in database
            const emailPrefix = u.email ? u.email.split('@')[0].split('.')[0] : '';
            // Check for all possible field name variations (camelCase, snake_case, lowercase)
            const firstName = (u.firstName || u.first_name || u.firstname || emailPrefix || 'N/A').substring(0, 15).padEnd(15);
            const lastName = (u.lastName || u.last_name || u.lastname || '').substring(0, 15).padEnd(15);

            // Platform detection - show which platforms user exists in
            const platforms = u.platforms || [];
            let platformStr = 'Local';
            if (platforms.includes('google_workspace') && platforms.includes('microsoft_365')) {
              platformStr = 'GW, M365';
            } else if (platforms.includes('google_workspace')) {
              platformStr = 'GW';
            } else if (platforms.includes('microsoft_365')) {
              platformStr = 'M365';
            }
            const platformDisplay = platformStr.padEnd(12);

            const status = (u.userStatus || u.user_status || u.userstatus || u.status || 'active').padEnd(10);
            return `${email} ${firstName} ${lastName} ${platformDisplay} ${status}`;
          }).join('\n');
          addOutput('success', `\nEMAIL${' '.repeat(25)}FIRST NAME${' '.repeat(5)}LAST NAME${' '.repeat(6)}PLATFORMS    STATUS\n${'='.repeat(90)}\n${users}`);
        }
        break;
      }

      case 'create': {
        // helios users create <email> --firstName=X --lastName=Y [--password=auto|<password>] [--google] [--m365] [--ou=/Path]
        if (restArgs.length < 1) {
          addOutput('error', 'Usage: helios users create <email> --firstName=<name> --lastName=<name> [options]');
          addOutput('info', '');
          addOutput('info', 'Options:');
          addOutput('info', '  --firstName=X       First name (required)');
          addOutput('info', '  --lastName=Y        Last name (required)');
          addOutput('info', '  --password=auto     Auto-generate memorable password (AdjectiveNoun#XXX)');
          addOutput('info', '  --password=<pwd>    Set specific password');
          addOutput('info', '  --department=X      Department name');
          addOutput('info', '  --jobTitle=X        Job title');
          addOutput('info', '  --role=user|manager|admin  Role (default: user)');
          addOutput('info', '  --google            Also create in Google Workspace');
          addOutput('info', '  --m365              Also create in Microsoft 365');
          addOutput('info', '  --ou=/Path          Organizational unit (for Google/M365)');
          addOutput('info', '');
          addOutput('info', 'Examples:');
          addOutput('info', '  helios users create john@company.com --firstName=John --lastName=Doe --password=auto');
          addOutput('info', '  helios users create john@company.com --firstName=John --lastName=Doe --password=auto --google --ou=/Staff');
          return;
        }

        const email = restArgs[0];
        const params = parseArgs(restArgs.slice(1));

        // Validate required fields
        if (!params.firstName || !params.lastName) {
          addOutput('error', 'Required: --firstName and --lastName');
          return;
        }

        // Handle password
        let password = params.password;
        let isAutoGenerated = false;
        if (password === 'auto' || password === '') {
          password = generateMemorablePassword();
          isAutoGenerated = true;
        }

        const createInGoogle = params.google !== undefined || params.gw !== undefined;
        const createInM365 = params.m365 !== undefined || params.microsoft !== undefined;

        // Step 1: Create user in Helios
        addOutput('info', `Creating user in Helios: ${email}`);

        const heliosBody: any = {
          email,
          firstName: params.firstName,
          lastName: params.lastName,
          department: params.department || null,
          jobTitle: params.jobTitle || null,
          role: params.role || 'user',
          userType: 'local'
        };

        if (password) {
          heliosBody.password = password;
        }

        try {
          const heliosResult = await apiRequest('POST', '/api/v1/organization/users', heliosBody);

          if (heliosResult.success) {
            addOutput('success', `  ✓ Created in Helios`);

            // Store initial password if auto-generated
            if (isAutoGenerated && password) {
              await storeInitialPassword(email, password);
            }

            // Step 2: Create in Google Workspace if requested
            if (createInGoogle) {
              addOutput('info', `Creating user in Google Workspace...`);
              try {
                const gwBody = {
                  primaryEmail: email,
                  name: {
                    givenName: params.firstName,
                    familyName: params.lastName
                  },
                  password: password || generateMemorablePassword(),
                  orgUnitPath: params.ou || '/',
                  changePasswordAtNextLogin: true
                };

                await apiRequest('POST', '/api/google/admin/directory/v1/users', gwBody);
                addOutput('success', `  ✓ Created in Google Workspace`);

                // Update Helios user to mark as synced to Google
                // This would typically be done by linking the Google ID
              } catch (gwError: any) {
                addOutput('error', `  ✗ Google Workspace: ${gwError.message}`);
              }
            }

            // Step 3: Create in M365 if requested
            if (createInM365) {
              addOutput('info', `Creating user in Microsoft 365...`);
              addOutput('info', `  (M365 provisioning not yet implemented)`);
              // TODO: Implement M365 user creation
            }

            // Summary
            addOutput('info', '');
            addOutput('success', `User created: ${email}`);

            if (isAutoGenerated && password) {
              addOutput('info', '');
              addOutput('info', 'Initial Password (auto-generated):');
              addOutput('info', '='.repeat(50));
              addOutput('success', `  ${password}`);
              addOutput('info', '='.repeat(50));
              addOutput('info', '');
              addOutput('info', 'To retrieve later: helios users initial-password ' + email);
              addOutput('info', 'Or view in User Slideout > Settings > Password');
            }

            const platforms = ['Helios'];
            if (createInGoogle) platforms.push('Google Workspace');
            if (createInM365) platforms.push('Microsoft 365');
            addOutput('info', `Platforms: ${platforms.join(', ')}`);

          } else {
            addOutput('error', `Failed to create user: ${heliosResult.error || 'Unknown error'}`);
          }
        } catch (error: any) {
          addOutput('error', `Failed to create user: ${error.message}`);
        }
        break;
      }

      case 'get': {
        if (restArgs.length === 0) {
          addOutput('error', 'Usage: helios users get <email>');
          return;
        }
        const email = restArgs[0];
        try {
          const data = await apiRequest('GET', `/api/v1/organization/users?email=${encodeURIComponent(email)}`);
          if (data.success && data.data && data.data.length > 0) {
            const user = data.data[0];
            addOutput('info', '');
            addOutput('info', `User: ${user.email}`);
            addOutput('info', '='.repeat(60));
            addOutput('info', `  Name: ${user.firstName || ''} ${user.lastName || ''}`);
            addOutput('info', `  Role: ${user.role || 'user'}`);
            addOutput('info', `  Status: ${user.status || 'active'}`);
            addOutput('info', `  Department: ${user.department || '-'}`);
            addOutput('info', `  Job Title: ${user.jobTitle || '-'}`);
            addOutput('info', `  Platforms: ${(user.platforms || ['Local']).join(', ')}`);
            addOutput('info', `  Created: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : '-'}`);
            addOutput('info', '='.repeat(60));
          } else {
            addOutput('error', `User not found: ${email}`);
          }
        } catch (error: any) {
          addOutput('error', `Failed to get user: ${error.message}`);
        }
        break;
      }

      case 'initial-password': {
        // Redirect to the same command we have in gw users
        if (restArgs.length === 0) {
          addOutput('error', 'Usage: helios users initial-password <email>');
          addOutput('info', 'Reveals the auto-generated initial password for a newly created user.');
          return;
        }
        const email = restArgs[0];

        // Try local state first
        let entry = revealInitialPassword(email);

        // If not in local state, try fetching from backend API
        if (!entry) {
          try {
            const response = await authFetch(`/api/v1/initial-passwords/${encodeURIComponent(email)}`);
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data) {
                entry = {
                  password: data.data.password,
                  createdAt: new Date(data.data.createdAt)
                };
                setInitialPasswords(prev => ({
                  ...prev,
                  [email.toLowerCase()]: { ...entry!, revealed: true }
                }));
              }
            }
          } catch (err) {
            // Silent fail
          }
        }

        if (entry) {
          addOutput('info', '');
          addOutput('info', `Initial Password for ${email}`);
          addOutput('info', '='.repeat(50));
          addOutput('success', `  ${entry.password}`);
          addOutput('info', '='.repeat(50));
          addOutput('info', `Created: ${entry.createdAt.toLocaleString()}`);
        } else {
          addOutput('error', `No initial password stored for ${email}`);
        }
        break;
      }

      case 'debug': {
        const data = await apiRequest('GET', '/api/v1/organization/users?status=all');
        addOutput('info', 'API Response:');
        addOutput('info', JSON.stringify(data, null, 2));

        // Show first user's fields
        if (data.success && data.data && data.data.length > 0) {
          const firstUser = data.data[0];
          addOutput('info', '\nFirst user fields:');
          addOutput('info', `  email: ${firstUser.email}`);
          addOutput('info', `  firstName: ${firstUser.firstName}`);
          addOutput('info', `  first_name: ${firstUser.first_name}`);
          addOutput('info', `  lastName: ${firstUser.lastName}`);
          addOutput('info', `  last_name: ${firstUser.last_name}`);
        }
        break;
      }

      default:
        addOutput('error', `Unknown action: ${action}. Available: list, create, get, initial-password`);
    }
  };

  // ===== HELIOS GROUPS COMMAND HANDLER =====
  const handleGroupsCommand = async (_args: string[]) => {
    addOutput('info', 'Helios groups commands coming soon...');
  };

  // ----- Helper: Parse --key=value arguments -----
  const parseArgs = (args: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const arg of args) {
      if (arg.startsWith('--')) {
        const [key, ...valueParts] = arg.substring(2).split('=');
        let value = valueParts.join('='); // Handle values with '=' in them
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        result[key] = value;
      }
    }
    return result;
  };

  // ----- Help Modal -----
  const showHelp = () => {
    setShowHelpModal(true);
  };

  // ----- Examples Modal -----
  const showExamples = () => {
    setShowExamplesModal(true);
  };

  // ----- Keyboard Handling -----
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isExecuting) {
      executeCommand(currentCommand);
      setCurrentCommand('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1
          ? commandHistory.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = Math.min(commandHistory.length - 1, historyIndex + 1);
        if (newIndex === commandHistory.length - 1 && historyIndex === commandHistory.length - 1) {
          setHistoryIndex(-1);
          setCurrentCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        }
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      // Ctrl+L / Cmd+L to clear console (standard terminal shortcut)
      e.preventDefault();
      setOutput([]);
      setCurrentCommand('');
      inputRef.current?.focus();
    } else if (e.key === 'Escape') {
      // Escape to close modals or unpinned panel, then focus input
      if (showHelpModal || showExamplesModal) {
        setShowHelpModal(false);
        setShowExamplesModal(false);
      } else if (showHelpPanel && !isHelpPanelPinned) {
        setShowHelpPanel(false);
      }
      inputRef.current?.focus();
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  // Pop-out console to a new window
  const handlePopOut = () => {
    const width = 900;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popupWindow = window.open(
      '/admin/console?mode=popup',
      'HeliosConsole',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes`
    );

    if (popupWindow) {
      popupWindow.focus();
      // Optionally navigate away from console in main window
      // window.location.href = '/admin/dashboard';
    }
  };

  // Close popup and return to main window
  const handleClosePopup = () => {
    window.close();
  };

  return (
    <div className={`developer-console-page ${isPopupMode ? 'popup-mode' : ''}`}>
      {!isPopupMode && (
        <div className="page-header">
          <h1>Developer Console</h1>
          <p className="page-subtitle">Execute commands and interact with Helios API</p>
        </div>
      )}

      <div className={`console-wrapper ${showHelpPanel ? `with-panel panel-${helpPanelDockPosition}` : ''} ${isPopupMode ? 'popup-wrapper' : ''}`}>
        <div className="console-container" onClick={() => inputRef.current?.focus()}>
          <div className="console-toolbar">
            <div className="console-toolbar-left">
              <div className="console-status">
                <span className={`status-dot ${isExecuting ? 'executing' : 'ready'}`}></span>
                <span>{isExecuting ? 'Executing...' : 'Ready'}</span>
              </div>
            </div>
            <div className="console-toolbar-right">
              <button
                onClick={toggleHelpPanel}
                className={`btn-console-action ${showHelpPanel ? 'active' : ''}`}
                title={showHelpPanel ? 'Hide command panel' : 'Show command panel'}
              >
                {helpPanelDockPosition === 'left' ? <PanelLeftOpen size={16} /> : <PanelRightOpen size={16} />}
              </button>
              <button
                onClick={() => setShowHelpModal(true)}
                className="btn-console-action"
                title="Show help (modal)"
              >
                <HelpCircle size={16} />
              </button>
              <button
                onClick={() => setShowExamplesModal(true)}
                className="btn-console-action"
                title="Show examples"
              >
                <BookOpen size={16} />
              </button>
              <button
                onClick={() => setOutput([])}
                className="btn-console-action"
                title="Clear console"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={handleCopyConsole}
                className="btn-console-action"
                title={copied ? "Copied!" : "Copy console output"}
                disabled={output.length === 0}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                onClick={handleDownloadConsole}
                className="btn-console-action"
                title="Download console output"
                disabled={output.length === 0}
              >
                <Download size={16} />
              </button>
              <div className="toolbar-separator" />
              {isPopupMode ? (
                <button
                  onClick={handleClosePopup}
                  className="btn-console-action btn-close-popup"
                  title="Close popup window"
                >
                  <Minimize2 size={16} />
                </button>
              ) : (
                <button
                  onClick={handlePopOut}
                  className="btn-console-action"
                  title="Pop out to new window"
                >
                  <ExternalLink size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="console-output" ref={outputRef}>
            {output.map((item, index) => (
              <div key={index} className={`output-line output-${item.type}`}>
                <span className="output-timestamp">[{formatTimestamp(item.timestamp)}]</span>
                <span className="output-content" style={{ whiteSpace: 'pre-wrap' }}>{item.content}</span>
              </div>
            ))}
          </div>

          <div className="console-input">
            <span className="input-prompt">$</span>
            <input
              ref={inputRef}
              type="text"
              value={currentCommand}
              onChange={(e) => setCurrentCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isExecuting}
              placeholder="Type a command..."
              className="input-field"
            />
          </div>
        </div>

        <ConsoleHelpPanel
          isOpen={showHelpPanel}
          onClose={() => setShowHelpPanel(false)}
          onInsertCommand={handleInsertCommand}
          dockPosition={helpPanelDockPosition}
          onChangeDockPosition={setHelpPanelDockPosition}
          isPinned={isHelpPanelPinned}
          onTogglePin={() => setIsHelpPanelPinned(prev => !prev)}
        />
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="modal-backdrop" onClick={() => setShowHelpModal(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Available Commands</h2>
              <button onClick={() => setShowHelpModal(false)} className="modal-close">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {/* Note about syntax */}
              <div className="help-note" style={{ marginBottom: '16px', padding: '12px', background: '#2d2d2d', borderRadius: '4px', fontSize: '13px', color: '#9ca3af' }}>
                <strong>Command Pattern:</strong> Use natural verb-first commands like <code style={{ background: '#1e1e1e', padding: '2px 6px', borderRadius: '3px' }}>create user</code>, <code style={{ background: '#1e1e1e', padding: '2px 6px', borderRadius: '3px' }}>list users</code>, <code style={{ background: '#1e1e1e', padding: '2px 6px', borderRadius: '3px' }}>delete group</code>. The "helios" prefix is optional.
              </div>

              {/* Built-in Commands */}
              <div className="help-section">
                <h3>Built-in Commands</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">help</td>
                      <td className="command-desc">Show this help modal with all available commands</td>
                    </tr>
                    <tr>
                      <td className="command-name">examples</td>
                      <td className="command-desc">Show practical usage examples for common operations</td>
                    </tr>
                    <tr>
                      <td className="command-name">clear</td>
                      <td className="command-desc">Clear all console output and start fresh</td>
                    </tr>
                    <tr>
                      <td className="command-name">password generate [--style=memorable|random]</td>
                      <td className="command-desc">Generate secure passwords. Default: AdjectiveNoun#XXX format</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* User Management (Verb-First Pattern) */}
              <div className="help-section">
                <h3>User Management</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                  Helios is the source of truth for identity management. Use --gw or --m365 flags to sync with external platforms.
                </p>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">create user &lt;email&gt; --firstName=X --lastName=Y [options]</td>
                      <td className="command-desc">Create user in Helios. Add --gw and/or --m365 to also provision externally</td>
                    </tr>
                    <tr>
                      <td className="command-name">list users [--status=all|active|deleted] [--filter="..."]</td>
                      <td className="command-desc">List all users in Helios across all platforms</td>
                    </tr>
                    <tr>
                      <td className="command-name">get user &lt;email&gt;</td>
                      <td className="command-desc">Get detailed information about a user</td>
                    </tr>
                    <tr>
                      <td className="command-name">update user &lt;email&gt; --firstName=X --jobTitle=Y</td>
                      <td className="command-desc">Update user properties (firstName, lastName, department, jobTitle, role)</td>
                    </tr>
                    <tr>
                      <td className="command-name">delete user &lt;email&gt; [--gw] [--confirm]</td>
                      <td className="command-desc">Delete user from Helios. Add --gw to also delete from Google Workspace</td>
                    </tr>
                    <tr>
                      <td className="command-name">export users [--format=csv|json]</td>
                      <td className="command-desc">Export all users to CSV or JSON file</td>
                    </tr>
                    <tr>
                      <td className="command-name">show initial-password &lt;email&gt;</td>
                      <td className="command-desc">Reveal auto-generated initial password for a newly created user</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Group Management (Verb-First Pattern) */}
              <div className="help-section">
                <h3>Group Management</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                  Manage groups across Helios and external platforms.
                </p>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">create group &lt;email&gt; --name="Name" [--gw]</td>
                      <td className="command-desc">Create group in Helios. Add --gw to also create in Google Workspace</td>
                    </tr>
                    <tr>
                      <td className="command-name">list groups</td>
                      <td className="command-desc">List all groups in Helios</td>
                    </tr>
                    <tr>
                      <td className="command-name">get group &lt;email&gt;</td>
                      <td className="command-desc">Get detailed information about a group</td>
                    </tr>
                    <tr>
                      <td className="command-name">update group &lt;email&gt; --name="New Name" [--description="..."]</td>
                      <td className="command-desc">Update group properties</td>
                    </tr>
                    <tr>
                      <td className="command-name">delete group &lt;email&gt; [--gw] [--confirm]</td>
                      <td className="command-desc">Delete group from Helios. Add --gw to also delete from Google Workspace</td>
                    </tr>
                    <tr>
                      <td className="command-name">export groups [--format=csv|json]</td>
                      <td className="command-desc">Export all groups to CSV or JSON file</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Google Workspace Users */}
              <div className="help-section">
                <h3>Google Workspace Commands</h3>
                <p style={{ fontSize: '13px', color: '#f59e0b', marginBottom: '12px' }}>
                  Platform-specific commands for Google Workspace. For CRUD operations, prefer verb-first commands (create user --gw).
                </p>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw users list</td>
                      <td className="command-desc">List users synced from Google Workspace only</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users list --filter="field:pattern"</td>
                      <td className="command-desc">Filter users by field (email, orgunit, status, firstname, lastname). Supports * wildcard.</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users get &lt;email&gt;</td>
                      <td className="command-desc">Get detailed information about a specific user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users create &lt;email&gt; --firstName=X --lastName=Y --password=Z|auto</td>
                      <td className="command-desc">Create user in Google Workspace AND Helios. --password=auto generates memorable password</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users suspend &lt;email&gt;</td>
                      <td className="command-desc">Suspend a user account (prevents login)</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users restore &lt;email&gt;</td>
                      <td className="command-desc">Restore a suspended user account</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users delete &lt;email&gt;</td>
                      <td className="command-desc">Permanently delete a user (cannot be undone)</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users delete --filter="..." [--dry-run] [--confirm]</td>
                      <td className="command-desc">Batch delete users matching filter. Use --dry-run to preview, --confirm to execute.</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users move &lt;email&gt; --ou=/Path</td>
                      <td className="command-desc">Move user to a different organizational unit</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users groups &lt;email&gt;</td>
                      <td className="command-desc">List all groups that this user belongs to</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users initial-password &lt;email&gt;</td>
                      <td className="command-desc">Reveal the auto-generated initial password for a newly created user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users list-initial-passwords</td>
                      <td className="command-desc">List all stored initial passwords (session only)</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users clear-initial-password &lt;email|--all&gt;</td>
                      <td className="command-desc">Clear stored initial password after user sets their own</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Groups */}
              <div className="help-section">
                <h3>Groups</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw groups list</td>
                      <td className="command-desc">List all Google Workspace groups</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups list --filter="field:pattern"</td>
                      <td className="command-desc">Filter groups by field (email, name). Supports * wildcard.</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups get &lt;email&gt;</td>
                      <td className="command-desc">Get detailed information about a group</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups create &lt;email&gt; --name="Name"</td>
                      <td className="command-desc">Create a new group with specified properties</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups update &lt;email&gt; --name="New Name"</td>
                      <td className="command-desc">Update group properties (name, description, etc.)</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups delete &lt;email&gt;</td>
                      <td className="command-desc">Delete a group permanently</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups delete --filter="..." [--dry-run] [--confirm]</td>
                      <td className="command-desc">Batch delete groups matching filter. Use --dry-run to preview, --confirm to execute.</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups members &lt;email&gt;</td>
                      <td className="command-desc">List all members of a group</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups add-member &lt;group&gt; &lt;user&gt;</td>
                      <td className="command-desc">Add a user to a group (optionally specify --role=OWNER)</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups add-member &lt;group&gt; --filter="..." [--dry-run]</td>
                      <td className="command-desc">Batch add users matching filter to a group</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups remove-member &lt;group&gt; &lt;user&gt;</td>
                      <td className="command-desc">Remove a user from a group</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw groups remove-member &lt;group&gt; --filter="..." [--confirm]</td>
                      <td className="command-desc">Batch remove members matching filter from a group</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Organizational Units */}
              <div className="help-section">
                <h3>Organizational Units</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw orgunits list</td>
                      <td className="command-desc">List all organizational units with user counts</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw orgunits get &lt;path&gt;</td>
                      <td className="command-desc">Get details about a specific OU (e.g., /Staff/Sales)</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw orgunits create &lt;parent&gt; --name="Name"</td>
                      <td className="command-desc">Create a new organizational unit under parent OU</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Email Delegation */}
              <div className="help-section">
                <h3>Email Delegation</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw delegates list &lt;email&gt;</td>
                      <td className="command-desc">List all delegates who can access user's email</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw delegates add &lt;user&gt; &lt;delegate&gt;</td>
                      <td className="command-desc">Grant email delegation access to another user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw delegates add &lt;delegate&gt; --filter="..." [--dry-run]</td>
                      <td className="command-desc">Batch add delegate to all users matching filter</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw delegates remove &lt;user&gt; &lt;delegate&gt;</td>
                      <td className="command-desc">Revoke email delegation access</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw delegates remove &lt;delegate&gt; --filter="..." [--confirm]</td>
                      <td className="command-desc">Batch remove delegate from all users matching filter</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Sync Operations */}
              <div className="help-section">
                <h3>Sync Operations</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw sync users</td>
                      <td className="command-desc">Manually sync users from Google Workspace</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw sync groups</td>
                      <td className="command-desc">Manually sync groups from Google Workspace</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw sync orgunits</td>
                      <td className="command-desc">Manually sync organizational units</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw sync all</td>
                      <td className="command-desc">Sync all data (users, groups, OUs) at once</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Data Transfer */}
              <div className="help-section">
                <h3>Data Transfer (Google)</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw transfer drive &lt;from&gt; --to=&lt;to&gt;</td>
                      <td className="command-desc">Transfer Drive ownership to another user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw transfer calendar &lt;from&gt; --to=&lt;to&gt;</td>
                      <td className="command-desc">Transfer Calendar events to another user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw transfer all &lt;from&gt; --to=&lt;to&gt;</td>
                      <td className="command-desc">Transfer Drive, Calendar, and Sites to another user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw transfer status &lt;transfer-id&gt;</td>
                      <td className="command-desc">Check the status of a data transfer</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw transfer list</td>
                      <td className="command-desc">List recent data transfers</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Email Settings */}
              <div className="help-section">
                <h3>Email Settings (Google)</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw forwarding get &lt;email&gt;</td>
                      <td className="command-desc">Get forwarding settings for a user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw forwarding set &lt;email&gt; --to=&lt;forward-to&gt;</td>
                      <td className="command-desc">Enable email forwarding for a user</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw forwarding set --filter="..." --to=&lt;email&gt; [--dry-run]</td>
                      <td className="command-desc">Batch set forwarding for all users matching filter</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw forwarding disable &lt;email&gt;</td>
                      <td className="command-desc">Disable email forwarding</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw forwarding disable --filter="..." [--dry-run]</td>
                      <td className="command-desc">Batch disable forwarding for all users matching filter</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw vacation get &lt;email&gt;</td>
                      <td className="command-desc">Get vacation/out-of-office settings</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw vacation set &lt;email&gt; --message="..."</td>
                      <td className="command-desc">Enable vacation responder</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw vacation disable &lt;email&gt;</td>
                      <td className="command-desc">Disable vacation responder</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* User Offboarding */}
              <div className="help-section">
                <h3>User Offboarding (Google)</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">gw users offboard &lt;email&gt;</td>
                      <td className="command-desc">Show offboarding options and help</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users offboard &lt;email&gt; --transfer-to=&lt;email&gt;</td>
                      <td className="command-desc">Transfer Drive/Calendar data during offboarding</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users offboard &lt;email&gt; --forward-to=&lt;email&gt;</td>
                      <td className="command-desc">Forward emails during offboarding</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users offboard &lt;email&gt; --suspend</td>
                      <td className="command-desc">Suspend user after offboarding steps</td>
                    </tr>
                    <tr>
                      <td className="command-name">gw users offboard &lt;email&gt; --revoke-access</td>
                      <td className="command-desc">Sign out sessions and revoke OAuth tokens</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Microsoft 365 Users */}
              <div className="help-section">
                <h3>Microsoft 365 Users</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">m365 users list</td>
                      <td className="command-desc">List ONLY users from Microsoft 365 (not GW or local-only users)</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 users get &lt;email&gt;</td>
                      <td className="command-desc">Get detailed information about a specific user</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 users create &lt;email&gt; --displayName=X --password=Y</td>
                      <td className="command-desc">Create a new Microsoft 365 user</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 users update &lt;email&gt; --displayName=X --jobTitle=Y</td>
                      <td className="command-desc">Update user properties</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 users delete &lt;email&gt;</td>
                      <td className="command-desc">Delete a user permanently</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 users reset-password &lt;email&gt;</td>
                      <td className="command-desc">Reset user password (generates random if not provided)</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 users enable &lt;email&gt;</td>
                      <td className="command-desc">Enable a disabled user account</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 users disable &lt;email&gt;</td>
                      <td className="command-desc">Disable a user account (prevents login)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Microsoft 365 Licenses */}
              <div className="help-section">
                <h3>Microsoft 365 Licenses</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">m365 licenses list</td>
                      <td className="command-desc">List all available license SKUs with usage stats</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 licenses assign &lt;email&gt; &lt;skuId&gt;</td>
                      <td className="command-desc">Assign a license to a user</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 licenses remove &lt;email&gt; &lt;skuId&gt;</td>
                      <td className="command-desc">Remove a license from a user</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Microsoft 365 Groups */}
              <div className="help-section">
                <h3>Microsoft 365 Groups</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">m365 groups list</td>
                      <td className="command-desc">List all Microsoft 365 and security groups</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 groups get &lt;groupId&gt;</td>
                      <td className="command-desc">Get detailed information about a group</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 groups create --displayName=X --mailNickname=Y</td>
                      <td className="command-desc">Create a new group (use --type=m365 for Microsoft 365 group)</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 groups add-member &lt;groupId&gt; &lt;userId&gt;</td>
                      <td className="command-desc">Add a user to a group (accepts email or object ID)</td>
                    </tr>
                    <tr>
                      <td className="command-name">m365 groups list-members &lt;groupId&gt;</td>
                      <td className="command-desc">List all members of a group</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Helios Users */}
              <div className="help-section">
                <h3>Helios Platform Users</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">users list</td>
                      <td className="command-desc">
                        List ALL users in Helios (the central source of truth)
                        <div className="command-example">Shows platform membership: GW (Google), M365 (Microsoft), or Local (Helios only)</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="command-name">users debug</td>
                      <td className="command-desc">Show raw API response for debugging</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Direct API */}
              <div className="help-section">
                <h3>Direct API Access (Transparent Proxy)</h3>
                <table className="command-table">
                  <tbody>
                    <tr>
                      <td className="command-name">api GET &lt;path&gt;</td>
                      <td className="command-desc">
                        Make a GET request to any Google Workspace API
                        <div className="command-example">Example: helios api GET /api/google/admin/directory/v1/users</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="command-name">api POST &lt;path&gt; '&#123;...&#125;'</td>
                      <td className="command-desc">
                        Make a POST request with JSON body
                        <div className="command-example">Example: helios api POST /api/google/admin/directory/v1/users '&#123;"primaryEmail":"user@company.com"&#125;'</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="command-name">api PATCH &lt;path&gt; '&#123;...&#125;'</td>
                      <td className="command-desc">Make a PATCH request to update resources</td>
                    </tr>
                    <tr>
                      <td className="command-name">api DELETE &lt;path&gt;</td>
                      <td className="command-desc">Make a DELETE request to remove resources</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Batch Operations */}
              <div className="help-section">
                <h3>Batch Operations</h3>
                <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '12px' }}>
                  Use <code style={{ background: '#1e1e1e', padding: '2px 6px', borderRadius: '3px' }}>--filter</code> to select multiple items for batch operations. Supported for <strong>users</strong> and <strong>groups</strong>.
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>User Filter Fields:</div>
                  <table className="command-table">
                    <thead>
                      <tr>
                        <th style={{ color: '#9ca3af', fontWeight: 500 }}>Filter Field</th>
                        <th style={{ color: '#9ca3af', fontWeight: 500 }}>Example</th>
                        <th style={{ color: '#9ca3af', fontWeight: 500 }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="command-name">email:</td>
                        <td className="command-desc"><code>--filter="email:test*"</code></td>
                        <td className="command-desc">Match emails starting with "test"</td>
                      </tr>
                      <tr>
                        <td className="command-name">orgunit:</td>
                        <td className="command-desc"><code>--filter="orgunit:/Contractors"</code></td>
                        <td className="command-desc">Match users in organizational unit</td>
                      </tr>
                      <tr>
                        <td className="command-name">status:</td>
                        <td className="command-desc"><code>--filter="status:suspended"</code></td>
                        <td className="command-desc">Match by status (active, suspended, archived)</td>
                      </tr>
                      <tr>
                        <td className="command-name">firstname:</td>
                        <td className="command-desc"><code>--filter="firstname:John*"</code></td>
                        <td className="command-desc">Match by first name</td>
                      </tr>
                      <tr>
                        <td className="command-name">lastname:</td>
                        <td className="command-desc"><code>--filter="lastname:Smith"</code></td>
                        <td className="command-desc">Match by last name</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>Group Filter Fields:</div>
                  <table className="command-table">
                    <tbody>
                      <tr>
                        <td className="command-name">email:</td>
                        <td className="command-desc"><code>--filter="email:test-*"</code></td>
                        <td className="command-desc">Match group emails</td>
                      </tr>
                      <tr>
                        <td className="command-name">name:</td>
                        <td className="command-desc"><code>--filter="name:Test*"</code></td>
                        <td className="command-desc">Match group names</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '12px', padding: '12px', background: '#2d2d2d', borderRadius: '4px', fontSize: '13px' }}>
                  <div style={{ color: '#f59e0b', marginBottom: '8px' }}>Batch Delete Safety:</div>
                  <ul style={{ color: '#9ca3af', margin: 0, paddingLeft: '20px' }}>
                    <li><code>--dry-run</code> - Preview what would be deleted without making changes</li>
                    <li><code>--confirm</code> - Required to actually execute the batch delete</li>
                    <li>Always use <code>--dry-run</code> first to verify the filter matches expected users</li>
                  </ul>
                </div>
              </div>

              {/* Tips */}
              <div className="help-section">
                <h3>Tips</h3>
                <ul className="help-tips">
                  <li>Use ↑/↓ arrow keys to navigate command history</li>
                  <li>Press Ctrl+L (Cmd+L on Mac) to clear the console</li>
                  <li>Press Escape to close modals and return focus to console</li>
                  <li>Click anywhere in the console to focus the input field</li>
                  <li>Platform codes: <strong>GW</strong> = Google Workspace, <strong>M365</strong> = Microsoft 365, <strong>Local</strong> = Helios only</li>
                  <li>All commands are automatically logged with audit trail</li>
                  <li>Use the transparent proxy (helios api) for any Google Workspace API</li>
                  <li>Check docs at: API Documentation (in user menu)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Examples Modal */}
      {showExamplesModal && (
        <div className="modal-backdrop" onClick={() => setShowExamplesModal(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Usage Examples</h2>
              <button onClick={() => setShowExamplesModal(false)} className="modal-close">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="example-section">
                <h4>List all Google Workspace users</h4>
                <code className="example-code">gw users list</code>
              </div>

              <div className="example-section">
                <h4>Create a new user</h4>
                <code className="example-code">gw users create john.doe@company.com --firstName="John" --lastName="Doe" --password="TempPass123!" --ou="/Staff"</code>
              </div>

              <div className="example-section">
                <h4>Suspend a user account</h4>
                <code className="example-code">gw users suspend john.doe@company.com</code>
              </div>

              <div className="example-section">
                <h4>Restore a suspended user</h4>
                <code className="example-code">gw users restore john.doe@company.com</code>
              </div>

              <div className="example-section">
                <h4>List all groups</h4>
                <code className="example-code">gw groups list</code>
              </div>

              <div className="example-section">
                <h4>Create a new group</h4>
                <code className="example-code">gw groups create sales@company.com --name="Sales Team" --description="Sales department group"</code>
              </div>

              <div className="example-section">
                <h4>Add user to group</h4>
                <code className="example-code">gw groups add-member sales@company.com john.doe@company.com --role=MEMBER</code>
              </div>

              <div className="example-section">
                <h4>Remove user from group</h4>
                <code className="example-code">gw groups remove-member sales@company.com john.doe@company.com</code>
              </div>

              <div className="example-section">
                <h4>Move user to different organizational unit</h4>
                <code className="example-code">gw users move john.doe@company.com --ou="/Staff/Sales"</code>
              </div>

              <div className="example-section">
                <h4>Grant email delegation access</h4>
                <code className="example-code">gw delegates add manager@company.com assistant@company.com</code>
              </div>

              <div className="example-section">
                <h4>List user's email delegates</h4>
                <code className="example-code">gw delegates list manager@company.com</code>
              </div>

              <div className="example-section">
                <h4>Sync all data from Google Workspace</h4>
                <code className="example-code">gw sync all</code>
              </div>

              <div className="example-section">
                <h4>List all Microsoft 365 users</h4>
                <code className="example-code">m365 users list</code>
              </div>

              <div className="example-section">
                <h4>Create a Microsoft 365 user</h4>
                <code className="example-code">m365 users create jane.smith@company.com --displayName="Jane Smith" --password="TempPass123!"</code>
              </div>

              <div className="example-section">
                <h4>Reset Microsoft 365 user password</h4>
                <code className="example-code">m365 users reset-password jane.smith@company.com</code>
              </div>

              <div className="example-section">
                <h4>List available Microsoft 365 licenses</h4>
                <code className="example-code">m365 licenses list</code>
              </div>

              <div className="example-section">
                <h4>Assign license to Microsoft 365 user</h4>
                <code className="example-code">m365 licenses assign jane.smith@company.com &lt;sku-id&gt;</code>
              </div>

              <div className="example-section">
                <h4>List Microsoft 365 groups</h4>
                <code className="example-code">m365 groups list</code>
              </div>

              <div className="example-section">
                <h4>Create Microsoft 365 group</h4>
                <code className="example-code">m365 groups create --displayName="Marketing Team" --mailNickname="marketing" --type=m365</code>
              </div>

              <div className="example-section">
                <h4>Add member to Microsoft 365 group</h4>
                <code className="example-code">m365 groups add-member &lt;group-id&gt; jane.smith@company.com</code>
              </div>

              <div className="example-section">
                <h4>Direct API call via transparent proxy</h4>
                <code className="example-code">api GET /api/google/admin/directory/v1/users/john.doe@company.com</code>
              </div>

              <div className="example-section">
                <h4>Create resource via API</h4>
                <code className="example-code">api POST /api/google/admin/directory/v1/users '&#123;"primaryEmail":"new.user@company.com","name":&#123;"givenName":"New","familyName":"User"&#125;,"password":"TempPass123!"&#125;'</code>
              </div>

              <div className="example-section">
                <h4>List ALL users in Helios (central source)</h4>
                <code className="example-code">users list</code>
              </div>
              <div className="example-section">
                <h4>Compare: GW users vs all Helios users</h4>
                <code className="example-code"># GW only: gw users list{'\n'}# All users: users list</code>
              </div>

              <div className="example-section" style={{ marginTop: '24px', borderTop: '1px solid #374151', paddingTop: '16px' }}>
                <h4 style={{ color: '#f59e0b' }}>Batch Operations</h4>
              </div>

              <div className="example-section">
                <h4>Filter users by email pattern</h4>
                <code className="example-code">gw users list --filter="email:test*"</code>
              </div>

              <div className="example-section">
                <h4>Filter users by organizational unit</h4>
                <code className="example-code">gw users list --filter="orgunit:/Contractors"</code>
              </div>

              <div className="example-section">
                <h4>Filter suspended users</h4>
                <code className="example-code">gw users list --filter="status:suspended"</code>
              </div>

              <div className="example-section">
                <h4>Preview batch delete (dry run)</h4>
                <code className="example-code">gw users delete --filter="email:test*" --dry-run</code>
              </div>

              <div className="example-section">
                <h4>Execute batch delete (with confirmation)</h4>
                <code className="example-code">gw users delete --filter="email:test*" --confirm</code>
              </div>

              <div className="example-section">
                <h4>Filter groups by email pattern</h4>
                <code className="example-code">gw groups list --filter="email:test-*"</code>
              </div>

              <div className="example-section">
                <h4>Batch delete groups (with dry run)</h4>
                <code className="example-code">gw groups delete --filter="name:Test*" --dry-run</code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
