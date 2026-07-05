import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.core.rag_engine import RAGManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing RAGManager on startup...")
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

@app.get("/health")
def health_check():
    return {"status": "ok"}
