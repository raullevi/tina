from datetime import date, timedelta
import pytest
import httpx

from app.main import app
from app.db.session import SessionLocal
from app.db.models import Activity, Measurement, DailyLog
from app.services.analytics import AnalyticsEngine


def test_weight_analytics_calculation():
    """Verify deterministic statistical calculations with pandas."""
    db = SessionLocal()
    try:
        today = date.today()
        # Clean existing test measurements
        db.query(Measurement).filter(Measurement.metric == "weight").delete()
        
        # Insert 3 weight points: 76.0 -> 75.5 -> 74.8
        db.add(Measurement(metric="weight", value=76.0, unit="kg", measurement_date=today - timedelta(days=6)))
        db.add(Measurement(metric="weight", value=75.5, unit="kg", measurement_date=today - timedelta(days=3)))
        db.add(Measurement(metric="weight", value=74.8, unit="kg", measurement_date=today))
        db.commit()

        stats = AnalyticsEngine.get_weight_analytics(db, days=7)
        assert stats["count"] == 3
        assert stats["start_weight"] == 76.0
        assert stats["current_weight"] == 74.8
        assert stats["min_weight"] == 74.8
        assert stats["max_weight"] == 76.0
        assert stats["weight_delta"] == -1.2  # 74.8 - 76.0
        assert len(stats["time_series"]) == 3
    finally:
        db.close()


def test_gym_analytics_calculation():
    """Verify gym duration totals and averages using pandas."""
    db = SessionLocal()
    try:
        today = date.today()
        db.query(Activity).filter(Activity.category == "gym").delete()

        db.add(Activity(category="gym", name="Bench Press", duration_minutes=45.0, activity_date=today - timedelta(days=2)))
        db.add(Activity(category="gym", name="Deadlifts", duration_minutes=60.0, activity_date=today - timedelta(days=1)))
        db.add(Activity(category="gym", name="Squats", duration_minutes=45.0, activity_date=today))
        db.commit()

        stats = AnalyticsEngine.get_gym_analytics(db, days=7)
        assert stats["total_sessions"] == 3
        assert stats["total_minutes"] == 150.0  # 45 + 60 + 45
        assert stats["avg_session_minutes"] == 50.0  # 150 / 3
        assert stats["exercise_counts"]["Bench Press"] == 1
    finally:
        db.close()


@pytest.mark.asyncio
async def test_manual_trackers_and_weekly_report_matching_db():
    """
    Phase 4 Completion Test (Section 6 of Blueprint):
    'Report values match the database.'
    Validates that:
    1. Direct logging works via /api/trackers/weight and /api/trackers/gym
    2. Weekly report calculates statistics deterministically that strictly match the database.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        today = date.today()

        # Clean prior records for exact math validation
        db = SessionLocal()
        try:
            db.query(Measurement).filter(Measurement.metric == "weight").delete()
            db.query(Activity).filter(Activity.category == "gym").delete()
            db.commit()
        finally:
            db.close()

        # 1. Log two weights via API
        w1_res = await client.post(
            "/api/trackers/weight",
            json={"value": 80.0, "unit": "kg", "date": (today - timedelta(days=5)).isoformat()},
        )
        assert w1_res.status_code == 200

        w2_res = await client.post(
            "/api/trackers/weight",
            json={"value": 78.5, "unit": "kg", "date": today.isoformat()},
        )
        assert w2_res.status_code == 200

        # 2. Log two gym workouts via API
        g1_res = await client.post(
            "/api/trackers/gym",
            json={"name": "Pull-ups & Core", "duration_minutes": 35.0, "category": "gym", "date": (today - timedelta(days=3)).isoformat()},
        )
        assert g1_res.status_code == 200

        g2_res = await client.post(
            "/api/trackers/gym",
            json={"name": "Leg Day", "duration_minutes": 55.0, "category": "gym", "date": today.isoformat()},
        )
        assert g2_res.status_code == 200

        # 3. Call weekly report
        report_res = await client.get("/api/analytics/weekly-report")
        assert report_res.status_code == 200
        report = report_res.json()

        weight_analysis = report["weight_analysis"]
        fitness_analysis = report["fitness_analysis"]

        # 4. Strict assertions: Report values MUST match database
        assert weight_analysis["start_weight"] == 80.0
        assert weight_analysis["current_weight"] == 78.5
        assert weight_analysis["weight_delta"] == -1.5
        assert weight_analysis["count"] == 2

        assert fitness_analysis["total_sessions"] == 2
        assert fitness_analysis["total_minutes"] == 90.0  # 35 + 55
        assert fitness_analysis["avg_session_minutes"] == 45.0  # 90 / 2

        # 5. Verify grounded summary contains accurate numbers
        assert "90.0 minutes" in report["grounded_summary"]
        assert "-1.5 kg" in report["grounded_summary"]
