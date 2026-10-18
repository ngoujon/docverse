import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { sha256Hex } from "../utils/sha256";
import type { CaptchaSolution } from "../types";

export type CaptchaStatus = "loading" | "solving" | "ready" | "error";

/** Hashes tried per tick before yielding back to the browser. */
const BATCH_SIZE = 20000;

/**
 * Solves the self-hosted proof-of-work challenge (see backend
 * services/captcha.py) entirely client-side: fetch a salt, then brute-force
 * a nonce so that sha256("salt:nonce") starts with `difficulty` zeros. The
 * search runs in small batches through setTimeout so the UI never freezes.
 *
 * A solution is single-use server-side: call `reset()` after a failed
 * submit to fetch and solve a fresh challenge.
 */
export function useCaptcha(): { status: CaptchaStatus; solution: CaptchaSolution | null; reset: () => void } {
  const [status, setStatus] = useState<CaptchaStatus>("loading");
  const [solution, setSolution] = useState<CaptchaSolution | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setSolution(null);

    api
      .captchaChallenge()
      .then(({ salt, difficulty }) => {
        if (cancelled) return;
        setStatus("solving");
        const target = "0".repeat(difficulty);
        let nonce = 0;

        const step = () => {
          if (cancelled) return;
          for (const end = nonce + BATCH_SIZE; nonce < end; nonce++) {
            if (sha256Hex(`${salt}:${nonce}`).startsWith(target)) {
              setSolution({ captcha_salt: salt, captcha_nonce: nonce });
              setStatus("ready");
              return;
            }
          }
          setTimeout(step, 0);
        };
        step();
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reset = useCallback(() => setAttempt((a) => a + 1), []);
  return { status, solution, reset };
}
