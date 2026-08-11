from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models_db, schemas
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/api", tags=["testimonials"])


@router.get("/testimonials", response_model=list[schemas.TestimonialOut])
def list_public_testimonials(db: Session = Depends(get_db)):
    return (
        db.query(models_db.Testimonial)
        .filter(models_db.Testimonial.published.is_(True))
        .order_by(models_db.Testimonial.display_order, models_db.Testimonial.created_at)
        .all()
    )


@router.get("/admin/testimonials", response_model=list[schemas.TestimonialOut])
def admin_list_testimonials(
    _: models_db.User = Depends(require_admin), db: Session = Depends(get_db)
):
    return (
        db.query(models_db.Testimonial)
        .order_by(models_db.Testimonial.display_order, models_db.Testimonial.created_at)
        .all()
    )


@router.post("/admin/testimonials", response_model=schemas.TestimonialOut)
def admin_create_testimonial(
    payload: schemas.TestimonialCreate,
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    testimonial = models_db.Testimonial(**payload.model_dump())
    db.add(testimonial)
    db.commit()
    db.refresh(testimonial)
    return testimonial


@router.patch("/admin/testimonials/{testimonial_id}", response_model=schemas.TestimonialOut)
def admin_update_testimonial(
    testimonial_id: str,
    payload: schemas.TestimonialUpdate,
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    testimonial = db.get(models_db.Testimonial, testimonial_id)
    if not testimonial:
        raise HTTPException(404, "Avis introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(testimonial, field, value)
    db.commit()
    db.refresh(testimonial)
    return testimonial


@router.delete("/admin/testimonials/{testimonial_id}")
def admin_delete_testimonial(
    testimonial_id: str,
    _: models_db.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    testimonial = db.get(models_db.Testimonial, testimonial_id)
    if not testimonial:
        raise HTTPException(404, "Avis introuvable")
    db.delete(testimonial)
    db.commit()
    return {"ok": True}
