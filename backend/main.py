import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

# CORS Configuration
# Fallback to localhost:3000 for frontend development if not specified
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}
