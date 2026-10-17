from sqlalchemy.orm import Session, Query
from sqlalchemy import or_, and_
from ..models.issue import Issue
from ..models.user import User

def apply_scoping_filter(query: Query, current_user: User, scope_view: str = "ALL") -> Query:
    """
    Applies strict scoping rules to the Issue query based on the authenticated user's role and academic department.
    
    Scopes:
    - DEPARTMENT_ONLY: Local to specific faculty (Engineering, Law, Dental, Physio, Sciences, etc.)
    - CAMPUS_WIDE: Shared campus facilities (Library, Canteen, Buses, Sports, Hostels)
    - FACULTY_ROOM: Private to teachers & staff (Strictly hidden from students)
    """
    role = current_user.role
    dept_id = current_user.academic_department_id

    # 1. Super Admin sees everything across the institution
    if role == "ADMIN":
        if scope_view == "CAMPUS_WIDE":
            return query.filter(Issue.scope == "CAMPUS_WIDE")
        elif scope_view == "FACULTY_ROOM":
            return query.filter(Issue.scope == "FACULTY_ROOM")
        elif scope_view == "DEPARTMENT_ONLY" and dept_id:
            return query.filter(Issue.academic_department_id == dept_id)
        return query

    # 2. Supervisors & Ground Technicians
    if role in ["SUPERVISOR", "TECHNICIAN"]:
        # Technicians see tickets assigned to them or within their trade specialty
        if role == "TECHNICIAN" and current_user.trade_specialty:
            return query.filter(
                or_(
                    Issue.assigned_technician_id == current_user.id,
                    Issue.service_trade == current_user.trade_specialty
                )
            )
        return query

    # 3. Students
    if role == "STUDENT":
        # Students NEVER see faculty room private issues
        base_condition = and_(
            Issue.scope != "FACULTY_ROOM",
            Issue.is_faculty_private == False
        )
        
        if scope_view == "CAMPUS_WIDE":
            return query.filter(base_condition, Issue.scope == "CAMPUS_WIDE")
        elif scope_view == "DEPARTMENT_ONLY":
            return query.filter(base_condition, Issue.academic_department_id == dept_id)
        
        # Default view: student's own department issues + whole-college issues
        return query.filter(
            base_condition,
            or_(
                Issue.academic_department_id == dept_id,
                Issue.scope == "CAMPUS_WIDE"
            )
        )

    # 4. Teachers / Faculty & Department HODs
    if role in ["TEACHER", "HOD"]:
        if scope_view == "FACULTY_ROOM":
            # Only staff room issues of their department
            return query.filter(
                Issue.scope == "FACULTY_ROOM",
                Issue.academic_department_id == dept_id
            )
        elif scope_view == "CAMPUS_WIDE":
            return query.filter(Issue.scope == "CAMPUS_WIDE")
        elif scope_view == "DEPARTMENT_ONLY":
            return query.filter(
                Issue.scope == "DEPARTMENT_ONLY",
                Issue.academic_department_id == dept_id
            )

        # Default teacher view: their dept issues + their faculty room issues + campus-wide issues
        return query.filter(
            or_(
                and_(
                    Issue.academic_department_id == dept_id,
                    or_(Issue.scope == "DEPARTMENT_ONLY", Issue.scope == "FACULTY_ROOM")
                ),
                Issue.scope == "CAMPUS_WIDE"
            )
        )

    return query
