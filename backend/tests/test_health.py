"""Test the /api/v1/health and / endpoints."""


def test_root_endpoint(client):
    """Root endpoint should be publicly reachable and return app metadata."""
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["app"] == "CampusFix API"
    assert body["status"] == "online"


def test_health_endpoint(client, student_a):
    """Health endpoint should return status=healthy and SLA-breach metrics."""
    from tests.conftest import _auth_header
    resp = client.get("/api/v1/health", headers=_auth_header(student_a))
    # Health endpoint uses Depends(get_db) but no auth, so try without auth too
    resp2 = client.get("/api/v1/health")
    # At least one should succeed
    for r in (resp, resp2):
        if r.status_code == 200:
            body = r.json()
            assert body["status"] == "healthy"
            assert "sla_breached_updated_count" in body
            return
    # If both fail, the health endpoint itself might require auth.
    # In our code it uses get_db but NOT get_current_user, so it should be 200.
    assert False, f"Health endpoint failed: {resp.status_code}, {resp2.status_code}"
