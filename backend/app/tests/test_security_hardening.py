"""Covers the findings from the 2026-08-29 external security audit.

Each test names the weakness it pins down, so a later refactor that
quietly reopens one fails here rather than in the next audit.
"""

import time

import pytest

from .conftest import auth_headers, register_user


# --- Account enumeration -------------------------------------------------

def test_forgot_password_answers_identically_for_known_and_unknown_email(client):
    register_user(client, "known@example.com")

    known = client.post("/api/auth/forgot-password", json={"email": "known@example.com"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody-here@example.com"})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json() == {"ok": True}


def test_forgot_password_costs_the_same_for_known_and_unknown_email(client):
    """The response body was always identical; the timing was not. Issuing
    a reset token hashes the current password hash and writes an email
    task, while the unknown-address branch used to return immediately -
    a gap wide enough to enumerate accounts one request at a time.

    Both branches now pay a bcrypt-sized cost, so the difference should be
    far smaller than the bcrypt work itself (~100ms). The bound is loose
    on purpose: this asserts "no exploitable oracle", not a fixed speed on
    whatever machine CI runs on."""
    register_user(client, "timing@example.com")

    def elapsed(email: str) -> float:
        start = time.perf_counter()
        client.post("/api/auth/forgot-password", json={"email": email})
        return time.perf_counter() - start

    # Warm up: first call pays for imports and connection setup.
    elapsed("timing@example.com")

    known = min(elapsed("timing@example.com") for _ in range(3))
    unknown = min(elapsed("absent@example.com") for _ in range(3))

    assert abs(known - unknown) < 0.05


def test_login_costs_the_same_for_known_and_unknown_email(client):
    """Same oracle on the login form, and a far more obvious one: without
    the dummy hash, an unknown email answered in microseconds while a real
    one paid the full bcrypt work factor."""
    register_user(client, "real@example.com", password="Right-password1")

    def elapsed(email: str) -> float:
        start = time.perf_counter()
        res = client.post("/api/auth/login", json={"email": email, "password": "Wrong-password1"})
        assert res.status_code == 401
        return time.perf_counter() - start

    elapsed("real@example.com")  # warm up

    known = min(elapsed("real@example.com") for _ in range(3))
    unknown = min(elapsed("ghost@example.com") for _ in range(3))

    assert abs(known - unknown) < 0.05


def test_register_does_not_confirm_that_an_email_is_taken(client):
    """The signup form is public, so a message that distinguishes "already
    registered" from any other rejection is an enumeration oracle."""
    register_user(client, "taken@example.com")
    challenge = client.get("/api/captcha/challenge").json()
    res = client.post(
        "/api/auth/register",
        json={
            "email": "taken@example.com",
            "password": "Correct-horse-battery1",
            "display_name": "",
            "captcha_salt": challenge["salt"],
            "captcha_nonce": 0,
            "terms_accepted": True,
        },
    )
    assert res.status_code == 409
    detail = res.json()["detail"].lower()
    assert "existe deja" not in detail
    assert "deja" in detail  # still points the real owner at password reset


# --- Rate limiting -------------------------------------------------------

def test_login_rate_limit_tells_the_caller_when_to_retry(client):
    """A 429 with no Retry-After leaves a well-behaved client guessing,
    so it retries blindly - indistinguishable from the abuse the limit
    exists to stop."""
    from app.services import rate_limiter

    for _ in range(rate_limiter.login_limiter.max_requests + 1):
        res = client.post(
            "/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1A"}
        )

    assert res.status_code == 429
    assert int(res.headers["retry-after"]) > 0
    assert res.headers["x-ratelimit-limit"] == str(rate_limiter.login_limiter.max_requests)
    assert res.headers["x-ratelimit-remaining"] == "0"


def test_failed_logins_are_capped_per_account_across_ips(client, monkeypatch):
    """The per-IP limit does nothing against an attacker rotating source
    addresses at a single known account, which is exactly the "9 tries,
    pause, repeat" pattern the audit described. This bucket is keyed by
    the targeted email instead."""
    from app.services import rate_limiter

    register_user(client, "target@example.com", password="Right-password1")
    # Take the per-IP limit out of the picture so only the account bucket
    # can be what stops us.
    monkeypatch.setattr(rate_limiter.login_limiter, "max_requests", 10_000)

    limit = rate_limiter.login_account_limiter.max_requests
    for _ in range(limit):
        res = client.post(
            "/api/auth/login",
            # A different spoofed source each time: only the per-account
            # bucket can see that these belong together.
            headers={"X-Real-IP": f"203.0.113.{_}"},
            json={"email": "target@example.com", "password": "Wrong-password1"},
        )
        assert res.status_code == 401

    blocked = client.post(
        "/api/auth/login",
        headers={"X-Real-IP": "203.0.113.250"},
        json={"email": "target@example.com", "password": "Wrong-password1"},
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


def test_a_stranger_cannot_lock_a_user_out_of_their_own_account(client, monkeypatch):
    """The flip side of a per-account limit: if wrong guesses alone could
    trip it, anyone could deny you access to your own account by typing
    your address a dozen times. Only failures count, and a success clears
    the bucket - so the real owner always gets through."""
    from app.services import rate_limiter

    register_user(client, "victim@example.com", password="Right-password1")
    monkeypatch.setattr(rate_limiter.login_limiter, "max_requests", 10_000)

    for _ in range(rate_limiter.login_account_limiter.max_requests - 1):
        client.post(
            "/api/auth/login",
            json={"email": "victim@example.com", "password": "Wrong-password1"},
        )

    ok = client.post(
        "/api/auth/login", json={"email": "victim@example.com", "password": "Right-password1"}
    )
    assert ok.status_code == 200

    # And the successful login reset the counter, rather than leaving the
    # owner one mistype away from a lockout.
    again = client.post(
        "/api/auth/login", json={"email": "victim@example.com", "password": "Right-password1"}
    )
    assert again.status_code == 200


def test_newsletter_subscribe_is_rate_limited(client):
    """Each accepted sign-up sends a confirmation email to an address the
    caller chose. Unlimited, that's a mail-bombing tool aimed at third
    parties - the captcha alone never bounded it."""
    from app.services import rate_limiter

    last = None
    for i in range(rate_limiter.newsletter_limiter.max_requests + 1):
        challenge = client.get("/api/captcha/challenge").json()
        last = client.post(
            "/api/newsletter/subscribe",
            json={
                "email": f"sub{i}@example.com",
                "captcha_salt": challenge["salt"],
                "captcha_nonce": 0,
            },
        )
    assert last.status_code == 429
    assert int(last.headers["retry-after"]) > 0


def test_captcha_challenge_issuance_is_rate_limited(client):
    """The proof-of-work only costs an attacker CPU, which they have. What
    they can't do is invent a salt: every solution must quote one this
    server issued, once. Capping issuance is therefore the real ceiling on
    scripted registration, whatever hardware they bring."""
    from app.services import rate_limiter

    for _ in range(rate_limiter.captcha_challenge_limiter.max_requests):
        assert client.get("/api/captcha/challenge").status_code == 200

    blocked = client.get("/api/captcha/challenge")
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


def test_a_captcha_solution_cannot_be_replayed(client):
    """Single-use salts are what stop one solved proof-of-work from being
    stamped onto a thousand registrations."""
    challenge = client.get("/api/captcha/challenge").json()
    payload = {
        "email": "replay1@example.com",
        "password": "Correct-horse-battery1",
        "display_name": "",
        "captcha_salt": challenge["salt"],
        "captcha_nonce": 0,
        "terms_accepted": True,
    }
    assert client.post("/api/auth/register", json=payload).status_code == 200

    payload["email"] = "replay2@example.com"
    replayed = client.post("/api/auth/register", json=payload)
    assert replayed.status_code == 400


# --- Information disclosure ---------------------------------------------

def test_public_health_reveals_nothing_about_the_stack(client):
    """It used to name the inference provider and list every model on the
    box to anonymous callers - free reconnaissance for tailoring an
    attack, and a change detector when the stack moves."""
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_detailed_health_requires_an_admin(client):
    data = register_user(client, "plain@example.com")

    assert client.get("/api/admin/health").status_code == 401
    assert client.get("/api/admin/health", headers=auth_headers(data["access_token"])).status_code == 403


# --- Response headers ----------------------------------------------------

def test_api_responses_carry_the_baseline_security_headers(client):
    res = client.get("/api/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert "no-store" in res.headers["cache-control"]
    assert "frame-ancestors 'none'" in res.headers["content-security-policy"]


# --- Signing key ---------------------------------------------------------

@pytest.mark.parametrize("weak", ["secret", "docverse", "changeme", "short-key-123"])
def test_config_refuses_to_boot_on_a_weak_secret_key(weak, monkeypatch):
    """HS256 is only as strong as its key: a guessable SECRET_KEY lets
    anyone mint a token with role=admin. A warning in the logs is the
    thing nobody reads, so this is a hard failure."""
    import importlib

    monkeypatch.setenv("SECRET_KEY", weak)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        importlib.reload(importlib.import_module("app.config"))

    # Leave the module in its normal state for the rest of the session.
    monkeypatch.undo()
    importlib.reload(importlib.import_module("app.config"))
