import { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, X, Pin, PinOff, Plus, Copy } from 'lucide-react';
import './ConsoleHelpPanel.css';

export interface CommandInfo {
  command: string;
  description: string;
  example?: string;
}

export interface CommandSection {
  title: string;
  commands: CommandInfo[];
}

interface ConsoleHelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCommand: (command: string) => void;
  dockPosition: 'left' | 'right';
  onChangeDockPosition: (position: 'left' | 'right') => void;
  isPinned: boolean;
  onTogglePin: () => void;
}

const COMMAND_SECTIONS: CommandSection[] = [
  {
    title: 'Built-in Commands',
    commands: [
      { command: 'help', description: 'Show this help panel' },
      { command: 'examples', description: 'Show practical usage examples' },
      { command: 'clear', description: 'Clear console output' }
    ]
  },
  {
    title: 'Google Workspace Users',
    commands: [
      { command: 'gw users list', description: 'List all Google Workspace users', example: 'gw users list' },
      { command: 'gw users get <email>', description: 'Get user details', example: 'gw users get john@example.com' },
      { command: 'gw users create <email> --firstName=X --lastName=Y --password=Z', description: 'Create a new user', example: 'gw users create john@example.com --firstName=John --lastName=Doe --password=SecurePass123!' },
      { command: 'gw users suspend <email>', description: 'Suspend a user account', example: 'gw users suspend john@example.com' },
      { command: 'gw users restore <email>', description: 'Restore a suspended user', example: 'gw users restore john@example.com' },
      { command: 'gw users delete <email>', description: 'Delete a user permanently', example: 'gw users delete john@example.com' },
      { command: 'gw users move <email> --ou=/Path', description: 'Move user to different OU', example: 'gw users move john@example.com --ou=/Staff/Sales' },
      { command: 'gw users groups <email>', description: 'List user group memberships', example: 'gw users groups john@example.com' }
    ]
  },
  {
    title: 'Groups',
    commands: [
      { command: 'gw groups list', description: 'List all Google Workspace groups', example: 'gw groups list' },
      { command: 'gw groups get <email>', description: 'Get group details', example: 'gw groups get team@example.com' },
      { command: 'gw groups create <email> --name="Name"', description: 'Create a new group', example: 'gw groups create team@example.com --name="Team Group"' },
      { command: 'gw groups update <email> --name="Name"', description: 'Update group properties', example: 'gw groups update team@example.com --name="New Team Name"' },
      { command: 'gw groups delete <email>', description: 'Delete a group', example: 'gw groups delete team@example.com' },
      { command: 'gw groups members <email>', description: 'List group members', example: 'gw groups members team@example.com' },
      { command: 'gw groups add-member <group> <user>', description: 'Add user to group', example: 'gw groups add-member team@example.com john@example.com' },
      { command: 'gw groups remove-member <group> <user>', description: 'Remove user from group', example: 'gw groups remove-member team@example.com john@example.com' }
    ]
  },
  {
    title: 'Organizational Units',
    commands: [
      { command: 'gw orgunits list', description: 'List all organizational units', example: 'gw orgunits list' },
      { command: 'gw orgunits get <path>', description: 'Get OU details', example: 'gw orgunits get /Staff/Sales' },
      { command: 'gw orgunits create <parent> --name="Name"', description: 'Create new OU', example: 'gw orgunits create /Staff --name="Marketing"' }
    ]
  },
  {
    title: 'Email Delegation',
    commands: [
      { command: 'gw delegates list <email>', description: 'List email delegates', example: 'gw delegates list john@example.com' },
      { command: 'gw delegates add <user> <delegate>', description: 'Add email delegate', example: 'gw delegates add john@example.com assistant@example.com' },
      { command: 'gw delegates remove <user> <delegate>', description: 'Remove email delegate', example: 'gw delegates remove john@example.com assistant@example.com' }
    ]
  },
  {
    title: 'Sync Operations',
    commands: [
      { command: 'gw sync users', description: 'Sync users from Google Workspace', example: 'gw sync users' },
      { command: 'gw sync groups', description: 'Sync groups from Google Workspace', example: 'gw sync groups' },
      { command: 'gw sync orgunits', description: 'Sync organizational units', example: 'gw sync orgunits' },
      { command: 'gw sync all', description: 'Sync all data at once', example: 'gw sync all' }
    ]
  },
  {
    title: 'Data Transfer',
    commands: [
      { command: 'gw transfer drive <from> --to=<to>', description: 'Transfer Drive ownership', example: 'gw transfer drive john@example.com --to=manager@example.com' },
      { command: 'gw transfer calendar <from> --to=<to>', description: 'Transfer Calendar events', example: 'gw transfer calendar john@example.com --to=manager@example.com' },
      { command: 'gw transfer all <from> --to=<to>', description: 'Transfer Drive, Calendar, Sites', example: 'gw transfer all john@example.com --to=manager@example.com' },
      { command: 'gw transfer status <id>', description: 'Check transfer status', example: 'gw transfer status transfer-id-here' },
      { command: 'gw transfer list', description: 'List recent transfers', example: 'gw transfer list' }
    ]
  },
  {
    title: 'Security & 2FA',
    commands: [
      { command: 'list 2fa', description: 'List 2FA status for all users', example: 'list 2fa' },
      { command: 'list 2fa --enrolled', description: 'List users enrolled in 2FA', example: 'list 2fa --enrolled' },
      { command: 'list 2fa --not-enrolled', description: 'List users NOT enrolled in 2FA', example: 'list 2fa --not-enrolled' },
      { command: 'list 2fa --enforced', description: 'List users with 2FA enforced', example: 'list 2fa --enforced' },
      { command: 'get 2fa <email>', description: 'Get 2FA status for a user', example: 'get 2fa john@example.com' },
      { command: 'list tokens', description: 'List all OAuth apps in organization', example: 'list tokens' },
      { command: 'list tokens --high-risk', description: 'List only high-risk OAuth apps', example: 'list tokens --high-risk' },
      { command: 'list tokens --user <email>', description: 'List OAuth tokens for a user', example: 'list tokens --user john@example.com' },
      { command: 'revoke token <email> <clientId>', description: 'Revoke OAuth token from user', example: 'revoke token john@example.com 123456.apps.googleusercontent.com' }
    ]
  },
  {
    title: 'Email Settings',
    commands: [
      { command: 'gw forwarding get <email>', description: 'Get forwarding settings', example: 'gw forwarding get john@example.com' },
      { command: 'gw forwarding set <email> --to=<to>', description: 'Enable email forwarding', example: 'gw forwarding set john@example.com --to=support@example.com' },
      { command: 'gw forwarding disable <email>', description: 'Disable forwarding', example: 'gw forwarding disable john@example.com' },
      { command: 'gw vacation get <email>', description: 'Get vacation settings', example: 'gw vacation get john@example.com' },
      { command: 'gw vacation set <email> --message="..."', description: 'Enable vacation responder', example: 'gw vacation set john@example.com --message="I am out of office"' },
      { command: 'gw vacation disable <email>', description: 'Disable vacation responder', example: 'gw vacation disable john@example.com' }
    ]
  },
  {
    title: 'User Offboarding',
    commands: [
      { command: 'gw users offboard <email>', description: 'Show offboarding options', example: 'gw users offboard john@example.com' },
      { command: 'gw users offboard <email> --transfer-to=<to>', description: 'Offboard with data transfer', example: 'gw users offboard john@example.com --transfer-to=manager@example.com' },
      { command: 'gw users offboard <email> --forward-to=<to>', description: 'Offboard with forwarding', example: 'gw users offboard john@example.com --forward-to=support@example.com' },
      { command: 'gw users offboard <email> --suspend', description: 'Offboard and suspend', example: 'gw users offboard john@example.com --suspend --transfer-to=manager@example.com' },
      { command: 'gw users offboard <email> --revoke-access', description: 'Revoke sessions and tokens', example: 'gw users offboard john@example.com --revoke-access --suspend' }
    ]
  },
  {
    title: 'Microsoft 365 Users',
    commands: [
      { command: 'm365 users list', description: 'List all Microsoft 365 users', example: 'm365 users list' },
      { command: 'm365 users get <email>', description: 'Get user details', example: 'm365 users get john@example.com' },
      { command: 'm365 users licenses <email>', description: 'List user licenses', example: 'm365 users licenses john@example.com' }
    ]
  },
  {
    title: 'Microsoft 365 Groups',
    commands: [
      { command: 'm365 groups list', description: 'List all Microsoft 365 groups', example: 'm365 groups list' },
      { command: 'm365 groups get <id>', description: 'Get group details', example: 'm365 groups get group-id-here' },
      { command: 'm365 groups members <id>', description: 'List group members', example: 'm365 groups members group-id-here' }
    ]
  }
];

export function ConsoleHelpPanel({
  isOpen,
  onClose,
  onInsertCommand,
  dockPosition,
  onChangeDockPosition,
  isPinned,
  onTogglePin
}: ConsoleHelpPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(COMMAND_SECTIONS.map(s => s.title)));
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  // Filter commands based on search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return COMMAND_SECTIONS;
    }

    const query = searchQuery.toLowerCase();
    return COMMAND_SECTIONS.map(section => ({
      ...section,
      commands: section.commands.filter(cmd =>
        cmd.command.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
      )
    })).filter(section => section.commands.length > 0);
  }, [searchQuery]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(title)) {
        newSet.delete(title);
      } else {
        newSet.add(title);
      }
      return newSet;
    });
  };

  const handleInsert = (command: string) => {
    onInsertCommand(command);
  };

  const handleCopy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`console-help-panel dock-${dockPosition}`}>
      <div className="help-panel-header">
        <h3>Commands</h3>
        <div className="header-actions">
          <button
            className="panel-action-btn"
            onClick={onTogglePin}
            title={isPinned ? 'Unpin panel' : 'Pin panel'}
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            className="panel-action-btn"
            onClick={() => onChangeDockPosition(dockPosition === 'left' ? 'right' : 'left')}
            title={`Dock to ${dockPosition === 'left' ? 'right' : 'left'}`}
          >
            {dockPosition === 'left' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          <button
            className="panel-action-btn"
            onClick={onClose}
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="help-panel-search">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          placeholder="Search commands..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>
            <X size={12} />
          </button>
        )}
      </div>

      <div className="help-panel-content">
        {filteredSections.length === 0 ? (
          <div className="no-results">
            <p>No commands match "{searchQuery}"</p>
          </div>
        ) : (
          filteredSections.map(section => (
            <div key={section.title} className="command-section">
              <button
                className="section-header"
                onClick={() => toggleSection(section.title)}
              >
                <span className="section-title">{section.title}</span>
                <span className="section-count">{section.commands.length}</span>
                <span className={`section-arrow ${expandedSections.has(section.title) ? 'expanded' : ''}`}>
                  <ChevronRight size={14} />
                </span>
              </button>
              {expandedSections.has(section.title) && (
                <div className="section-commands">
                  {section.commands.map(cmd => (
                    <div key={cmd.command} className="command-item">
                      <div className="command-main">
                        <code className="command-syntax">{cmd.command}</code>
                        <p className="command-description">{cmd.description}</p>
                      </div>
                      <div className="command-actions">
                        <button
                          className="insert-btn"
                          onClick={() => handleInsert(cmd.example || cmd.command)}
                          title="Insert into console"
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          className={`copy-btn ${copiedCommand === (cmd.example || cmd.command) ? 'copied' : ''}`}
                          onClick={() => handleCopy(cmd.example || cmd.command)}
                          title="Copy to clipboard"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="help-panel-footer">
        <span className="tip">Tip: The "helios" prefix is optional</span>
      </div>
    </div>
  );
}

export default ConsoleHelpPanel;
