from fastapi import APIRouter, Request

from .. import schemas
from ..deps import client_ip
from ..services import captcha, rate_limiter

router = APIRouter(prefix="/api/captcha", tags=["captcha"])


@router.get("/challenge", response_model=schemas.CaptchaChallengeOut)
def get_challenge(request: Request):
    # Solving the proof-of-work is only expensive for an honest browser;
    # a determined script just spends the CPU. What it can't do is invent
    # a salt - only one issued here is accepted, and only once. Rate
    # limiting issuance is therefore the real cap on how many registrations,
    # newsletter sign-ups or contact messages a single source can attempt,
    # independent of how fast it can hash.
    rate_limiter.enforce(
        rate_limiter.captcha_challenge_limiter,
        client_ip(request),
        "Trop de demandes de verification anti-robot, reessayez plus tard",
    )
    return captcha.create_challenge()
