import asyncio
import cv2
import numpy as np
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()

async def process_frames_consumer(websocket: WebSocket, queue: asyncio.Queue):
    vision_pipeline = websocket.app.state.vision_pipeline

    while True:
        try:
            # Wait for a frame
            data = await queue.get()

            # Decode binary frame
            nparr = np.frombuffer(data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is not None:
                # Process frame in thread to not block async loop
                results = await asyncio.to_thread(vision_pipeline.process_frame, frame)

                historical_context = []
                rag_engine = websocket.app.state.rag_engine

                if rag_engine and rag_engine.qdrant_client:
                    faces = results.get('faces', [])
                    if faces and len(faces) > 0 and faces[0].get('embedding') is not None:
                        embedding = faces[0]['embedding']
                        try:
                            search_result = await rag_engine.qdrant_client.search(
                                collection_name=rag_engine.collection_name,
                                query_vector=embedding,
                                limit=5
                            )
                            historical_context = [hit.payload for hit in search_result if hit.payload is not None]
                        except Exception as e:
                            logger.error(f"Error querying Qdrant: {e}")

                # Synthesize context
                narrative = ""
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
                    except Exception as e:
                        logger.error(f"Error synthesizing context: {e}")

                # Send JSON payload
                payload = {
                    "objects": results.get("objects", []),
                    "faces": [
                        {k: v for k, v in face.items() if k != "embedding"}
                        for face in results.get("faces", [])
                    ],
                    "narrative": narrative
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

@router.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to /ws/stream")

    # Queue for frame skipping, maxsize 1
    queue = asyncio.Queue(maxsize=1)

    # Start the consumer task
    consumer_task = asyncio.create_task(process_frames_consumer(websocket, queue))

    try:
        while True:
            # Receive binary frame from client
            data = await websocket.receive_bytes()

            try:
                # Put in queue. If full, catch exception and drop frame
                queue.put_nowait(data)
            except asyncio.QueueFull:
                # Dropping stale frame because inference is busy
                pass

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/stream")
    finally:
        consumer_task.cancel()
