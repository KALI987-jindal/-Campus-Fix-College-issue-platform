"""Test that public registration blocks privileged roles."""

import pytest


PRIVILEGED_ROLES = ["ADMIN", "SUPERVISOR", "HOD"]
ALLOWED_ROLES = ["STUDENT", "TEACHER", "TECHNICIAN"]


@pytest.mark.parametrize("role", PRIVILEGED_ROLES)
def test_register_privileged_role_blocked(client, department, role):
    """Attempting to self-register as ADMIN / SUPERVISOR / HOD must fail."""
    resp = client.post("/api/v1/auth/register", json={
        "full_name": "Bad Actor",
        "email": f"bad_{role.lower()}@evil.com",
        "password": "hackme123",
        "role": role,
        "academic_department_id": department.id,
    })
    assert resp.status_code == 400, f"Expected 400 for role {role}, got {resp.status_code}"
    assert "cannot be self-registered" in resp.json()["detail"]


@pytest.mark.parametrize("role", ALLOWED_ROLES)
def test_register_allowed_role_succeeds(client, department, role):
    """STUDENT, TEACHER, and TECHNICIAN can self-register."""
    payload = {
        "full_name": f"Test {role.title()}",
        "email": f"test_{role.lower()}@campus.edu",
        "password": "strongpassword123",
        "role": role,
        "academic_department_id": department.id,
    }
    if role == "TECHNICIAN":
        payload["trade_specialty"] = "PLUMBING"

    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 200, f"Expected 200 for role {role}, got {resp.status_code}: {resp.text}"
    body = resp.json()
    assert body["role"] == role
    assert "access_token" in body


def test_register_case_insensitive_role_block(client, department):
    """Role check should be case-insensitive — 'admin' should also be blocked."""
    resp = client.post("/api/v1/auth/register", json={
        "full_name": "Sneaky",
        "email": "sneaky@evil.com",
        "password": "hackme123",
        "role": "admin",  # lowercase
        "academic_department_id": department.id,
    })
    assert resp.status_code == 400


def test_register_duplicate_email_blocked(client, department):
    """Registering twice with the same email should fail."""
    payload = {
        "full_name": "First",
        "email": "dup@campus.edu",
        "password": "pass123",
        "role": "STUDENT",
        "academic_department_id": department.id,
    }
    resp1 = client.post("/api/v1/auth/register", json=payload)
    assert resp1.status_code == 200

    resp2 = client.post("/api/v1/auth/register", json=payload)
    assert resp2.status_code == 400
    assert "already registered" in resp2.json()["detail"]
