import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import DB_PATH

logger = logging.getLogger("docverse.database")

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
                # ALTER TABLE ADD COLUMN leaves existing rows NULL - the
                # model's `default=` is only applied on INSERT by
                # SQLAlchemy, not retroactively. Backfill it here for any
                # column with a plain scalar default, so a NOT NULL /
                # boolean-checked column (e.g. users.is_active) doesn't
                # come back NULL for rows that predate the migration.
                if column.default is not None and not callable(column.default.arg):
                    default_value = column.default.arg
                    if isinstance(default_value, bool):
                        default_value = 1 if default_value else 0
                    conn.execute(
                        text(
                            f"UPDATE {table.name} SET {column.name} = :val "
                            f"WHERE {column.name} IS NULL"
                        ),
                        {"val": default_value},
                    )

        # Docverse went fully free: the paid plans, Stripe and the billing
        # profile are gone. Drop their columns rather than leave them
        # behind - plan was created NOT NULL, so an unmapped leftover would
        # make every INSERT into users fail. The invoices table itself is
        # deliberately kept (issued invoices must be retained 10 years).
        if "users" in inspector.get_table_names():
            user_columns = {c["name"] for c in inspector.get_columns("users")}
            for column_name in (
                "plan",
                "stripe_customer_id",
                "stripe_subscription_id",
                "billing_is_business",
                "billing_company_name",
                "billing_siret",
                "billing_vat_number",
                "billing_address_line1",
                "billing_address_line2",
                "billing_postal_code",
                "billing_city",
                "billing_country_code",
            ):
                if column_name in user_columns:
                    logger.warning("Migration : suppression de la colonne users.%s", column_name)
                    conn.execute(text(f"ALTER TABLE users DROP COLUMN {column_name}"))

        # One-off data migration: the old editor/viewer per-member role was
        # replaced by a single "member" role plus a separate can_upload
        # flag. Former editors keep write access (can_upload=true); former
        # viewers keep none. Idempotent - already-migrated rows have
        # role="member" and don't match the filter again.
        for table_name in ("space_members", "share_links"):
            if table_name not in inspector.get_table_names():
                continue
            conn.execute(
                text(f"UPDATE {table_name} SET can_upload = 1 WHERE role = 'editor'")
            )
            conn.execute(
                text(f"UPDATE {table_name} SET role = 'member' WHERE role IN ('editor', 'viewer')")
            )
