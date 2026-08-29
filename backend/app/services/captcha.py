"""Self-hosted proof-of-work captcha (Altcha-style): no external service,
no image datasets, works fully offline - consistent with the app's "100%
local" stance. The server hands out a random salt; the browser has to
brute-force a nonce so that sha256(f"{salt}:{nonce}") starts with N zero
hex characters, then submits that nonce back. Solving costs real CPU time
(bad bots doing this at scale pay for it) while verifying is one hash -
free for us.

What the proof-of-work does NOT do is stop someone willing to spend the
CPU: at any difficulty a browser can solve in under a second, a script
can solve it too. The cost is only half the defense - the other half is
that a solution is worthless without a salt this server issued, that each
salt is accepted exactly once, and that issuing salts is itself rate
limited per IP (routers/captcha.py). That last part is what actually caps
mass registration, whatever hardware the attacker brings.

In-memory only, like rate_limiter.py: fine for a single-process
deployment, resets on restart, not distributed."""

import hashlib
import os
import time

from ..config import settings

_CHALLENGE_TTL_SECONDS = 300

# Hard ceiling on outstanding challenges. Each one is a small dict entry,
# but nothing stops a client from requesting them in a loop, and an
# unbounded dict is a slow memory-exhaustion DoS. At this size the oldest
# entries are dropped first; legitimate traffic never comes close, and a
# flood only ever evicts the attacker's own pending challenges.
_MAX_OUTSTANDING = 20_000

_issued: dict[str, float] = {}


def _cleanup(now: float) -> None:
    expired = [salt for salt, issued_at in _issued.items() if now - issued_at > _CHALLENGE_TTL_SECONDS]
    for salt in expired:
        _issued.pop(salt, None)
    # dicts preserve insertion order, and every entry is inserted with the
    # current time, so the front of the dict is the oldest.
    while len(_issued) > _MAX_OUTSTANDING:
        _issued.pop(next(iter(_issued)), None)


def create_challenge() -> dict:
    salt = os.urandom(16).hex()
    now = time.time()
    _issued[salt] = now
    _cleanup(now)
    return {"salt": salt, "difficulty": settings.captcha_difficulty}


def verify_solution(salt: str, nonce: int) -> bool:
    issued_at = _issued.pop(salt, None)  # single-use regardless of outcome
    if issued_at is None or time.time() - issued_at > _CHALLENGE_TTL_SECONDS:
        return False
    digest = hashlib.sha256(f"{salt}:{nonce}".encode("utf-8")).hexdigest()
    return digest.startswith("0" * settings.captcha_difficulty)
