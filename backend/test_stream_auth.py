from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import status

from app.api.stream import origin_is_allowed, token_is_valid, websocket_stream
from app.core.config import Settings


def make_settings(**changes) -> Settings:
    base = Settings(
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
    return replace(base, **changes)


def test_token_and_origin_policy_helpers():
    assert token_is_valid(None, None)
    assert token_is_valid("correct", "correct")
    assert not token_is_valid(None, "correct")
    assert not token_is_valid("wrong", "correct")
    assert origin_is_allowed(None, ("http://localhost:3000",))
    assert origin_is_allowed("https://example.com", ("*",))
    assert not origin_is_allowed("https://evil.example", ("https://example.com",))


@pytest.mark.asyncio
async def test_websocket_rejects_invalid_token():
    websocket = AsyncMock()
    websocket.query_params = {"token": "wrong"}
    websocket.headers = {}
    websocket.app = SimpleNamespace(
        state=SimpleNamespace(
            settings=make_settings(api_token="correct"),
            vision_pipeline=MagicMock(),
            rag_engine=None,
        )
    )

    await websocket_stream(websocket)

    websocket.accept.assert_not_awaited()
    websocket.close.assert_awaited_once_with(
        code=status.WS_1008_POLICY_VIOLATION,
        reason="Invalid token",
    )


@pytest.mark.asyncio
async def test_websocket_rejects_disallowed_origin():
    websocket = AsyncMock()
    websocket.query_params = {}
    websocket.headers = {"origin": "https://evil.example"}
    websocket.app = SimpleNamespace(
        state=SimpleNamespace(
            settings=make_settings(),
            vision_pipeline=MagicMock(),
            rag_engine=None,
        )
    )

    await websocket_stream(websocket)

    websocket.close.assert_awaited_once_with(
        code=status.WS_1008_POLICY_VIOLATION,
        reason="Origin not allowed",
    )
