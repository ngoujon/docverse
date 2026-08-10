"""Self-hosted proof-of-work captcha (Altcha-style): no external service,
no image datasets, works fully offline - consistent with the app's "100%
local" stance. The server hands out a random salt; the browser has to
brute-force a nonce so that sha256(f"{salt}:{nonce}") starts with N zero
bits, then submits that nonce back. Solving costs real CPU time (bad bots
doing this at scale pay for it) while verifying is one hash - free for us.

In-memory only, like rate_limiter.py: fine for a single-process
deployment, resets on restart, not distributed."""

import hashlib
import os
import time

from ..config import settings

_CHALLENGE_TTL_SECONDS = 300
_issued: dict[str, float] = {}


def _cleanup(now: float) -> None:
    expired = [salt for salt, issued_at in _issued.items() if now - issued_at > _CHALLENGE_TTL_SECONDS]
    for salt in expired:
        _issued.pop(salt, None)


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
