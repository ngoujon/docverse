import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, default="")
    role = Column(String, nullable=False, default="user")  # admin | user
    is_active = Column(Boolean, nullable=False, default=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    # Bumped on password change / explicit "log out everywhere" - embedded in
    # session JWTs so previously issued tokens stop working immediately
    # instead of staying valid until their natural expiry.
    token_version = Column(Integer, nullable=False, default=0)
    totp_secret = Column(String, nullable=True)
    totp_enabled = Column(Boolean, nullable=False, default=False)
    # Daily AI-question counter backing config.FREE_QUOTAS
    # ["messages_per_day"]: messages_today only counts for the UTC date
    # stored in messages_day, and silently restarts from zero on the
    # first question of a new day.
    messages_day = Column(String, nullable=True)
    messages_today = Column(Integer, nullable=False, default=0)
    # When this account explicitly accepted the CGU + privacy policy (the
    # required checkbox on the signup form, or the notice shown next to the
    # SSO buttons). Kept as a timestamp rather than a boolean because what
    # matters in a dispute is *when* the terms were accepted, so it can be
    # matched against the version of the terms in force that day. Null for
    # accounts created before this was introduced.
    terms_accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owned_spaces = relationship("Space", back_populates="owner")


class Space(Base):
    __tablename__ = "spaces"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    color = Column(String, default="#6366f1")
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="owned_spaces")
    conversations = relationship(
        "Conversation", back_populates="space", cascade="all, delete-orphan"
    )
    documents = relationship(
        "Document", back_populates="space", cascade="all, delete-orphan"
    )
    members = relationship(
        "SpaceMember", back_populates="space", cascade="all, delete-orphan"
    )
    share_links = relationship(
        "ShareLink", back_populates="space", cascade="all, delete-orphan"
    )


class SpaceMember(Base):
    """An account-holding collaborator on a workspace, distinct from the
    owner (tracked on Space.owner_id, never duplicated here)."""

    __tablename__ = "space_members"

    id = Column(String, primary_key=True, default=gen_id)
    space_id = Column(String, ForeignKey("spaces.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String, nullable=False, default="member")
    # Members can always chat; uploading/deleting documents is a separate,
    # opt-in permission the space owner grants per member (off by default).
    can_upload = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    space = relationship("Space", back_populates="members")
    user = relationship("User")


class SpaceMemberRemoval(Base):
    """Log of member removals, kept independently of SpaceMember (which is
    hard-deleted on removal) so add_member can enforce a re-invite cooldown
    and stop someone from being cycled in/out to dodge members_per_space."""

    __tablename__ = "space_member_removals"

    id = Column(String, primary_key=True, default=gen_id)
    space_id = Column(String, ForeignKey("spaces.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    removed_at = Column(DateTime, default=datetime.utcnow, index=True)


class ShareLink(Base):
    """An unguessable capability token (the row id itself) that grants
    anonymous visitors a fixed role on one space, replacing the old
    space-password mechanism."""

    __tablename__ = "share_links"

    id = Column(String, primary_key=True, default=gen_id)
    space_id = Column(String, ForeignKey("spaces.id"), nullable=False, index=True)
    role = Column(String, nullable=False, default="member")
    can_upload = Column(Boolean, nullable=False, default=False)
    label = Column(String, default="")
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    revoked = Column(Boolean, default=False)

    space = relationship("Space", back_populates="share_links")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=gen_id)
    space_id = Column(String, ForeignKey("spaces.id"), nullable=False, index=True)
    title = Column(String, default="Nouvelle conversation")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", back_populates="conversations")
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=gen_id)
    conversation_id = Column(
        String, ForeignKey("conversations.id"), nullable=False, index=True
    )
    role = Column(String, nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    sources_json = Column(Text, default="[]")  # JSON encoded list of citations
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=gen_id)
    space_id = Column(String, ForeignKey("spaces.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    doc_type = Column(String, nullable=False)  # pdf | image | url | docx | txt | md
    source_url = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending|processing|ready|error
    error_message = Column(Text, nullable=True)
    chunk_count = Column(Integer, default=0)
    preview = Column(Text, default="")
    size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    space = relationship("Space", back_populates="documents")


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    subject = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    company = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    # Recorded proof of RGPD consent at submission time - the form requires
    # this checkbox, but we keep the value (rather than just gating on it)
    # in case we ever need to demonstrate consent was actually collected.
    consent_given = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Testimonial(Base):
    """A homepage testimonial/review. Seeded with placeholder drafts on
    first boot (see database.py) but never auto-published - an admin must
    review and explicitly publish each one from the admin dashboard,
    since displaying fabricated reviews as genuine to visitors would be
    misleading advertising if left on autopilot."""

    __tablename__ = "testimonials"

    id = Column(String, primary_key=True, default=gen_id)
    author_name = Column(String, nullable=False)
    author_role = Column(String, default="")
    author_company = Column(String, default="")
    content = Column(Text, nullable=False)
    rating = Column(Integer, default=5)
    published = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SpaceSnapshot(Base):
    """A point-in-time backup of one space (its SQL rows, vector store, and
    uploaded files), so an admin can restore it after a mistake or data
    problem without affecting any other space. See services/backup.py."""

    __tablename__ = "space_snapshots"

    id = Column(String, primary_key=True, default=gen_id)
    space_id = Column(String, ForeignKey("spaces.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    size_bytes = Column(Integer, default=0)
    conversation_count = Column(Integer, default=0)
    document_count = Column(Integer, default=0)
    path = Column(String, nullable=False)


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, nullable=False, unique=True, index=True)
    confirmed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)
