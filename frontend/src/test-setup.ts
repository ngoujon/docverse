/**
 * Node 22+ (and 20.20+) expose a global `localStorage`/`sessionStorage` that
 * takes precedence over the jsdom ones inside the test workers. Node's
 * version throws unless the process was started with `--localstorage-file`,
 * so every read our code does came back empty and any test that relies on a
 * stored value failed.
 *
 * The project used to force `--no-experimental-webstorage` through
 * NODE_OPTIONS, which Node refuses in that variable - the frontend CI job has
 * been failing on `--no-experimental-webstorage is not allowed in
 * NODE_OPTIONS` ever since. Installing a plain in-memory Storage here needs no
 * flag and behaves the same on every Node version.
 */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(String(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(String(key));
  }

  clear(): void {
    this.entries.clear();
  }
}

for (const key of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  });
}
