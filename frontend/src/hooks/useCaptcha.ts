import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { solveChallenge } from "../utils/captchaSolver";
import type { CaptchaSolution } from "../types";

export type CaptchaStatus = "idle" | "loading" | "solving" | "ready" | "error";

/** Hashes tried per tick when no Web Worker is available. */
const BATCH_SIZE = 5000;

/** Solves the challenge in a Web Worker when possible, otherwise on the
 * main thread in small batches so the UI never freezes. */
function solve(salt: string, difficulty: number, isCancelled: () => boolean): Promise<number> {
  if (typeof Worker !== "undefined") {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("../workers/captcha.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<number>) => {
        worker.terminate();
        resolve(e.data);
      };
      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };
      worker.postMessage({ salt, difficulty });
    });
  }
  return new Promise((resolve) => {
    let from = 0;
    const step = () => {
      if (isCancelled()) return;
      const nonce = solveChallenge(salt, difficulty, from, BATCH_SIZE);
      if (nonce >= 0) return resolve(nonce);
      from += BATCH_SIZE;
      setTimeout(step, 0);
    };
    step();
  });
}

/**
 * Self-hosted proof-of-work captcha (see backend services/captcha.py):
 * fetch a salt, then find a nonce so that sha256("salt:nonce") starts with
 * `difficulty` zeros.
 *
 * With `lazy`, nothing happens until `start()` is called (e.g. when the
 * visitor focuses the form): the landing page carries two forms, and
 * solving both captchas at load cost seconds of CPU on every visit.
 *
 * A solution is single-use server-side: call `reset()` after a failed
 * submit to fetch and solve a fresh challenge.
 */
export function useCaptcha({ lazy = false }: { lazy?: boolean } = {}): {
  status: CaptchaStatus;
  solution: CaptchaSolution | null;
  reset: () => void;
  start: () => void;
} {
  const [status, setStatus] = useState<CaptchaStatus>(lazy ? "idle" : "loading");
  const [solution, setSolution] = useState<CaptchaSolution | null>(null);
  const [attempt, setAttempt] = useState(lazy ? 0 : 1);

  useEffect(() => {
    if (attempt === 0) return;
    let cancelled = false;
    setStatus("loading");
    setSolution(null);

    api
      .captchaChallenge()
      .then(({ salt, difficulty }) => {
        if (cancelled) return;
        setStatus("solving");
        return solve(salt, difficulty, () => cancelled).then((nonce) => {
          if (cancelled) return;
          setSolution({ captcha_salt: salt, captcha_nonce: nonce });
          setStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reset = useCallback(() => setAttempt((a) => a + 1), []);
  const start = useCallback(() => setAttempt((a) => (a === 0 ? 1 : a)), []);
  return { status, solution, reset, start };
}
