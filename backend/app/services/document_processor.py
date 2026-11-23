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
import unicodedata
from collections.abc import Awaitable, Callable
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

# on_progress(done, total) - awaited after each unit of work (PDF page...).
ProgressCallback = Callable[[int, int], Awaitable[None]]


def _b64_from_bytes(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def count_scanned_pages(doc_type: str, path: Path | None) -> int:
    """Nombre de pages que l'IA devra lire (OCR/vision) pour ce document :
    pages de PDF sans couche texte, ou 1 pour une image. Lecture locale,
    rapide et gratuite - sert à vérifier le quota avant tout appel payant."""
    if path is None:
        return 0
    if doc_type == "image":
        return 1
    if doc_type != "pdf":
        return 0
    doc = fitz.open(path)
    try:
        return sum(1 for page in doc if len(page.get_text().strip()) < _MIN_TEXT_CHARS_PER_PAGE)
    finally:
        doc.close()


async def _read_scanned_image(image_b64: str, mime_type: str, vision_prompt: str) -> str:
    """SCAN_ENGINE=vision (défaut) : le modèle de lecture léger
    (MISTRAL_SCAN_MODEL) transcrit la page, avec repli sur le modèle de
    vision principal s'il échoue ou ne renvoie rien.
    SCAN_ENGINE=ocr : API OCR dédiée, avec repli sur la vision si elle ne
    trouve quasiment pas de texte (photo, schéma)."""
    if settings.scan_engine == "ocr":
        try:
            text = await llm_provider.ocr_image(image_b64, mime_type=mime_type)
        except Exception:  # noqa: BLE001
            logger.warning("OCR Mistral en échec, repli sur le modèle de vision", exc_info=True)
            text = ""
        if len(text.strip()) >= _MIN_TEXT_CHARS_PER_PAGE:
            return text.strip()
    elif settings.mistral_scan_model and settings.mistral_scan_model != settings.mistral_vision_model:
        try:
            text = await llm_provider.describe_image(
                image_b64, vision_prompt, model=settings.mistral_scan_model, mime_type=mime_type
            )
        except Exception:  # noqa: BLE001
            logger.warning("Lecture par %s en échec, repli sur %s", settings.mistral_scan_model,
                           settings.mistral_vision_model, exc_info=True)
            text = ""
        if text.strip():
            return text.strip()
    return (await llm_provider.describe_image(image_b64, vision_prompt, mime_type=mime_type)).strip()


def _read_pdf_page(doc, page_index: int) -> tuple[str, bytes | None]:
    """(text layer, PNG render when the page has no usable text)."""
    page = doc[page_index]
    text = page.get_text().strip()
    if len(text) >= _MIN_TEXT_CHARS_PER_PAGE:
        return text, None
    return text, page.get_pixmap(dpi=200).tobytes("png")


async def extract_text_from_pdf(path: Path, on_progress: ProgressCallback | None = None) -> str:
    # PyMuPDF is synchronous: each page is read in a worker thread so a
    # 300-page thesis doesn't freeze the event loop.
    doc = await asyncio.to_thread(fitz.open, path)
    parts: list[str] = []
    try:
        total = len(doc)
        for page_index in range(total):
            text, img_bytes = await asyncio.to_thread(_read_pdf_page, doc, page_index)
            if img_bytes is not None:
                text = await _read_scanned_image(
                    _b64_from_bytes(img_bytes), "image/png", _SCANNED_PAGE_PROMPT
                )
            parts.append(f"[Page {page_index + 1}]\n{text}")
            if on_progress is not None:
                await on_progress(page_index + 1, total)
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
    return await _read_scanned_image(_b64_from_bytes(data), mime_type, _IMAGE_PROMPT)


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


# Synchronous parsers run in a worker thread so a big file never freezes
# the event loop - and with it every other request of the app.
async def _extract_text_file(path: Path) -> str:
    return await asyncio.to_thread(extract_text_from_txt, path)


async def _extract_docx(path: Path) -> str:
    return await asyncio.to_thread(extract_text_from_docx, path)


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
    doc_type: str,
    file_path: Path | None = None,
    url: str | None = None,
    on_progress: ProgressCallback | None = None,
) -> tuple[str, str]:
    """Returns (title, extracted_text). `on_progress` is only called for
    PDFs (page by page); other types are read in one go."""
    if doc_type == "url":
        assert url is not None
        return await extract_text_from_url(url)
    extractor = _FILE_EXTRACTORS.get(doc_type)
    if extractor is None:
        raise ValueError(f"Type de document non supporté: {doc_type}")
    assert file_path is not None
    if doc_type == "pdf":
        return file_path.name, await extract_text_from_pdf(file_path, on_progress)
    return file_path.name, await extractor(file_path)


_MAX_DOCUMENT_NAME = 200


def clean_document_name(name: str | None) -> str:
    """Display name of a document, safe to show and to put in the AI
    prompt (the space inventory lists every name): control characters and
    line breaks are removed so a name can't fake extra prompt lines,
    whitespace is collapsed and the length capped. Returns "" when nothing
    usable is left - the caller decides the fallback."""
    if not name:
        return ""
    kept = "".join(" " if unicodedata.category(ch).startswith("C") else ch for ch in name)
    return " ".join(kept.split())[:_MAX_DOCUMENT_NAME].strip()


# MIME types the viewer may hand to the browser, keyed by the stored file's
# extension. Text formats are always served as plain text and HTML/SVG
# never appear here, so an uploaded file can't run script in the browser.
# Anything else (docx...) is offered as a download instead of displayed.
_VIEWABLE_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".csv": "text/plain; charset=utf-8",
    ".json": "text/plain; charset=utf-8",
    ".log": "text/plain; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
}

_DOWNLOAD_MIME_TYPES = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def viewer_media_type(filename: str) -> tuple[str, bool]:
    """(media type, shown inline?) for serving a stored upload."""
    ext = Path(filename).suffix.lower()
    if ext in _VIEWABLE_MIME_TYPES:
        return _VIEWABLE_MIME_TYPES[ext], True
    return _DOWNLOAD_MIME_TYPES.get(ext, "application/octet-stream"), False


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
