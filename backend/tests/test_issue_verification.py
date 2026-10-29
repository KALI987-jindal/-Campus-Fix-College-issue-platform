"""
Test issue verification authorization.

Rules under test:
  - The original reporter can ACCEPT or REOPEN their own issue.
  - A teacher in the SAME department can verify (faculty sign-off workflow).
  - A teacher in a DIFFERENT department CANNOT verify.
  - An unrelated student CANNOT verify another student's issue.
  - ADMIN and SUPERVISOR can always verify (administrative override).
"""

import pytest
from app.models.issue import Issue
from tests.conftest import _auth_header


def _create_resolved_issue(db, *, reporter_id, dept_id):
    """Insert a RESOLVED issue directly into the DB."""
    from datetime import datetime, timedelta
    issue = Issue(
        title="Broken AC",
        description="AC not working in room 201",
        scope="DEPARTMENT_ONLY",
        academic_department_id=dept_id,
        service_trade="ELECTRICAL",
        priority="MEDIUM",
        status="RESOLVED",
        reported_by_user_id=reporter_id,
        location_room_or_block="Block A, Room 201",
        sla_deadline=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


class TestVerifyAsReporter:
    """The original reporter can accept or reopen."""

    def test_reporter_accept(self, client, db, student_a, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "ACCEPT", "star_rating": 5, "feedback_comment": "Great job!"},
            headers=_auth_header(student_a),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "CLOSED"

    def test_reporter_reopen(self, client, db, student_a, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "REOPEN", "feedback_comment": "Still broken"},
            headers=_auth_header(student_a),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "REOPENED"


class TestVerifyDeniedForUnrelatedStudent:
    """An unrelated student must NOT be able to verify another user's issue."""

    def test_other_student_cannot_accept(self, client, db, student_a, student_b, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "ACCEPT", "star_rating": 4},
            headers=_auth_header(student_b),  # NOT the reporter
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"

    def test_other_student_cannot_reopen(self, client, db, student_a, student_b, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "REOPEN", "feedback_comment": "not my issue"},
            headers=_auth_header(student_b),
        )
        assert resp.status_code == 403


class TestVerifyFacultySignOff:
    """Same-dept teacher can verify; different-dept teacher cannot."""

    def test_same_dept_teacher_can_verify(self, client, db, student_a, teacher_same_dept, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "ACCEPT", "star_rating": 5},
            headers=_auth_header(teacher_same_dept),
        )
        assert resp.status_code == 200

    def test_other_dept_teacher_blocked(self, client, db, student_a, teacher_other_dept, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "ACCEPT", "star_rating": 3},
            headers=_auth_header(teacher_other_dept),
        )
        assert resp.status_code == 403


class TestVerifyAdminOverride:
    """ADMIN and SUPERVISOR can always verify."""

    def test_admin_can_verify(self, client, db, student_a, admin_user, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "ACCEPT", "star_rating": 5},
            headers=_auth_header(admin_user),
        )
        assert resp.status_code == 200

    def test_supervisor_can_verify(self, client, db, student_a, supervisor_user, department):
        issue = _create_resolved_issue(db, reporter_id=student_a.id, dept_id=department.id)
        resp = client.post(
            f"/api/v1/issues/{issue.id}/verify",
            json={"action": "ACCEPT", "star_rating": 4},
            headers=_auth_header(supervisor_user),
        )
        assert resp.status_code == 200
