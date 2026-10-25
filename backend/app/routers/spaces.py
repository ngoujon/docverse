"""Workspaces ("spaces"): CRUD, usage statistics, the vector-graph view,
account-holder members and share links."""

from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import quota, settings
from ..database import get_db
from ..deps import SpaceAccess, get_current_user, require_space_access, require_space_owner
from ..services import accounts, mailer, vectorstore

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


@router.get("", response_model=list[schemas.SpaceOut])
def list_my_spaces(
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Spaces the current user owns or is a member of (the client
    dashboard's "my spaces" list). Admins do NOT see every space here -
    that's a deliberate privacy default; see /api/admin/spaces."""
    owned = db.query(models.Space).filter_by(owner_id=user.id).all()
    member_rows = db.query(models.SpaceMember).filter_by(user_id=user.id).all()
    member_upload = {m.space_id: m.can_upload for m in member_rows}
    members_spaces_objs = (
        db.query(models.Space).filter(models.Space.id.in_(member_upload.keys())).all()
        if member_upload
        else []
    )
    out = [schemas.SpaceOut.from_space(s, "owner", can_upload=True) for s in owned]
    out += [schemas.SpaceOut.from_space(s, "member", can_upload=member_upload[s.id]) for s in members_spaces_objs]
    out.sort(key=lambda s: s.created_at, reverse=True)
    return out


@router.post("", response_model=schemas.SpaceOut)
def create_space(
    payload: schemas.SpaceCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_count = db.query(models.Space).filter_by(owner_id=user.id).count()
    effective_limit = min(quota("spaces"), settings.max_spaces_per_user)
    if owned_count >= effective_limit:
        raise HTTPException(400, f"Limite de {effective_limit} espaces atteinte pour votre compte")
    space = models.Space(
        name=payload.name.strip() or "Espace sans nom",
        description=payload.description,
        color=payload.color,
        owner_id=user.id,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return schemas.SpaceOut.from_space(space, "owner", can_upload=True)


@router.get("/by-share/{token}", response_model=schemas.SpaceOut)
def get_space_by_share_token(token: str, db: Session = Depends(get_db)):
    """Resolves a share link to its space - the frontend's /share/:token
    route only has the token, not the space id, so this is how it finds
    out which space to load before making any further scoped requests."""
    link = db.get(models.ShareLink, token)
    if (
        not link
        or link.revoked
        or (link.expires_at and link.expires_at <= datetime.utcnow())
    ):
        raise HTTPException(404, "Lien de partage introuvable ou expiré")
    space = db.get(models.Space, link.space_id)
    if not space:
        raise HTTPException(404, "Espace introuvable")
    return schemas.SpaceOut.from_space(space, "member", can_upload=link.can_upload)


@router.get("/{space_id}", response_model=schemas.SpaceOut)
def get_space(access: SpaceAccess = Depends(require_space_access)):
    return schemas.SpaceOut.from_space(access.space, access.role, can_upload=access.can_upload)


@router.get("/{space_id}/vector-graph", response_model=schemas.VectorGraphOut)
def space_vector_graph(access: SpaceAccess = Depends(require_space_access)):
    return vectorstore.build_graph(access.space.id)


@router.get("/{space_id}/stats", response_model=schemas.SpaceStatsOut)
def space_stats(access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)):
    space = access.space
    message_count = (
        db.query(func.count(models.Message.id))
        .join(models.Conversation, models.Message.conversation_id == models.Conversation.id)
        .filter(models.Conversation.space_id == space.id)
        .scalar()
    )
    last_conv = (
        db.query(models.Conversation)
        .filter(models.Conversation.space_id == space.id)
        .order_by(models.Conversation.updated_at.desc())
        .first()
    )
    member_limit = quota("members_per_space")
    return schemas.SpaceStatsOut(
        space_id=space.id,
        document_count=len(space.documents),
        conversation_count=len(space.conversations),
        message_count=message_count or 0,
        storage_bytes=accounts.storage_bytes(db, [space.id]),
        storage_limit_bytes=quota("storage_bytes"),
        member_count=len(space.members) + 1,  # +1 for the owner, matches add_member's headcount
        member_limit=member_limit,
        active_share_links=sum(1 for link in space.share_links if not link.revoked),
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
    return schemas.SpaceOut.from_space(space, "owner", can_upload=True)


@router.delete("/{space_id}")
def delete_space(access: SpaceAccess = Depends(require_space_owner), db: Session = Depends(get_db)):
    accounts.purge_space(db, access.space)
    return {"ok": True}


# --- Members (account-holder collaborators) ------------------------------

@router.get("/{space_id}/members", response_model=list[schemas.SpaceMemberOut])
def list_members(access: SpaceAccess = Depends(require_space_access), db: Session = Depends(get_db)):
    rows = db.query(models.SpaceMember).filter_by(space_id=access.space.id).all()
    return [schemas.SpaceMemberOut.from_member(m) for m in rows]


@router.post("/{space_id}/members", response_model=schemas.SpaceMemberOut)
def add_member(
    payload: schemas.SpaceMemberCreate,
    background_tasks: BackgroundTasks,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    email = payload.email.lower().strip()
    target = db.query(models.User).filter_by(email=email).first()
    if not target:
        raise HTTPException(404, "Aucun compte avec cet email")
    if target.id == access.space.owner_id:
        raise HTTPException(400, "Cet utilisateur est déjà propriétaire de l'espace")

    cooldown = timedelta(hours=settings.member_reinvite_cooldown_hours)
    cooldown_cutoff = datetime.utcnow() - cooldown
    recent_removal = (
        db.query(models.SpaceMemberRemoval)
        .filter(
            models.SpaceMemberRemoval.space_id == access.space.id,
            models.SpaceMemberRemoval.user_id == target.id,
            models.SpaceMemberRemoval.removed_at > cooldown_cutoff,
        )
        .order_by(models.SpaceMemberRemoval.removed_at.desc())
        .first()
    )
    if recent_removal:
        remaining = recent_removal.removed_at + cooldown - datetime.utcnow()
        hours_left = max(1, int(remaining.total_seconds() // 3600) + 1)
        raise HTTPException(
            400,
            f"Cette personne a été retirée récemment - elle pourra être réinvitée dans {hours_left}h",
        )

    existing = (
        db.query(models.SpaceMember)
        .filter_by(space_id=access.space.id, user_id=target.id)
        .first()
    )
    if existing:
        existing.can_upload = payload.can_upload
        db.commit()
        member = existing
    else:
        member_limit = quota("members_per_space")
        # +1 for the owner - the "members per space" figure is a total
        # headcount, not just invited members.
        current_count = (
            db.query(models.SpaceMember).filter_by(space_id=access.space.id).count() + 1
        )
        if current_count >= member_limit:
            raise HTTPException(
                400,
                f"Limite de {member_limit} membres par espace atteinte",
            )
        member = models.SpaceMember(
            space_id=access.space.id, user_id=target.id, can_upload=payload.can_upload
        )
        db.add(member)
        db.commit()
        db.refresh(member)
        # Only on a new membership - updating an existing member's upload
        # permission isn't news worth an email.
        inviter = access.user.display_name or access.user.email
        app_url = f"{settings.frontend_base_url}/app/{access.space.id}"
        mailer.send_later(
            background_tasks, target.email, mailer.space_member_added_email(inviter, access.space.name, app_url)
        )
    return schemas.SpaceMemberOut.from_member(member)


@router.delete("/{space_id}/members/{member_id}")
def remove_member(
    member_id: str,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    member = db.get(models.SpaceMember, member_id)
    if not member or member.space_id != access.space.id:
        raise HTTPException(404, "Membre introuvable")
    db.add(models.SpaceMemberRemoval(space_id=member.space_id, user_id=member.user_id))
    db.delete(member)
    db.commit()
    return {"ok": True}


# --- Share links (anonymous, role-scoped, replaces the old password) -----

@router.get("/{space_id}/share-links", response_model=list[schemas.ShareLinkOut])
def list_share_links(access: SpaceAccess = Depends(require_space_owner), db: Session = Depends(get_db)):
    return db.query(models.ShareLink).filter_by(space_id=access.space.id).all()


@router.post("/{space_id}/share-links", response_model=schemas.ShareLinkOut)
def create_share_link(
    payload: schemas.ShareLinkCreate,
    access: SpaceAccess = Depends(require_space_owner),
    db: Session = Depends(get_db),
):
    active_count = (
        db.query(models.ShareLink)
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
    link = models.ShareLink(
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
    link = db.get(models.ShareLink, link_id)
    if not link or link.space_id != access.space.id:
        raise HTTPException(404, "Lien introuvable")
    link.revoked = True
    db.commit()
    return {"ok": True}
