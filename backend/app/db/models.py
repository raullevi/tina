from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


class VoiceSession(Base):
    """Stores recorded voice sessions metadata."""
    __tablename__ = "voice_sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(50), default="completed", nullable=False)  # recorded, transcribed, completed, failed
    duration_seconds = Column(Float, nullable=True)

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
