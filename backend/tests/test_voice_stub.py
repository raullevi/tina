import pytest
import httpx
from app.main import app
from app.db.session import SessionLocal
from app.db.models import VoiceSession, Transcript


@pytest.mark.asyncio
async def test_voice_stub_endpoint_flow():
    """
    Task 04 Acceptance Test:
    Send text to /api/voice and verify response JSON contains reply and session_id,
    and that transcript is stored in SQLite.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"text": "I washed clothes and folded laundry today."}
        response = await client.post("/api/voice", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert "reply" in data
        assert "session_id" in data
        assert len(data["reply"]) > 0

        # Verify database record
        db = SessionLocal()
        try:
            transcript = (
                db.query(Transcript)
                .filter(Transcript.session_id == data["session_id"])
                .first()
            )
            assert transcript is not None
            assert transcript.original_text == payload["text"]
        finally:
            db.close()
