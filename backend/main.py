import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.core.rag_engine import RAGManager
from app.core.inference import VisionPipeline
from app.api.stream import router as stream_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing RAGManager on startup...")

    # Initialize Vision Pipeline
    logger.info("Initializing Vision Pipeline...")
    try:
        app.state.vision_pipeline = VisionPipeline()
        logger.info("Vision Pipeline initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize Vision Pipeline: {e}")
        app.state.vision_pipeline = None

    # Initialize RAG Manager
    try:
        async with RAGManager() as rag_manager:
            app.state.rag_engine = rag_manager
            logger.info("RAGManager initialized and stored in app.state.")
            yield
    except Exception as e:
        logger.error(f"Failed to initialize RAGManager: {e}")
        app.state.rag_engine = None
        yield
    finally:
        logger.info("Closing RAGManager on shutdown...")

app = FastAPI(title="SOTA Vision RAG API", lifespan=lifespan)

# Register routers
app.include_router(stream_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
