from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key constraints and WAL journal mode on SQLite."""
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator:
    """FastAPI database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables and perform lightweight schema migrations if needed."""
    import app.db.models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Lightweight migrations for SQLite
    with engine.connect() as conn:
        for tbl, col, col_def in [
            ("voice_sessions", "file_path", "VARCHAR(500)"),
            ("routine_rules", "name", "VARCHAR(255) DEFAULT 'Routine'"),
            ("task_occurrences", "title", "VARCHAR(255) DEFAULT 'Task'"),
        ]:
            try:
                conn.execute(text(f"SELECT {col} FROM {tbl} LIMIT 1"))
            except Exception:
                try:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN {col} {col_def}"))
                    conn.commit()
                except Exception:
                    pass
