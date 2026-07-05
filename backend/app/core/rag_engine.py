import os
import logging
import uuid
import json
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

class RAGManager:
    def __init__(self):
        self.qdrant_client = None
        self.genai_client = None
        self.collection_name = "vision_frames"

    async def __aenter__(self):
        # Qdrant init
        qdrant_url = os.getenv("QDRANT_URL")
        if not qdrant_url:
            raise ValueError("QDRANT_URL environment variable is missing.")

        self.qdrant_client = AsyncQdrantClient(url=qdrant_url)

        # Google GenAI init
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            raise ValueError("GEMINI_API_KEY environment variable is missing.")

        self.genai_client = genai.Client(api_key=gemini_api_key)

        # Check and create Qdrant collection if not exists
        collections_response = await self.qdrant_client.get_collections()
        collection_names = [col.name for col in collections_response.collections]

        if self.collection_name not in collection_names:
            logger.info(f"Creating Qdrant collection: {self.collection_name}")
            # Assumed Vector size 512 for CLIP/SigLIP fallback representation
            # If using another model, adjust size appropriately.
            await self.qdrant_client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=512,  # Example: SigLIP dimensions
                    distance=models.Distance.COSINE
                )
            )

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.qdrant_client:
            await self.qdrant_client.close()
            logger.info("Closed Qdrant client connection.")

    async def index_entity(self, vector: list, metadata: dict) -> None:
        point = models.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload=metadata
        )
        await self.qdrant_client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )

    async def synthesize_context(self, current_metadata: dict, historical_context: list) -> str:
        prompt = (
            f"Current Frame Metadata: {json.dumps(current_metadata)}\n"
            f"Historical Context: {json.dumps(historical_context)}"
        )

        config = types.GenerateContentConfig(
            system_instruction="Please provide a clean narrative description of the events occurring."
        )

        response = await self.genai_client.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=config,
        )
        return response.text
