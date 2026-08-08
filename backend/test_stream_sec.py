from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.stream import websocket_stream
from app.core.config import Settings


@pytest.mark.asyncio
async def test_large_payload_is_rejected():
    settings = Settings(
        app_name="test",
        vision_mode="lite",
        vision_model="model.pt",
        api_token=None,
        allowed_origins=("http://localhost:3000",),
        qdrant_url=None,
        qdrant_api_key=None,
        gemini_api_key=None,
        gemini_model="gemini-test",
        rag_strict=False,
        synthesis_interval_seconds=4.0,
        max_payload_bytes=16,
    )
    websocket = AsyncMock()
    websocket.query_params = {}
    websocket.headers = {}
    websocket.receive_bytes.return_value = b"x" * 17
    websocket.app = SimpleNamespace(
        state=SimpleNamespace(
            settings=settings,
            vision_pipeline=MagicMock(),
            rag_engine=None,
        )
    )

    await websocket_stream(websocket)

    websocket.accept.assert_awaited_once()
    websocket.close.assert_awaited_once_with(code=1009, reason="Message too big")


@pytest.mark.asyncio
async def test_unavailable_pipeline_is_rejected_before_accept():
    settings = Settings.from_env()
    websocket = AsyncMock()
    websocket.query_params = {}
    websocket.headers = {}
    websocket.app = SimpleNamespace(
        state=SimpleNamespace(
            settings=settings,
            vision_pipeline=None,
            rag_engine=None,
        )
    )

    await websocket_stream(websocket)

    websocket.accept.assert_not_awaited()
    websocket.close.assert_awaited_once_with(
        code=1013,
        reason="Vision pipeline unavailable",
    )
