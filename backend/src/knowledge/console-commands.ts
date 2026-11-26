/**
 * The Developer Console commands the assistant is allowed to suggest.
 *
 * This is the one list the assistant's prompt is built from. Every entry is a
 * command the console accepts as written; `console-commands.test.ts` checks
 * each one against the console source, so a command that does not exist cannot
 * be added here. Keep descriptions to what the command does today.
 */
export interface ConsoleCommand {
  command: string;
  does: string;
}

export interface ConsoleCommandGroup {
  title: string;
  commands: ConsoleCommand[];
}

export const CONSOLE_COMMANDS: ConsoleCommandGroup[] = [
  {
    title: 'Google Workspace users (`gw users`)',
    commands: [
      { command: 'gw users list', does: 'List users synced from Google Workspace (email, name, org unit, status)' },
      { command: 'gw users list --status=suspended', does: 'List only users with that status (active, suspended)' },
      { command: 'gw users list --ou=/Staff', does: 'List only users in that organizational unit' },
      { command: 'gw users get <email>', does: 'Show one user in detail' },
      { command: 'gw users create <email> --firstName=X --lastName=Y --password=auto', does: 'Create a user; `auto` generates a password' },
      { command: 'gw users update <email> --jobTitle="X" --department=Y', does: 'Change name, job title or department' },
      { command: 'gw users move <email> --ou=/Staff/Sales', does: 'Move a user to another organizational unit' },
      { command: 'gw users suspend <email>', does: 'Suspend a user' },
      { command: 'gw users restore <email>', does: 'Restore a suspended user' },
      { command: 'gw users delete <email> --confirm', does: 'Delete a user in Google Workspace; refused without --confirm' },
      { command: 'gw users undelete <email>', does: 'Bring back a recently deleted user; Google can take a few minutes to list a deletion' },
      { command: 'gw users reset-password <email>', does: 'Set a new generated password' },
      { command: 'gw users groups <email>', does: 'List the groups a user belongs to' },
      { command: 'gw users list-aliases <email>', does: 'List a user\'s aliases' },
      { command: 'gw users add-alias <email> <alias>', does: 'Add an alias' },
      { command: 'gw users remove-alias <email> <alias>', does: 'Remove an alias; wait a minute after adding one' },
    ],
  },
  {
    title: 'Offboarding (`gw offboard`)',
    commands: [
      { command: 'gw offboard <email> --vacation="message" --revoke', does: 'Offboard a user through the audited workflow; suspends by default, never deletes unless asked' },
    ],
  },
  {
    title: 'Google Workspace groups (`gw groups`)',
    commands: [
      { command: 'gw groups list', does: 'List groups' },
      { command: 'gw groups get <group-email>', does: 'Show one group' },
      { command: 'gw groups create <group-email> --name="Name" --description="Text"', does: 'Create a group' },
      { command: 'gw groups update <group-email> --description="Text"', does: 'Change a group\'s name or description' },
      { command: 'gw groups delete <group-email> --confirm', does: 'Delete a group; refused without --confirm' },
      { command: 'gw groups members <group-email>', does: 'List members' },
      { command: 'gw groups add-member <group-email> <user-email>', does: 'Add a member' },
      { command: 'gw groups remove-member <group-email> <user-email>', does: 'Remove a member' },
      { command: 'gw groups set-member-role <group-email> <user-email> MANAGER', does: 'Change a member\'s role (MEMBER, MANAGER, OWNER)' },
    ],
  },
  {
    title: 'Organizational units (`gw orgunits`)',
    commands: [
      { command: 'gw orgunits list', does: 'List organizational units' },
      { command: 'gw orgunits get </Path>', does: 'Show one organizational unit' },
      { command: 'gw orgunits create </Path> --description="Text"', does: 'Create an organizational unit' },
      { command: 'gw orgunits update </Path> --description="Text"', does: 'Change an organizational unit' },
      { command: 'gw orgunits delete </Path> --confirm', does: 'Delete an organizational unit; refused without --confirm' },
    ],
  },
  {
    title: 'Mail settings',
    commands: [
      { command: 'gw delegates list <email>', does: 'List who can read and send mail for a user' },
      { command: 'gw forwarding get <email>', does: 'Show a user\'s mail forwarding' },
      { command: 'gw vacation get <email>', does: 'Show a user\'s out-of-office reply' },
      { command: 'gw vacation set <email> --message="Text" --subject="Text"', does: 'Turn on an out-of-office reply' },
      { command: 'gw vacation disable <email>', does: 'Turn off the out-of-office reply' },
      { command: 'gw signature get <email>', does: 'Show a user\'s Gmail signature' },
      { command: 'gw sendas list <email>', does: 'List a user\'s send-as addresses' },
    ],
  },
  {
    title: 'Sync and the rest',
    commands: [
      { command: 'gw sync users', does: 'Sync users from Google Workspace now' },
      { command: 'gw sync groups', does: 'Sync groups now' },
      { command: 'gw sync orgunits', does: 'Sync organizational units now' },
      { command: 'gw sync all', does: 'Sync everything now' },
      { command: 'gw domains list', does: 'List the domains on the Google Workspace account' },
      { command: 'gw shared-drives list', does: 'List shared drives' },
      { command: 'gw calendar list <email>', does: 'List a user\'s calendars' },
      { command: 'help', does: 'Show every command the console accepts' },
    ],
  },
];

/** The command list as it appears in the assistant's prompt. */
export function commandReference(): string {
  const groups = CONSOLE_COMMANDS.map(
    (group) =>
      `### ${group.title}\n` + group.commands.map((c) => `- \`${c.command}\` - ${c.does}`).join('\n')
  );
  return (
    '## Developer Console commands\n\n' +
    'These are the only commands you may suggest. The "helios" prefix is optional. ' +
    'There is no command to count things: to answer "how many", tell the user to run the list command and read the "Found N" line, or to look at the page. ' +
    'If what the user wants is not in this list, say there is no console command for it and point to the page in Helios.\n\n' +
    groups.join('\n\n')
  );
}

/** Where the command list goes in a prompt an administrator has edited. */
export const COMMANDS_PLACEHOLDER = '{{commands}}';

/** Fill the placeholder with the current command list. */
export function fillPrompt(template: string): string {
  return template.split(COMMANDS_PLACEHOLDER).join(commandReference());
}
