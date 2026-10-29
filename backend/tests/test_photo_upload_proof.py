"""
Isolated Unit & Integration Tests for Technician Proof-of-Work Photo Upload Workflow.
Tests:
- Valid image uploads (.jpg, .png, .webp)
- Invalid extension rejection
- Magic bytes content signature verification
- File size boundary checks (> 10 MB rejected with 413)
- Empty file handling
- Authentication enforcement on upload and proof endpoints
- Role and technician task assignment authorization
- Issue state transitions, ProofPhoto persistence, and audit logging
"""

import io
import pytest
from datetime import datetime, timedelta
from app.models.issue import Issue
from app.models.interactions import ProofPhoto, Comment
from tests.conftest import _auth_header, _make_user


# Sample valid image byte headers (magic bytes)
VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 100
VALID_PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00" + b"\x00" * 100
VALID_WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00\x30\x01\x00\x9d\x01\x2a\x01\x00\x01\x00" + b"\x00" * 100


@pytest.fixture(autouse=True)
def isolate_upload_directory(tmp_path, monkeypatch):
    """Ensure all test uploads write strictly to a temporary test directory."""
    monkeypatch.setattr("app.main.UPLOAD_DIR", tmp_path)
    return tmp_path


@pytest.fixture()
def technician_b(db, department):
    """Second technician for cross-assignment authorization tests."""
    return _make_user(
        db,
        full_name="Tech Electrician",
        email="electrician@campus.edu",
        role="TECHNICIAN",
        dept_id=department.id,
        trade="ELECTRICAL"
    )


@pytest.fixture()
def sample_issue(db, department, student_a, technician_user):
    """Create a sample issue assigned to technician_user."""
    issue = Issue(
        title="Burst Pipe in 2nd Floor Washroom",
        description="Water spraying across floor",
        scope="DEPARTMENT_ONLY",
        academic_department_id=department.id,
        service_trade="PLUMBING",
        priority="HIGH",
        status="IN_PROGRESS",
        reported_by_user_id=student_a.id,
        assigned_technician_id=technician_user.id,
        location_room_or_block="Block A, Room 204",
        sla_deadline=datetime.utcnow() + timedelta(hours=6),
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


# ── 1. POST /api/v1/uploads Tests ────────────────────────────────────────────

def test_upload_valid_jpeg(client, technician_user):
    """Uploading a valid JPEG must succeed with 200 and return a valid URL."""
    files = {"file": ("repaired_pipe.jpg", io.BytesIO(VALID_JPEG_BYTES), "image/jpeg")}
    resp = client.post("/api/v1/uploads", files=files, headers=_auth_header(technician_user))
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"].endswith(".jpg")
    assert data["url"].startswith("/uploads/")


def test_upload_valid_png(client, technician_user):
    """Uploading a valid PNG must succeed with 200."""
    files = {"file": ("fix_proof.png", io.BytesIO(VALID_PNG_BYTES), "image/png")}
    resp = client.post("/api/v1/uploads", files=files, headers=_auth_header(technician_user))
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"].endswith(".png")
    assert data["url"].startswith("/uploads/")


def test_upload_valid_webp(client, technician_user):
    """Uploading a valid WEBP must succeed with 200."""
    files = {"file": ("fix_proof.webp", io.BytesIO(VALID_WEBP_BYTES), "image/webp")}
    resp = client.post("/api/v1/uploads", files=files, headers=_auth_header(technician_user))
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"].endswith(".webp")
    assert data["url"].startswith("/uploads/")


def test_upload_unauthenticated_blocked(client):
    """Uploading without an auth token must be rejected with 401."""
    files = {"file": ("proof.jpg", io.BytesIO(VALID_JPEG_BYTES), "image/jpeg")}
    resp = client.post("/api/v1/uploads", files=files)
    assert resp.status_code == 401


def test_upload_invalid_extension_blocked(client, technician_user):
    """Uploading executable or text extensions must be rejected with 400."""
    files = {"file": ("malicious.exe", io.BytesIO(b"MZ\x90\x00" + b"\x00" * 50), "application/octet-stream")}
    resp = client.post("/api/v1/uploads", files=files, headers=_auth_header(technician_user))
    assert resp.status_code == 400
    assert "Invalid file type" in resp.json()["detail"]


def test_upload_magic_bytes_mismatch_blocked(client, technician_user):
    """A text file disguised with a .png extension must be rejected with 400."""
    fake_png = b"This is plain text disguised as a picture"
    files = {"file": ("fake_picture.png", io.BytesIO(fake_png), "image/png")}
    resp = client.post("/api/v1/uploads", files=files, headers=_auth_header(technician_user))
    assert resp.status_code == 400
    assert "magic" in resp.json()["detail"] or "signature" in resp.json()["detail"]


def test_upload_empty_file_blocked(client, technician_user):
    """Uploading an empty 0-byte file must be rejected with 400."""
    files = {"file": ("empty.jpg", io.BytesIO(b""), "image/jpeg")}
    resp = client.post("/api/v1/uploads", files=files, headers=_auth_header(technician_user))
    assert resp.status_code == 400
    assert "empty" in resp.json()["detail"].lower()


def test_upload_oversized_file_blocked(client, technician_user):
    """Uploading a file exceeding 10 MB must be rejected with 413 Payload Too Large."""
    # 10 MB + 1024 bytes with valid JPEG magic header
    oversized_bytes = VALID_JPEG_BYTES[:4] + b"\x00" * (10 * 1024 * 1024 + 1024)
    files = {"file": ("huge_image.jpg", io.BytesIO(oversized_bytes), "image/jpeg")}
    resp = client.post("/api/v1/uploads", files=files, headers=_auth_header(technician_user))
    assert resp.status_code == 413
    assert "exceeds" in resp.json()["detail"].lower()


# ── 2. POST /api/v1/staff/issues/{issue_id}/proof Tests ───────────────────────

def test_proof_unauthenticated_blocked(client, sample_issue):
    """Submitting proof without authentication must return 401."""
    data = {"photo_url": "/uploads/test.jpg", "resolution_note": "Done"}
    resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data)
    assert resp.status_code == 401


def test_proof_unauthorized_roles_blocked(client, sample_issue, student_a, teacher_same_dept, hod_user):
    """STUDENT, TEACHER, and HOD roles must be forbidden from submitting technician proof."""
    data = {"photo_url": "/uploads/test.jpg", "resolution_note": "Attempt by non-tech"}
    for user in [student_a, teacher_same_dept, hod_user]:
        resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data, headers=_auth_header(user))
        assert resp.status_code == 403, f"Expected 403 for role {user.role}, got {resp.status_code}"


def test_proof_non_existent_issue(client, technician_user):
    """Submitting proof for a non-existent issue ID must return 404."""
    data = {"photo_url": "/uploads/test.jpg", "resolution_note": "Done"}
    resp = client.post("/api/v1/staff/issues/999999/proof", data=data, headers=_auth_header(technician_user))
    assert resp.status_code == 404


def test_proof_empty_photo_url_blocked(client, sample_issue, technician_user):
    """Submitting proof with an empty photo URL must return 400."""
    data = {"photo_url": "   ", "resolution_note": "No photo URL"}
    resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data, headers=_auth_header(technician_user))
    assert resp.status_code == 400


def test_proof_wrong_technician_blocked(client, sample_issue, technician_b):
    """Technician B cannot submit proof for a ticket assigned specifically to Technician A."""
    data = {"photo_url": "/uploads/proof.jpg", "resolution_note": "Done by wrong tech"}
    resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data, headers=_auth_header(technician_b))
    assert resp.status_code == 403
    assert "different technician" in resp.json()["detail"].lower()


def test_proof_wrong_trade_unassigned_blocked(client, db, department, student_a, technician_b):
    """Technician B (Electrician) cannot resolve an unassigned PLUMBING issue."""
    unassigned_plumbing = Issue(
        title="Unassigned Leaking Valve",
        description="Valve leaking",
        scope="DEPARTMENT_ONLY",
        academic_department_id=department.id,
        service_trade="PLUMBING",
        priority="MEDIUM",
        status="SUBMITTED",
        reported_by_user_id=student_a.id,
        location_room_or_block="Block B",
        sla_deadline=datetime.utcnow() + timedelta(hours=12),
    )
    db.add(unassigned_plumbing)
    db.commit()

    data = {"photo_url": "/uploads/proof.jpg", "resolution_note": "Electrician doing plumbing"}
    resp = client.post(f"/api/v1/staff/issues/{unassigned_plumbing.id}/proof", data=data, headers=_auth_header(technician_b))
    assert resp.status_code == 403
    assert "requires trade" in resp.json()["detail"].lower()


def test_proof_assigned_technician_success(client, db, sample_issue, technician_user):
    """Assigned technician submits proof: status becomes RESOLVED, ProofPhoto & Comment are created."""
    data = {
        "photo_url": "/uploads/fixed_pipe_001.jpg",
        "resolution_note": "Replaced cracked gasket and tightened fitting"
    }
    resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data, headers=_auth_header(technician_user))
    assert resp.status_code == 200
    res = resp.json()
    assert res["status"] == "RESOLVED"
    assert res["proof_url"] == "/uploads/fixed_pipe_001.jpg"

    # Verify database state in isolated session
    db.refresh(sample_issue)
    assert sample_issue.status == "RESOLVED"
    assert sample_issue.resolution_proof_url == "/uploads/fixed_pipe_001.jpg"
    assert sample_issue.resolution_note == "Replaced cracked gasket and tightened fitting"
    assert sample_issue.resolved_at is not None

    # Check ProofPhoto record
    photo = db.query(ProofPhoto).filter(ProofPhoto.issue_id == sample_issue.id).first()
    assert photo is not None
    assert photo.photo_url == "/uploads/fixed_pipe_001.jpg"
    assert photo.uploaded_by_user_id == technician_user.id

    # Check Audit Log Comment
    comment = db.query(Comment).filter(Comment.issue_id == sample_issue.id).order_by(Comment.id.desc()).first()
    assert comment is not None
    assert "REPAIRED & RESOLVED" in comment.message


def test_proof_supervisor_override_success(client, db, sample_issue, supervisor_user):
    """Supervisor can submit proof and resolve any issue."""
    data = {"photo_url": "/uploads/supervisor_verified.jpg", "resolution_note": "Supervisor signed off fix"}
    resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data, headers=_auth_header(supervisor_user))
    assert resp.status_code == 200
    db.refresh(sample_issue)
    assert sample_issue.status == "RESOLVED"


def test_proof_admin_override_success(client, db, sample_issue, admin_user):
    """Admin can submit proof and resolve any issue."""
    data = {"photo_url": "/uploads/admin_override.jpg", "resolution_note": "Admin override resolution"}
    resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data, headers=_auth_header(admin_user))
    assert resp.status_code == 200
    db.refresh(sample_issue)
    assert sample_issue.status == "RESOLVED"


def test_proof_already_closed_issue_blocked(client, db, sample_issue, technician_user):
    """Attempting to submit proof for an issue that is already CLOSED must return 400."""
    sample_issue.status = "CLOSED"
    db.commit()

    data = {"photo_url": "/uploads/too_late.jpg", "resolution_note": "Attempt to edit closed issue"}
    resp = client.post(f"/api/v1/staff/issues/{sample_issue.id}/proof", data=data, headers=_auth_header(technician_user))
    assert resp.status_code == 400
    assert "already closed" in resp.json()["detail"].lower()

