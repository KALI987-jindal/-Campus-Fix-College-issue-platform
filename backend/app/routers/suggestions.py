from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..database import get_db
from ..models.suggestion import Suggestion, SuggestionUpvote
from ..models.user import User
from ..schemas.suggestion import (
    SuggestionCreate, SuggestionOut, SuggestionStatusUpdate
)
from ..services.auth_service import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/suggestions", tags=["Student & Campus Suggestions"])

def enrich_suggestion(s: Suggestion, current_user_id: Optional[int] = None) -> dict:
    has_upvoted = False
    if current_user_id and s.upvotes:
        has_upvoted = any(u.user_id == current_user_id for u in s.upvotes)

    submitter_name = "Anonymous Student" if s.is_anonymous else (s.submitted_by.full_name if s.submitted_by else "Campus Member")

    return {
        "id": s.id,
        "title": s.title,
        "description": s.description,
        "category": s.category,
        "submitted_by_user_id": s.submitted_by_user_id,
        "submitted_by_name": submitter_name,
        "is_anonymous": s.is_anonymous,
        "upvotes_count": s.upvotes_count,
        "status": s.status,
        "admin_response": s.admin_response,
        "created_at": s.created_at,
        "user_has_upvoted": has_upvoted
    }

@router.get("", response_model=List[SuggestionOut])
def list_suggestions(
    category: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List campus suggestions submitted by students and faculty."""
    query = db.query(Suggestion)
    if category:
        query = query.filter(Suggestion.category == category.upper())
    if status:
        query = query.filter(Suggestion.status == status.upper())

    suggestions = query.order_by(desc(Suggestion.upvotes_count), desc(Suggestion.created_at)).all()
    return [enrich_suggestion(s, current_user.id) for s in suggestions]

@router.post("", response_model=SuggestionOut)
def create_suggestion(
    sugg_in: SuggestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Students can submit new campus improvement suggestions."""
    suggestion = Suggestion(
        title=sugg_in.title.strip(),
        description=sugg_in.description.strip(),
        category=sugg_in.category.upper(),
        submitted_by_user_id=current_user.id,
        is_anonymous=sugg_in.is_anonymous,
        upvotes_count=0,
        status="UNDER_REVIEW"
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    return enrich_suggestion(suggestion, current_user.id)

@router.post("/{suggestion_id}/upvote")
def toggle_suggestion_upvote(
    suggestion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upvote or remove upvote from a campus suggestion."""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    existing_upvote = db.query(SuggestionUpvote).filter(
        SuggestionUpvote.suggestion_id == suggestion_id,
        SuggestionUpvote.user_id == current_user.id
    ).first()

    if existing_upvote:
        db.delete(existing_upvote)
        suggestion.upvotes_count = max(0, suggestion.upvotes_count - 1)
        upvoted = False
    else:
        new_upvote = SuggestionUpvote(suggestion_id=suggestion_id, user_id=current_user.id)
        db.add(new_upvote)
        suggestion.upvotes_count += 1
        upvoted = True

    db.commit()
    return {"suggestion_id": suggestion.id, "upvotes_count": suggestion.upvotes_count, "upvoted": upvoted}

@router.put("/{suggestion_id}/status", response_model=SuggestionOut)
def update_suggestion_status(
    suggestion_id: int,
    status_in: SuggestionStatusUpdate,
    current_user: User = Depends(require_roles("ADMIN", "HOD", "SUPERVISOR")),
    db: Session = Depends(get_db)
):
    """Dean or HOD reviews a suggestion, marks status (ACCEPTED, IN_PROGRESS, DECLINED) and adds remarks."""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    suggestion.status = status_in.status.upper()
    if status_in.admin_response:
        suggestion.admin_response = status_in.admin_response.strip()

    db.commit()
    db.refresh(suggestion)
    return enrich_suggestion(suggestion, current_user.id)
