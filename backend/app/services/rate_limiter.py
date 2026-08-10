import time
from collections import defaultdict, deque


class RateLimiter:
    """Simple in-memory sliding-window rate limiter, keyed by an arbitrary
    string (typically "client_ip:route"). Good enough for a single-process
    deployment on a small VPS; not distributed, resets on restart."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_requests:
            return False
        hits.append(now)
        return True


# A few attempts is plenty for a legitimate user who mistypes a password;
# beyond that we're looking at brute-forcing.
space_unlock_limiter = RateLimiter(max_requests=10, window_seconds=300)

# The self-hosted PoW captcha (services/captcha.py) already raises the cost
# of scripted abuse; this is a second, cheap backstop.
contact_form_limiter = RateLimiter(max_requests=5, window_seconds=3600)

# Generic per-IP chat throttle so one user can't monopolize the single
# Ollama worker on a small VPS.
chat_limiter = RateLimiter(max_requests=20, window_seconds=60)

# Account creation and login attempts, per IP.
register_limiter = RateLimiter(max_requests=10, window_seconds=3600)
login_limiter = RateLimiter(max_requests=10, window_seconds=300)
password_reset_limiter = RateLimiter(max_requests=5, window_seconds=3600)

# The public support widget needs no account and no captcha (a captcha per
# chat message would kill the UX) - this is the only abuse backstop, so it's
# tighter than the authenticated chat_limiter above.
support_chat_limiter = RateLimiter(max_requests=15, window_seconds=300)
