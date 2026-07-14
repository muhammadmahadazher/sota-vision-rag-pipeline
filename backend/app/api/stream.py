import asyncio
import time
import cv2
import numpy as np
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()

async def process_frames_consumer(websocket: WebSocket, queue: asyncio.Queue):
    vision_pipeline = websocket.app.state.vision_pipeline
    last_narrative = ""
    last_synthesis_time = 0.0

    while True:
        try:
            # Wait for a frame
            data = await queue.get()

            # Decode binary frame
            nparr = np.frombuffer(data, np.uint8)
            frame = await asyncio.to_thread(cv2.imdecode, nparr, cv2.IMREAD_COLOR)

            if frame is None:
                logger.warning("Decoded frame is None (corrupt/empty). Broadcasting Stream Disconnected status.")
                try:
                    await websocket.send_json({"status": "Stream Disconnected", "narrative": "Corrupted or empty frame received from source."})
                except Exception:
                    pass
                queue.task_done()
                continue

            # Process frame in thread to not block async loop
            results = await asyncio.to_thread(vision_pipeline.process_frame, frame)

            historical_context = []
            rag_engine = websocket.app.state.rag_engine
            qdrant_latency_ms = 0.0

            if rag_engine and rag_engine.qdrant_client:
                faces = results.get('faces', [])
                if faces and len(faces) > 0 and faces[0].get('embedding') is not None:
                    embedding = faces[0]['embedding']
                    try:
                        start_time = time.time()
                        search_result = await rag_engine.qdrant_client.query_points(
                            collection_name=rag_engine.collection_name,
                            query=embedding,
                            limit=5
                        )
                        qdrant_latency_ms = (time.time() - start_time) * 1000
                        historical_context = [hit.payload for hit in search_result.points if hit.payload is not None]
                    except Exception as e:
                        logger.error(f"Error querying Qdrant: {e}")

            # Throttled Context Synthesis to respect free tier limit (15 requests per minute)
            current_time = time.time()
            narrative = last_narrative

            if current_time - last_synthesis_time >= 4.0:
                if rag_engine:
                    try:
                        # Create current metadata copy, exclude embeddings to save tokens
                        current_metadata = {
                            "objects": results.get("objects", []),
                            "faces": [
                                {k: v for k, v in face.items() if k != "embedding"}
                                for face in results.get("faces", [])
                            ]
                        }
                        narrative = await rag_engine.synthesize_context(current_metadata, historical_context)
                        last_narrative = narrative
                        last_synthesis_time = current_time

                        # Index face embedding in Qdrant database for persistence memory
                        faces = results.get('faces', [])
                        if faces and len(faces) > 0 and faces[0].get('embedding') is not None:
                            embedding = faces[0]['embedding']
                            payload_metadata = {
                                "timestamp": time.time(),
                                "narrative": narrative,
                                "objects": results.get("objects", []),
                                "faces": [
                                    {k: v for k, v in f.items() if k != "embedding"}
                                    for f in faces
                                ]
                            }
                            # Index asynchronously
                            asyncio.create_task(rag_engine.index_entity(embedding, payload_metadata))
                            logger.info("Face embedding and narrative indexed in Qdrant.")
                    except Exception as e:
                        logger.error(f"Error synthesizing context: {e}")
                        # Keep reusing last narrative on failure (e.g. rate limit error) to prevent blank pages
                        narrative = last_narrative

            # Send JSON payload
            payload = {
                "objects": results.get("objects", []),
                "faces": [
                    {k: v for k, v in face.items() if k != "embedding"}
                    for face in results.get("faces", [])
                ],
                "narrative": narrative,
                "status": "Connected",
                "qdrant_latency_ms": qdrant_latency_ms,
                "device": getattr(vision_pipeline, "device", "cpu")
            }

            try:
                await websocket.send_json(payload)
            except Exception as e:
                logger.error(f"Error sending payload: {e}")

            queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error processing frame: {e}")
            try:
                await websocket.send_json({"status": "Stream Disconnected", "narrative": f"Internal pipeline error: {str(e)}"})
            except Exception:
                pass

@router.websocket("/api/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to /api/stream")

    # Queue for frame skipping, maxsize 1
    queue = asyncio.Queue(maxsize=1)

    # Start the consumer task
    consumer_task = asyncio.create_task(process_frames_consumer(websocket, queue))

    try:
        while True:
            # Receive binary frame from client
            try:
                data = await websocket.receive_bytes()
            except Exception as e:
                logger.warning(f"Error receiving bytes or sudden disconnect: {e}")
                try:
                    await websocket.send_json({"status": "Stream Disconnected", "narrative": "Media source stream was interrupted."})
                except Exception:
                    pass
                break

            try:
                # Put in queue. If full, catch exception and drop frame
                queue.put_nowait(data)
            except asyncio.QueueFull:
                # Dropping stale frame because inference is busy
                pass

    except WebSocketDisconnect:
        logger.info("Client disconnected from /api/stream")
    except Exception as e:
        logger.error(f"Unexpected error in websocket_stream: {e}")
    finally:
        consumer_task.cancel()
