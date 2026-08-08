import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI

os.environ.setdefault("VISION_MODE", "lite")
os.environ.pop("API_TOKEN", None)
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("QDRANT_URL", None)

from main import app, lifespan


@pytest.mark.asyncio
async def test_lifespan_initializes_services_independently():
    test_app = FastAPI()
    rag = AsyncMock()
    rag.__aenter__.return_value = rag
    vision = MagicMock(device="cpu-lite", backend_name="OpenCV lite")

    with patch("main.RAGManager", return_value=rag), patch(
        "main.VisionPipeline",
        return_value=vision,
    ):
        async with lifespan(test_app):
            assert test_app.state.rag_engine is rag
            assert test_app.state.vision_pipeline is vision
            assert test_app.state.startup_errors == []

    rag.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_lifespan_keeps_vision_when_rag_fails():
    test_app = FastAPI()
    rag = AsyncMock()
    rag.__aenter__.side_effect = RuntimeError("database unavailable")
    vision = MagicMock(device="cpu-lite", backend_name="OpenCV lite")

    with patch("main.RAGManager", return_value=rag), patch(
        "main.VisionPipeline",
        return_value=vision,
    ):
        async with lifespan(test_app):
            assert test_app.state.rag_engine is None
            assert test_app.state.vision_pipeline is vision
            assert "RAG initialization failed" in test_app.state.startup_errors[0]


@pytest.mark.asyncio
async def test_cors_preflight_policy():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        allowed = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        denied = await client.options(
            "/health",
            headers={
                "Origin": "http://evil.example",
                "Access-Control-Request-Method": "GET",
            },
        )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert denied.status_code == 400


@pytest.mark.asyncio
async def test_health_reports_component_state():
    app.state.vision_pipeline = SimpleNamespace(
        backend_name="OpenCV lite",
        device="cpu-lite",
        fallback_reason=None,
    )
    app.state.rag_engine = SimpleNamespace(
        capabilities={
            "vector_memory": False,
            "generative_narration": False,
            "local_narration": True,
        }
    )
    app.state.startup_errors = []
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["vision"]["mode"] == "OpenCV lite"
    assert body["rag"]["local_narration"] is True
