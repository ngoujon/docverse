/**
 * Everything the app keeps in localStorage on the client side.
 *
 * Keys keep their historical "hyaides:" prefix on purpose: renaming them
 * would log every existing user out and drop their remembered links.
 * Every access is wrapped in try/catch - localStorage throws in private
 * mode or when storage is disabled, and the app must keep working.
 */

// --- Session token ----------------------------------------------------------

const USER_TOKEN_KEY = "hyaides:user-token";

export function getUserToken(): string | null {
  try {
    return localStorage.getItem(USER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setUserToken(token: string) {
  try {
    localStorage.setItem(USER_TOKEN_KEY, token);
  } catch {
    /* localStorage unavailable (private mode, etc.) - degrade silently */
  }
}

export function clearUserToken() {
  try {
    localStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// --- Remembered share links ---------------------------------------------------
// Share links grant access by token only - following one doesn't make the
// visitor a member, so the space never shows up in their own space list.
// To keep it reachable from the dashboard afterwards, each link a signed-in
// user opens is remembered here, per user (a shared computer must not show
// one account's links to the next) and on this device only.

const SHARE_LINKS_PREFIX = "hyaides:shared-links:";

interface RememberedShareLink {
  token: string;
  spaceId: string;
  name: string;
  color: string;
}

function shareLinksKey(userId: string) {
  return `${SHARE_LINKS_PREFIX}${userId}`;
}

export function listSharedLinks(userId: string): RememberedShareLink[] {
  try {
    const raw = localStorage.getItem(shareLinksKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSharedLinks(userId: string, links: RememberedShareLink[]) {
  try {
    localStorage.setItem(shareLinksKey(userId), JSON.stringify(links));
  } catch {
    /* localStorage unavailable (private mode, etc.) - degrade silently */
  }
}

export function rememberSharedLink(userId: string, link: RememberedShareLink) {
  const others = listSharedLinks(userId).filter((l) => l.token !== link.token);
  writeSharedLinks(userId, [link, ...others]);
}

export function forgetSharedLink(userId: string, token: string) {
  writeSharedLinks(
    userId,
    listSharedLinks(userId).filter((l) => l.token !== token),
  );
}
