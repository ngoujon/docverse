const STORAGE_KEY = "open-rag:space-tokens";

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

export function getSpaceToken(spaceId: string): string | null {
  return readAll()[spaceId] ?? null;
}

export function setSpaceToken(spaceId: string, token: string) {
  const tokens = readAll();
  tokens[spaceId] = token;
  writeAll(tokens);
}

export function clearSpaceToken(spaceId: string) {
  const tokens = readAll();
  delete tokens[spaceId];
  writeAll(tokens);
}
