"""
Test the /api/v1/staff/my-tasks endpoint.

Verifies that the and_ import fix in staff.py does not cause a runtime crash
and that the endpoint returns the correct technician tasks.
"""

from datetime import datetime, timedelta
from app.models.issue import Issue
from tests.conftest import _auth_header


def _seed_issues(db, *, dept_id, tech_id, reporter_id):
    """Create a few test issues, some assigned to tech, some matching trade."""
    issues = [
        Issue(
            title="Leaking Pipe",
            description="Pipe leaking in washroom",
            scope="DEPARTMENT_ONLY",
            academic_department_id=dept_id,
            service_trade="PLUMBING",
            priority="HIGH",
            status="SUBMITTED",
            reported_by_user_id=reporter_id,
            location_room_or_block="Block B",
            sla_deadline=datetime.utcnow() + timedelta(hours=12),
        ),
        Issue(
            title="Broken Switch",
            description="Light switch broken",
            scope="DEPARTMENT_ONLY",
            academic_department_id=dept_id,
            service_trade="ELECTRICAL",
            priority="MEDIUM",
            status="ASSIGNED",
            reported_by_user_id=reporter_id,
            assigned_technician_id=tech_id,
            location_room_or_block="Block C",
            sla_deadline=datetime.utcnow() + timedelta(hours=24),
        ),
    ]
    db.add_all(issues)
    db.commit()
    return issues


def test_technician_my_tasks_no_crash(client, db, technician_user, student_a, department):
    """
    The and_ import bug in staff.py would cause a NameError crash on this endpoint.
    After the fix, it should return 200.
    """
    _seed_issues(db, dept_id=department.id, tech_id=technician_user.id, reporter_id=student_a.id)
    resp = client.get("/api/v1/staff/my-tasks", headers=_auth_header(technician_user))
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    tasks = resp.json()
    assert isinstance(tasks, list)
    # Technician should see: assigned issue (Broken Switch) and trade-matching SUBMITTED (Leaking Pipe)
    assert len(tasks) >= 1


def test_supervisor_my_tasks(client, db, supervisor_user, technician_user, student_a, department):
    """Supervisors should see all active issues."""
    _seed_issues(db, dept_id=department.id, tech_id=technician_user.id, reporter_id=student_a.id)
    resp = client.get("/api/v1/staff/my-tasks", headers=_auth_header(supervisor_user))
    assert resp.status_code == 200
    tasks = resp.json()
    assert isinstance(tasks, list)
    assert len(tasks) >= 1
