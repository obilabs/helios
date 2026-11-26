/**
 * Reading Google Directory API paths for the proxy's follow-up bookkeeping.
 *
 * After a call to Google succeeds, the proxy updates Helios's own copy (a user
 * was deleted, a group was removed). To do that it has to know which resource
 * the call was about, and it must only act when the call addressed that
 * resource ITSELF:
 *
 *   DELETE users/ana@example.com                  -> the user ana@example.com
 *   DELETE users/ana@example.com/aliases/a@x.com  -> an alias, NOT the user
 *   DELETE groups/team@example.com/members/ana    -> a membership, NOT the group
 *
 * The key also arrives URL-encoded (ana%40example.com). Compared as written it
 * matches no row, and the bookkeeping silently does nothing.
 */

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The key of the resource a path addresses directly, decoded, or null when the
 * path is a collection (`users`) or something beneath a resource
 * (`users/{key}/aliases/...`).
 */
export function directResourceKey(path: string, collection: 'users' | 'groups'): string | null {
  const clean = path.split('?')[0].replace(/\/+$/, '');
  const match = clean.match(new RegExp(`(?:^|/)${collection}/([^/]+)$`));
  if (!match) return null;
  const key = decode(match[1]).trim();
  return key || null;
}

/** True for an entry in a user listing that Google reports as deleted. */
export function isDeletedListing(user: { deletionTime?: unknown } | null | undefined): boolean {
  return !!user && user.deletionTime !== undefined && user.deletionTime !== null && user.deletionTime !== '';
}
