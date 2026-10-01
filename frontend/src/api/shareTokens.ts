// Share links grant access by token only - following one doesn't make the
// visitor a member, so the space never shows up in their own space list.
// To keep it reachable from the dashboard afterwards, each link a signed-in
// user opens is remembered here, per user (a shared computer must not show
// one account's links to the next) and on this device only.
const STORAGE_PREFIX = "hyaides:shared-links:";

export interface RememberedShareLink {
  token: string;
  spaceId: string;
  name: string;
  color: string;
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function listSharedLinks(userId: string): RememberedShareLink[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(userId: string, links: RememberedShareLink[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(links));
  } catch {
    /* localStorage unavailable (private mode, etc.) - degrade silently */
  }
}

export function rememberSharedLink(userId: string, link: RememberedShareLink) {
  const others = listSharedLinks(userId).filter((l) => l.token !== link.token);
  writeAll(userId, [link, ...others]);
}

export function forgetSharedLink(userId: string, token: string) {
  writeAll(
    userId,
    listSharedLinks(userId).filter((l) => l.token !== token)
  );
}
