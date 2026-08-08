import json
import logging
import time
import uuid
from collections import Counter
from typing import Any, Sequence

from google import genai
from google.genai import types
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models

from app.core.config import Settings

logger = logging.getLogger(__name__)


class RAGManager:
    """Optional Qdrant + Gemini services with a useful offline fallback."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.from_env()
        self.qdrant_client: AsyncQdrantClient | None = None
        self.genai_client: Any = None
        self.collection_name = "vision_frames"
        self.vector_size = 512
        self.last_error: str | None = None

    @property
    def capabilities(self) -> dict[str, bool]:
        return {
            "vector_memory": self.qdrant_client is not None,
            "generative_narration": self.genai_client is not None,
            "local_narration": True,
        }

    async def __aenter__(self) -> "RAGManager":
        await self._initialize_qdrant()
        self._initialize_gemini()
        if self.settings.rag_strict:
            missing = [
                name
                for name, enabled in {
                    "Qdrant": self.qdrant_client is not None,
                    "Gemini": self.genai_client is not None,
                }.items()
                if not enabled
            ]
            if missing:
                raise RuntimeError(f"RAG_STRICT is enabled but {'', ''.join(missing)} is unavailable.")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self.qdrant_client:
            await self.qdrant_client.close()
            self.qdrant_client = None
            logger.info("Closed Qdrant client connection.")

    async def _initialize_qdrant(self) -> None:
        if not self.settings.qdrant_url:
            logger.info("QDRANT_URL is not configured; vector memory is disabled.")
            return
        client = AsyncQdrantClient(
            url=self.settings.qdrant_url,
            api_key=self.settings.qdrant_api_key,
            timeout=4,
        )
        try:
            response = await client.get_collections()
            existing = {collection.name for collection in response.collections}
            if self.collection_name not in existing:
                await client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=self.vector_size,
                        distance=models.Distance.COSINE,
                    ),
                )
            self.qdrant_client = client
            logger.info("Qdrant memory ready at %s.", self.settings.qdrant_url)
        except Exception as exc:
            await client.close()
            self.last_error = f"Qdrant: {exc}"
            if self.settings.rag_strict:
                raise
            logger.warning("Qdrant unavailable; continuing without vector memory: %s", exc)

    def _initialize_gemini(self) -> None:
        if not self.settings.gemini_api_key:
            logger.info("GEMINI_API_KEY is not configured; local narration is enabled.")
            return
        try:
            self.genai_client = genai.Client(api_key=self.settings.gemini_api_key)
            logger.info("Gemini narrative synthesis is configured.")
        except Exception as exc:
            self.last_error = f"Gemini: {exc}"
            if self.settings.rag_strict:
                raise
            logger.warning("Gemini unavailable; continuing with local narration: %s", exc)

    async def query_similar(
        self,
        vector: Sequence[float],
        limit: int = 5,
    ) -> tuple[list[dict[str, Any]], float]:
        if not self.qdrant_client:
            return [], 0.0
        started = time.perf_counter()
        try:
            result = await self.qdrant_client.query_points(
                collection_name=self.collection_name,
                query=list(vector),
                limit=max(1, min(limit, 20)),
            )
            payloads = [
                point.payload
                for point in result.points
                if isinstance(point.payload, dict)
            ]
            return payloads, (time.perf_counter() - started) * 1000
        except Exception as exc:
            self.last_error = f"Qdrant query: {exc}"
            logger.warning("Vector recall failed: %s", exc)
            return [], (time.perf_counter() - started) * 1000

    async def index_entity(
        self,
        vector: Sequence[float],
        metadata: dict[str, Any],
    ) -> bool:
        return await self.index_entities([vector], [metadata])

    async def index_entities(
        self,
        vectors: Sequence[Sequence[float]],
        metadatas: Sequence[dict[str, Any]],
    ) -> bool:
        if len(vectors) != len(metadatas):
            raise ValueError("vectors and metadatas must contain the same number of entries.")
        if not vectors or not self.qdrant_client:
            return False
        for vector in vectors:
            if len(vector) != self.vector_size:
                raise ValueError(f"Expected {self.vector_size}-dimensional face embeddings.")
        try:
            await self.qdrant_client.upsert(
                collection_name=self.collection_name,
                points=models.Batch(
                    ids=[str(uuid.uuid4()) for _ in vectors],
                    vectors=[list(vector) for vector in vectors],
                    payloads=list(metadatas),
                ),
            )
            return True
        except Exception as exc:
            self.last_error = f"Qdrant index: {exc}"
            logger.warning("Vector indexing failed: %s", exc)
            return False

    async def synthesize_context(
        self,
        current_metadata: dict[str, Any],
        historical_context: Sequence[dict[str, Any]],
    ) -> str:
        fallback = self._local_narrative(current_metadata, historical_context)
        if not self.genai_client:
            return fallback

        prompt_payload = {
            "current_frame": current_metadata,
            "recalled_moments": list(historical_context)[:5],
        }
        try:
            response = await self.genai_client.aio.models.generate_content(
                model=self.settings.gemini_model,
                contents=json.dumps(prompt_payload, separators=(",", ":"), default=str),
                config=types.GenerateContentConfig(
                    system_instruction=(
                        "You are the concise scene analyst for Aether Vision RAG. "
                        "Write 1-2 factual sentences grounded only in the supplied detections "
                        "and recalled moments. State uncertainty, avoid identity claims, and do "
                        "not infer sensitive traits. Highlight meaningful change when supported."
                    ),
                    temperature=0.2,
                    max_output_tokens=120,
                ),
            )
            text = (response.text or "").strip()
            return text or fallback
        except Exception as exc:
            self.last_error = f"Gemini synthesis: {exc}"
            logger.warning("Gemini synthesis failed; using local narrative: %s", exc)
            return fallback

    @staticmethod
    def _local_narrative(
        current_metadata: dict[str, Any],
        historical_context: Sequence[dict[str, Any]],
    ) -> str:
        objects = current_metadata.get("objects") or []
        faces = current_metadata.get("faces") or []
        labels = [
            str(item.get("label", "object")).lower()
            for item in objects
            if isinstance(item, dict)
        ]
        counts = Counter(labels)
        phrases = [
            f"{count} {label}" + ("" if count == 1 else "s")
            for label, count in counts.most_common(4)
        ]
        if phrases:
            if len(phrases) == 1:
                inventory = phrases[0]
            else:
                inventory = ", ".join(phrases[:-1]) + f", and {phrases[-1]}"
            opening = f"The current frame contains {inventory}."
        elif faces:
            opening = (
                f"The current frame contains {len(faces)} visible "
                + ("person" if len(faces) == 1 else "people")
                + ", with no classified objects above threshold."
            )
        else:
            metrics = current_metadata.get("metrics") or {}
            motion = metrics.get("motion_regions", 0) if isinstance(metrics, dict) else 0
            opening = (
                "No classified objects are above threshold."
                if not motion
                else f"{motion} " + ("area is" if motion == 1 else "areas are") + " showing motion."
            )

        recalled_labels: set[str] = set()
        for moment in historical_context:
            for item in moment.get("objects", []) if isinstance(moment, dict) else []:
                if isinstance(item, dict) and item.get("label"):
                    recalled_labels.add(str(item["label"]).lower())
        new_labels = [label for label in counts if label not in recalled_labels]
        if historical_context and new_labels:
            return f"{opening} New since the recalled moments: {'', ''.join(new_labels[:3])}."
        if historical_context:
            return f"{opening} The scene is broadly consistent with related recalled moments."
        return opening
