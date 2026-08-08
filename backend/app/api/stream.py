import asyncio
import logging
import secrets
import time
from contextlib import suppress
from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.config import Settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stream"])

MAX_PAYLOAD_SIZE_BYTES = 5 * 1024 * 1024


def token_is_valid(token: str | None, expected_token: str | None) -> bool:
    """Authentication is opt-in for local use and constant-time when configured."""
    if not expected_token:
        return True
    return bool(token) and secrets.compare_digest(token, expected_token)


def origin_is_allowed(origin: str | None, allowed_origins: tuple[str, ...]) -> bool:
    if not origin:
        return True
    return "*" in allowed_origins or origin in allowed_origins


def _public_faces(faces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            key: value
            for key, value in face.items()
            if key not in {"embedding", "landmarks", "gender", "age"} and value is not None
        }
        for face in faces
    ]


async def process_frames_consumer(
    websocket: WebSocket,
    queue: asyncio.Queue[bytes],
    settings: Settings,
) -> None:
    vision_pipeline = websocket.app.state.vision_pipeline
    rag_engine = websocket.app.state.rag_engine
    last_narrative = ""
    last_synthesis_time = 0.0

    while True:
        data = await queue.get()
        try:
            frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                await websocket.send_json(
                    {
                        "status": "Stream Disconnected",
                        "narrative": "The frame was empty or could not be decoded.",
                    }
                )
                continue

            results = await asyncio.to_thread(vision_pipeline.process_frame, frame)
            objects = results.get("objects", [])
            faces = results.get("faces", [])
            historical_context: list[dict[str, Any]] = []
            qdrant_latency_ms = 0.0
            primary_embedding = next(
                (
                    face.get("embedding")
                    for face in faces
                    if isinstance(face, dict) and face.get("embedding") is not None
                ),
                None,
            )
            if primary_embedding is None:
                primary_embedding = results.get("frame_embedding")

            if rag_engine and primary_embedding is not None:
                historical_context, qdrant_latency_ms = await rag_engine.query_similar(
                    primary_embedding,
                    limit=5,
                )

            now = time.monotonic()
            narrative = last_narrative
            if not narrative or now - last_synthesis_time >= settings.synthesis_interval_seconds:
                metadata = {
                    "objects": objects,
                    "faces": _public_faces(faces),
                    "metrics": results.get("metrics", {}),
                }
                if rag_engine:
                    narrative = await rag_engine.synthesize_context(
                        metadata,
                        historical_context,
                    )
                else:
                    narrative = "Scene analysis is active; narrative memory is unavailable."
                last_narrative = narrative
                last_synthesis_time = now

                if rag_engine and primary_embedding is not None:
                    await rag_engine.index_entity(
                        primary_embedding,
                        {
                            "timestamp": time.time(),
                            "narrative": narrative,
                            **metadata,
                        },
                    )

            await websocket.send_json(
                {
                    "objects": objects,
                    "faces": _public_faces(faces),
                    "narrative": narrative,
                    "status": "Connected",
                    "qdrant_latency_ms": round(qdrant_latency_ms, 2),
                    "device": getattr(vision_pipeline, "device", "unknown"),
                    "backend": getattr(vision_pipeline, "backend_name", "unknown"),
                    "metrics": results.get("metrics", {}),
                }
            )
        except asyncio.CancelledError:
            raise
        except WebSocketDisconnect:
            return
        except Exception as exc:
            logger.exception("Frame processing failed.")
            with suppress(Exception):
                await websocket.send_json(
                    {
                        "status": "Stream Disconnected",
                        "narrative": "The frame could not be processed. Check the backend logs.",
                        "error": type(exc).__name__,
                    }
                )
        finally:
            queue.task_done()


@router.websocket("/api/stream")
async def websocket_stream(websocket: WebSocket) -> None:
    settings: Settings = getattr(
        websocket.app.state,
        "settings",
        Settings.from_env(),
    )
    token = websocket.query_params.get("token")
    origin = websocket.headers.get("origin")

    if not token_is_valid(token, settings.api_token):
        logger.warning("Rejected an unauthorized WebSocket connection.")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return
    if not origin_is_allowed(origin, settings.allowed_origins):
        logger.warning("Rejected WebSocket origin: %s", origin)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Origin not allowed")
        return
    if getattr(websocket.app.state, "vision_pipeline", None) is None:
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER, reason="Vision pipeline unavailable")
        return

    await websocket.accept()
    queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=1)
    consumer_task = asyncio.create_task(
        process_frames_consumer(websocket, queue, settings)
    )
    max_payload = settings.max_payload_bytes or MAX_PAYLOAD_SIZE_BYTES

    try:
        while True:
            data = await websocket.receive_bytes()
            if len(data) > max_payload:
                logger.warning("Closing oversized WebSocket message: %d bytes.", len(data))
                await websocket.close(code=1009, reason="Message too big")
                break
            if queue.full():
                with suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
                    queue.task_done()
            queue.put_nowait(data)
    except WebSocketDisconnect:
        logger.info("Vision stream client disconnected.")
    except RuntimeError as exc:
        logger.info("Vision stream closed: %s", exc)
    except Exception:
        logger.exception("Unexpected WebSocket receive failure.")
    finally:
        consumer_task.cancel()
        with suppress(asyncio.CancelledError):
            await consumer_task
