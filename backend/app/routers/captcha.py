from fastapi import APIRouter

from .. import schemas
from ..services import captcha

router = APIRouter(prefix="/api/captcha", tags=["captcha"])


@router.get("/challenge", response_model=schemas.CaptchaChallengeOut)
def get_challenge():
    return captcha.create_challenge()
