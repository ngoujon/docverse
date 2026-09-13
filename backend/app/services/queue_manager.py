import asyncio

from ..config import settings

_semaphore = asyncio.Semaphore(settings.llm_max_concurrency)
_waiting = 0
_state_lock = asyncio.Lock()


class QueueSlot:
    """Borne les appels simultanes a l'API Mistral pour ne pas declencher
    ses 429. Reporte combien de requetes attendaient deja a l'arrivee de
    celle-ci, pour le retour visuel dans l'interface."""

    def __init__(self) -> None:
        self.position = 0

    async def __aenter__(self) -> "QueueSlot":
        global _waiting
        async with _state_lock:
            self.position = _waiting
            _waiting += 1
        await _semaphore.acquire()
        async with _state_lock:
            _waiting -= 1
        return self

    async def __aexit__(self, *exc) -> bool:
        _semaphore.release()
        return False


def queue_slot() -> QueueSlot:
    return QueueSlot()


def is_busy() -> bool:
    return _semaphore.locked()


async def waiting_count() -> int:
    async with _state_lock:
        return _waiting
