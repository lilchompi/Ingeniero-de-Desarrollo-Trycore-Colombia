from fastapi.testclient import TestClient

from backend.app import db
from backend.app.main import app

db.init_db()
client = TestClient(app)


def test_create_and_get_project():
    payload = {"name": "Contract Project", "description": "Project for contract tests", "status": "active"}
    create_response = client.post("/api/projects", json=payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == payload["name"]
    assert created["description"] == payload["description"]
    assert created["status"] == payload["status"]
    assert "id" in created

    detail_response = client.get(f"/api/projects/{created['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == created["id"]
    assert detail["name"] == payload["name"]


def test_create_and_update_activity():
    project_payload = {"name": "Activity Project", "description": "Project for activity tests"}
    project_response = client.post("/api/projects", json=project_payload)
    project_id = project_response.json()["id"]

    activity_payload = {
        "project_id": project_id,
        "name": "Write tests",
        "description": "Add integration tests for HTTP contracts",
        "kind": "test",
        "status": "pending",
    }

    create_activity_response = client.post("/api/activities", json=activity_payload)
    assert create_activity_response.status_code == 201
    activity = create_activity_response.json()
    assert activity["name"] == activity_payload["name"]
    assert activity["project_id"] == project_id

    update_payload = {"status": "done", "description": "Integration tests complete"}
    update_response = client.patch(f"/api/activities/{activity['id']}", json=update_payload)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["status"] == "done"
    assert updated["description"] == "Integration tests complete"


def test_calculate_evm_metrics():
    payload = {
        "planned_value": 100.0,
        "earned_value": 90.0,
        "actual_cost": 80.0,
        "budget_at_completion": 120.0,
    }

    response = client.post("/api/evm/calculate", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result["pv"] == 100.0
    assert result["ev"] == 90.0
    assert result["ac"] == 80.0
    assert result["cpi"] == 1.125
    assert result["spi"] == 0.9
