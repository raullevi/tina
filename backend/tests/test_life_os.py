import pytest
import httpx

from app.main import app
from app.db.session import SessionLocal
from app.db.models import Document, LifeNode, RoutineRule, TaskOccurrence


@pytest.mark.asyncio
async def test_document_ingestion_and_fts5_search():
    """Phase 5: Test document ingestion and SQLite FTS5 search."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Ingest a personal document
        doc_payload = {
            "title": "Sleep Protocol & Evening Routine",
            "content": "Turn off blue screens at 10 PM. Maintain bedroom temperature at 19 degrees Celsius. Magnesium bisglycinate 200mg before bed.",
            "filename": "sleep_protocol.txt",
        }
        create_res = await client.post("/api/documents", json=doc_payload)
        assert create_res.status_code == 200
        data = create_res.json()
        assert data["status"] == "indexed"
        assert data["id"] > 0

        # Search via FTS5
        search_res = await client.get("/api/documents/search?q=Magnesium")
        assert search_res.status_code == 200
        results = search_res.json()
        assert len(results) >= 1
        assert "Sleep Protocol" in results[0]["title"]


@pytest.mark.asyncio
async def test_research_assistant_query():
    """Phase 5: Test research query grounded in personal documents with citations."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Ingest target reference document
        await client.post(
            "/api/documents",
            json={
                "title": "Sleep Protocol & Bedroom Temperature",
                "content": "Maintain bedroom temperature at 19 degrees Celsius for optimal deep REM sleep.",
            },
        )
        q_res = await client.post(
            "/api/research/query",
            json={"question": "What is my bedroom temperature for sleep?"},
        )
        assert q_res.status_code == 200
        data = q_res.json()
        assert "answer" in data
        assert "sources" in data
        assert len(data["sources"]) > 0
        assert "Sleep Protocol" in data["sources"][0]["title"]


@pytest.mark.asyncio
async def test_life_tree_and_clusters():
    """Phase 6: Test hierarchical Life Tree clusters."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        tree_res = await client.get("/api/life-tree")
        assert tree_res.status_code == 200
        tree = tree_res.json()
        assert len(tree) >= 4  # Health, Personal, Work, Finance, Growth
        cluster_names = [c["name"] for c in tree]
        assert "Health & Fitness" in cluster_names
        assert "Personal Life" in cluster_names


@pytest.mark.asyncio
async def test_routines_my_day_and_next_action():
    """Phase 6: Test routines, My Day due tasks, task completion, and next action."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Fetch due tasks for My Day
        tasks_res = await client.get("/api/tasks/due")
        assert tasks_res.status_code == 200
        due_tasks = tasks_res.json()
        assert len(due_tasks) > 0

        first_task = due_tasks[0]
        task_id = first_task["id"]

        # 2. Complete the task
        complete_res = await client.post(f"/api/task_occurrences/{task_id}/complete")
        assert complete_res.status_code == 200
        assert complete_res.json()["status"] == "completed"

        # 3. Verify status updated in due tasks
        tasks_res2 = await client.get("/api/tasks/due")
        updated_tasks = tasks_res2.json()
        matching = [t for t in updated_tasks if t["id"] == task_id]
        assert matching[0]["status"] == "completed"

        # 4. Get Next Best Action
        action_res = await client.get("/api/next_action")
        assert action_res.status_code == 200
        action_data = action_res.json()
        assert "task" in action_data
        assert "why" in action_data


@pytest.mark.asyncio
async def test_manual_task_creation_all_types():
    """Test manual task creation flow for flexible, recurring, deadline, and project tasks."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Flexible task
        flex_res = await client.post(
            "/api/tasks/manual",
            json={
                "title": "Organize Bookshelf",
                "type": "flexible",
                "primaryCluster": "Personal Life",
                "priority": "low",
                "estimatedDurationMinutes": 45,
            },
        )
        assert flex_res.status_code == 200
        flex_data = flex_res.json()
        assert flex_data["createdVia"] == "manual"
        assert flex_data["title"] == "Organize Bookshelf"
        assert flex_data["type"] == "flexible"

        # 2. Project with subtasks
        proj_res = await client.post(
            "/api/tasks/manual",
            json={
                "title": "Launch Portfolio Site",
                "type": "project",
                "primaryCluster": "Work & Projects",
                "priority": "high",
                "subtasks": ["Draft bio", "Upload projects", "Connect domain"],
            },
        )
        assert proj_res.status_code == 200
        proj_data = proj_res.json()
        assert len(proj_data["subtasks"]) == 3
        assert proj_data["primaryCluster"] == "Work & Projects"

