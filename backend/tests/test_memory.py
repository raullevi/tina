from datetime import date
import pytest
import httpx

from app.main import app
from app.db.session import engine, SessionLocal
from app.db.models import VoiceSession, Transcript, DailyLog, Activity, Measurement, PersonalFact
from app.services.extractor import ExtractionResult, ExtractedActivity, ExtractedMeasurement, ExtractedFact


def test_extraction_schema_validation():
    """Verify deterministic Python validation for structured memory entities."""
    raw_data = {
        "daily_summary": "Morning gym and hydration tracking.",
        "activities": [
            {"category": "gym", "name": "Bench Press", "duration_minutes": 45.0, "notes": "Heavy set"}
        ],
        "measurements": [
            {"metric": "weight", "value": 74.5, "unit": "kg", "review_status": "confirmed"}
        ],
        "facts": [
            {"category": "goal", "key": "Target Weight", "value": "72 kg"}
        ],
    }
    result = ExtractionResult(**raw_data)
    assert result.daily_summary == "Morning gym and hydration tracking."
    assert len(result.activities) == 1
    assert result.activities[0].name == "Bench Press"
    assert result.measurements[0].value == 74.5
    assert result.facts[0].key == "Target Weight"


@pytest.mark.asyncio
async def test_memory_extraction_and_endpoints_flow():
    """Test memory extraction, search, measurement confirmation, and JSON export."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a test session and transcript
        db = SessionLocal()
        try:
            vs = VoiceSession(status="transcribed")
            db.add(vs)
            db.flush()
            tr = Transcript(
                session_id=vs.id,
                original_text="Ran 5 kilometers in 25 minutes. Weight this morning was 75.2 kg. Aiming to run 10k by December.",
            )
            db.add(tr)
            db.commit()
            session_id = vs.id
        finally:
            db.close()

        # 1. Trigger extraction
        extract_res = await client.post(f"/api/memory/extract/{session_id}")
        assert extract_res.status_code == 200
        data = extract_res.json()
        assert data["session_id"] == session_id

        # 2. Check Daily Logs
        logs_res = await client.get("/api/memory/daily-logs")
        assert logs_res.status_code == 200
        assert isinstance(logs_res.json(), list)

        # 3. Check Activities
        act_res = await client.get("/api/memory/activities")
        assert act_res.status_code == 200
        assert isinstance(act_res.json(), list)

        # 4. Check Measurements & Confirm
        meas_res = await client.get("/api/memory/measurements")
        assert meas_res.status_code == 200
        meas_list = meas_res.json()
        if len(meas_list) > 0:
            target_id = meas_list[0]["id"]
            confirm_res = await client.put(
                f"/api/memory/measurements/{target_id}/confirm",
                json={"value": 75.0, "review_status": "confirmed", "notes": "Scale calibrated"},
            )
            assert confirm_res.status_code == 200
            assert confirm_res.json()["value"] == 75.0
            assert confirm_res.json()["review_status"] == "confirmed"

        # 5. Search Memory
        search_res = await client.get("/api/memory/search?q=December")
        assert search_res.status_code == 200
        search_data = search_res.json()
        assert "results" in search_data

        # 6. Export Memory
        export_res = await client.get("/api/memory/export")
        assert export_res.status_code == 200
        export_data = export_res.json()
        assert "transcripts" in export_data
        assert "measurements" in export_data


def test_phase3_completion_restart_test():
    """
    Phase 3 Completion Test (Section 6 of Blueprint):
    'Restart the app and retrieve an old entry.'
    Simulates a complete application restart:
    1. Writes an entry to SQLite
    2. Completely shuts down / disposes the database engine
    3. Reconnects and verifies that the exact record persists and is retrievable.
    """
    db1 = SessionLocal()
    try:
        test_session = VoiceSession(status="completed")
        db1.add(test_session)
        db1.flush()

        test_transcript = Transcript(
            session_id=test_session.id,
            original_text="Read 2 chapters of Atomic Habits.",
        )
        db1.add(test_transcript)
        db1.flush()

        test_activity = Activity(
            category="study",
            name="Read Atomic Habits",
            duration_minutes=30.0,
            activity_date=date.today(),
            notes="Chapters 1 and 2",
            source_transcript_id=test_transcript.id,
        )
        db1.add(test_activity)
        db1.commit()
        saved_id = test_activity.id
        saved_name = test_activity.name
    finally:
        db1.close()

    # SIMULATE APP RESTART: Dispose database engine connection pool
    engine.dispose()

    # RE-OPEN AFTER RESTART: Reconnect to SQLite file
    db2 = SessionLocal()
    try:
        retrieved_activity = db2.query(Activity).filter(Activity.id == saved_id).first()
        assert retrieved_activity is not None, "Failed to retrieve old entry after simulated restart!"
        assert retrieved_activity.name == saved_name
        assert retrieved_activity.category == "study"
        assert retrieved_activity.duration_minutes == 30.0
        assert retrieved_activity.source_transcript is not None
        assert retrieved_activity.source_transcript.original_text == "Read 2 chapters of Atomic Habits."
    finally:
        db2.close()
