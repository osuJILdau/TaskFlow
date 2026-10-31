
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def register_user():
    unique = uuid4().hex[:12]

    username = f"test_{unique}"
    password = "TestPassword123!"

    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": password,
        },
    )

    assert response.status_code == 201, response.text

    login = client.post(
        "/api/auth/login",
        data={
            "username": username,
            "password": password,
        },
    )

    assert login.status_code == 200, login.text

    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_tasks_require_authorization():
    response = client.get("/api/tasks")

    assert response.status_code == 401


def test_users_cannot_access_other_users_tasks():
    headers_a = register_user()
    headers_b = register_user()

    created = client.post(
        "/api/tasks",
        headers=headers_a,
        json={
            "title": "Личная задача пользователя A",
            "description": "Секретная задача",
            "priority": "high",
        },
    )

    assert created.status_code == 201, created.text

    task_id = created.json()["id"]

    # Пользователь A видит свою задачу.
    own_task = client.get(
        f"/api/tasks/{task_id}",
        headers=headers_a,
    )
    assert own_task.status_code == 200

    # Пользователь B не видит чужую задачу.
    other_task = client.get(
        f"/api/tasks/{task_id}",
        headers=headers_b,
    )
    assert other_task.status_code == 404

    # Чужая задача не появляется в общем списке B.
    other_list = client.get(
        "/api/tasks",
        headers=headers_b,
    )
    assert other_list.status_code == 200
    assert all(
        task["id"] != task_id
        for task in other_list.json()
    )

    # Пользователь B не может изменить чужую задачу.
    updated = client.put(
        f"/api/tasks/{task_id}",
        headers=headers_b,
        json={"title": "Попытка взлома"},
    )
    assert updated.status_code == 404

    # Пользователь B не может удалить чужую задачу.
    deleted = client.delete(
        f"/api/tasks/{task_id}",
        headers=headers_b,
    )
    assert deleted.status_code == 404

    # Проверяем, что задача осталась без изменений.
    original = client.get(
        f"/api/tasks/{task_id}",
        headers=headers_a,
    )
    assert original.status_code == 200
    assert original.json()["title"] == "Личная задача пользователя A"

    # Убираем созданную тестовую задачу.
    cleanup = client.delete(
        f"/api/tasks/{task_id}",
        headers=headers_a,
    )
    assert cleanup.status_code == 200
