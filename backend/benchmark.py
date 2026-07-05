import asyncio
import os
import time
from unittest.mock import patch, MagicMock, AsyncMock

os.environ["QDRANT_URL"] = "http://localhost:6333"
os.environ["GEMINI_API_KEY"] = "fake-key"

from app.core.rag_engine import RAGManager

async def mock_upsert(*args, **kwargs):
    await asyncio.sleep(0.01) # Simulate 10ms network latency

@patch('app.core.rag_engine.AsyncQdrantClient')
@patch('app.core.rag_engine.genai.Client')
async def main(mock_genai_client, mock_qdrant_client):
    mock_qdrant_instance = AsyncMock()
    mock_qdrant_client.return_value = mock_qdrant_instance

    mock_collections_response = MagicMock()
    mock_collections_response.collections = []
    mock_qdrant_instance.get_collections.return_value = mock_collections_response
    mock_qdrant_instance.upsert.side_effect = mock_upsert

    manager = RAGManager()
    async with manager as m:
        num_items = 100
        vectors = [[0.1]*512 for _ in range(num_items)]
        metadatas = [{"info": f"test_{i}"} for i in range(num_items)]

        # Test individual insertions
        start = time.time()
        for v, meta in zip(vectors, metadatas):
            await m.index_entity(v, meta)
        end = time.time()
        print(f"Time taken for {num_items} individual insertions: {end - start:.4f} seconds")

        # Test batch insertion
        if hasattr(m, 'index_entities'):
            start = time.time()
            await m.index_entities(vectors, metadatas)
            end = time.time()
            print(f"Time taken for batch insertion of {num_items} items: {end - start:.4f} seconds")
        else:
            print("index_entities method not found. Benchmark baseline complete.")

if __name__ == '__main__':
    asyncio.run(main())
