"""FastAPI application entry point: schema bootstrap, middlewares, error
handling and router registration."""

import logging

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models  # noqa: F401 - registers every table on Base.metadata
from .config import settings
from .database import Base, engine, ensure_schema
from .routers import (
    admin,
    auth,
    captcha,
    chat,
    contact,
    conversations,
    documents,
    newsletter,
    oauth,
    spaces,
    support,
    testimonials,
)

logging.basicConfig(level=logging.INFO)

# No Alembic: create missing tables, then add any missing columns.
Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(title="Docverse", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # No cookies are used for auth (user sessions and space access both use
    # bearer-style header tokens instead), so credentials don't need to be
    # allowed - this also lets CORS_ORIGINS=* work as a real wildcard.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cache_and_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    # API responses are JSON, never a document: a restrictive CSP costs
    # nothing here and neutralises any content-sniffing or direct-navigation
    # trick that would otherwise get a reflected value treated as markup.
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    # Cache control: API responses must not be cached by default
    # (endpoints that need caching should override these headers)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # email-validator's messages are English and very technical ("The part
    # after the @-sign is a special-use or reserved name...") and the
    # frontend shows `detail` as-is, so a malformed email gets one plain
    # French message instead. Every other validation error keeps FastAPI's
    # default shape (our own validators already raise French messages).
    for err in exc.errors():
        loc = err.get("loc") or ()
        if loc and "email" in str(loc[-1]) and err.get("type") == "value_error":
            return JSONResponse(status_code=422, content={"detail": "Adresse email invalide"})
    return await request_validation_exception_handler(request, exc)


for module in (
    auth,
    oauth,
    admin,
    captcha,
    newsletter,
    spaces,
    conversations,
    documents,
    chat,
    contact,
    support,
    testimonials,
):
    app.include_router(module.router)


@app.get("/api/health")
async def health():
    """Public liveness probe - deliberately says nothing but "the process
    is up".

    It used to return the inference provider, the exact model names and
    every model present on the box. None of that is a secret in the sense
    of a credential, but handed to an anonymous caller it's free
    reconnaissance: it names the stack to target, tells an attacker which
    model to tailor prompt-injection payloads to, and confirms when
    something changes. The detailed version lives behind admin auth at
    /api/admin/health (routers/admin.py)."""
    return {"status": "ok"}
