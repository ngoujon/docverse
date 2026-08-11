import shutil
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import config, models_db, schemas
from ..config import UPLOAD_DIR, settings
from ..database import get_db
from ..deps import SpaceAccess, get_current_user, require_space_access, require_space_owner
from ..services import backup, vector_graph, vectorstore

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


def _to_out(space: models_db.Space, role: str, can_upload: bool = False) -> schemas.SpaceOut:
    return schemas.SpaceOut(
        id=space.id,
        name=space.name,
        description=space.description or "",
        color=space.color or "#6366f1",
        owner_id=space.owner_id,
        my_role=role,
        can_upload=can_upload,
        created_at=space.created_at,
        document_count=len(space.documents),
        conversation_count=len(space.conversations),
    )


@router.get("", response_model=list[schemas.SpaceOut])
def list_my_spaces(
    user: models_db.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Spaces the current user owns or is a member of (the client
    dashboard's "my spaces" list). Admins do NOT see every space here -
    that's a deliberate privacy default; see /api/admin/spaces."""
    owned = db.query(models_db.Space).filter_by(owner_id=user.id).all()
    member_rows = db.query(models_db.SpaceMember).filter_by(user_id=user.id).all()
    member_upload = {m.space_id: m.can_upload for m in member_rows}
    members_spaces_objs = (
        db.query(models_db.Space).filter(models_db.Space.id.in_(member_upload.keys())).all()
        if member_upload
        else []
    )
    out = [_to_out(s, "owner", can_upload=True) for s in owned]
    out += [_to_out(s, "member", can_upload=member_upload[s.id]) for s in members_spaces_objs]
    out.sort(key=lambda s: s.created_at, reverse=True)
    return out


@router.post("", response_model=schemas.SpaceOut)
def create_space(
    payload: schemas.SpaceCreate,
    user: models_db.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_count = db.query(models_db.Space).filter_by(owner_id=user.id).count()
    plan_limit = config.plan_quota(user.plan, "spaces")
    effective_limit = min(plan_limit, settings.max_spaces_per_user) if plan_limit is not None else settings.max_spaces_per_user
    if owned_count >= effective_limit:
        raise HTTPException(
            400, f"Limite de {effective_limit} espaces atteinte pour votre palier ({user.plan})"
        )
    space = models_db.Space(
        name=payload.name.strip() or "Espace sans nom",
        description=payload.description,
        color=payload.color,
        owner_id=user.id,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return _to_out(space, "owner", can_upload=True)


@router.get("/by-share/{token}", response_model=schemas.SpaceOut)
def get_space_by_share_token(token: str, db: Session = Depends(get_db)):
    """Resolves a share link to its space - the frontend's /share/:token
    route only has the token, not the space id, so this is how it finds
    out which space to load before making any further scoped requests."""
    link = db.get(models_db.ShareLink, token)
    if (
        not link
        or link.revoked
        or (link.expires_at and link.expires_at <= datetime.utcnow())
    ):
        raise HTTPException(404, "Lien de partage introuvable ou expire")
    space = db.get(models_db.Space, link.space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    return _to_out(space, "member", can_upload=link.can_upload)


@router.get("/{space_id}", response_model=schemas.SpaceOut)
def get_space(access: SpaceAccess = Depends(require_space_access)):
    return _to_out(access.space, access.role, can_upload=access.can_upload)


@router.get("/{space_id}/vector-graph", response_model=schemas.VectorGraphOut)
def space_vector_graph(access: SpaceAccess = Depends(require_space_access)):
    return vector_graph.build_graph(access.space.id)


@router.get("/{space_id}/stats", response_model=schemas.SpaceStatsOut)
def space_stats(access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)):
    space = access.space
    message_count = (
        db.query(func.count(models_db.Message.id))
        .join(models_db.Conversation, models_db.Message.conversation_id == models_db.Conversation.id)
        .filter(models_db.Conversation.space_id == space.id)
        .scalar()
    )
    storage_bytes = (
        db.query(func.coalesce(func.sum(models_db.Document.size_bytes), 0))
        .filter(models_db.Document.space_id == space.id)
        .scalar()
    )
    last_conv = (
        db.query(models_db.Conversation)
        .filter(models_db.Conversation.space_id == space.id)
        .order_by(models_db.Conversation.updated_at.desc())
        .first()
    )
    owner = db.get(models_db.User, space.owner_id)
    plan = owner.plan if owner else config.DEFAULT_PLAN
    member_limit = config.plan_quota(plan, "members_per_space")
    return schemas.SpaceStatsOut(
        space_id=space.id,
        document_count=len(space.documents),
        conversation_count=len(space.conversations),
        message_count=message_count or 0,
        storage_bytes=storage_bytes or 0,
        storage_limit_bytes=config.plan_quota(plan, "storage_bytes"),
        member_count=len(space.members) + 1,  # +1 for the owner, matches add_member's headcount
        member_limit=member_limit,
        active_share_links=sum(1 for l in space.share_links if not l.revoked),
        last_activity_at=last_conv.updated_at if last_conv else None,
    )


@router.patch("/{space_id}", response_model=schemas.SpaceOut)
def update_space(
    payload: schemas.SpaceUpdate,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    space = access.space
    if payload.name is not None:
        space.name = payload.name
    if payload.description is not None:
        space.description = payload.description
    if payload.color is not None:
        space.color = payload.color
    db.commit()
    db.refresh(space)
    return _to_out(space, "owner", can_upload=True)


@router.delete("/{space_id}")
def delete_space(
    access: SpaceAccess = Depends(require_space_owner), db: Session = Depends(get_db)
):
    space_id = access.space.id
    db.delete(access.space)
    db.commit()

    vectorstore.delete_space(space_id)
    backup.delete_all_snapshots(space_id)
    space_upload_dir = UPLOAD_DIR / space_id
    if space_upload_dir.exists():
        shutil.rmtree(space_upload_dir, ignore_errors=True)

    return {"ok": True}


# --- Members (account-holder collaborators) ------------------------------

@router.get("/{space_id}/members", response_model=list[schemas.SpaceMemberOut])
def list_members(access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)):
    rows = db.query(models_db.SpaceMember).filter_by(space_id=access.space.id).all()
    return [
        schemas.SpaceMemberOut(
            id=m.id,
            user_id=m.user_id,
            email=m.user.email,
            display_name=m.user.display_name,
            can_upload=m.can_upload,
            created_at=m.created_at,
        )
        for m in rows
    ]


@router.post("/{space_id}/members", response_model=schemas.SpaceMemberOut)
def add_member(
    payload: schemas.SpaceMemberCreate,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    email = payload.email.lower().strip()
    target = db.query(models_db.User).filter_by(email=email).first()
    if not target:
        raise HTTPException(404, "Aucun compte avec cet email")
    if target.id == access.space.owner_id:
        raise HTTPException(400, "Cet utilisateur est deja proprietaire de l'espace")

    cooldown_cutoff = datetime.utcnow() - timedelta(hours=settings.member_reinvite_cooldown_hours)
    recent_removal = (
        db.query(models_db.SpaceMemberRemoval)
        .filter(
            models_db.SpaceMemberRemoval.space_id == access.space.id,
            models_db.SpaceMemberRemoval.user_id == target.id,
            models_db.SpaceMemberRemoval.removed_at > cooldown_cutoff,
        )
        .order_by(models_db.SpaceMemberRemoval.removed_at.desc())
        .first()
    )
    if recent_removal:
        remaining = recent_removal.removed_at + timedelta(hours=settings.member_reinvite_cooldown_hours) - datetime.utcnow()
        hours_left = max(1, int(remaining.total_seconds() // 3600) + 1)
        raise HTTPException(
            400,
            f"Cette personne a ete retiree recemment - elle pourra etre reinvitee dans {hours_left}h",
        )

    existing = (
        db.query(models_db.SpaceMember)
        .filter_by(space_id=access.space.id, user_id=target.id)
        .first()
    )
    if existing:
        existing.can_upload = payload.can_upload
        db.commit()
        member = existing
    else:
        owner = db.get(models_db.User, access.space.owner_id)
        plan_limit = config.plan_quota(owner.plan if owner else config.DEFAULT_PLAN, "members_per_space")
        if plan_limit is not None:
            # +1 for the owner - the plan's "members per space" figure is a
            # total headcount, not just invited members.
            current_count = (
                db.query(models_db.SpaceMember).filter_by(space_id=access.space.id).count() + 1
            )
            if current_count >= plan_limit:
                raise HTTPException(
                    400,
                    f"Limite de {plan_limit} membres par espace atteinte pour ce palier",
                )
        member = models_db.SpaceMember(
            space_id=access.space.id, user_id=target.id, can_upload=payload.can_upload
        )
        db.add(member)
        db.commit()
        db.refresh(member)
    return schemas.SpaceMemberOut(
        id=member.id,
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        can_upload=member.can_upload,
        created_at=member.created_at,
    )


@router.delete("/{space_id}/members/{member_id}")
def remove_member(
    member_id: str,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    member = db.get(models_db.SpaceMember, member_id)
    if not member or member.space_id != access.space.id:
        raise HTTPException(404, "Membre introuvable")
    db.add(models_db.SpaceMemberRemoval(space_id=member.space_id, user_id=member.user_id))
    db.delete(member)
    db.commit()
    return {"ok": True}


# --- Share links (anonymous, role-scoped, replaces the old password) -----

@router.get("/{space_id}/share-links", response_model=list[schemas.ShareLinkOut])
def list_share_links(access: SpaceAccess = Depends(require_space_owner), db: Session = Depends(get_db)):
    return db.query(models_db.ShareLink).filter_by(space_id=access.space.id).all()


@router.post("/{space_id}/share-links", response_model=schemas.ShareLinkOut)
def create_share_link(
    payload: schemas.ShareLinkCreate,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    active_count = (
        db.query(models_db.ShareLink)
        .filter_by(space_id=access.space.id, revoked=False)
        .count()
    )
    if active_count >= settings.max_share_links_per_space:
        raise HTTPException(
            400,
            f"Limite de {settings.max_share_links_per_space} liens de partage actifs par espace atteinte",
        )
    expires_at = (
        datetime.utcnow() + timedelta(days=payload.expires_in_days)
        if payload.expires_in_days
        else None
    )
    link = models_db.ShareLink(
        space_id=access.space.id,
        can_upload=payload.can_upload,
        label=payload.label,
        created_by=access.user.id if access.user else None,
        expires_at=expires_at,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{space_id}/share-links/{link_id}")
def revoke_share_link(
    link_id: str,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    link = db.get(models_db.ShareLink, link_id)
    if not link or link.space_id != access.space.id:
        raise HTTPException(404, "Lien introuvable")
    link.revoked = True
    db.commit()
    return {"ok": True}
