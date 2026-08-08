from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel


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
    created_at: datetime
    document_count: int = 0
    conversation_count: int = 0

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    title: str = "Nouvelle conversation"


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    web_search_enabled: Optional[bool] = None


class ConversationOut(BaseModel):
    id: str
    space_id: str
    title: str
    web_search_enabled: bool
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
    web_search: bool = False


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
