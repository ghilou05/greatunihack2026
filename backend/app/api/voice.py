"""P3: ElevenLabs helpers and lesson runtime (stubs)."""

from fastapi import APIRouter

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/status")
def voice_status() -> dict[str, str]:
    return {
        "status": "stub",
        "owner": "P3",
        "hint": "Wire ElevenLabs TTS/STT here or from the frontend",
    }
