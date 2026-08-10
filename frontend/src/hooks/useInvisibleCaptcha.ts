import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { sha256Hex } from "../utils/sha256";

// Same self-hosted proof-of-work challenge as Captcha.tsx, solved silently
// in the background with no visible UI - for gating an action that should
// stay frictionless for real visitors (a human's normal page dwell time is
// enough) while still requiring real client-side work before a scripted
// bot can act, without pulling in an external captcha service.
export function useInvisibleCaptcha(): boolean {
  const [solved, setSolved] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

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
              setSolved(true);
              return;
            }
          }
          setTimeout(step, 0);
        };
        step();
      })
      .catch(() => {
        // If the challenge can't be fetched, fail open rather than
        // permanently blocking a purely cosmetic client-side demo.
        setSolved(true);
      });

    return () => {
      cancelled.current = true;
    };
  }, []);

  return solved;
}
