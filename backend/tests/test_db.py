import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import ActivityEvent, LifeNode, Transcript, VoiceSession
from app.db.session import Base

TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture
def db_session():
    """Provides a fresh isolated in-memory SQLite database session for testing."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_voice_session_and_transcript_persistence(db_session):
    """Test creating, storing, and retrieving voice sessions and raw transcripts."""
    session_record = VoiceSession(status="completed", duration_seconds=4.5)
    db_session.add(session_record)
    db_session.commit()
    db_session.refresh(session_record)

    assert session_record.id is not None

    transcript_record = Transcript(
        session_id=session_record.id,
        original_text="Went for a 15-minute jog.",
    )
    db_session.add(transcript_record)
    db_session.commit()
    db_session.refresh(transcript_record)

    # Query back
    stored_transcript = (
        db_session.query(Transcript)
        .filter(Transcript.session_id == session_record.id)
        .first()
    )
    assert stored_transcript is not None
    assert stored_transcript.original_text == "Went for a 15-minute jog."
    assert stored_transcript.session.status == "completed"


def test_life_node_creation(db_session):
    """Test creating hierarchical Life Tree nodes."""
    parent_area = LifeNode(name="Health", type="area", description="All physical and mental health")
    db_session.add(parent_area)
    db_session.commit()
    db_session.refresh(parent_area)

    routine_node = LifeNode(
        name="Daily Walk",
        type="routine",
        parent_id=parent_area.id,
        description="30 min walk",
    )
    db_session.add(routine_node)
    db_session.commit()
    db_session.refresh(routine_node)

    assert routine_node.parent_id == parent_area.id
    assert len(parent_area.children) == 1
    assert parent_area.children[0].name == "Daily Walk"
