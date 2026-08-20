"""Minimal OAuth2 authorization-code flow for SSO login/registration - hand
rolled with httpx (already a dependency) rather than pulling in a full
OAuth client library, consistent with how the rest of this app favors small
self-contained implementations (see utils/sha256.ts, services/captcha.py).

Google speaks plain OAuth2 + OpenID Connect userinfo, covered by the
generic OAuthProvider below. Apple is different enough to need its own
class: its client "secret" is a short-lived JWT signed with a private key
(not a static string), it returns the user's name only once - as JSON in
the callback body, never from a userinfo endpoint - and it refuses
http://localhost redirect URIs entirely, so it can be fully wired up here
but can't actually be exercised until this app is served over HTTPS from a
real domain (see config.apple_oauth_*).
"""

import time

import httpx
import jwt

from ..config import settings


class OAuthNotConfigured(Exception):
    pass


class OAuthProvider:
    def __init__(
        self,
        name: str,
        authorize_url: str,
        token_url: str,
        userinfo_url: str,
        scope: str,
        client_id: str,
        client_secret: str,
    ):
        self.name = name
        self.authorize_url = authorize_url
        self.token_url = token_url
        self.userinfo_url = userinfo_url
        self.scope = scope
        self.client_id = client_id
        self.client_secret = client_secret

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def redirect_uri(self) -> str:
        return f"{settings.backend_base_url}/api/auth/oauth/{self.name}/callback"

    def build_authorize_url(self, state: str) -> str:
        if not self.configured:
            raise OAuthNotConfigured(self.name)
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri(),
            "response_type": "code",
            "scope": self.scope,
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return f"{self.authorize_url}?{httpx.QueryParams(params)}"

    async def exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                self.token_url,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "redirect_uri": self.redirect_uri(),
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            res.raise_for_status()
            return res.json()

    async def fetch_userinfo(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                self.userinfo_url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            res.raise_for_status()
            return res.json()


google = OAuthProvider(
    name="google",
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    token_url="https://oauth2.googleapis.com/token",
    userinfo_url="https://www.googleapis.com/oauth2/v3/userinfo",
    scope="openid email profile",
    client_id=settings.google_oauth_client_id,
    client_secret=settings.google_oauth_client_secret,
)

linkedin = OAuthProvider(
    # LinkedIn's "Sign In with LinkedIn using OpenID Connect" product speaks
    # plain OIDC, same shape as Google - no subclassing needed.
    name="linkedin",
    authorize_url="https://www.linkedin.com/oauth/v2/authorization",
    token_url="https://www.linkedin.com/oauth/v2/accessToken",
    userinfo_url="https://api.linkedin.com/v2/userinfo",
    scope="openid profile email",
    client_id=settings.linkedin_oauth_client_id,
    client_secret=settings.linkedin_oauth_client_secret,
)


class GitHubAuth(OAuthProvider):
    """GitHub's /user endpoint omits "email" whenever the user hasn't made
    one public, even with the user:email scope granted - the verified
    address only shows up via the separate /user/emails endpoint, so
    userinfo has to merge both calls."""

    async def fetch_userinfo(self, access_token: str) -> dict:
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=15) as client:
            profile_res = await client.get("https://api.github.com/user", headers=headers)
            profile_res.raise_for_status()
            profile = profile_res.json()

            if not profile.get("email"):
                emails_res = await client.get("https://api.github.com/user/emails", headers=headers)
                emails_res.raise_for_status()
                primary = next(
                    (e["email"] for e in emails_res.json() if e.get("primary") and e.get("verified")),
                    None,
                )
                if primary:
                    profile["email"] = primary
            return profile


github = GitHubAuth(
    name="github",
    authorize_url="https://github.com/login/oauth/authorize",
    token_url="https://github.com/login/oauth/access_token",
    userinfo_url="https://api.github.com/user",
    scope="read:user user:email",
    client_id=settings.github_oauth_client_id,
    client_secret=settings.github_oauth_client_secret,
)

class AppleAuth:
    """Sign in with Apple - authorization-code flow with response_mode
    "form_post" (mandatory as soon as the "email"/"name" scopes are
    requested), handled by a dedicated POST route in routers/oauth.py
    rather than forced into OAuthProvider's GET-callback shape."""

    name = "apple"

    @property
    def configured(self) -> bool:
        return bool(
            settings.apple_oauth_client_id
            and settings.apple_oauth_team_id
            and settings.apple_oauth_key_id
            and settings.apple_oauth_private_key
        )

    def redirect_uri(self) -> str:
        return f"{settings.backend_base_url}/api/auth/oauth/apple/callback"

    def build_authorize_url(self, state: str) -> str:
        if not self.configured:
            raise OAuthNotConfigured(self.name)
        params = {
            "client_id": settings.apple_oauth_client_id,
            "redirect_uri": self.redirect_uri(),
            "response_type": "code",
            "response_mode": "form_post",
            "scope": "name email",
            "state": state,
        }
        return f"https://appleid.apple.com/auth/authorize?{httpx.QueryParams(params)}"

    def _client_secret(self) -> str:
        # Apple wants a JWT instead of a static client secret. It may live
        # up to ~6 months; minting a fresh one per exchange is simpler than
        # caching and never risks using an expired one.
        now = int(time.time())
        payload = {
            "iss": settings.apple_oauth_team_id,
            "iat": now,
            "exp": now + 3600,
            "aud": "https://appleid.apple.com",
            "sub": settings.apple_oauth_client_id,
        }
        return jwt.encode(
            payload,
            settings.apple_oauth_private_key,
            algorithm="ES256",
            headers={"kid": settings.apple_oauth_key_id},
        )

    async def exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                "https://appleid.apple.com/auth/token",
                data={
                    "client_id": settings.apple_oauth_client_id,
                    "client_secret": self._client_secret(),
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": self.redirect_uri(),
                },
            )
            res.raise_for_status()
            return res.json()

    def email_from_id_token(self, id_token: str) -> str:
        # This id_token was just obtained via our own direct, TLS server-
        # to-server call to Apple's token endpoint (authenticated with the
        # signed client secret above) - unlike the browser-mediated
        # implicit/hybrid flow, nothing attacker-controlled passes through
        # this code path, so decoding without re-verifying the signature
        # is safe here.
        claims = jwt.decode(id_token, options={"verify_signature": False})
        return (claims.get("email") or "").lower().strip()


apple = AppleAuth()

PROVIDERS = {"google": google, "github": github, "linkedin": linkedin}


def normalize_userinfo(provider: str, raw: dict) -> tuple[str, str]:
    """Returns (email, display_name) for GET-callback providers (Google,
    GitHub, LinkedIn). Apple is handled separately - see
    AppleAuth.email_from_id_token and routers/oauth.py's apple_callback."""
    email = (raw.get("email") or "").lower().strip()
    # GitHub profiles often leave "name" blank; "login" (the username) is
    # always present and is what GitHub itself falls back to in its own UI.
    name = raw.get("name") or raw.get("given_name") or raw.get("login") or ""
    return email, name
