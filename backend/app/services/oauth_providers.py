"""Minimal OAuth2 authorization-code flow for SSO login/registration - hand
rolled with httpx (already a dependency) rather than pulling in a full
OAuth client library, consistent with how the rest of this app favors small
self-contained implementations (see utils/sha256.ts, services/captcha.py).

Google and Microsoft both speak plain OAuth2 + OpenID Connect userinfo, so
one generic flow covers both. Apple is deliberately not implemented here:
its client "secret" is a JWT signed with a private key (not a static
string) and it refuses http://localhost redirect URIs entirely, so it
can't be exercised in local dev the way the other two can - see
config.apple_oauth_* for the settings that would be needed once there's a
real HTTPS domain.
"""

import httpx

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

microsoft = OAuthProvider(
    name="microsoft",
    authorize_url=f"https://login.microsoftonline.com/{settings.microsoft_oauth_tenant_id}/oauth2/v2.0/authorize",
    token_url=f"https://login.microsoftonline.com/{settings.microsoft_oauth_tenant_id}/oauth2/v2.0/token",
    userinfo_url="https://graph.microsoft.com/oidc/userinfo",
    scope="openid email profile",
    client_id=settings.microsoft_oauth_client_id,
    client_secret=settings.microsoft_oauth_client_secret,
)

PROVIDERS = {"google": google, "microsoft": microsoft}


def normalize_userinfo(provider: str, raw: dict) -> tuple[str, str]:
    """Returns (email, display_name) - Google and Microsoft's OIDC userinfo
    shapes differ slightly for the display name field."""
    email = raw.get("email", "").lower().strip()
    if provider == "microsoft":
        name = raw.get("name", "")
    else:
        name = raw.get("name") or raw.get("given_name", "")
    return email, name
