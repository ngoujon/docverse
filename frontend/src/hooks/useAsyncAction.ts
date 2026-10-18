import { useCallback, useState } from "react";
import { errorMessage } from "../api/client";

/**
 * Busy/error state of one async user action (form submit, button click).
 * `run(fn)` resolves to true when `fn` succeeded; on failure the error
 * message is kept in `error` for display instead of being thrown.
 */
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
