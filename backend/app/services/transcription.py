import asyncio
import logging
from functools import lru_cache
from pathlib import Path

from faster_whisper import WhisperModel

from ..config import WHISPER_MODEL_DIR, settings
from . import queue_manager

logger = logging.getLogger("hyaides.transcription")


@lru_cache(maxsize=1)
def _model() -> WhisperModel:
    """Loaded lazily on first transcription (not at import time) so the
    model download/load doesn't block API startup, and cached process-wide
    since it holds the weights in memory."""
    logger.info("Chargement du modele Whisper '%s'...", settings.whisper_model_size)
    return WhisperModel(
        settings.whisper_model_size,
        device="cpu",
        compute_type=settings.whisper_compute_type,
        download_root=str(WHISPER_MODEL_DIR),
    )


def _transcribe_sync(path: Path) -> str:
    segments, _info = _model().transcribe(str(path), beam_size=5, vad_filter=True)
    return " ".join(segment.text.strip() for segment in segments).strip()


async def transcribe_audio(path: Path) -> str:
    """Runs on a thread since faster-whisper's transcribe() is blocking
    CPU work - keeps the event loop free for other requests. Always goes
    through the local queue slot (like embeddings): transcription is
    self-hosted only, with no cloud fallback, so it competes for the same
    CPU as the rest of the app and must be serialized against it."""
    async with queue_manager.queue_slot():
        return await asyncio.to_thread(_transcribe_sync, path)
