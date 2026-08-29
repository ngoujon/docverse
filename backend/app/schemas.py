import re
from datetime import datetime
from typing import Optional, Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


def _validate_password_complexity(value: str) -> str:
    if not re.search(r"[a-z]", value):
        raise ValueError("Le mot de passe doit contenir au moins une lettre minuscule")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Le mot de passe doit contenir au moins une lettre majuscule")
    if not re.search(r"\d", value):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre")
    if not re.search(r"[^a-zA-Z0-9]", value):
        raise ValueError("Le mot de passe doit contenir au moins un caractère spécial")
    return value


# --- Auth -------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=120)
    captcha_salt: str
    captcha_nonce: int
    # Explicit acceptance of the CGU + privacy policy. Checked server-side
    # rather than trusting the frontend checkbox alone, so an account can
    # never exist without a recorded acceptance.
    terms_accepted: bool = False

    _validate_password = field_validator("password")(_validate_password_complexity)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    is_active: bool
    email_verified: bool
    totp_enabled: bool
    plan: str
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    user: UserOut


class LoginResponse(BaseModel):
    access_token: Optional[str] = None
    user: Optional[UserOut] = None
    requires_2fa: bool = False
    pending_token: Optional[str] = None


class TwoFactorVerifyRequest(BaseModel):
    pending_token: str
    code: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class TwoFactorEnableRequest(BaseModel):
    code: str


class TwoFactorDisableRequest(BaseModel):
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class DeleteAccountRequest(BaseModel):
    password: str


class LogoutEverywhereResponse(BaseModel):
    access_token: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=200)

    _validate_password = field_validator("password")(_validate_password_complexity)


# --- Spaces -------------------------------------------------------------

class SpaceCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#6366f1"


class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class SpaceOut(BaseModel):
    id: str
    name: str
    description: str
    color: str
    owner_id: str
    my_role: str = "member"  # owner | member | admin_view, resolved per-request
    can_upload: bool = False
    created_at: datetime
    document_count: int = 0
    conversation_count: int = 0

    class Config:
        from_attributes = True


class SpaceMemberCreate(BaseModel):
    email: EmailStr
    # Off by default - members can always chat, but uploading/deleting
    # documents is an explicit permission the owner grants per invitation.
    can_upload: bool = False


class SpaceMemberOut(BaseModel):
    id: str
    user_id: str
    email: str
    display_name: str
    can_upload: bool
    created_at: datetime


class ShareLinkCreate(BaseModel):
    can_upload: bool = False
    label: str = Field(default="", max_length=120)
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365)


class ShareLinkOut(BaseModel):
    id: str
    space_id: str
    can_upload: bool
    label: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    revoked: bool = False

    class Config:
        from_attributes = True


class SpaceStatsOut(BaseModel):
    space_id: str
    document_count: int
    conversation_count: int
    message_count: int
    storage_bytes: int
    storage_limit_bytes: Optional[int] = None
    member_count: int
    member_limit: Optional[int] = None
    active_share_links: int
    last_activity_at: Optional[datetime] = None


class MeStatsOut(BaseModel):
    owned_spaces: int
    space_limit: Optional[int] = None
    member_spaces: int
    document_count: int
    conversation_count: int
    message_count: int
    storage_bytes: int


class VectorGraphNode(BaseModel):
    id: str
    doc_id: str
    doc_name: str
    text_preview: str
    x: float
    y: float


class VectorGraphEdge(BaseModel):
    source: str
    target: str


class VectorGraphOut(BaseModel):
    nodes: list[VectorGraphNode]
    edges: list[VectorGraphEdge]
    truncated: bool


class AdminUpdateUserRequest(BaseModel):
    role: Optional[str] = Field(default=None, pattern="^(admin|user)$")
    is_active: Optional[bool] = None


class AdminCreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=120)
    role: str = Field(default="user", pattern="^(admin|user)$")

    _validate_password = field_validator("password")(_validate_password_complexity)


class SpaceSnapshotOut(BaseModel):
    id: str
    space_id: str
    created_at: datetime
    size_bytes: int
    conversation_count: int
    document_count: int

    class Config:
        from_attributes = True


class PaginatedUsers(BaseModel):
    items: list[UserOut]
    total: int
    limit: int
    offset: int


class PaginatedSpaces(BaseModel):
    items: list[SpaceOut]
    total: int
    limit: int
    offset: int


class InvoiceOut(BaseModel):
    id: str
    number: Optional[str] = None
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None
    is_business: bool
    tax_ids: list[str] = []
    amount_paid: int
    currency: str
    status: Optional[str] = None
    created: int
    hosted_invoice_url: Optional[str] = None
    invoice_pdf: Optional[str] = None


class PaginatedInvoices(BaseModel):
    items: list[InvoiceOut]
    has_more: bool


class AdminStatsOut(BaseModel):
    users: int
    spaces: int
    documents: int
    conversations: int
    messages: int
    storage_bytes: int
    newsletter_subscribers: int
    new_users_7d: int
    new_spaces_7d: int


class ConversationCreate(BaseModel):
    title: str = "Nouvelle conversation"


class ConversationUpdate(BaseModel):
    title: Optional[str] = None


class ConversationOut(BaseModel):
    id: str
    space_id: str
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources: list[Any] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str
    # Documents explicitly referenced with "@name" in the message (see
    # frontend ChatWindow.tsx) - narrows retrieval to just these instead of
    # searching the whole space. Ids not belonging to this conversation's
    # space are silently dropped server-side (see routers/chat.py).
    doc_ids: list[str] = []


class DocumentOut(BaseModel):
    id: str
    space_id: str
    name: str
    doc_type: str
    source_url: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    chunk_count: int
    preview: str
    size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True


class UrlIngestRequest(BaseModel):
    url: str


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    subject: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=40)
    company: str = Field(default="", max_length=200)
    message: str = Field(min_length=1, max_length=5000)
    consent: bool
    # Honeypot: real users never fill this hidden field; bots often do.
    website: str = Field(default="", max_length=200)
    captcha_salt: str
    captcha_nonce: int

    @field_validator("consent")
    @classmethod
    def consent_must_be_true(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Le consentement RGPD est requis")
        return v


class CaptchaChallengeOut(BaseModel):
    salt: str
    difficulty: int


class SupportChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class SupportChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[SupportChatMessage] = Field(default_factory=list, max_length=20)


class NewsletterSubscribeRequest(BaseModel):
    email: EmailStr
    captcha_salt: str
    captcha_nonce: int


# --- Testimonials -------------------------------------------------------

class TestimonialOut(BaseModel):
    id: str
    author_name: str
    author_role: str
    author_company: str
    content: str
    rating: int
    published: bool
    display_order: int
    created_at: datetime

    class Config:
        from_attributes = True


class TestimonialCreate(BaseModel):
    author_name: str = Field(min_length=1, max_length=120)
    author_role: str = Field(default="", max_length=120)
    author_company: str = Field(default="", max_length=120)
    content: str = Field(min_length=1, max_length=2000)
    rating: int = Field(default=5, ge=1, le=5)
    published: bool = False
    display_order: int = 0


class TestimonialUpdate(BaseModel):
    author_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    author_role: Optional[str] = Field(default=None, max_length=120)
    author_company: Optional[str] = Field(default=None, max_length=120)
    content: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    published: Optional[bool] = None
    display_order: Optional[int] = None
