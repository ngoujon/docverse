/// <reference lib="webworker" />
// Brute-forces the proof-of-work captcha off the main thread, so the page
// stays responsive (on a slow phone the search takes seconds of CPU).
import { solveChallenge } from "../utils/captchaSolver";

self.onmessage = (e: MessageEvent<{ salt: string; difficulty: number }>) => {
  const nonce = solveChallenge(e.data.salt, e.data.difficulty);
  (self as DedicatedWorkerGlobalScope).postMessage(nonce);
};
