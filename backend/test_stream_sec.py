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
    websocket.headers = {'origin': 'http://localhost:3000'}
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
    websocket.headers = {'origin': 'http://localhost:3000'}
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

@pytest.mark.asyncio
async def test_origin_header_log_injection_is_prevented(caplog):
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
        max_payload_bytes=1024,
    )
    websocket = AsyncMock()
    websocket.query_params = {}
    websocket.headers = {'origin': 'http://evil.com\r\nInjected-Log: true'}
    websocket.app = SimpleNamespace(
        state=SimpleNamespace(
            settings=settings,
            vision_pipeline=MagicMock(),
            rag_engine=None,
        )
    )

    await websocket_stream(websocket)

    websocket.accept.assert_not_awaited()
    websocket.close.assert_awaited_once_with(
        code=1008,
        reason="Origin not allowed",
    )

    assert "Rejected WebSocket origin: http://evil.comInjected-Log: true" in caplog.text
    # Note: caplog.text appends a newline to each log record, but we only care about newlines within our logged string.
    assert "\nInjected-Log" not in caplog.text
    assert "\r" not in caplog.text
