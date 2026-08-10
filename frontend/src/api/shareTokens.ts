// Share-link tokens (X-Share-Token) let an anonymous visitor access one
// space at a role fixed by whoever generated the link - replaces the old
// per-space password/unlock-token flow entirely. Keyed by space id so a
// visitor who followed links to several shared spaces keeps access to all
// of them.
const STORAGE_KEY = "open-rag:share-tokens";

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(tokens: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    /* localStorage unavailable (private mode, etc.) - degrade silently */
  }
}

export function getShareToken(spaceId: string): string | null {
  return readAll()[spaceId] ?? null;
}

export function setShareToken(spaceId: string, token: string) {
  const tokens = readAll();
  tokens[spaceId] = token;
  writeAll(tokens);
}

export function clearShareToken(spaceId: string) {
  const tokens = readAll();
  delete tokens[spaceId];
  writeAll(tokens);
}
