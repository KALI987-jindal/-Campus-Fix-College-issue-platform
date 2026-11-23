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


# ── Role Authorization Tests for Staff & Admin Routes ────────────────────────

def test_my_tasks_unauthenticated_blocked(client):
    """Unauthenticated access to staff my-tasks must return 401."""
    resp = client.get("/api/v1/staff/my-tasks")
    assert resp.status_code == 401


def test_my_tasks_unauthorized_roles_blocked(client, student_a, teacher_same_dept, hod_user):
    """STUDENT, TEACHER, and HOD roles must be forbidden from /api/v1/staff/my-tasks."""
    for user in [student_a, teacher_same_dept, hod_user]:
        resp = client.get("/api/v1/staff/my-tasks", headers=_auth_header(user))
        assert resp.status_code == 403, f"Expected 403 for role {user.role}, got {resp.status_code}"


def test_my_tasks_authorized_roles_allowed(client, technician_user, supervisor_user, admin_user):
    """TECHNICIAN, SUPERVISOR, and ADMIN roles must be authorized for /api/v1/staff/my-tasks."""
    for user in [technician_user, supervisor_user, admin_user]:
        resp = client.get("/api/v1/staff/my-tasks", headers=_auth_header(user))
        assert resp.status_code == 200, f"Expected 200 for role {user.role}, got {resp.status_code}"


def test_admin_dashboard_unauthenticated_blocked(client):
    """Unauthenticated access to /api/v1/admin/dashboard must return 401."""
    resp = client.get("/api/v1/admin/dashboard")
    assert resp.status_code == 401


def test_admin_dashboard_unauthorized_roles_blocked(client, student_a, teacher_same_dept, technician_user):
    """STUDENT, TEACHER, and TECHNICIAN roles must be forbidden from /api/v1/admin/dashboard."""
    for user in [student_a, teacher_same_dept, technician_user]:
        resp = client.get("/api/v1/admin/dashboard", headers=_auth_header(user))
        assert resp.status_code == 403, f"Expected 403 for role {user.role}, got {resp.status_code}"


def test_admin_dashboard_authorized_roles_allowed(client, admin_user, supervisor_user, hod_user):
    """ADMIN, SUPERVISOR, and HOD roles must be authorized for /api/v1/admin/dashboard."""
    for user in [admin_user, supervisor_user, hod_user]:
        resp = client.get("/api/v1/admin/dashboard", headers=_auth_header(user))
        assert resp.status_code == 200, f"Expected 200 for role {user.role}, got {resp.status_code}"


# ── Supervisor & Technician Workflow Tests: Submitted → Assigned → In Progress ─

def test_start_work_on_unassigned_issue_blocked(client, db, technician_user, student_a, department):
    """Starting work on an unassigned SUBMITTED ticket must return 400 Bad Request."""
    issue = Issue(
        title="Unassigned Water Leak",
        description="Water leaking in lab",
        scope="DEPARTMENT_ONLY",
        academic_department_id=department.id,
        service_trade="PLUMBING",
        priority="HIGH",
        status="SUBMITTED",
        reported_by_user_id=student_a.id,
        location_room_or_block="Room 101",
        sla_deadline=datetime.utcnow() + timedelta(hours=12),
    )
    db.add(issue)
    db.commit()

    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(technician_user),
    )
    assert resp.status_code == 400
    assert "Cannot start work on an unassigned ticket" in resp.json()["detail"]


def test_supervisor_cannot_start_work(client, db, supervisor_user, technician_user, student_a, department):
    """Supervisor must be forbidden (403) from starting work; only assigned tech can start."""
    issue = Issue(
        title="Assigned Pipe Issue",
        description="Assigned to technician",
        scope="DEPARTMENT_ONLY",
        academic_department_id=department.id,
        service_trade="PLUMBING",
        priority="HIGH",
        status="ASSIGNED",
        reported_by_user_id=student_a.id,
        assigned_technician_id=technician_user.id,
        location_room_or_block="Room 102",
        sla_deadline=datetime.utcnow() + timedelta(hours=12),
    )
    db.add(issue)
    db.commit()

    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(supervisor_user),
    )
    assert resp.status_code == 403
    assert "only the assigned technician can start work" in resp.json()["detail"]


def test_different_technician_cannot_start_work(client, db, technician_user, student_a, department):
    """A technician not assigned to the ticket must be forbidden (403) from starting work."""
    from tests.conftest import _make_user

    other_tech = _make_user(
        db,
        full_name="Tech Electrician",
        email="tech_elec@campus.edu",
        role="TECHNICIAN",
        dept_id=department.id,
        trade="ELECTRICAL",
    )

    issue = Issue(
        title="Plumbing Job for Tech 1",
        description="Assigned specifically to Tech 1",
        scope="DEPARTMENT_ONLY",
        academic_department_id=department.id,
        service_trade="PLUMBING",
        priority="HIGH",
        status="ASSIGNED",
        reported_by_user_id=student_a.id,
        assigned_technician_id=technician_user.id,
        location_room_or_block="Room 103",
        sla_deadline=datetime.utcnow() + timedelta(hours=12),
    )
    db.add(issue)
    db.commit()

    # other_tech attempts to start work
    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(other_tech),
    )
    assert resp.status_code == 403
    assert "only the assigned technician can start work" in resp.json()["detail"]


def test_assigned_technician_can_start_work(client, db, technician_user, student_a, department):
    """The assigned technician must successfully transition ticket to IN_PROGRESS (200)."""
    issue = Issue(
        title="Assigned Work Order",
        description="Ready for work to commence",
        scope="DEPARTMENT_ONLY",
        academic_department_id=department.id,
        service_trade="PLUMBING",
        priority="HIGH",
        status="ASSIGNED",
        reported_by_user_id=student_a.id,
        assigned_technician_id=technician_user.id,
        location_room_or_block="Room 104",
        sla_deadline=datetime.utcnow() + timedelta(hours=12),
    )
    db.add(issue)
    db.commit()

    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(technician_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "IN_PROGRESS"

    db.refresh(issue)
    assert issue.status == "IN_PROGRESS"


def test_full_workflow_submitted_to_assigned_to_in_progress(
    client, db, supervisor_user, technician_user, student_a, department
):
    """
    Test complete lifecycle:
    1. SUBMITTED ticket: Start work is blocked.
    2. Supervisor assigns technician: Status becomes ASSIGNED.
    3. Supervisor attempts to start work: Blocked with 403.
    4. Assigned technician starts work: Transitions to IN_PROGRESS.
    5. Assigned technician uploads proof: Transitions to RESOLVED.
    """
    from tests.conftest import _make_user

    unrelated_tech = _make_user(
        db,
        full_name="Unrelated Tech",
        email="unrelated@campus.edu",
        role="TECHNICIAN",
        dept_id=department.id,
        trade="CARPENTRY",
    )

    # 1. New ticket created by student
    issue = Issue(
        title="Busted Faucet in Lab 2",
        description="Continuous leak causing flooding",
        scope="DEPARTMENT_ONLY",
        academic_department_id=department.id,
        service_trade="PLUMBING",
        priority="HIGH",
        status="SUBMITTED",
        reported_by_user_id=student_a.id,
        location_room_or_block="Lab 202",
        sla_deadline=datetime.utcnow() + timedelta(hours=12),
    )
    db.add(issue)
    db.commit()
    assert issue.status == "SUBMITTED"
    assert issue.assigned_technician_id is None

    # 1a. Assigned technician tries to start work before assignment -> Blocked (400)
    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(technician_user),
    )
    assert resp.status_code == 400

    # 2. Supervisor assigns the ticket to technician_user
    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/assign",
        json={"assigned_technician_id": technician_user.id},
        headers=_auth_header(supervisor_user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ASSIGNED"
    assert data["assigned_to"] == technician_user.full_name

    db.refresh(issue)
    assert issue.status == "ASSIGNED"
    assert issue.assigned_technician_id == technician_user.id

    # 3. Supervisor tries to start work -> Blocked (403)
    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(supervisor_user),
    )
    assert resp.status_code == 403

    # 3b. Unrelated technician tries to start work -> Blocked (403)
    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(unrelated_tech),
    )
    assert resp.status_code == 403

    # 4. Assigned technician starts work -> Allowed (200)
    resp = client.put(
        f"/api/v1/staff/issues/{issue.id}/status",
        json={"status": "IN_PROGRESS"},
        headers=_auth_header(technician_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "IN_PROGRESS"

    db.refresh(issue)
    assert issue.status == "IN_PROGRESS"

    # 5. Assigned technician completes work and uploads proof -> Allowed (200)
    resp = client.post(
        f"/api/v1/staff/issues/{issue.id}/proof",
        data={
            "photo_url": "https://storage.college.edu/proofs/fixed_faucet_202.jpg",
            "photo_type": "AFTER_FIX",
            "resolution_note": "Replaced damaged washer and tightened valve stem",
        },
        headers=_auth_header(technician_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "RESOLVED"

    db.refresh(issue)
    assert issue.status == "RESOLVED"
    assert issue.resolution_proof_url == "https://storage.college.edu/proofs/fixed_faucet_202.jpg"

