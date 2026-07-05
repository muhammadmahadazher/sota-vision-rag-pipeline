import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
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

# Configure CORS securely
# Frontend URL passed via env var, defaults to localhost:3000
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
origins = [
    frontend_url,
    # Add other trusted origins here if needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
