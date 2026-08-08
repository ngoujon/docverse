import base64
from pathlib import Path

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


async def extract_text_from_url(url: str) -> tuple[str, str]:
    """Returns (title, text)."""
    async with httpx.AsyncClient(
        timeout=30.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}
    ) as client:
        r = await client.get(url)
        r.raise_for_status()
        html = r.text

    extracted = trafilatura.extract(
        html, include_comments=False, include_tables=True, favor_recall=True
    )
    metadata = trafilatura.extract_metadata(html)
    title = (metadata.title if metadata and metadata.title else url) or url
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
