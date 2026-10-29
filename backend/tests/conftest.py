"""
Shared fixtures for CampusFix Phase-1 tests.

Uses an isolated in-memory SQLite database so the real campus_fix.db
is never touched.
"""

import os, sys

# ── Set a test SECRET_KEY before anything imports app.config ──────────────
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci-only-do-not-use-in-prod")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.department import Department
from app.services.auth_service import hash_password, create_access_token

# ── In-memory SQLite engine ──────────────────────────────────────────────
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


@pytest.fixture(autouse=True)
def _setup_db():
    """Create all tables before each test, drop afterwards."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture()
def db():
    """Yield a fresh DB session for direct model manipulation in tests."""
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    """FastAPI TestClient wired to the in-memory database."""
    from fastapi.testclient import TestClient

    def _override_get_db():
        try:
            yield db
        finally:
            pass  # session is closed by the `db` fixture

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Helper: seed a department ────────────────────────────────────────────
@pytest.fixture()
def department(db):
    dept = Department(name="Computer Science & Engineering", code="CSE", building_name="Block A")
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@pytest.fixture()
def department_b(db):
    """A second department for cross-department tests."""
    dept = Department(name="Mechanical Engineering", code="ME", building_name="Block B")
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


# ── Helper: seed users & get auth headers ────────────────────────────────
def _make_user(db, *, full_name, email, role, dept_id=None, trade=None):
    user = User(
        full_name=full_name,
        email=email,
        hashed_password=hash_password("password123"),
        role=role,
        academic_department_id=dept_id,
        trade_specialty=trade,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_header(user):
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def student_a(db, department):
    return _make_user(db, full_name="Student A", email="stud_a@campus.edu",
                      role="STUDENT", dept_id=department.id)


@pytest.fixture()
def student_b(db, department):
    return _make_user(db, full_name="Student B", email="stud_b@campus.edu",
                      role="STUDENT", dept_id=department.id)


@pytest.fixture()
def teacher_same_dept(db, department):
    return _make_user(db, full_name="Teacher CSE", email="teach_cse@campus.edu",
                      role="TEACHER", dept_id=department.id)


@pytest.fixture()
def teacher_other_dept(db, department_b):
    return _make_user(db, full_name="Teacher ME", email="teach_me@campus.edu",
                      role="TEACHER", dept_id=department_b.id)


@pytest.fixture()
def admin_user(db, department):
    return _make_user(db, full_name="Admin", email="admin@campus.edu",
                      role="ADMIN", dept_id=department.id)


@pytest.fixture()
def supervisor_user(db, department):
    return _make_user(db, full_name="Super", email="super@campus.edu",
                      role="SUPERVISOR", dept_id=department.id)


@pytest.fixture()
def technician_user(db, department):
    return _make_user(db, full_name="Tech Plumber", email="tech@campus.edu",
                      role="TECHNICIAN", dept_id=department.id, trade="PLUMBING")
