from datetime import date, timedelta
from typing import Any, Dict, List, Optional
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import Activity, DailyLog, Measurement


class AnalyticsEngine:
    """Deterministic analytics engine using Python and pandas."""

    @staticmethod
    def get_weight_analytics(db: Session, days: int = 30) -> Dict[str, Any]:
        """Calculate deterministic weight trends over the given number of days."""
        cutoff_date = date.today() - timedelta(days=days)
        records = (
            db.query(Measurement)
            .filter(
                Measurement.metric == "weight",
                Measurement.measurement_date >= cutoff_date,
            )
            .order_by(Measurement.measurement_date.asc(), Measurement.id.asc())
            .all()
        )

        if not records:
            return {
                "count": 0,
                "current_weight": None,
                "start_weight": None,
                "weight_delta": 0.0,
                "min_weight": None,
                "max_weight": None,
                "average_weight": None,
                "unit": "kg",
                "time_series": [],
            }

        data = [
            {
                "date": r.measurement_date.isoformat(),
                "value": round(float(r.value), 2),
                "unit": r.unit,
                "status": r.review_status,
            }
            for r in records
        ]

        df = pd.DataFrame(data)
        # Handle duplicates on the same date by taking the latest/mean
        grouped = df.groupby("date")["value"].mean().reset_index()
        grouped["rolling_avg_7d"] = grouped["value"].rolling(window=7, min_periods=1).mean().round(2)

        start_val = float(grouped["value"].iloc[0])
        current_val = float(grouped["value"].iloc[-1])
        min_val = float(grouped["value"].min())
        max_val = float(grouped["value"].max())
        avg_val = float(grouped["value"].mean())
        delta = round(current_val - start_val, 2)

        time_series = [
            {
                "date": row["date"],
                "value": round(row["value"], 2),
                "rolling_avg": round(row["rolling_avg_7d"], 2),
            }
            for _, row in grouped.iterrows()
        ]

        return {
            "count": len(records),
            "current_weight": round(current_val, 2),
            "start_weight": round(start_val, 2),
            "weight_delta": delta,
            "min_weight": round(min_val, 2),
            "max_weight": round(max_val, 2),
            "average_weight": round(avg_val, 2),
            "unit": records[-1].unit,
            "time_series": time_series,
        }

    @staticmethod
    def get_gym_analytics(db: Session, days: int = 30) -> Dict[str, Any]:
        """Calculate gym and fitness analytics over the given number of days."""
        cutoff_date = date.today() - timedelta(days=days)
        records = (
            db.query(Activity)
            .filter(
                Activity.category.in_(["gym", "fitness", "workout"]),
                Activity.activity_date >= cutoff_date,
            )
            .order_by(Activity.activity_date.asc())
            .all()
        )

        if not records:
            return {
                "total_sessions": 0,
                "total_minutes": 0.0,
                "avg_session_minutes": 0.0,
                "sessions_per_week": 0.0,
                "daily_breakdown": [],
                "exercise_counts": {},
            }

        data = [
            {
                "date": r.activity_date.isoformat(),
                "name": r.name,
                "duration": float(r.duration_minutes or 0.0),
            }
            for r in records
        ]

        df = pd.DataFrame(data)
        total_sessions = len(df)
        total_minutes = float(df["duration"].sum())
        avg_minutes = float(df["duration"].mean()) if total_sessions > 0 else 0.0
        weeks = max(1.0, days / 7.0)
        sessions_per_week = round(total_sessions / weeks, 2)

        # Aggregate by date
        daily = df.groupby("date")["duration"].sum().reset_index()
        daily_breakdown = [
            {"date": row["date"], "duration_minutes": round(row["duration"], 1)}
            for _, row in daily.iterrows()
        ]

        # Top exercises
        counts = df["name"].value_counts().to_dict()

        return {
            "total_sessions": total_sessions,
            "total_minutes": round(total_minutes, 1),
            "avg_session_minutes": round(avg_minutes, 1),
            "sessions_per_week": sessions_per_week,
            "daily_breakdown": daily_breakdown,
            "exercise_counts": counts,
        }

    @classmethod
    def generate_weekly_report(cls, db: Session, target_date: Optional[date] = None) -> Dict[str, Any]:
        """
        Generate a deterministic weekly progress report for the past 7 days.
        Blueprint requirement: 'Report values match the database; ground insights in stored data.'
        """
        ref_date = target_date or date.today()
        start_date = ref_date - timedelta(days=7)

        # 1. Deterministic weight stats
        weight_stats = cls.get_weight_analytics(db, days=7)

        # 2. Deterministic gym stats
        gym_stats = cls.get_gym_analytics(db, days=7)

        # 3. Daily logs in timeframe
        logs = (
            db.query(DailyLog)
            .filter(DailyLog.log_date >= start_date, DailyLog.log_date <= ref_date)
            .order_by(DailyLog.log_date.asc())
            .all()
        )
        log_summaries = [{"date": l.log_date.isoformat(), "summary": l.summary} for l in logs]

        # Build grounded summary text
        summary_sentences = []
        if gym_stats["total_sessions"] > 0:
            summary_sentences.append(
                f"Completed {gym_stats['total_sessions']} gym sessions totaling {gym_stats['total_minutes']} minutes."
            )
        else:
            summary_sentences.append("No gym sessions recorded in the past 7 days.")

        if weight_stats["count"] > 0:
            delta_str = f"+{weight_stats['weight_delta']}" if weight_stats['weight_delta'] > 0 else f"{weight_stats['weight_delta']}"
            summary_sentences.append(
                f"Weight moved by {delta_str} {weight_stats['unit']} (latest: {weight_stats['current_weight']} {weight_stats['unit']}, average: {weight_stats['average_weight']} {weight_stats['unit']})."
            )

        report_summary = " ".join(summary_sentences)

        return {
            "report_period": {
                "start_date": start_date.isoformat(),
                "end_date": ref_date.isoformat(),
            },
            "weight_analysis": weight_stats,
            "fitness_analysis": gym_stats,
            "daily_logs": log_summaries,
            "grounded_summary": report_summary,
        }
