from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from ..database import get_db
from ..models.issue import Issue
from ..models.user import User
from ..models.interactions import ProofPhoto, Comment
from ..schemas.issue import IssueStatusUpdate, IssueAssign, IssueOut
from ..schemas.auth import UserOut
from ..services.auth_service import get_current_user, require_roles
from .issues import enrich_issue_out

router = APIRouter(prefix="/api/v1/staff", tags=["Supervisor & Ground Staff Operations"])

@router.get("/technicians", response_model=List[UserOut])
def list_technicians(
    trade: Optional[str] = None,
    current_user: User = Depends(require_roles("SUPERVISOR", "ADMIN", "HOD")),
    db: Session = Depends(get_db)
):
    """List available ground technicians (Plumbers, Carpenters, Electricians, IT, Sweepers)."""
    query = db.query(User).filter(User.role == "TECHNICIAN")
    if trade:
        query = query.filter(User.trade_specialty == trade.upper())
    return query.all()

@router.get("/my-tasks", response_model=List[IssueOut])
def get_my_tasks(
    current_user: User = Depends(require_roles("TECHNICIAN", "SUPERVISOR", "ADMIN")),
    db: Session = Depends(get_db)
):
    """
    Ultra-simple mobile task list for ground staff.
    Returns tasks assigned to this technician or within their trade specialty.
    """
    if current_user.role == "TECHNICIAN":
        issues = db.query(Issue).filter(
            or_(
                Issue.assigned_technician_id == current_user.id,
                and_(Issue.service_trade == current_user.trade_specialty, Issue.status == "SUBMITTED")
            ),
            Issue.status.in_(["SUBMITTED", "ASSIGNED", "IN_PROGRESS"])
        ).order_by(Issue.priority == "LECTURE_CRITICAL", Issue.created_at).all()
    else:
        # Supervisors see all active tickets needing attention
        issues = db.query(Issue).filter(
            Issue.status.in_(["SUBMITTED", "ASSIGNED", "IN_PROGRESS"])
        ).order_by(Issue.priority == "LECTURE_CRITICAL", Issue.created_at).all()

    return [enrich_issue_out(i, current_user.id) for i in issues]

@router.put("/issues/{issue_id}/assign")
def assign_ticket(
    issue_id: int,
    assign_in: IssueAssign,
    current_user: User = Depends(require_roles("SUPERVISOR", "ADMIN", "HOD")),
    db: Session = Depends(get_db)
):
    """Supervisor assigns a ticket to a ground technician."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    tech = db.query(User).filter(User.id == assign_in.assigned_technician_id, User.role == "TECHNICIAN").first()
    if not tech:
        raise HTTPException(status_code=400, detail="Invalid technician ID")

    issue.assigned_technician_id = tech.id
    issue.supervisor_id = current_user.id
    issue.status = "ASSIGNED"

    # Add activity log
    log = Comment(
        issue_id=issue.id,
        user_id=current_user.id,
        message=f"[ASSIGNMENT]: Supervisor {current_user.full_name} assigned task to {tech.full_name} ({tech.trade_specialty})",
        is_staff_only_note=True
    )
    db.add(log)
    db.commit()

    return {
        "message": f"Assigned to {tech.full_name}",
        "issue_id": issue.id,
        "status": issue.status,
        "assigned_to": tech.full_name
    }

@router.put("/issues/{issue_id}/status")
def update_status(
    issue_id: int,
    status_update: IssueStatusUpdate,
    current_user: User = Depends(require_roles("TECHNICIAN", "SUPERVISOR", "ADMIN", "HOD")),
    db: Session = Depends(get_db)
):
    """Technician or Supervisor updates issue status (e.g. IN_PROGRESS, RESOLVED)."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    new_status = status_update.status.upper()
    issue.status = new_status

    if new_status == "RESOLVED":
        issue.resolved_at = datetime.utcnow()
        if status_update.resolution_note:
            issue.resolution_note = status_update.resolution_note
        if status_update.resolution_proof_url:
            issue.resolution_proof_url = status_update.resolution_proof_url

    # Add work log comment
    note = status_update.resolution_note or f"Status changed to {new_status}"
    comment = Comment(
        issue_id=issue.id,
        user_id=current_user.id,
        message=f"[{new_status}]: {note}",
        is_staff_only_note=False
    )
    db.add(comment)
    db.commit()

    return {"message": f"Status updated to {new_status}", "issue_id": issue.id, "status": issue.status}

@router.post("/issues/{issue_id}/proof")
def upload_proof(
    issue_id: int,
    photo_url: str = Form(...),
    photo_type: str = Form("AFTER_FIX"),
    resolution_note: Optional[str] = Form(None),
    current_user: User = Depends(require_roles("TECHNICIAN", "SUPERVISOR", "ADMIN")),
    db: Session = Depends(get_db)
):
    """1-Click proof upload to verify completed repair and mark ticket as RESOLVED."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    proof = ProofPhoto(
        issue_id=issue.id,
        photo_url=photo_url,
        photo_type=photo_type.upper(),
        uploaded_by_user_id=current_user.id
    )
    db.add(proof)

    issue.resolution_proof_url = photo_url
    issue.status = "RESOLVED"
    issue.resolved_at = datetime.utcnow()
    if resolution_note:
        issue.resolution_note = resolution_note

    log = Comment(
        issue_id=issue.id,
        user_id=current_user.id,
        message=f"[REPAIRED & RESOLVED]: Proof photo uploaded. Note: {resolution_note or 'Work completed'}",
        is_staff_only_note=False
    )
    db.add(log)
    db.commit()

    return {
        "message": "Resolution proof uploaded and marked RESOLVED",
        "issue_id": issue.id,
        "proof_url": photo_url,
        "status": issue.status
    }
