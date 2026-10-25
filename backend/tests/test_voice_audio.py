import io
import math
import struct
import wave
import pytest
import httpx

from app.main import app
from app.db.session import SessionLocal
from app.db.models import VoiceSession, Transcript


def generate_test_wav_bytes(duration_seconds: float = 1.0, sample_rate: int = 16000) -> bytes:
    """Generate valid 16kHz mono PCM WAV audio bytes for testing."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        num_samples = int(duration_seconds * sample_rate)
        # Generate low-amplitude 440Hz sine wave tone
        samples = []
        for i in range(num_samples):
            t = float(i) / sample_rate
            value = int(5000.0 * math.sin(2.0 * math.pi * 440.0 * t))
            samples.append(struct.pack("<h", value))
        wav_file.writeframes(b"".join(samples))
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_audio_upload_transcribe_and_replay_flow():
    """
    Phase 2 Completion Test:
    1. Uploads real audio WAV bytes to /api/voice/audio
    2. Runs local Faster-Whisper transcription and stores in SQLite
    3. Replays/streams the saved audio via /api/voice/sessions/{id}/audio
    4. Edits the transcript via PUT /api/voice/sessions/{id}/transcript and validates original is preserved
    5. Confirms session appears in /api/voice/sessions list
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        wav_bytes = generate_test_wav_bytes(duration_seconds=0.8)

        # 1. Upload audio
        files = {"file": ("test_recording.wav", wav_bytes, "audio/wav")}
        response = await client.post("/api/voice/audio", files=files)
        assert response.status_code == 200

        data = response.json()
        assert "session_id" in data
        assert "original_text" in data
        assert "audio_url" in data
        session_id = data["session_id"]
        assert session_id > 0

        # 2. Verify stored in SQLite
        db = SessionLocal()
        try:
            session_rec = db.query(VoiceSession).filter(VoiceSession.id == session_id).first()
            assert session_rec is not None
            assert session_rec.status == "transcribed"
            assert session_rec.file_path is not None

            transcript_rec = db.query(Transcript).filter(Transcript.session_id == session_id).first()
            assert transcript_rec is not None
            original_text = transcript_rec.original_text
        finally:
            db.close()

        # 3. Audio replay endpoint
        audio_res = await client.get(f"/api/voice/sessions/{session_id}/audio")
        assert audio_res.status_code == 200
        assert len(audio_res.content) > 0
        assert audio_res.headers.get("content-type") == "audio/wav"

        # 4. Edit transcript (Preserving original)
        edited_content = "Washed dishes and cleaned kitchen."
        edit_res = await client.put(
            f"/api/voice/sessions/{session_id}/transcript",
            json={"edited_text": edited_content},
        )
        assert edit_res.status_code == 200
        edit_data = edit_res.json()
        assert edit_data["edited_text"] == edited_content
        assert edit_data["original_text"] == original_text  # Original text is preserved

        # 5. List sessions
        list_res = await client.get("/api/voice/sessions")
        assert list_res.status_code == 200
        sessions_list = list_res.json()
        matching = [s for s in sessions_list if s["session_id"] == session_id]
        assert len(matching) == 1
        assert matching[0]["edited_text"] == edited_content
