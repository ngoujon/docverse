import { sha256Hex } from "./sha256";

/** Smallest nonce such that sha256("salt:nonce") starts with `difficulty`
 * zeros (see backend services/captcha.py). Blocking: run it in a worker,
 * or in small batches with `from`/`batch` on the main thread. Returns -1
 * when no nonce matched within the batch. */
export function solveChallenge(salt: string, difficulty: number, from = 0, batch = Infinity): number {
  const target = "0".repeat(difficulty);
  for (let nonce = from; nonce < from + batch; nonce++) {
    if (sha256Hex(`${salt}:${nonce}`).startsWith(target)) return nonce;
  }
  return -1;
}
