import asyncio
import base64
import logging
from typing import Any, Dict

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()

async def receive_frames(websocket: WebSocket, frame_queue: asyncio.Queue, cancel_event: asyncio.Event):
    """
    Constantly receives frames from the WebSocket.
    If the queue is full (processing is busy), it drops the oldest frame
    to keep only the most recent one, preventing buffer bloat.
    """
    try:
        while not cancel_event.is_set():
            message = await websocket.receive()

            frame_bytes = None
            if "bytes" in message:
                frame_bytes = message["bytes"]
            elif "text" in message:
                text_data = message["text"]
                if "," in text_data:
                    text_data = text_data.split(",")[1]
                try:
                    frame_bytes = base64.b64decode(text_data)
                except Exception as e:
                    logger.error(f"Failed to decode base64 string: {e}")
                    continue

            if not frame_bytes:
                continue

            # Update the queue to hold only the latest frame
            try:
                frame_queue.put_nowait(frame_bytes)
            except asyncio.QueueFull:
                # Remove the old frame and put the new one to skip frames when busy
                try:
                    frame_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    frame_queue.put_nowait(frame_bytes)
                except asyncio.QueueFull:
                    pass

    except WebSocketDisconnect:
        logger.info("Client disconnected from receive task")
    except Exception as e:
        logger.error(f"Error in receive task: {e}")
    finally:
        cancel_event.set()

async def process_frames(websocket: WebSocket, frame_queue: asyncio.Queue, cancel_event: asyncio.Event):
    """
    Pulls the latest frame from the queue, processes it, and sends the result back.
    """
    try:
        while not cancel_event.is_set():
            try:
                # Wait for a new frame, but check cancel_event periodically
                frame_bytes = await asyncio.wait_for(frame_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            try:
                # Safely decode the image
                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if frame is None:
                    await websocket.send_json({"error": "Failed to decode image"})
                    continue

                # 1. Vision Pipeline Processing (wrap in thread to prevent blocking event loop)
                vision_pipeline = websocket.app.state.vision_pipeline
                vision_results = await asyncio.to_thread(vision_pipeline.process_frame, frame)

                # 2. Extract historical context if we have face embeddings
                rag_engine = websocket.app.state.rag_engine

                historical_context = []
                if vision_results["faces"] and rag_engine and hasattr(rag_engine, "qdrant_client"):
                    first_face_emb = vision_results["faces"][0]["embedding"]
                    if first_face_emb:
                        try:
                            search_results = await rag_engine.qdrant_client.search(
                                collection_name=rag_engine.collection_name,
                                query_vector=first_face_emb,
                                limit=3
                            )
                            historical_context = [res.payload for res in search_results]
                        except Exception as e:
                            logger.error(f"Search failed: {e}")

                # We can also index this frame asynchronously
                vector_to_index = vision_results["faces"][0]["embedding"] if (vision_results["faces"] and vision_results["faces"][0]["embedding"]) else [0.0] * 512
                # Truncate vector to 512 to match Qdrant collection
                if len(vector_to_index) > 512:
                     vector_to_index = vector_to_index[:512]
                elif len(vector_to_index) < 512:
                     vector_to_index = vector_to_index + [0.0] * (512 - len(vector_to_index))

                if rag_engine:
                    try:
                        # Index current frame metadata
                        metadata = {
                            "objects": [{"label": obj["label"]} for obj in vision_results["objects"]],
                            "face_count": len(vision_results["faces"])
                        }
                        # Fire and forget indexing to avoid blocking the stream response
                        asyncio.create_task(rag_engine.index_entity(vector_to_index, metadata))
                    except Exception as e:
                        logger.error(f"Failed to initiate indexing: {e}")

                # 3. Synthesize Narrative
                narrative = "No narrative available."
                if rag_engine:
                    try:
                        current_metadata = {
                            "detected_objects": [obj["label"] for obj in vision_results["objects"]],
                            "faces_detected": len(vision_results["faces"])
                        }
                        narrative = await rag_engine.synthesize_context(current_metadata, historical_context)
                    except Exception as e:
                        logger.error(f"Failed to synthesize context: {e}")
                        narrative = f"Error generating narrative: {e}"

                # 4. Stream back results
                response_payload = {
                    "vision": vision_results,
                    "narrative": narrative
                }

                if not cancel_event.is_set():
                    await websocket.send_json(response_payload)

            except Exception as e:
                logger.error(f"Error processing frame: {e}")
                if not cancel_event.is_set():
                    await websocket.send_json({"error": str(e)})

    except asyncio.CancelledError:
        logger.info("Process task cancelled")
    except Exception as e:
        logger.error(f"Error in process task: {e}")
    finally:
        cancel_event.set()


@router.websocket("/ws/stream")
async def websocket_route(websocket: WebSocket):
    await websocket.accept()

    frame_queue = asyncio.Queue(maxsize=1)
    cancel_event = asyncio.Event()

    # Decouple receiving and processing
    receiver_task = asyncio.create_task(receive_frames(websocket, frame_queue, cancel_event))
    processor_task = asyncio.create_task(process_frames(websocket, frame_queue, cancel_event))

    try:
        # Wait until one of the tasks finishes or the cancel event is set
        await cancel_event.wait()
    finally:
        # Clean up tasks
        receiver_task.cancel()
        processor_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass
