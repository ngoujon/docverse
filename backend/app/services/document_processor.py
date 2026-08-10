import asyncio
import base64
import ipaddress
import socket
from pathlib import Path
from urllib.parse import urlparse

import fitz  # PyMuPDF
import httpx
import trafilatura
from docx import Document as DocxDocument

from . import ollama_client

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}

_IMAGE_PROMPT = (
    "Tu analyses un document image. Transcris integralement tout le texte "
    "visible (OCR precis, conserve la mise en forme en liste/tableau si "
    "pertinent). Ensuite decris brievement les elements visuels importants "
    "(graphiques, schemas, photos, logos). Reponds uniquement avec le "
    "contenu extrait, sans commentaire meta."
)

_SCANNED_PAGE_PROMPT = (
    "Voici une page de document scannee. Transcris integralement tout le "
    "texte visible (OCR precis). Si la page contient des tableaux, "
    "restitue-les en texte structure. Reponds uniquement avec le texte "
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
                described = await ollama_client.describe_image(
                    _b64_from_bytes(img_bytes), _SCANNED_PAGE_PROMPT
                )
                text = described.strip()
            parts.append(f"[Page {page_index + 1}]\n{text}")
    finally:
        doc.close()
    return "\n\n".join(parts)


async def extract_text_from_image(path: Path) -> str:
    data = path.read_bytes()
    return await ollama_client.describe_image(_b64_from_bytes(data), _IMAGE_PROMPT)


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
    pointing at http://169.254.169.254/, http://ollama:11434, localhost...).
    Resolves the hostname ourselves rather than trusting the string, since
    that's also what actually gets connected to."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Seuls les liens http(s) sont autorises")
    if not parsed.hostname:
        raise UnsafeUrlError("URL invalide")

    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        raise UnsafeUrlError("Impossible de resoudre ce nom de domaine")

    if not infos or not all(_is_public_ip(info[4][0]) for info in infos):
        raise UnsafeUrlError("Cette adresse n'est pas autorisee")


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


async def process_document(
    doc_type: str, file_path: Path | None = None, url: str | None = None
) -> tuple[str, str]:
    """Returns (title, extracted_text)."""
    if doc_type == "pdf":
        assert file_path is not None
        return file_path.name, await extract_text_from_pdf(file_path)
    if doc_type == "image":
        assert file_path is not None
        return file_path.name, await extract_text_from_image(file_path)
    if doc_type == "docx":
        assert file_path is not None
        return file_path.name, extract_text_from_docx(file_path)
    if doc_type in ("txt", "md"):
        assert file_path is not None
        return file_path.name, extract_text_from_txt(file_path)
    if doc_type == "url":
        assert url is not None
        return await extract_text_from_url(url)
    raise ValueError(f"Type de document non supporte: {doc_type}")


def guess_doc_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return "pdf"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext == ".docx":
        return "docx"
    if ext == ".md":
        return "md"
    if ext in (".txt", ".csv", ".json", ".log"):
        return "txt"
    raise ValueError(f"Extension de fichier non supportee: {ext}")


_IMAGE_SIGNATURES = (
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"\xff\xd8\xff",  # JPEG
    b"GIF87a",
    b"GIF89a",
    b"BM",  # BMP
    b"RIFF",  # WEBP (RIFF....WEBP - checking the RIFF prefix is enough here)
)


def content_matches_type(doc_type: str, content: bytes) -> bool:
    """Sniffs the actual file bytes instead of trusting the extension
    alone - a renamed executable or script uploaded as "report.pdf"
    should be rejected before it ever reaches disk or gets processed."""
    if doc_type == "pdf":
        return content.startswith(b"%PDF-")
    if doc_type == "docx":
        return content.startswith(b"PK\x03\x04")  # docx is a zip archive
    if doc_type == "image":
        return content.startswith(_IMAGE_SIGNATURES)
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
