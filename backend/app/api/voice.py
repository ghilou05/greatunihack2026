"""P3: Optional ElevenLabs proxy only — lesson runtime stays in the browser."""


from fastapi import APIRouter

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/status")
def voice_status() -> dict[str, str]:
    return {
        "status": "stub",
        "owner": "P3",
        "hint": "Wire ElevenLabs TTS/STT here or from the frontend",
    }
