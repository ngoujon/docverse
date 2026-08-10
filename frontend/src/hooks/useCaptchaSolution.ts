import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { sha256Hex } from "../utils/sha256";
import type { CaptchaSolution } from "../types";

// Same self-hosted proof-of-work challenge as Captcha.tsx, solved silently
// in the background with no visible widget or status text - the form stays
// clean, submit just waits until `solution` is ready. Call `reset()` after a
// failed submit to fetch a fresh challenge (a spent nonce won't validate twice).
export function useCaptchaSolution(): { solution: CaptchaSolution | null; reset: () => void } {
  const [solution, setSolution] = useState<CaptchaSolution | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setSolution(null);

    api
      .captchaChallenge()
      .then(({ salt, difficulty }) => {
        if (cancelled.current) return;
        const target = "0".repeat(difficulty);
        let nonce = 0;

        const step = () => {
          if (cancelled.current) return;
          const chunkEnd = nonce + 20000;
          for (; nonce < chunkEnd; nonce++) {
            if (sha256Hex(`${salt}:${nonce}`).startsWith(target)) {
              setSolution({ captcha_salt: salt, captcha_nonce: nonce });
              return;
            }
          }
          setTimeout(step, 0);
        };
        step();
      })
      .catch(() => {
        // Leave solution null on failure - unlike the cosmetic demo gate,
        // these forms actually hit the backend, which enforces the captcha.
      });

    return () => {
      cancelled.current = true;
    };
  }, [attempt]);

  return { solution, reset: () => setAttempt((a) => a + 1) };
}
