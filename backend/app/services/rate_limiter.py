import math
import time
from collections import defaultdict, deque

from fastapi import HTTPException

# Buckets are created lazily per key (typically per client IP), and an
# attacker can mint new keys for free by rotating source addresses. Sweep
# the dictionary once it grows past this, dropping every bucket whose hits
# have all aged out, so a spray of one-off IPs can't grow it without bound.
_SWEEP_THRESHOLD = 10_000


class RateLimiter:
    """Simple in-memory sliding-window rate limiter, keyed by an arbitrary
    string (typically "client_ip" or "route:identifier"). Good enough for a
    single-process deployment on a small VPS; not distributed, resets on
    restart."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque:
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        return hits

    def _sweep(self, now: float) -> None:
        if len(self._hits) < _SWEEP_THRESHOLD:
            return
        stale = [
            key
            for key, hits in self._hits.items()
            if not hits or now - hits[-1] > self.window_seconds
        ]
        for key in stale:
            self._hits.pop(key, None)

    def check(self, key: str) -> bool:
        """Is this key currently under its limit? Records nothing - used
        where a hit should only be counted on failure (see record())."""
        return len(self._prune(key, time.monotonic())) < self.max_requests

    def record(self, key: str) -> None:
        """Count one hit against this key without checking the limit."""
        now = time.monotonic()
        self._prune(key, now).append(now)
        self._sweep(now)

    def reset(self, key: str) -> None:
        """Forget every hit for this key - called when an attempt finally
        succeeds, so a legitimate user who mistyped a few times starts
        again from a clean slate."""
        self._hits.pop(key, None)

    def allow(self, key: str) -> bool:
        """Check and, if under the limit, count this request."""
        now = time.monotonic()
        hits = self._prune(key, now)
        if len(hits) >= self.max_requests:
            return False
        hits.append(now)
        self._sweep(now)
        return True

    def remaining(self, key: str) -> int:
        return max(0, self.max_requests - len(self._prune(key, time.monotonic())))

    def retry_after(self, key: str) -> int:
        """Seconds until the oldest recorded hit leaves the window, i.e.
        until this key gets its next slot back."""
        hits = self._prune(key, time.monotonic())
        if len(hits) < self.max_requests:
            return 0
        return max(1, math.ceil(self.window_seconds - (time.monotonic() - hits[0])))


def too_many_requests(limiter: RateLimiter, key: str, detail: str) -> HTTPException:
    """A 429 that actually tells the caller when to come back. Without
    Retry-After a well-behaved client has to guess, and retries blindly -
    which looks exactly like the abuse the limit is there to stop."""
    retry_after = limiter.retry_after(key)
    return HTTPException(
        429,
        detail,
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(limiter.max_requests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": str(retry_after),
        },
    )


def enforce(limiter: RateLimiter, key: str, detail: str = "Trop de tentatives, reessayez plus tard") -> None:
    """Consume one slot for `key`, or raise a 429 carrying Retry-After."""
    if not limiter.allow(key):
        raise too_many_requests(limiter, key, detail)


def enforce_check(limiter: RateLimiter, key: str, detail: str) -> None:
    """Like enforce(), but records nothing - for limits fed only by
    record() on failure."""
    if not limiter.check(key):
        raise too_many_requests(limiter, key, detail)


# A few attempts is plenty for a legitimate user who mistypes a password;
# beyond that we're looking at brute-forcing.
space_unlock_limiter = RateLimiter(max_requests=10, window_seconds=300)

# The self-hosted PoW captcha (services/captcha.py) already raises the cost
# of scripted abuse; this is a second, cheap backstop.
contact_form_limiter = RateLimiter(max_requests=5, window_seconds=3600)

# Generic per-IP chat throttle so one user can't monopolize the single
# appel au fournisseur d'IA, facture a l'usage.
chat_limiter = RateLimiter(max_requests=20, window_seconds=60)

# Account creation and login attempts, per IP.
register_limiter = RateLimiter(max_requests=10, window_seconds=3600)
login_limiter = RateLimiter(max_requests=10, window_seconds=300)
password_reset_limiter = RateLimiter(max_requests=5, window_seconds=3600)
# Re-sending the confirmation email, per account - each call sends a real
# email, so a handful per hour is enough for a lost or delayed message.
verify_email_resend_limiter = RateLimiter(max_requests=3, window_seconds=3600)

# Per-IP limits alone don't stop a patient attacker who rotates addresses
# (a botnet, or just a cloud provider's IP pool) against one known account.
# This bucket is keyed by the targeted email instead, and - crucially -
# only FAILED attempts are recorded and a success clears it: someone else
# hammering your address can never lock you out of your own account.
login_account_limiter = RateLimiter(max_requests=8, window_seconds=900)

# Every captcha-protected form (register, newsletter, contact) needs a
# server-issued challenge first, and each one is single-use. Capping how
# many challenges an IP can draw therefore caps those forms directly,
# whatever the proof-of-work costs the client - which is the real defense
# against someone who has simply thrown more CPU at solving them.
captcha_challenge_limiter = RateLimiter(max_requests=30, window_seconds=3600)

# Newsletter sign-ups: the captcha is the first gate, this bounds how many
# confirmation emails a single source can make us send (each one is an
# email to an address the requester chose, i.e. a spam vector).
newsletter_limiter = RateLimiter(max_requests=3, window_seconds=3600)

# The public support widget needs no account and no captcha (a captcha per
# chat message would kill the UX) - this is the only abuse backstop, so
# it's tighter than the authenticated chat_limiter above. The daily bucket
# bounds the LLM bill a single visitor can run up over a long session.
support_chat_limiter = RateLimiter(max_requests=15, window_seconds=300)
support_chat_daily_limiter = RateLimiter(max_requests=100, window_seconds=86400)
