import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.stream import router as stream_router
from app.core.config import Settings
from app.core.inference import VisionPipeline
from app.core.rag_engine import RAGManager

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.rag_engine = None
    app.state.vision_pipeline = None
    app.state.startup_errors = []

    rag_manager = RAGManager(settings)
    rag_entered = False
    try:
        try:
            app.state.rag_engine = await rag_manager.__aenter__()
            rag_entered = True
        except Exception as exc:
            message = f"RAG initialization failed: {exc}"
            app.state.startup_errors.append(message)
            logger.exception(message)

        try:
            app.state.vision_pipeline = await asyncio.to_thread(
                VisionPipeline,
                settings.vision_model,
                settings.vision_mode,
            )
        except Exception as exc:
            message = f"Vision initialization failed: {exc}"
            app.state.startup_errors.append(message)
            logger.exception(message)

        yield
    finally:
        if rag_entered:
            await rag_manager.__aexit__(None, None, None)
        logger.info("Aether Vision resources closed.")


settings = Settings.from_env()
app = FastAPI(
    title=settings.app_name,
    summary="Real-time detection, temporal vector memory, and grounded scene narration.",
    description=(
        "Stream JPEG frames over WebSocket and receive structured detections plus "
        "context-aware narratives. Runs in OpenCV lite mode out of the box and "
        "supports YOLO-World + InsightFace in advanced mode."
    ),
    version="1.0.0",
    lifespan=lifespan,
    license_info={"name": "MIT", "identifier": "MIT"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/", tags=["system"])
async def root() -> dict[str, Any]:
    return {
        "name": "Aether Vision RAG API",
        "version": "1.0.0",
        "docs": "/docs",
        "websocket": "/api/stream",
    }


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, Any]:
    vision = getattr(app.state, "vision_pipeline", None)
    rag = getattr(app.state, "rag_engine", None)
    errors = getattr(app.state, "startup_errors", [])
    return {
        "status": "ok" if vision is not None else "degraded",
        "vision": {
            "ready": vision is not None,
            "mode": getattr(vision, "backend_name", None),
            "device": getattr(vision, "device", None),
            "fallback_reason": getattr(vision, "fallback_reason", None),
            "hardware": getattr(vision, "hardware", None),
        },
        "rag": (
            rag.capabilities
            if rag is not None
            else {
                "vector_memory": False,
                "generative_narration": False,
                "local_narration": True,
            }
        ),
        "startup_errors": errors,
    }


app.include_router(stream_router)
