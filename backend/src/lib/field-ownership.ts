/**
 * Field ownership: which system wins when a profile field differs between Helios and
 * Google. The single definition of the owned fields and of the decision rule; the sync,
 * the drift routes and the settings page all use it.
 *
 * Why this exists (proven 2026-09-11 on the trial tenant): sync ran both ways per
 * operation, but fields were asymmetric. Helios pushed about ten fields on every save;
 * the Google sync copied back only names and suspended status. A title changed in the
 * Google console never reached Helios, and the next unrelated save in Helios pushed the
 * stale title back over it, reporting success. helios #124 stopped the overwrite; this
 * decides the direction.
 *
 * The rule, per field, per sync:
 *   - values equal                       -> nothing (an open drift record is closed)
 *   - owner google, Google value present -> pull Google's value into Helios
 *   - owner google, Google value EMPTY
 *     while Helios has one               -> drift. Never wipe Helios with an absence:
 *                                           empty in Google often means "never set there",
 *                                           and silently erasing Helios data is the exact
 *                                           failure this module exists to stop.
 *   - owner helios                       -> drift, for an admin to resolve. Never an
 *                                           automatic overwrite in either direction.
 *
 * An admin's explicit edit in Helios is still written through to Google at save time,
 * whoever owns the field: ownership governs what the SYNC does with a difference, not
 * whether an admin may change a value on purpose.
 */

export const OWNED_FIELDS = ['jobTitle', 'department', 'manager', 'mobilePhone', 'workPhone', 'location'] as const;
export type OwnedField = (typeof OWNED_FIELDS)[number];

export const FIELD_OWNERS = ['google', 'helios'] as const;
export type FieldOwner = (typeof FIELD_OWNERS)[number];

/** Google-first: a Google shop manages people in the Google Admin console. */
export const DEFAULT_FIELD_OWNERSHIP: Record<OwnedField, FieldOwner> = {
  jobTitle: 'google',
  department: 'google',
  manager: 'google',
  mobilePhone: 'google',
  workPhone: 'google',
  location: 'google',
};

export const FIELD_LABELS: Record<OwnedField, string> = {
  jobTitle: 'Job title',
  department: 'Department',
  manager: 'Manager',
  mobilePhone: 'Mobile phone',
  workPhone: 'Work phone',
  location: 'Location',
};

/** The Helios column for each field. Manager is special: stored as an id, compared as an email. */
export const HELIOS_COLUMN: Record<Exclude<OwnedField, 'manager'>, string> = {
  jobTitle: 'job_title',
  department: 'department',
  mobilePhone: 'mobile_phone',
  workPhone: 'work_phone',
  location: 'location',
};

export type FieldValues = Record<OwnedField, string>;

const norm = (v: unknown, field: OwnedField): string => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return field === 'manager' ? s.toLowerCase() : s;
};

/** Google's value for each owned field, from a users.list / users.get record. */
export function googleFieldValues(u: any): FieldValues {
  const orgs: any[] = Array.isArray(u?.organizations) ? u.organizations : [];
  const primaryOrg = orgs.find((o) => o?.primary) ?? orgs[0] ?? {};
  const phones: any[] = Array.isArray(u?.phones) ? u.phones : [];
  const relations: any[] = Array.isArray(u?.relations) ? u.relations : [];
  const locations: any[] = Array.isArray(u?.locations) ? u.locations : [];
  return {
    jobTitle: norm(primaryOrg.title, 'jobTitle'),
    department: norm(primaryOrg.department, 'department'),
    manager: norm(relations.find((r) => r?.type === 'manager')?.value, 'manager'),
    mobilePhone: norm(phones.find((p) => p?.type === 'mobile')?.value, 'mobilePhone'),
    workPhone: norm(phones.find((p) => p?.type === 'work')?.value, 'workPhone'),
    location: norm(locations[0]?.area, 'location'),
  };
}

/** Helios's value for each owned field. `managerEmail` is the manager row's email. */
export function heliosFieldValues(row: any, managerEmail: string | null): FieldValues {
  return {
    jobTitle: norm(row?.job_title, 'jobTitle'),
    department: norm(row?.department, 'department'),
    manager: norm(managerEmail, 'manager'),
    mobilePhone: norm(row?.mobile_phone, 'mobilePhone'),
    workPhone: norm(row?.work_phone, 'workPhone'),
    location: norm(row?.location, 'location'),
  };
}

export type FieldAction = 'none' | 'pull' | 'drift';

export interface FieldDecision {
  field: OwnedField;
  action: FieldAction;
  owner: FieldOwner;
  heliosValue: string;
  googleValue: string;
}

export function decideField(field: OwnedField, owner: FieldOwner, heliosValue: string, googleValue: string): FieldDecision {
  const h = norm(heliosValue, field);
  const g = norm(googleValue, field);
  let action: FieldAction;
  if (h === g) action = 'none';
  else if (owner === 'google') action = g === '' && h !== '' ? 'drift' : 'pull';
  else action = 'drift';
  return { field, action, owner, heliosValue: h, googleValue: g };
}

export function decideAll(
  ownership: Record<OwnedField, FieldOwner>,
  helios: FieldValues,
  google: FieldValues,
): FieldDecision[] {
  return OWNED_FIELDS.map((f) => decideField(f, ownership[f] ?? 'google', helios[f], google[f]));
}

export class FieldOwnershipError extends Error {}

/** Validate a submitted ownership map: known fields, known owners, nothing else. */
export function validateFieldOwnership(input: unknown): Record<OwnedField, FieldOwner> {
  if (!input || typeof input !== 'object') throw new FieldOwnershipError('fieldOwnership must be an object');
  const out = { ...DEFAULT_FIELD_OWNERSHIP };
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!OWNED_FIELDS.includes(k as OwnedField)) throw new FieldOwnershipError(`Unknown field: ${k}`);
    if (!FIELD_OWNERS.includes(v as FieldOwner)) throw new FieldOwnershipError(`Owner for ${k} must be google or helios`);
    out[k as OwnedField] = v as FieldOwner;
  }
  return out;
}
