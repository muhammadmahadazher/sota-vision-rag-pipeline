import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
import numpy as np
import cv2

import pytest

from app.api.stream import process_frames_consumer
from app.core.config import Settings

@pytest.mark.asyncio
async def test_process_frames_consumer_pipeline_error():
    websocket = AsyncMock()
    vision_pipeline = MagicMock()
    vision_pipeline.process_frame.side_effect = RuntimeError("Simulated pipeline failure")

    websocket.app = SimpleNamespace(
        state=SimpleNamespace(
            vision_pipeline=vision_pipeline,
            rag_engine=None,
        )
    )

    queue = asyncio.Queue()
    dummy_image = np.zeros((10, 10, 3), dtype=np.uint8)
    _, encoded_image = cv2.imencode('.jpg', dummy_image)
    await queue.put(encoded_image.tobytes())

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

    consumer_task = asyncio.create_task(process_frames_consumer(websocket, queue, settings))

    # wait for queue to be empty which means it processed the frame
    await queue.join()

    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass

    websocket.send_json.assert_called_with(
        {
            "status": "Stream Disconnected",
            "narrative": "The frame could not be processed. Check the backend logs.",
            "error": "RuntimeError",
        }
    )
