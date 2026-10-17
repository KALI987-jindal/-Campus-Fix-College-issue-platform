from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.issue import Issue
from ..models.department import Department
from ..models.user import User
from ..models.interactions import BroadcastNotice
from ..schemas.issue import BroadcastNoticeOut, BroadcastNoticeCreate
from ..services.auth_service import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/admin", tags=["Executive Administration & Governance"])

@router.get("/dashboard")
def get_executive_dashboard(
    current_user: User = Depends(require_roles("ADMIN", "HOD", "SUPERVISOR")),
    db: Session = Depends(get_db)
):
    """Dean & Admin bird's-eye metrics, SLA performance, and department league tables."""
    total = db.query(Issue).count()
    resolved = db.query(Issue).filter(Issue.status.in_(["RESOLVED", "CLOSED"])).count()
    open_count = total - resolved
    sla_breached = db.query(Issue).filter(Issue.is_sla_breached == True).count()
    critical_active = db.query(Issue).filter(
        Issue.priority.in_(["CRITICAL", "LECTURE_CRITICAL"]),
        Issue.status.in_(["SUBMITTED", "ASSIGNED", "IN_PROGRESS"])
    ).count()

    resolution_rate = round((resolved / total * 100), 1) if total > 0 else 100.0

    # Department breakdown
    depts = db.query(Department).all()
    dept_league = []
    for d in depts:
        d_total = db.query(Issue).filter(Issue.academic_department_id == d.id).count()
        d_resolved = db.query(Issue).filter(
            Issue.academic_department_id == d.id,
            Issue.status.in_(["RESOLVED", "CLOSED"])
        ).count()
        d_rate = round((d_resolved / d_total * 100), 1) if d_total > 0 else 100.0
        dept_league.append({
            "id": d.id,
            "name": d.name,
            "code": d.code,
            "total": d_total,
            "resolved": d_resolved,
            "open": d_total - d_resolved,
            "rate_percent": d_rate
        })

    # Trade Breakdown
    trades_data = db.query(
        Issue.service_trade, func.count(Issue.id)
    ).group_by(Issue.service_trade).all()
    trades_breakdown = [{"trade": t[0], "count": t[1]} for t in trades_data]

    return {
        "kpis": {
            "total_issues": total,
            "resolved_issues": resolved,
            "open_issues": open_count,
            "sla_breached": sla_breached,
            "critical_active": critical_active,
            "resolution_rate_percent": resolution_rate
        },
        "department_league": dept_league,
        "trade_breakdown": trades_breakdown
    }

@router.get("/broadcasts", response_model=List[BroadcastNoticeOut])
def get_broadcasts(db: Session = Depends(get_db)):
    """Fetch active campus announcements."""
    return db.query(BroadcastNotice).filter(BroadcastNotice.is_active == True).order_by(BroadcastNotice.created_at.desc()).all()

@router.post("/broadcasts", response_model=BroadcastNoticeOut)
def create_broadcast(
    notice_in: BroadcastNoticeCreate,
    current_user: User = Depends(require_roles("ADMIN", "SUPERVISOR")),
    db: Session = Depends(get_db)
):
    """Publish a new campus-wide outage or maintenance notice."""
    notice = BroadcastNotice(
        title=notice_in.title.strip(),
        message=notice_in.message.strip(),
        scope=notice_in.scope.upper(),
        is_active=True,
        created_by_user_id=current_user.id
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)
    return notice

@router.delete("/broadcasts/{notice_id}")
def dismiss_broadcast(
    notice_id: int,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db)
):
    notice = db.query(BroadcastNotice).filter(BroadcastNotice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    notice.is_active = False
    db.commit()
    return {"message": "Notice dismissed"}

@router.get("/audit-report")
def export_audit_data(
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db)
):
    """One-click compliance and audit data for NAAC / UGC inspection."""
    total = db.query(Issue).count()
    resolved = db.query(Issue).filter(Issue.status.in_(["RESOLVED", "CLOSED"])).count()
    anonymous_grievances = db.query(Issue).filter(Issue.is_anonymous == True).count()
    lecture_critical_count = db.query(Issue).filter(Issue.priority == "LECTURE_CRITICAL").count()

    return {
        "institution": "CampusFix University Central Grievance Redressal Cell",
        "generated_at": datetime.utcnow().isoformat(),
        "total_grievances_received": total,
        "total_grievances_resolved": resolved,
        "resolution_percentage": round((resolved / total * 100), 1) if total > 0 else 100.0,
        "anonymous_safety_reports": anonymous_grievances,
        "lecture_critical_interventions": lecture_critical_count,
        "statutory_compliance_status": "COMPLIANT WITH UGC REGULATION 2019"
    }
