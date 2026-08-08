import shutil

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..config import UPLOAD_DIR
from ..database import get_db
from ..services import vectorstore

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


def _to_out(space: models_db.Space) -> schemas.SpaceOut:
    return schemas.SpaceOut(
        id=space.id,
        name=space.name,
        description=space.description or "",
        color=space.color or "#6366f1",
        created_at=space.created_at,
        document_count=len(space.documents),
        conversation_count=len(space.conversations),
    )


@router.get("", response_model=list[schemas.SpaceOut])
def list_spaces(db: Session = Depends(get_db)):
    spaces = db.query(models_db.Space).order_by(models_db.Space.created_at.desc()).all()
    return [_to_out(s) for s in spaces]


@router.post("", response_model=schemas.SpaceOut)
def create_space(payload: schemas.SpaceCreate, db: Session = Depends(get_db)):
    space = models_db.Space(
        name=payload.name.strip() or "Espace sans nom",
        description=payload.description,
        color=payload.color,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return _to_out(space)


@router.get("/{space_id}", response_model=schemas.SpaceOut)
def get_space(space_id: str, db: Session = Depends(get_db)):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    return _to_out(space)


@router.patch("/{space_id}", response_model=schemas.SpaceOut)
def update_space(space_id: str, payload: schemas.SpaceUpdate, db: Session = Depends(get_db)):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    if payload.name is not None:
        space.name = payload.name
    if payload.description is not None:
        space.description = payload.description
    if payload.color is not None:
        space.color = payload.color
    db.commit()
    db.refresh(space)
    return _to_out(space)


@router.delete("/{space_id}")
def delete_space(space_id: str, db: Session = Depends(get_db)):
    space = db.get(models_db.Space, space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")

    db.delete(space)
    db.commit()

    vectorstore.delete_space(space_id)
    space_upload_dir = UPLOAD_DIR / space_id
    if space_upload_dir.exists():
        shutil.rmtree(space_upload_dir, ignore_errors=True)

    return {"ok": True}
