/**
 * Block type -> Lucide icon mapping (single source of truth).
 *
 * Replaces the per-file emoji maps that previously lived in BlockPalette,
 * BlockItem and BlockConfig. Per DESIGN-SYSTEM.md, workflow blocks use
 * monochrome, stroke-based Lucide icons (16/20px) instead of emojis.
 */
import {
  UserPlus,
  UserCog,
  UserX,
  Trash2,
  KeyRound,
  UserRoundPlus,
  UserRoundMinus,
  UsersRound,
  Mail,
  PenLine,
  Plane,
  Undo2,
  CalendarPlus,
  CalendarX,
  CalendarClock,
  FolderOpen,
  FolderLock,
  FolderInput,
  ShieldOff,
  LogOut,
  Smartphone,
  Megaphone,
  Bell,
  BellRing,
  Send,
  GraduationCap,
  ClipboardCheck,
  Split,
  Clock,
  MessageSquare,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const BLOCK_ICONS: Record<string, LucideIcon> = {
  create_user: UserPlus,
  update_user: UserCog,
  suspend_user: UserX,
  delete_user: Trash2,
  reset_password: KeyRound,
  add_to_group: UserRoundPlus,
  remove_from_group: UserRoundMinus,
  create_group: UsersRound,
  send_email: Mail,
  set_signature: PenLine,
  set_vacation_responder: Plane,
  remove_vacation_responder: Undo2,
  create_calendar_event: CalendarPlus,
  decline_future_meetings: CalendarX,
  transfer_calendar: CalendarClock,
  grant_drive_access: FolderOpen,
  revoke_drive_access: FolderLock,
  transfer_drive_ownership: FolderInput,
  revoke_oauth_tokens: ShieldOff,
  sign_out_sessions: LogOut,
  wipe_mobile_device: Smartphone,
  notify_manager: Megaphone,
  notify_hr: Bell,
  notify_it: BellRing,
  send_notification: Send,
  assign_training: GraduationCap,
  create_task: ClipboardCheck,
  if_condition: Split,
  wait: Clock,
  comment: MessageSquare,
};

/** Returns the Lucide icon component for a block type (Zap as the fallback). */
export function getBlockIcon(type: string): LucideIcon {
  return BLOCK_ICONS[type] ?? Zap;
}
