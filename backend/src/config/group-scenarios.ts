/**
 * Group scenarios (D-048): the ONE place built-in scenarios are defined.
 *
 * A scenario is a use case for a Google Group written as a user story, plus the
 * exact settings that make it work. Creating a group from a scenario creates the
 * group, applies these settings, reads them back and reports every mismatch.
 *
 * Source of the values: the Helios knowledge-base articles
 * `guide-google-groups-settings` and `guide-google-groups-recipes`
 * (knowledge/content/google-groups.json). Each scenario names its recipe letter.
 * Where a recipe gives a choice ("X or Y"), the first or recommended option is
 * used and the alternative is stated in the explainer. Where the recipe asks for
 * something the Groups Settings API cannot express, the setting is NOT guessed:
 * it is listed under `manualSteps` (done in Google's own UI) and, when the KB and
 * the API disagree, under `kbApiNotes`.
 *
 * Built-in scenarios can be disabled per organization but never deleted
 * (group_scenario_builtin_state). Admin-defined scenarios live in the
 * `group_scenarios` table and are validated against GROUP_SETTING_FIELDS below.
 *
 * Dependency-free on purpose, like feature-registry.ts.
 */

// ---------------------------------------------------------------------------
// Groups Settings API vocabulary
// ---------------------------------------------------------------------------

/**
 * Every Groups Settings API field a scenario may set, with the values Google
 * accepts and Google's UI wording for each, so the drill-in shows both. A value
 * is listed only when BOTH the API reference (groups-settings v1, checked
 * 2026-09-15) and the googleapis client docs name it; the two disagree on
 * ALL_OWNERS_CAN_VIEW and ALL_OWNERS_CAN_CONTACT, so neither is offered. Booleans are the strings
 * "true"/"false" on the wire. Deprecated fields are deliberately absent.
 */
export interface GroupSettingField {
  /** Label on groups.google.com / Admin console. */
  label: string;
  /** Where an admin finds it in Google's UI. */
  location: string;
  /** Allowed wire values -> Google's UI wording. `null` = free text. */
  values: Readonly<Record<string, string>> | null;
}

const BOOL = { true: 'On', false: 'Off' } as const;

export const GROUP_SETTING_FIELDS = {
  whoCanJoin: {
    label: 'Who can join group',
    location: 'groups.google.com > Group settings > General',
    values: {
      ANYONE_CAN_JOIN: 'Anyone can join',
      ALL_IN_DOMAIN_CAN_JOIN: 'Organization users only',
      INVITED_CAN_JOIN: 'Invited users only',
      CAN_REQUEST_TO_JOIN: 'Anyone can ask',
    },
  },
  whoCanViewMembership: {
    label: 'Who can view members',
    location: 'groups.google.com > Group settings > General',
    values: {
      ALL_IN_DOMAIN_CAN_VIEW: 'Organization members',
      ALL_MEMBERS_CAN_VIEW: 'Group members',
      ALL_MANAGERS_CAN_VIEW: 'Group managers (and owners)',
    },
  },
  whoCanViewGroup: {
    label: 'Who can view conversations',
    location: 'groups.google.com > Group settings > General',
    values: {
      ANYONE_CAN_VIEW: 'Anyone on the web',
      ALL_IN_DOMAIN_CAN_VIEW: 'Organization members',
      ALL_MEMBERS_CAN_VIEW: 'Group members',
      ALL_MANAGERS_CAN_VIEW: 'Group managers',
    },
  },
  whoCanDiscoverGroup: {
    label: 'Who can see group',
    location: 'groups.google.com > Group settings > General',
    values: {
      ANYONE_CAN_DISCOVER: 'Anyone on the web',
      ALL_IN_DOMAIN_CAN_DISCOVER: 'Organization members',
      ALL_MEMBERS_CAN_DISCOVER: 'Group members',
    },
  },
  allowExternalMembers: {
    label: 'Allow external members',
    location: 'groups.google.com > Group settings > General',
    values: BOOL,
  },
  whoCanPostMessage: {
    label: 'Who can post',
    location: 'groups.google.com > Group settings > General',
    // NONE_CAN_POST is omitted on purpose: Google rejects it unless the group is
    // archive-only (disabled), which no scenario should do.
    values: {
      ANYONE_CAN_POST: 'Anyone on the web',
      ALL_IN_DOMAIN_CAN_POST: 'Organization members',
      ALL_MEMBERS_CAN_POST: 'Group members',
      ALL_MANAGERS_CAN_POST: 'Group owners and managers',
      ALL_OWNERS_CAN_POST: 'Group owners',
    },
  },
  whoCanContactOwner: {
    label: 'Who can contact group owners',
    location: 'groups.google.com > Group settings > Member privacy',
    values: {
      ANYONE_CAN_CONTACT: 'Anyone on the web',
      ALL_IN_DOMAIN_CAN_CONTACT: 'Organization members',
      ALL_MEMBERS_CAN_CONTACT: 'Group members',
      ALL_MANAGERS_CAN_CONTACT: 'Group managers',
    },
  },
  whoCanModerateMembers: {
    label: 'Who can manage members',
    location: 'groups.google.com > Group settings > Member moderation',
    values: { ALL_MEMBERS: 'Group members', OWNERS_AND_MANAGERS: 'Group owners and managers', OWNERS_ONLY: 'Group owners', NONE: 'Nobody' },
  },
  whoCanModerateContent: {
    label: 'Who can moderate content',
    location: 'groups.google.com > Group settings > Posting policies',
    values: { ALL_MEMBERS: 'Group members', OWNERS_AND_MANAGERS: 'Group owners and managers', OWNERS_ONLY: 'Group owners', NONE: 'Nobody' },
  },
  whoCanAssistContent: {
    label: 'Who can moderate metadata',
    location: 'groups.google.com > Group settings > Posting policies',
    values: { ALL_MEMBERS: 'Group members', OWNERS_AND_MANAGERS: 'Group owners and managers', MANAGERS_ONLY: 'Group managers', OWNERS_ONLY: 'Group owners', NONE: 'Nobody' },
  },
  allowWebPosting: {
    label: 'Allow web posting',
    location: 'groups.google.com > Group settings > Posting policies',
    values: BOOL,
  },
  isArchived: {
    label: 'Conversation history',
    location: 'groups.google.com > Group settings > Posting policies',
    values: BOOL,
  },
  enableCollaborativeInbox: {
    label: 'Enable additional Google Groups features: Collaborative Inbox',
    location: 'groups.google.com > Group settings > General',
    values: BOOL,
  },
  messageModerationLevel: {
    label: 'Message moderation',
    location: 'groups.google.com > Group settings > Posting policies',
    values: {
      MODERATE_NONE: 'No moderation',
      MODERATE_NON_MEMBERS: 'Moderate messages from non-members',
      MODERATE_NEW_MEMBERS: 'New member posts are moderated',
      MODERATE_ALL_MESSAGES: 'Moderate all messages',
    },
  },
  spamModerationLevel: {
    label: 'Spam message handling',
    location: 'groups.google.com > Group settings > Posting policies',
    values: {
      ALLOW: 'Post suspicious messages to the group',
      MODERATE: 'Moderate and notify content moderators',
      SILENTLY_MODERATE: 'Moderate without notifying content moderators',
      REJECT: 'Reject all messages marked as spam',
    },
  },
  membersCanPostAsTheGroup: {
    label: 'Who can post as group (members)',
    location: 'groups.google.com > Group settings > Posting policies',
    values: { true: 'Group members', false: 'Not members' },
  },
  defaultSender: {
    label: 'Default sender',
    location: 'groups.google.com > Group settings > Posting policies',
    values: { DEFAULT_SELF: "Author's address", GROUP: 'Group address' },
  },
  replyTo: {
    label: 'Post replies to',
    location: 'groups.google.com > Group settings > Email options',
    // REPLY_TO_CUSTOM is omitted: it needs a per-group customReplyTo address,
    // which a reusable scenario cannot know.
    values: {
      REPLY_TO_IGNORE: "Sender's choice",
      REPLY_TO_SENDER: 'Message author only',
      REPLY_TO_LIST: 'All group members',
      REPLY_TO_MANAGERS: 'Group managers only',
      REPLY_TO_OWNER: 'Group owners only',
    },
  },
  includeCustomFooter: {
    label: 'Include a custom footer',
    location: 'groups.google.com > Group settings > Email options',
    values: BOOL,
  },
  customFooterText: {
    label: 'Custom footer text',
    location: 'groups.google.com > Group settings > Email options',
    values: null as Readonly<Record<string, string>> | null,
  },
  sendMessageDenyNotification: {
    label: 'Rejected message notification',
    location: 'groups.google.com > Group settings > Posting policies',
    values: BOOL,
  },
  includeInGlobalAddressList: {
    label: 'Include in the global address list',
    location: 'Admin console > Groups > the group',
    values: BOOL,
  },
} as const satisfies Record<string, GroupSettingField>;

export type GroupSettingKey = keyof typeof GROUP_SETTING_FIELDS;
export type GroupSettings = Partial<Record<GroupSettingKey, string>>;

/** Directory API per-member delivery (members.delivery_settings). */
export const MEMBER_DELIVERY_VALUES = {
  ALL_MAIL: 'Each email',
  DIGEST: 'Digest',
  DAILY: 'Abridged (one daily summary)',
  NONE: 'No email',
} as const;
export type MemberDelivery = keyof typeof MEMBER_DELIVERY_VALUES;
export type MemberRole = 'OWNER' | 'MANAGER' | 'MEMBER';
export const MEMBER_ROLES: readonly MemberRole[] = ['OWNER', 'MANAGER', 'MEMBER'];

/** Google's limit on alias addresses per group. */
export const MAX_GROUP_ALIASES = 30;

/**
 * Local parts Google reserves. The KB says these refuse to be created as a
 * group address and recommends adding them as ALIASES of an existing group
 * instead (recipe e), while noting aliases on them "may be blocked or behave
 * specially". Helios blocks them as a group's primary address and warns when
 * they are used as aliases, so the live check decides.
 */
export const RESERVED_GROUP_LOCAL_PARTS: readonly string[] = ['abuse', 'postmaster'];

// ---------------------------------------------------------------------------
// Scenario shape
// ---------------------------------------------------------------------------

export interface ScenarioExplainer {
  /** The user story, "As a ..., I want ..., so that ...". */
  userStory: string;
  /** What Helios will do and what the group will then behave like. */
  whatHappens: string[];
  /** What someone outside the group sees when they write in. */
  outsideSendersSee: string;
  /** What members see. */
  membersSee: string;
}

export interface GroupScenario extends ScenarioExplainer {
  key: string;
  name: string;
  /** One line for the dropdown. */
  summary: string;
  /** Recipe letter in guide-google-groups-recipes, for built-ins. */
  kbRecipe?: string;
  /** Groups Settings API values applied, then read back. */
  settings: GroupSettings;
  /** Directory API delivery for members Helios adds, by role. Omitted role = Google's default (Each email). */
  memberDelivery: Partial<Record<MemberRole, MemberDelivery>>;
  /** Suggested alias local parts (the admin chooses the actual addresses). */
  suggestedAliases: string[];
  /** Steps the API cannot perform; done in Google's own UI. */
  manualSteps: string[];
  /** Where the KB recipe and the Groups Settings API disagree. Shown in the drill-in. */
  kbApiNotes: string[];
  /** The email test checklist. */
  emailChecklist: string[];
  /** Outsiders must be able to write in (depends on the org-level Groups sharing setting). */
  acceptsExternalMail: boolean;
}

// Manual steps shared by several scenarios. Written once.
const STEP_STANDARD_FOOTER =
  'Email options > Email footer: untick "Include the standard Groups footer" (the Groups Settings API has no field for the standard footer).';
const STEP_SUBJECT_PREFIX_EMPTY = 'Email options > Subject prefix: leave empty (not settable through the API).';
const STEP_ORG_EXTERNAL_MAIL =
  'Check Admin console > Apps > Google Workspace > Groups for Business > Sharing settings. If "Group owners can allow incoming email from outside the organization" is off, the admin-applied "Anyone on the web" still works, but a group owner cannot change it later.';

// ---------------------------------------------------------------------------
// Built-in scenarios
// ---------------------------------------------------------------------------

export const BUILTIN_GROUP_SCENARIOS: readonly GroupScenario[] = [
  {
    key: 'public-contact-inbox',
    name: 'Public contact inbox',
    summary: 'hello@ or info@: customers write in, the team replies as the group, nothing is silently held.',
    kbRecipe: 'a',
    userStory:
      'As a small business owner, I want customers to email hello@ and get a reply that comes from hello@, so that the business has one public address that outlives any employee.',
    whatHappens: [
      'Anyone, inside or outside the organization, can send to the address.',
      'No message moderation, and suspicious messages are posted to the group instead of being held for a twice-weekly review.',
      'Collaborative Inbox is on (with conversation history), so members can Take, Assign and Mark complete.',
      'Members can reply as the group from groups.google.com; replies go to the sender, not back into the group.',
      'Only members can read the conversations; only owners and managers can see the member list.',
    ],
    outsideSendersSee:
      'An ordinary reply. From the web, replies come from the group address; from Gmail, from the member\'s own address unless they set up "Send mail as". No unsubscribe footer once the manual footer step is done.',
    membersSee:
      'Each message in Gmail with the customer as From (or "Name via group" when the customer\'s domain enforces DMARC). Status and assignment are only on groups.google.com.',
    settings: {
      whoCanPostMessage: 'ANYONE_CAN_POST',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanDiscoverGroup: 'ALL_IN_DOMAIN_CAN_DISCOVER',
      whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
      whoCanContactOwner: 'ANYONE_CAN_CONTACT',
      whoCanModerateMembers: 'OWNERS_AND_MANAGERS',
      whoCanJoin: 'INVITED_CAN_JOIN',
      allowExternalMembers: 'false',
      isArchived: 'true',
      enableCollaborativeInbox: 'true',
      messageModerationLevel: 'MODERATE_NONE',
      spamModerationLevel: 'ALLOW',
      membersCanPostAsTheGroup: 'true',
      defaultSender: 'DEFAULT_SELF',
      whoCanAssistContent: 'ALL_MEMBERS',
      replyTo: 'REPLY_TO_IGNORE',
    },
    memberDelivery: { OWNER: 'DAILY', MANAGER: 'ALL_MAIL', MEMBER: 'ALL_MAIL' },
    suggestedAliases: ['info'],
    manualSteps: [
      STEP_STANDARD_FOOTER,
      STEP_SUBJECT_PREFIX_EMPTY,
      'Email options > Auto replies > non-members outside the organization: optional short acknowledgement (not settable through the API).',
      STEP_ORG_EXTERNAL_MAIL,
    ],
    kbApiNotes: [],
    emailChecklist: [
      'From an external mailbox, send to the group: every member on Each email receives it within a minute.',
      'groups.google.com > the group > Pending is empty.',
      'On groups.google.com, Reply all choosing the group as From: the external mailbox receives it from the group address and the reply shows in the thread.',
      'Reply all from Gmail: the external mailbox sees the member\'s personal address; the group has a copy.',
      'Next day: the owner receives the abridged summary.',
      'Send from a Yahoo or Outlook.com address: the "via" rewrite appears and Reply still reaches the sender.',
      'Send from a second organization account that is not a member: delivered.',
    ],
    acceptsExternalMail: true,
  },
  {
    key: 'shared-team-inbox',
    name: 'Shared team inbox (Collaborative Inbox)',
    summary: 'accounts@ or support@: a team works one address, takes threads and sees what is still open.',
    kbRecipe: 'b, c',
    userStory:
      'As an office manager, I want accounts@ to reach the finance team and let any of them take a request, mark it done and see what the others already answered, so that nothing is answered twice or missed.',
    whatHappens: [
      'People in the organization can send to the address. (If suppliers or customers write in, create a custom scenario from this one with "Who can post" set to Anyone on the web.)',
      'Collaborative Inbox is on with conversation history; any member can Take, Assign and Mark complete.',
      'Owners and managers moderate content; members see the member list and the conversations.',
      'No message moderation, suspicious messages are posted, and replies go to the sender.',
    ],
    outsideSendersSee: 'Ordinary email replies from the member who answered, or from the group address when replying on the web.',
    membersSee:
      'Every message in Gmail. Who took what, and what is still open, is only on groups.google.com; a Gmail reply appears there only if the group was in To or Cc.',
    settings: {
      whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanDiscoverGroup: 'ALL_IN_DOMAIN_CAN_DISCOVER',
      whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',
      whoCanModerateMembers: 'OWNERS_AND_MANAGERS',
      whoCanJoin: 'INVITED_CAN_JOIN',
      allowExternalMembers: 'false',
      isArchived: 'true',
      enableCollaborativeInbox: 'true',
      whoCanAssistContent: 'ALL_MEMBERS',
      whoCanModerateContent: 'OWNERS_AND_MANAGERS',
      messageModerationLevel: 'MODERATE_NONE',
      spamModerationLevel: 'ALLOW',
      membersCanPostAsTheGroup: 'true',
      defaultSender: 'DEFAULT_SELF',
      replyTo: 'REPLY_TO_IGNORE',
    },
    memberDelivery: { OWNER: 'ALL_MAIL', MANAGER: 'ALL_MAIL', MEMBER: 'ALL_MAIL' },
    suggestedAliases: [],
    manualSteps: [
      STEP_STANDARD_FOOTER,
      'General > Shared labels: turn on and add labels such as access, hardware, billing if the team wants them (not settable through the API).',
    ],
    kbApiNotes: [],
    emailChecklist: [
      'From a second organization account that is not a member, send to the group: two members confirm receipt.',
      'Member A clicks Take on groups.google.com: member B sees "Assigned to A".',
      'Member A replies all from Gmail: member B sees the reply in Gmail and on the web.',
      'A plain Reply from Gmail (group not in To/Cc) does not appear on the web. This is expected.',
      'Member A marks the thread complete: the "Is unresolved" filter no longer lists it.',
    ],
    acceptsExternalMail: false,
  },
  {
    key: 'security-reports-inbox',
    name: 'Security reports inbox',
    summary: 'security@: outside reports reach a small trusted group within a minute and are never held.',
    kbRecipe: 'e',
    userStory:
      "As the person responsible for security, I want any outsider's vulnerability or abuse report to reach two trusted colleagues and me within a minute, so that a report is never held in a queue nobody checks.",
    whatHappens: [
      'Anyone on the web can send; there is no message moderation and suspicious messages are posted, not held.',
      'Conversation history is on, so there is a record of every report.',
      'Only members can see the group, read conversations, and only owners manage members.',
      'Members can reply as the group, and replies go to the reporter.',
    ],
    outsideSendersSee:
      'Their report is accepted immediately. A reply from the web comes from the group address. An optional acknowledgement can be set up as an auto reply in Google.',
    membersSee: 'Every report in Gmail as ordinary email from the reporter (or "Name via group"), with attachments.',
    settings: {
      whoCanPostMessage: 'ANYONE_CAN_POST',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanDiscoverGroup: 'ALL_MEMBERS_CAN_DISCOVER',
      whoCanContactOwner: 'ANYONE_CAN_CONTACT',
      whoCanModerateMembers: 'OWNERS_ONLY',
      whoCanJoin: 'INVITED_CAN_JOIN',
      allowExternalMembers: 'false',
      messageModerationLevel: 'MODERATE_NONE',
      spamModerationLevel: 'ALLOW',
      isArchived: 'true',
      membersCanPostAsTheGroup: 'true',
      defaultSender: 'DEFAULT_SELF',
      replyTo: 'REPLY_TO_IGNORE',
    },
    memberDelivery: { OWNER: 'ALL_MAIL', MANAGER: 'ALL_MAIL', MEMBER: 'ALL_MAIL' },
    suggestedAliases: ['abuse'],
    manualSteps: [
      'Admin console > the group > Access settings > View members: Group owners. Helios does not set this (see the note below).',
      'Posting policies > Who can attach files: Anyone on the web (not settable through the API; advisory for email posts).',
      STEP_STANDARD_FOOTER,
      'Email options > Auto replies > non-members outside the organization: optional receipt (not settable through the API).',
      'Add the address to your security.txt.',
      STEP_ORG_EXTERNAL_MAIL,
    ],
    kbApiNotes: [
      'The KB recipe sets View members to "Group owners". The Groups Settings API field whoCanViewMembership only accepts organization, members or managers, so Helios leaves it at Google\'s default and lists it as a manual step rather than applying a different value.',
    ],
    emailChecklist: [
      'From an external mailbox, send a report with an attachment: every member receives it within a minute.',
      'groups.google.com > the group > Pending is empty.',
      'Send again from a Yahoo or Outlook.com address: the "via" copy still delivers.',
      'A member replies from the web choosing the group as From: the reporter sees the group address.',
      'Send to each alias separately and confirm delivery.',
    ],
    acceptsExternalMail: true,
  },
  {
    key: 'announcement-list',
    name: 'Announcement list',
    summary: 'all-staff@: only owners and managers send, replies go privately to the sender.',
    kbRecipe: 'f',
    userStory:
      'As the head of a school, I want all-staff@ to reach every employee, only the office to be able to send to it, and a reply to come back to me rather than to 60 people, so that announcements do not turn into a reply-all storm.',
    whatHappens: [
      'Only group owners and managers can post; make the office staff managers.',
      'Everyone in the organization can read past announcements (conversation history on).',
      'A reply goes privately to whoever sent the announcement.',
      'Collaborative Inbox is off.',
    ],
    outsideSendersSee: 'Nothing: outsiders cannot post. Anyone who is not an owner or manager gets a "does not allow posting" bounce.',
    membersSee:
      'Announcements from the manager who sent them. Reply reaches that manager; Reply all to the group bounces, which is expected.',
    settings: {
      whoCanPostMessage: 'ALL_MANAGERS_CAN_POST',
      whoCanViewGroup: 'ALL_IN_DOMAIN_CAN_VIEW',
      whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
      whoCanModerateMembers: 'OWNERS_AND_MANAGERS',
      whoCanContactOwner: 'ALL_IN_DOMAIN_CAN_CONTACT',
      replyTo: 'REPLY_TO_SENDER',
      isArchived: 'true',
      enableCollaborativeInbox: 'false',
    },
    memberDelivery: { OWNER: 'ALL_MAIL', MANAGER: 'ALL_MAIL', MEMBER: 'ALL_MAIL' },
    suggestedAliases: [],
    manualSteps: [
      'Email options > Subject prefix: for example [All staff] (not settable through the API).',
      'Email options > Email footer: untick the standard footer unless you want the "view on web" link.',
      'If the list really is everyone, consider a Helios dynamic group so joiners and leavers are automatic.',
    ],
    kbApiNotes: [],
    emailChecklist: [
      'From a manager account, send to the group: a non-manager member receives it.',
      'That member hits Reply all: they get a "does not allow posting" bounce (expected).',
      'That member hits Reply: the manager receives the private reply.',
    ],
    acceptsExternalMail: false,
  },
  {
    key: 'access-only-group',
    name: 'Access-only group (Drive and Calendar sharing, no email)',
    summary: 'marketing@: share Drive folders and calendar invites to one name; members get no email.',
    kbRecipe: 'g',
    userStory:
      'As a team lead, I want a marketing@ group, so that I can share a Drive folder and calendar invites to one name and stop editing sharing lists every time someone joins or leaves.',
    whatHappens: [
      'Members only, everywhere: posting, reading conversations and seeing the member list.',
      'The group is visible to the organization so people can pick it when sharing.',
      'Members Helios adds are set to "No email", so the group does not become a mailing list.',
    ],
    outsideSendersSee: 'Nothing. Outsiders cannot post.',
    membersSee:
      'No email from the group. Folders shared to the group appear in "Shared with me" once membership syncs (a few minutes).',
    settings: {
      whoCanPostMessage: 'ALL_MEMBERS_CAN_POST',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',
      whoCanContactOwner: 'ALL_IN_DOMAIN_CAN_CONTACT',
      whoCanDiscoverGroup: 'ALL_IN_DOMAIN_CAN_DISCOVER',
      whoCanJoin: 'INVITED_CAN_JOIN',
    },
    memberDelivery: { OWNER: 'NONE', MANAGER: 'NONE', MEMBER: 'NONE' },
    suggestedAliases: [],
    manualSteps: [
      'Posting policies > Allow email posting: off (optional; not settable through the API, see the note below).',
      'Share Drive folders and shared drives to the group address; put the group on calendar invites.',
    ],
    kbApiNotes: [
      'The KB recipe turns "Allow email posting" off. The Groups Settings API has no such field: the closest value, whoCanPostMessage = NONE_CAN_POST, is only accepted for an archive-only (disabled) group. Helios keeps posting at members only and lists the switch as a manual step.',
      'The KB marks the "Restricted" preset values as unverified (Google does not publish the preset matrix); the members-only values here follow the KB table.',
    ],
    emailChecklist: [
      'From a non-member account, share a folder to the group: a member can open it.',
      'Send a test message to the group from a member: other members receive no email.',
      'Remove a member: their access to the folder disappears within a few minutes.',
    ],
    acceptsExternalMail: false,
  },
  {
    key: 'client-inquiries',
    name: 'Client inquiries (external members)',
    summary: 'acme-project@: your staff and the client\'s people on one address, one group per client.',
    kbRecipe: 'd',
    userStory:
      'As a consultant, I want acme-project@ to reach my two colleagues and two people at the client, so that the client can write to one address and never sees any other client\'s traffic.',
    whatHappens: [
      'External members are allowed; only group owners manage members, and only owners and managers see the member list.',
      'Anyone on the web can send (a client colleague who is not a member still gets through), with no moderation and suspicious messages posted.',
      'Replies go to all group members, which is fine here because every party is a member.',
      'Privacy between clients comes from one group per client, never from roles inside one group.',
    ],
    outsideSendersSee:
      'Client members see messages from your staff\'s own addresses (or the group, if replying as the group) and from each other. They never see the member list.',
    membersSee: 'Every message in Gmail. Client people appear as ordinary senders (possibly "via group" if the client enforces DMARC).',
    settings: {
      allowExternalMembers: 'true',
      whoCanPostMessage: 'ANYONE_CAN_POST',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
      whoCanModerateMembers: 'OWNERS_ONLY',
      whoCanDiscoverGroup: 'ALL_MEMBERS_CAN_DISCOVER',
      whoCanJoin: 'INVITED_CAN_JOIN',
      messageModerationLevel: 'MODERATE_NONE',
      spamModerationLevel: 'ALLOW',
      replyTo: 'REPLY_TO_LIST',
      isArchived: 'true',
    },
    memberDelivery: { OWNER: 'ALL_MAIL', MANAGER: 'ALL_MAIL', MEMBER: 'ALL_MAIL' },
    suggestedAliases: [],
    manualSteps: [
      'Member privacy > Who can view member email addresses: Managers (not settable through the API).',
      STEP_STANDARD_FOOTER,
      'Never turn "Allow external members" off later: since the Q2 2026 change, Google permanently removes the external members.',
    ],
    kbApiNotes: [],
    emailChecklist: [
      'A client member sends to the group: all members receive it.',
      'A non-member organization account sends: delivered.',
      'A member of a different client group cannot open this group\'s conversation history.',
    ],
    acceptsExternalMail: true,
  },
  {
    key: 'departed-employee-address',
    name: "Departed employee's address",
    summary: "Keep a leaver's address working: mail reaches their replacement and outsiders are told whom to contact.",
    kbRecipe: 'h',
    userStory:
      "As the manager of someone who left, I want mail sent to their old address to reach their replacement for a few months and tell outsiders whom to contact, so that customers do not get a bounce and the company keeps the account unlicensed.",
    whatHappens: [
      'Anyone on the web can send, with no moderation and suspicious messages posted, so customers and vendors still get through.',
      'Only members see the group; replies go to the sender.',
      'The address must be free: an existing user or alias on it blocks creation. Helios offboarding\'s "release address" step frees it first.',
      'Conversation history is on. Turn it off in Google if your retention policy says so.',
    ],
    outsideSendersSee: 'Their mail is delivered. With the manual auto reply set, they are told whom to contact.',
    membersSee: 'The replacement receives each message with the original sender as From. A plain Reply comes from the replacement\'s own address.',
    settings: {
      whoCanPostMessage: 'ANYONE_CAN_POST',
      messageModerationLevel: 'MODERATE_NONE',
      spamModerationLevel: 'ALLOW',
      isArchived: 'true',
      whoCanDiscoverGroup: 'ALL_MEMBERS_CAN_DISCOVER',
      replyTo: 'REPLY_TO_IGNORE',
    },
    memberDelivery: { OWNER: 'ALL_MAIL', MANAGER: 'ALL_MAIL', MEMBER: 'ALL_MAIL' },
    suggestedAliases: [],
    manualSteps: [
      'Email options > Auto replies > non-members outside the organization: "This person has left; please contact ..." (not settable through the API).',
      STEP_STANDARD_FOOTER,
      'Set a date to delete the group; deleting it frees the address immediately.',
      STEP_ORG_EXTERNAL_MAIL,
    ],
    kbApiNotes: [],
    emailChecklist: [
      'From an external mailbox, write to the old address: the replacement receives it.',
      'The external mailbox receives the auto reply (after the manual step).',
      'A plain Reply from the replacement reaches the outsider from the replacement\'s own address.',
    ],
    acceptsExternalMail: true,
  },
];

const BY_KEY: ReadonlyMap<string, GroupScenario> = new Map(BUILTIN_GROUP_SCENARIOS.map((s) => [s.key, s]));

export function getBuiltinScenario(key: string): GroupScenario | undefined {
  return BY_KEY.get(key);
}

export function isBuiltinScenarioKey(key: string): boolean {
  return BY_KEY.has(key);
}

// ---------------------------------------------------------------------------
// Validation (shared by the registry test and custom scenarios)
// ---------------------------------------------------------------------------

/** Scenario keys are URL-safe slugs. */
export const SCENARIO_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Every problem with a settings object, as human-readable strings. Empty = valid.
 * Enforces Google's cross-field rules so a custom scenario cannot ask for a
 * combination Google would reject or silently ignore.
 */
export function validateGroupSettings(settings: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const fields = GROUP_SETTING_FIELDS as Record<string, GroupSettingField>;
  for (const [key, value] of Object.entries(settings)) {
    const def = fields[key];
    if (!def) {
      problems.push(`${key} is not a supported group setting`);
      continue;
    }
    if (typeof value !== 'string') {
      problems.push(`${key} must be a string`);
      continue;
    }
    if (def.values && !(value in def.values)) {
      problems.push(`${key} must be one of ${Object.keys(def.values).join(', ')}`);
    }
    if (!def.values && value.length > 1000) {
      problems.push(`${key} must be at most 1000 characters`);
    }
  }
  if (settings.enableCollaborativeInbox === 'true' && settings.isArchived !== 'true') {
    problems.push('Collaborative Inbox requires conversation history (isArchived = "true")');
  }
  if (settings.customFooterText !== undefined && settings.includeCustomFooter !== 'true') {
    problems.push('customFooterText requires includeCustomFooter = "true"');
  }
  return problems;
}

export function validateMemberDelivery(delivery: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [role, value] of Object.entries(delivery)) {
    if (!MEMBER_ROLES.includes(role as MemberRole)) problems.push(`memberDelivery role ${role} must be one of ${MEMBER_ROLES.join(', ')}`);
    if (typeof value !== 'string' || !(value in MEMBER_DELIVERY_VALUES)) {
      problems.push(`memberDelivery.${role} must be one of ${Object.keys(MEMBER_DELIVERY_VALUES).join(', ')}`);
    }
  }
  return problems;
}

/** Drill-in rows for a settings object: API field, value, and Google's wording. */
export function describeSettings(settings: GroupSettings): Array<{
  field: GroupSettingKey;
  value: string;
  label: string;
  valueLabel: string;
  location: string;
}> {
  const fields = GROUP_SETTING_FIELDS as Record<string, GroupSettingField>;
  return (Object.entries(settings) as Array<[GroupSettingKey, string]>).map(([field, value]) => {
    const def = fields[field];
    return {
      field,
      value,
      label: def?.label ?? field,
      valueLabel: def?.values?.[value] ?? value,
      location: def?.location ?? '',
    };
  });
}
