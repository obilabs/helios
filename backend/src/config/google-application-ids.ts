/**
 * Canonical Google Workspace "application IDs" for the Admin SDK Data Transfer
 * API (POST admin/datatransfer/v1/transfers). These are GLOBAL, Google-assigned
 * constants — identical for every tenant — that name which application's data a
 * transfer moves.
 *
 * THIS is the single source of truth. The authoritative in-repo reference is
 * google-workspace.service.ts (which documents `55656082996` as Google Drive,
 * matching Google's published value). A previous copy in
 * `data-transfer.service.ts` had Drive and Calendar SWAPPED, so a "transfer
 * Drive" request actually moved Calendar data and vice-versa — a silent
 * data-integrity bug. The frontend request-builder
 * (frontend/src/lib/googleApiRequests.ts) was fixed to the values below; keep
 * every backend caller importing from here so the swap cannot recur.
 */
export const DATA_TRANSFER_APPLICATION_IDS = {
  /** Google Drive and Docs. */
  drive: '55656082996',
  /** Google Calendar. */
  calendar: '435070579839',
  /** Google Sites (classic). */
  sites: '529327477839',
  /** Google Groups. */
  groups: '588034504559',
} as const;

export type DataTransferApplication = keyof typeof DATA_TRANSFER_APPLICATION_IDS;
