"""Homepage testimonials: public list of published ones, admin CRUD."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/api", tags=["testimonials"])


def _ordered(db: Session):
    return db.query(models.Testimonial).order_by(models.Testimonial.display_order, models.Testimonial.created_at)


def _get_or_404(db: Session, testimonial_id: str) -> models.Testimonial:
    testimonial = db.get(models.Testimonial, testimonial_id)
    if not testimonial:
        raise HTTPException(404, "Avis introuvable")
    return testimonial


@router.get("/testimonials", response_model=list[schemas.TestimonialOut])
def list_public_testimonials(db: Session = Depends(get_db)):
    return _ordered(db).filter(models.Testimonial.published.is_(True)).all()


@router.get("/admin/testimonials", response_model=list[schemas.TestimonialOut])
def admin_list_testimonials(
    _: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    return _ordered(db).all()


@router.post("/admin/testimonials", response_model=schemas.TestimonialOut)
def admin_create_testimonial(
    payload: schemas.TestimonialCreate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    testimonial = models.Testimonial(**payload.model_dump())
    db.add(testimonial)
    db.commit()
    db.refresh(testimonial)
    return testimonial


@router.patch("/admin/testimonials/{testimonial_id}", response_model=schemas.TestimonialOut)
def admin_update_testimonial(
    testimonial_id: str,
    payload: schemas.TestimonialUpdate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    testimonial = _get_or_404(db, testimonial_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(testimonial, field, value)
    db.commit()
    db.refresh(testimonial)
    return testimonial


@router.delete("/admin/testimonials/{testimonial_id}")
def admin_delete_testimonial(
    testimonial_id: str,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    testimonial = _get_or_404(db, testimonial_id)
    db.delete(testimonial)
    db.commit()
    return {"ok": True}
