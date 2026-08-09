from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, EmailStr, Field


class SpaceCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#6366f1"
    password: Optional[str] = Field(default=None, max_length=200)


class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    # Pass an empty string to remove the current password; omit the field
    # to leave it unchanged; pass a value to set/replace it.
    password: Optional[str] = Field(default=None, max_length=200)


class SpaceOut(BaseModel):
    id: str
    name: str
    description: str
    color: str
    has_password: bool = False
    created_at: datetime
    document_count: int = 0
    conversation_count: int = 0
    access_token: Optional[str] = None

    class Config:
        from_attributes = True


class SpaceUnlockRequest(BaseModel):
    password: str


class SpaceUnlockResponse(BaseModel):
    access_token: str


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
    message: str = Field(min_length=1, max_length=5000)
    # Honeypot: real users never fill this hidden field; bots often do.
    website: str = Field(default="", max_length=200)
