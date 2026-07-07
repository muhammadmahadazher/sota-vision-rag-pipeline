import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.rag_engine import RAGManager
from app.core.inference import VisionPipeline
from app.api.stream import router as stream_router
from app.api.query import router as query_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing RAGManager and VisionPipeline on startup...")
    try:
        async with RAGManager() as rag_manager:
            app.state.rag_engine = rag_manager
            logger.info("RAGManager initialized and stored in app.state.")

            logger.info("Initializing VisionPipeline...")
            app.state.vision_pipeline = VisionPipeline()
            logger.info("VisionPipeline initialized and stored in app.state.")

            yield
    except Exception as e:
        logger.error(f"Failed to initialize RAGManager or VisionPipeline: {e}")
        app.state.rag_engine = None
        app.state.vision_pipeline = None
        yield
    finally:
        logger.info("Closing resources on shutdown...")

app = FastAPI(title="SOTA Vision RAG API", lifespan=lifespan)

# Security Fix: Add CORS Middleware
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(stream_router)
app.include_router(query_router)
