"""Document ingestion pipeline: validates an upload, extracts its text
(PDF, scanned pages and images through the vision model, audio through a
local Whisper model, DOCX, plain text, web pages) and splits it into
overlapping chunks ready to be embedded."""

import asyncio
import base64
import ipaddress
import logging
import re
import socket
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import fitz  # PyMuPDF
import httpx
import trafilatura
from docx import Document as DocxDocument

from ..config import WHISPER_MODEL_DIR, settings
from . import llm_provider

logger = logging.getLogger("docverse.documents")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"}

_IMAGE_PROMPT = (
    "Tu analyses un document image. Transcris intégralement tout le texte "
    "visible (OCR précis, conserve la mise en forme en liste/tableau si "
    "pertinent). Ensuite décris brièvement les éléments visuels importants "
    "(graphiques, schémas, photos, logos). Réponds uniquement avec le "
    "contenu extrait, sans commentaire méta."
)

_SCANNED_PAGE_PROMPT = (
    "Voici une page de document scannée. Transcris intégralement tout le "
    "texte visible (OCR précis). Si la page contient des tableaux, "
    "restitue-les en texte structuré. Réponds uniquement avec le texte "
    "extrait, sans commentaire."
)

_MIN_TEXT_CHARS_PER_PAGE = 40


def _b64_from_bytes(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


async def extract_text_from_pdf(path: Path) -> str:
    doc = fitz.open(path)
    parts: list[str] = []
    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            text = page.get_text().strip()
            if len(text) < _MIN_TEXT_CHARS_PER_PAGE:
                pix = page.get_pixmap(dpi=200)
                img_bytes = pix.tobytes("png")
                described = await llm_provider.describe_image(
                    _b64_from_bytes(img_bytes),
                    _SCANNED_PAGE_PROMPT,
                    mime_type="image/png",
                )
                text = described.strip()
            parts.append(f"[Page {page_index + 1}]\n{text}")
    finally:
        doc.close()
    return "\n\n".join(parts)


# L'API Mistral recoit l'image dans une data-URI : le type MIME doit
# correspondre au contenu reel, sans quoi elle rejette la requete. On le
# deduit de l'extension plutot que d'annoncer du JPEG par defaut.
_IMAGE_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


async def extract_text_from_image(path: Path) -> str:
    data = path.read_bytes()
    mime_type = _IMAGE_MIME_TYPES.get(path.suffix.lower(), "image/jpeg")
    return await llm_provider.describe_image(
        _b64_from_bytes(data), _IMAGE_PROMPT, mime_type=mime_type
    )


@lru_cache(maxsize=1)
def _whisper_model():
    """Loaded lazily on first transcription (not at import time) so the
    model download/load doesn't block API startup, and cached process-wide
    since it holds the weights in memory. "small" on CPU balances accuracy
    and speed on a GPU-less box; weights live in WHISPER_MODEL_DIR."""
    from faster_whisper import WhisperModel

    logger.info("Chargement du modele Whisper '%s'...", settings.whisper_model_size)
    return WhisperModel(
        settings.whisper_model_size,
        device="cpu",
        compute_type=settings.whisper_compute_type,
        download_root=str(WHISPER_MODEL_DIR),
    )


def _transcribe_sync(path: Path) -> str:
    segments, _info = _whisper_model().transcribe(str(path), beam_size=5, vad_filter=True)
    return " ".join(segment.text.strip() for segment in segments).strip()


async def extract_text_from_audio(path: Path) -> str:
    """Self-hosted transcription (faster-whisper). Runs on a thread since it
    is blocking CPU work, and through the shared queue slot so it competes
    fairly with the rest of the app for the same CPU."""
    async with llm_provider.queue_slot():
        return await asyncio.to_thread(_transcribe_sync, path)


def extract_text_from_docx(path: Path) -> str:
    doc = DocxDocument(str(path))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    return "\n\n".join(parts)


def extract_text_from_txt(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


class UnsafeUrlError(ValueError):
    pass


def _is_public_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def _assert_public_url(url: str) -> None:
    """Blocks requests to internal/cloud-metadata/loopback addresses so the
    URL-ingestion and web-search features can't be used for SSRF (e.g.
    pointing at http://169.254.169.254/, http://backend:8000, localhost...).
    Resolves the hostname ourselves rather than trusting the string, since
    that's also what actually gets connected to."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Seuls les liens http(s) sont autorisés")
    if not parsed.hostname:
        raise UnsafeUrlError("URL invalide")

    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrlError("Impossible de résoudre ce nom de domaine") from exc

    if not infos or not all(_is_public_ip(info[4][0]) for info in infos):
        raise UnsafeUrlError("Cette adresse n'est pas autorisée")


async def extract_text_from_url(url: str) -> tuple[str, str]:
    """Returns (title, text)."""
    current_url = url
    async with httpx.AsyncClient(
        timeout=30.0, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0"}
    ) as client:
        for _ in range(5):
            await _assert_public_url(current_url)
            r = await client.get(current_url)
            if r.is_redirect:
                next_url = r.headers.get("location")
                if not next_url:
                    r.raise_for_status()
                current_url = str(httpx.URL(current_url).join(next_url))
                continue
            r.raise_for_status()
            html = r.text
            break
        else:
            raise UnsafeUrlError("Trop de redirections")

    extracted = trafilatura.extract(
        html, include_comments=False, include_tables=True, favor_recall=True
    )
    metadata = trafilatura.extract_metadata(html)
    title = (metadata.title if metadata and metadata.title else current_url) or current_url
    return title, (extracted or "").strip()


async def _extract_text_file(path: Path) -> str:
    return extract_text_from_txt(path)


async def _extract_docx(path: Path) -> str:
    return extract_text_from_docx(path)


# doc_type -> extractor for every file-based type ("url" is handled apart).
_FILE_EXTRACTORS = {
    "pdf": extract_text_from_pdf,
    "image": extract_text_from_image,
    "audio": extract_text_from_audio,
    "docx": _extract_docx,
    "txt": _extract_text_file,
    "md": _extract_text_file,
}

# File extension -> doc_type accepted at upload.
_EXTENSION_TYPES = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".md": "md",
    **{ext: "image" for ext in IMAGE_EXTENSIONS},
    **{ext: "audio" for ext in AUDIO_EXTENSIONS},
    **{ext: "txt" for ext in (".txt", ".csv", ".json", ".log")},
}


async def process_document(
    doc_type: str, file_path: Path | None = None, url: str | None = None
) -> tuple[str, str]:
    """Returns (title, extracted_text)."""
    if doc_type == "url":
        assert url is not None
        return await extract_text_from_url(url)
    extractor = _FILE_EXTRACTORS.get(doc_type)
    if extractor is None:
        raise ValueError(f"Type de document non supporté: {doc_type}")
    assert file_path is not None
    return file_path.name, await extractor(file_path)


def guess_doc_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in _EXTENSION_TYPES:
        raise ValueError(f"Extension de fichier non supportée: {ext}")
    return _EXTENSION_TYPES[ext]


_IMAGE_SIGNATURES = (
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"\xff\xd8\xff",  # JPEG
    b"GIF87a",
    b"GIF89a",
    b"BM",  # BMP
)

_MP3_FRAME_SYNCS = (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2", b"\xff\xe3")


def _is_webp(content: bytes) -> bool:
    return content.startswith(b"RIFF") and content[8:12] == b"WEBP"


def _is_wav(content: bytes) -> bool:
    return content.startswith(b"RIFF") and content[8:12] == b"WAVE"


def content_matches_type(doc_type: str, content: bytes) -> bool:
    """Sniffs the actual file bytes instead of trusting the extension
    alone - a renamed executable or script uploaded as "report.pdf"
    should be rejected before it ever reaches disk or gets processed."""
    if doc_type == "pdf":
        return content.startswith(b"%PDF-")
    if doc_type == "docx":
        return content.startswith(b"PK\x03\x04")  # docx is a zip archive
    if doc_type == "image":
        return content.startswith(_IMAGE_SIGNATURES) or _is_webp(content)
    if doc_type == "audio":
        return (
            content.startswith(b"ID3")
            or content.startswith(_MP3_FRAME_SYNCS)
            or _is_wav(content)
            or content.startswith(b"OggS")
            or content.startswith(b"fLaC")
            or content[4:8] == b"ftyp"  # M4A / MP4 container
            or content.startswith(b"\x1a\x45\xdf\xa3")  # WebM (EBML header)
        )
    if doc_type in ("txt", "md"):
        sample = content[:8192]
        if b"\x00" in sample:
            return False
        for encoding in ("utf-8", "latin-1"):
            try:
                sample.decode(encoding)
                return True
            except UnicodeDecodeError:
                continue
        return False
    return True


# --- Chunking -------------------------------------------------------------------


def split_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> list[str]:
    """Split text into overlapping chunks, trying to break on paragraph /
    sentence boundaries so chunks stay semantically coherent."""
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}" if current else para
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(para) <= chunk_size:
            current = para
            continue

        sentences = re.split(r"(?<=[.!?])\s+", para)
        buf = ""
        for sent in sentences:
            if len(buf) + len(sent) + 1 <= chunk_size:
                buf = f"{buf} {sent}" if buf else sent
            else:
                if buf:
                    chunks.append(buf)
                if len(sent) > chunk_size:
                    for i in range(0, len(sent), chunk_size - overlap):
                        chunks.append(sent[i : i + chunk_size])
                    buf = ""
                else:
                    buf = sent
        if buf:
            current = buf

    if current:
        chunks.append(current)

    if overlap > 0 and len(chunks) > 1:
        overlapped = [chunks[0]]
        for i in range(1, len(chunks)):
            tail = overlapped[-1][-overlap:]
            overlapped.append(f"{tail} {chunks[i]}")
        return overlapped

    return chunks
