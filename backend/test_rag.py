from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import Settings
from app.core.rag_engine import RAGManager


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


@pytest.mark.asyncio
async def test_rag_lifecycle_and_indexing():
    qdrant = AsyncMock()
    qdrant.get_collections.return_value = SimpleNamespace(collections=[])
    gemini = MagicMock()

    with patch("app.core.rag_engine.AsyncQdrantClient", return_value=qdrant) as client_class, patch(
        "app.core.rag_engine.genai.Client",
        return_value=gemini,
    ):
        manager = RAGManager(
            make_settings(
                qdrant_url="http://qdrant:6333",
                qdrant_api_key="key",
                gemini_api_key="gemini-key",
            )
        )
        async with manager:
            assert manager.capabilities == {
                "vector_memory": True,
                "generative_narration": True,
                "local_narration": True,
            }
            indexed = await manager.index_entity([0.1] * 512, {"label": "test"})
            assert indexed is True
            qdrant.create_collection.assert_awaited_once()
            qdrant.upsert.assert_awaited_once()

    client_class.assert_called_once_with(
        url="http://qdrant:6333",
        api_key="key",
        timeout=4,
    )
    qdrant.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_missing_services_use_local_narration():
    manager = RAGManager(make_settings())
    async with manager:
        narrative = await manager.synthesize_context(
            {
                "objects": [
                    {"label": "person"},
                    {"label": "package"},
                    {"label": "package"},
                ],
                "faces": [],
            },
            [],
        )
    assert "1 person" in narrative
    assert "2 packages" in narrative
    assert manager.capabilities["local_narration"] is True


@pytest.mark.asyncio
async def test_strict_mode_requires_external_services():
    manager = RAGManager(make_settings(rag_strict=True))
    with pytest.raises(RuntimeError, match="RAG_STRICT"):
        async with manager:
            pass


@pytest.mark.asyncio
async def test_gemini_synthesis_and_fallback():
    manager = RAGManager(make_settings(gemini_api_key="key"))
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(
        return_value=SimpleNamespace(text="A grounded narrative.")
    )
    with patch("app.core.rag_engine.genai.Client", return_value=client):
        async with manager:
            result = await manager.synthesize_context(
                {"objects": [{"label": "laptop"}], "faces": []},
                [],
            )
    assert result == "A grounded narrative."
    client.aio.models.generate_content.assert_awaited_once()


@pytest.mark.asyncio
async def test_vector_dimension_is_validated():
    qdrant = AsyncMock()
    manager = RAGManager(make_settings())
    manager.qdrant_client = qdrant
    with pytest.raises(ValueError, match="512-dimensional"):
        await manager.index_entity([0.1] * 12, {})
