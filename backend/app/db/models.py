from datetime import datetime, date
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


class VoiceSession(Base):
    """Stores recorded voice sessions metadata."""
    __tablename__ = "voice_sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(50), default="recorded", nullable=False)  # recorded, transcribed, completed, failed
    duration_seconds = Column(Float, nullable=True)
    file_path = Column(String(500), nullable=True)

    transcripts = relationship("Transcript", back_populates="session", cascade="all, delete-orphan")


class Transcript(Base):
    """Preserves raw and edited transcripts linked to a voice session."""
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("voice_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    original_text = Column(Text, nullable=False)
    edited_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    session = relationship("VoiceSession", back_populates="transcripts")
    daily_logs = relationship("DailyLog", back_populates="source_transcript")
    activities = relationship("Activity", back_populates="source_transcript")
    measurements = relationship("Measurement", back_populates="source_transcript")
    personal_facts = relationship("PersonalFact", back_populates="source_transcript")


# ---------------------------------------------------------
# Phase 3: Persistent Memory & Life Trackers Schema
# ---------------------------------------------------------

class DailyLog(Base):
    """Daily summaries linked to source transcripts."""
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    log_date = Column(Date, default=date.today, nullable=False, index=True)
    summary = Column(Text, nullable=False)
    source_transcript_id = Column(Integer, ForeignKey("transcripts.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    source_transcript = relationship("Transcript", back_populates="daily_logs")


class Activity(Base):
    """Gym, study, work, and other activities linked to source transcripts."""
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String(50), default="general", nullable=False, index=True)  # gym, study, work, chore, general
    name = Column(String(255), nullable=False)
    duration_minutes = Column(Float, nullable=True)
    activity_date = Column(Date, default=date.today, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    source_transcript_id = Column(Integer, ForeignKey("transcripts.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    source_transcript = relationship("Transcript", back_populates="activities")


class Measurement(Base):
    """Numeric measurements (weight, sleep, water) with units and review status."""
    __tablename__ = "measurements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    metric = Column(String(100), nullable=False, index=True)  # weight, sleep_hours, water_liters, steps
    value = Column(Float, nullable=False)
    unit = Column(String(50), nullable=False)  # kg, lbs, hours, liters, count
    measurement_date = Column(Date, default=date.today, nullable=False, index=True)
    review_status = Column(String(50), default="confirmed", nullable=False)  # confirmed, uncertain
    notes = Column(Text, nullable=True)
    source_transcript_id = Column(Integer, ForeignKey("transcripts.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    source_transcript = relationship("Transcript", back_populates="measurements")


class PersonalFact(Base):
    """User facts, preferences, decisions, and goals linked to source transcripts."""
    __tablename__ = "personal_facts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String(50), default="fact", nullable=False, index=True)  # preference, decision, fact, goal
    key = Column(String(255), nullable=False, index=True)
    value = Column(Text, nullable=False)
    source_transcript_id = Column(Integer, ForeignKey("transcripts.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    source_transcript = relationship("Transcript", back_populates="personal_facts")


class AuditLog(Base):
    """Immutable audit trail of data modifications and deletions."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action = Column(String(50), nullable=False)  # created, updated, deleted, confirmed
    entity = Column(String(50), nullable=False)  # measurements, activities, daily_logs, facts
    entity_id = Column(Integer, nullable=True)
    description = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)


# ---------------------------------------------------------
# Hierarchical Life Tree Schema
# ---------------------------------------------------------

class LifeNode(Base):
    """Hierarchical Life Tree node (Area, Goal, Routine, Task)."""
    __tablename__ = "life_nodes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # area, goal, routine, task
    parent_id = Column(Integer, ForeignKey("life_nodes.id", ondelete="SET NULL"), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="active", nullable=False)
    importance = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    parent = relationship("LifeNode", remote_side=[id], backref="children")


class RoutineRule(Base):
    """Recurrence rules for scheduled routines."""
    __tablename__ = "routine_rules"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    node_id = Column(Integer, ForeignKey("life_nodes.id", ondelete="CASCADE"), nullable=False)
    schedule_type = Column(String(50), nullable=False)  # interval, weekly, event, deadline
    interval_days = Column(Integer, nullable=True)
    weekday = Column(Integer, nullable=True)
    time_of_day = Column(String(20), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    details = Column(Text, nullable=True)


class TaskOccurrence(Base):
    """Individual scheduled instances of a routine."""
    __tablename__ = "task_occurrences"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    routine_id = Column(Integer, ForeignKey("routine_rules.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    status = Column(String(50), default="pending", nullable=False)  # pending, completed, missed
    completed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)


class ActivityEvent(Base):
    """User-reported activity occurrences or voice-logged events."""
    __tablename__ = "activity_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    node_id = Column(Integer, ForeignKey("life_nodes.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(50), nullable=False)  # completed, added, skipped
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    details = Column(Text, nullable=True)
