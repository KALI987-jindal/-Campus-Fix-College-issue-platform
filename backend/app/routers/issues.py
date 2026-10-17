from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..database import get_db
from ..models.issue import Issue
from ..models.user import User
from ..models.department import Department
from ..models.interactions import Upvote, Comment, ProofPhoto
from ..schemas.issue import (
    IssueCreate, IssueOut, IssueVerify,
    CommentCreate, CommentOut
)
from ..services.auth_service import get_current_user
from ..services.scoping_service import apply_scoping_filter

router = APIRouter(prefix="/api/v1/issues", tags=["Issues & Feeds"])

def calculate_sla_deadline(priority: str) -> datetime:
    now = datetime.utcnow()
    p = priority.upper()
    if p == "LECTURE_CRITICAL":
        return now + timedelta(minutes=15)
    elif p == "CRITICAL":
        return now + timedelta(hours=2)
    elif p == "HIGH":
        return now + timedelta(hours=12)
    elif p == "MEDIUM":
        return now + timedelta(hours=24)
    else:  # LOW
        return now + timedelta(hours=72)

def enrich_issue_out(issue: Issue, current_user_id: Optional[int] = None) -> dict:
    has_upvoted = False
    if current_user_id and issue.upvotes:
        has_upvoted = any(u.user_id == current_user_id for u in issue.upvotes)

    reporter_name = "Anonymous Student" if issue.is_anonymous else (issue.reported_by.full_name if issue.reported_by else "Unknown")
    reporter_role = issue.reported_by.role if issue.reported_by else "STUDENT"

    comments_out = []
    if issue.comments:
        for c in issue.comments:
            comments_out.append({
                "id": c.id,
                "user_id": c.user_id,
                "user_name": c.user.full_name if c.user else "User",
                "user_role": c.user.role if c.user else "STUDENT",
                "message": c.message,
                "is_staff_only_note": c.is_staff_only_note,
                "created_at": c.created_at
            })

    proofs_out = []
    if issue.proof_photos:
        for p in issue.proof_photos:
            proofs_out.append({
                "id": p.id,
                "photo_url": p.photo_url,
                "photo_type": p.photo_type,
                "uploaded_by_user_id": p.uploaded_by_user_id,
                "uploaded_at": p.uploaded_at
            })

    return {
        "id": issue.id,
        "title": issue.title,
        "description": issue.description,
        "scope": issue.scope,
        "academic_department_id": issue.academic_department_id,
        "academic_department_name": issue.academic_department.name if issue.academic_department else None,
        "service_trade": issue.service_trade,
        "priority": issue.priority,
        "status": issue.status,
        "reported_by_user_id": issue.reported_by_user_id,
        "reported_by_name": reporter_name,
        "reported_by_role": reporter_role,
        "assigned_technician_id": issue.assigned_technician_id,
        "assigned_technician_name": issue.assigned_technician.full_name if issue.assigned_technician else None,
        "supervisor_id": issue.supervisor_id,
        "location_room_or_block": issue.location_room_or_block,
        "teacher_availability_slot": issue.teacher_availability_slot,
        "image_url": issue.image_url,
        "resolution_proof_url": issue.resolution_proof_url,
        "resolution_note": issue.resolution_note,
        "upvotes_count": issue.upvotes_count,
        "is_anonymous": issue.is_anonymous,
        "is_faculty_private": issue.is_faculty_private,
        "sla_deadline": issue.sla_deadline,
        "is_sla_breached": issue.is_sla_breached,
        "star_rating": issue.star_rating,
        "feedback_comment": issue.feedback_comment,
        "created_at": issue.created_at,
        "resolved_at": issue.resolved_at,
        "closed_at": issue.closed_at,
        "user_has_upvoted": has_upvoted,
        "comments": comments_out,
        "proof_photos": proofs_out
    }

@router.get("", response_model=List[IssueOut])
def get_scoped_issues(
    scope_view: str = Query("ALL", description="ALL, DEPARTMENT_ONLY, CAMPUS_WIDE, FACULTY_ROOM"),
    status: Optional[str] = None,
    service_trade: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Core scoped feed query. Automatically filters issues based on user role and academic department.
    """
    base_query = db.query(Issue)
    filtered_query = apply_scoping_filter(base_query, current_user, scope_view=scope_view.upper())

    if status:
        filtered_query = filtered_query.filter(Issue.status == status.upper())
    if service_trade:
        filtered_query = filtered_query.filter(Issue.service_trade == service_trade.upper())

    issues = filtered_query.order_by(
        desc(Issue.priority == "LECTURE_CRITICAL"),
        desc(Issue.upvotes_count),
        desc(Issue.created_at)
    ).all()

    return [enrich_issue_out(i, current_user.id) for i in issues]

@router.post("", response_model=IssueOut)
def create_issue(
    issue_in: IssueCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new issue.
    Supports Department-Only, Campus-Wide, and Faculty-Room scopes.
    """
    # Verify academic department
    dept = db.query(Department).filter(Department.id == issue_in.academic_department_id).first()
    if not dept:
        raise HTTPException(status_code=400, detail="Invalid academic department ID")

    # Faculty room issues can only be reported by teachers, HODs, or admin
    is_faculty_private = False
    scope = issue_in.scope.upper()
    if scope == "FACULTY_ROOM":
        if current_user.role not in ["TEACHER", "HOD", "ADMIN"]:
            raise HTTPException(
                status_code=403,
                detail="Only Teachers and Faculty members can report Faculty Room issues"
            )
        is_faculty_private = True

    # Lecture-Critical priority can only be set by Teachers / Faculty
    priority = issue_in.priority.upper()
    if priority == "LECTURE_CRITICAL" and current_user.role not in ["TEACHER", "HOD", "ADMIN"]:
        priority = "HIGH"

    new_issue = Issue(
        title=issue_in.title.strip(),
        description=issue_in.description.strip(),
        scope=scope,
        academic_department_id=issue_in.academic_department_id,
        service_trade=issue_in.service_trade.upper(),
        priority=priority,
        status="SUBMITTED",
        reported_by_user_id=current_user.id,
        location_room_or_block=issue_in.location_room_or_block.strip(),
        teacher_availability_slot=issue_in.teacher_availability_slot,
        image_url=issue_in.image_url,
        is_anonymous=issue_in.is_anonymous,
        is_faculty_private=is_faculty_private,
        sla_deadline=calculate_sla_deadline(priority),
        is_sla_breached=False,
        upvotes_count=0
    )

    db.add(new_issue)
    db.commit()
    db.refresh(new_issue)

    return enrich_issue_out(new_issue, current_user.id)

@router.get("/{issue_id}", response_model=IssueOut)
def get_issue(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Privacy check for students: cannot view faculty room tickets
    if current_user.role == "STUDENT" and (issue.scope == "FACULTY_ROOM" or issue.is_faculty_private):
        raise HTTPException(status_code=403, detail="Access denied: confidential faculty room issue")

    return enrich_issue_out(issue, current_user.id)

@router.post("/{issue_id}/upvote")
def toggle_upvote(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    existing_upvote = db.query(Upvote).filter(
        Upvote.issue_id == issue_id,
        Upvote.user_id == current_user.id
    ).first()

    if existing_upvote:
        # Remove upvote
        db.delete(existing_upvote)
        issue.upvotes_count = max(0, issue.upvotes_count - 1)
        upvoted = False
    else:
        # Cast upvote
        new_upvote = Upvote(issue_id=issue_id, user_id=current_user.id)
        db.add(new_upvote)
        issue.upvotes_count += 1
        upvoted = True

    db.commit()
    return {"issue_id": issue.id, "upvotes_count": issue.upvotes_count, "upvoted": upvoted}

@router.post("/{issue_id}/comments", response_model=CommentOut)
def add_comment(
    issue_id: int,
    comment_in: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    new_comment = Comment(
        issue_id=issue_id,
        user_id=current_user.id,
        message=comment_in.message.strip(),
        is_staff_only_note=comment_in.is_staff_only_note
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    return {
        "id": new_comment.id,
        "user_id": current_user.id,
        "user_name": current_user.full_name,
        "user_role": current_user.role,
        "message": new_comment.message,
        "is_staff_only_note": new_comment.is_staff_only_note,
        "created_at": new_comment.created_at
    }

@router.post("/{issue_id}/verify")
def verify_resolution(
    issue_id: int,
    verify_data: IssueVerify,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Student or Teacher sign-off on completed repair.
    Action: ACCEPT (rate 1-5) or REOPEN.
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    action = verify_data.action.upper()
    if action == "ACCEPT":
        issue.status = "CLOSED"
        issue.closed_at = datetime.utcnow()
        if verify_data.star_rating:
            issue.star_rating = verify_data.star_rating
        if verify_data.feedback_comment:
            issue.feedback_comment = verify_data.feedback_comment
    elif action == "REOPEN":
        issue.status = "REOPENED"
        issue.priority = "HIGH"  # Escalated upon reopening
        if verify_data.feedback_comment:
            reopen_comment = Comment(
                issue_id=issue_id,
                user_id=current_user.id,
                message=f"[REOPENED BY USER]: {verify_data.feedback_comment}"
            )
            db.add(reopen_comment)
    else:
        raise HTTPException(status_code=400, detail="Action must be ACCEPT or REOPEN")

    db.commit()
    db.refresh(issue)
    return {"message": f"Issue status updated to {issue.status}", "status": issue.status}
