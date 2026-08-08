import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, Boolean
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


class Space(Base):
    __tablename__ = "spaces"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    color = Column(String, default="#6366f1")
    created_at = Column(DateTime, default=datetime.utcnow)

    conversations = relationship(
        "Conversation", back_populates="space", cascade="all, delete-orphan"
    )
    documents = relationship(
        "Document", back_populates="space", cascade="all, delete-orphan"
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=gen_id)
    space_id = Column(String, ForeignKey("spaces.id"), nullable=False, index=True)
    title = Column(String, default="Nouvelle conversation")
    web_search_enabled = Column(Boolean, default=False)
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
