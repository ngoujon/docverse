import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import DB_PATH

logger = logging.getLogger("open-rag.database")

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    """Lightweight auto-migration: after create_all() has created any
    brand-new tables, add any columns that exist on the models but not yet
    in the (already-existing, pre-upgrade) database file. There's no
    Alembic here on purpose - this is a small self-hosted app with a single
    SQLite file, and this covers the only schema change shape it needs
    (new nullable/defaulted columns)."""
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in inspector.get_table_names():
                continue
            existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                logger.warning(
                    "Migration : ajout de la colonne %s.%s (%s)",
                    table.name,
                    column.name,
                    col_type,
                )
                conn.execute(
                    text(f"ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}")
                )
