from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import db
from backend.app.main import app

db.init_db()
client = TestClient(app)


def auth_headers(role: str = "project_lead") -> dict[str, str]:
    credentials = {
        "project_lead": {"email": "lider@trycore.com", "password": "lider123"},
        "viewer": {"email": "viewer@trycore.com", "password": "viewer123"},
    }
    login_response = client.post("/api/auth/login", json=credentials[role])
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_and_get_project():
    headers = auth_headers("project_lead")
    payload = {
        "name": f"Contract Project {uuid4().hex[:8]}",
        "description": "Project for contract tests",
        "status": "active",
    }
    create_response = client.post("/api/projects", json=payload, headers=headers)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == payload["name"]
    assert created["description"] == payload["description"]
    assert created["status"] == payload["status"]
    assert "id" in created

    detail_response = client.get(f"/api/projects/{created['id']}", headers=headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == created["id"]
    assert detail["name"] == payload["name"]


def test_create_and_update_activity():
    headers = auth_headers("project_lead")
    project_payload = {
        "name": f"Activity Project {uuid4().hex[:8]}",
        "description": "Project for activity tests",
    }
    project_response = client.post("/api/projects", json=project_payload, headers=headers)
    project_id = project_response.json()["id"]

    activity_payload = {
        "project_id": project_id,
        "name": "Write tests",
        "description": "Add integration tests for HTTP contracts",
        "kind": "test",
        "status": "pending",
    }

    create_activity_response = client.post("/api/activities", json=activity_payload, headers=headers)
    assert create_activity_response.status_code == 201
    activity = create_activity_response.json()
    assert activity["name"] == activity_payload["name"]
    assert activity["project_id"] == project_id

    update_payload = {"status": "done", "description": "Integration tests complete"}
    update_response = client.patch(f"/api/activities/{activity['id']}", json=update_payload, headers=headers)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["status"] == "done"
    assert updated["description"] == "Integration tests complete"


def test_calculate_evm_metrics():
    headers = auth_headers("viewer")
    payload = {
        "planned_value": 100.0,
        "earned_value": 90.0,
        "actual_cost": 80.0,
        "budget_at_completion": 120.0,
    }

    response = client.post("/api/evm/calculate", json=payload, headers=headers)
    assert response.status_code == 200
    result = response.json()
    assert result["pv"] == 100.0
    assert result["ev"] == 90.0
    assert result["ac"] == 80.0
    assert result["cpi"] == 1.125
    assert result["spi"] == 0.9


def test_viewer_cannot_mutate_projects():
    headers = auth_headers("viewer")
    payload = {
        "name": f"Forbidden Project {uuid4().hex[:8]}",
        "description": "Should fail",
        "status": "active",
    }

    response = client.post("/api/projects", json=payload, headers=headers)
    assert response.status_code == 403


def test_rename_and_delete_project():
    headers = auth_headers("project_lead")
    payload = {
        "name": f"Rename Project {uuid4().hex[:8]}",
        "description": "Project to rename",
        "status": "active",
    }

    create_response = client.post("/api/projects", json=payload, headers=headers)
    assert create_response.status_code == 201
    project_id = create_response.json()["id"]

    new_name = f"Renamed Project {uuid4().hex[:8]}"
    rename_response = client.patch(
        f"/api/projects/{project_id}",
        json={"name": new_name},
        headers=headers,
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["name"] == new_name

    delete_response = client.delete(f"/api/projects/{project_id}", headers=headers)
    assert delete_response.status_code == 200

    detail_response = client.get(f"/api/projects/{project_id}", headers=headers)
    assert detail_response.status_code == 404


def test_delete_activity_and_viewer_forbidden_delete():
    lead_headers = auth_headers("project_lead")
    viewer_headers = auth_headers("viewer")

    project_payload = {
        "name": f"Delete Activity Project {uuid4().hex[:8]}",
        "description": "Project for delete activity",
    }
    project_response = client.post("/api/projects", json=project_payload, headers=lead_headers)
    assert project_response.status_code == 201
    project_id = project_response.json()["id"]

    activity_payload = {
        "project_id": project_id,
        "name": "Disposable Activity",
        "description": "Will be deleted",
        "kind": "test",
        "status": "pending",
    }
    create_activity_response = client.post("/api/activities", json=activity_payload, headers=lead_headers)
    assert create_activity_response.status_code == 201
    activity_id = create_activity_response.json()["id"]

    viewer_delete = client.delete(f"/api/activities/{activity_id}", headers=viewer_headers)
    assert viewer_delete.status_code == 403

    lead_delete = client.delete(f"/api/activities/{activity_id}", headers=lead_headers)
    assert lead_delete.status_code == 200
