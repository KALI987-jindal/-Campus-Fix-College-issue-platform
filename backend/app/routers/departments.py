from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.department import Department
from ..models.issue import Issue
from ..schemas.department import DepartmentOut

router = APIRouter(prefix="/api/v1/departments", tags=["Departments"])

@router.get("", response_model=List[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    """List all registered academic departments and central campus facilities."""
    return db.query(Department).all()

@router.get("/{department_id}", response_model=DepartmentOut)
def get_department(department_id: int, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept

@router.get("/{department_id}/stats")
def get_department_stats(department_id: int, db: Session = Depends(get_db)):
    """Returns department-level metrics (total, open, resolved, SLA breached)."""
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    total = db.query(Issue).filter(Issue.academic_department_id == department_id).count()
    resolved = db.query(Issue).filter(
        Issue.academic_department_id == department_id,
        Issue.status.in_(["RESOLVED", "CLOSED"])
    ).count()
    open_issues = total - resolved
    sla_breached = db.query(Issue).filter(
        Issue.academic_department_id == department_id,
        Issue.is_sla_breached == True
    ).count()

    resolution_rate = round((resolved / total * 100), 1) if total > 0 else 100.0

    return {
        "department_id": dept.id,
        "name": dept.name,
        "code": dept.code,
        "total_issues": total,
        "open_issues": open_issues,
        "resolved_issues": resolved,
        "sla_breached_count": sla_breached,
        "resolution_rate_percent": resolution_rate
    }
