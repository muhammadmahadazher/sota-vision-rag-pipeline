import os
import unittest
from unittest.mock import patch, MagicMock, AsyncMock

# Set required environment variables for tests
os.environ["QDRANT_URL"] = "http://localhost:6333"
os.environ["QDRANT_API_KEY"] = "fake-qdrant-key"
os.environ["GEMINI_API_KEY"] = "fake-key"

from app.core.rag_engine import RAGManager

class TestRAGManager(unittest.IsolatedAsyncioTestCase):
    @patch('app.core.rag_engine.AsyncQdrantClient')
    @patch('app.core.rag_engine.genai.Client')
    async def test_rag_manager_lifecycle(self, mock_genai_client, mock_qdrant_client):
        # Mock qdrant client methods
        mock_qdrant_instance = AsyncMock()
        mock_qdrant_client.return_value = mock_qdrant_instance

        # Setup mock for get_collections to simulate no collections existing
        mock_collections_response = MagicMock()
        mock_collections_response.collections = []
        mock_qdrant_instance.get_collections.return_value = mock_collections_response

        manager = RAGManager()
        async with manager as m:
            self.assertIsNotNone(m.qdrant_client)
            self.assertIsNotNone(m.genai_client)
            mock_qdrant_instance.create_collection.assert_called_once()

            # Test index_entity
            await m.index_entity([0.1]*512, {"info": "test"})
            mock_qdrant_instance.upsert.assert_called_once()
            mock_qdrant_instance.upsert.reset_mock()

            # Test index_entities
            vectors = [[0.1]*512, [0.2]*512]
            metadatas = [{"info": "test1"}, {"info": "test2"}]
            await m.index_entities(vectors, metadatas)
            mock_qdrant_instance.upsert.assert_called_once()
            called_kwargs = mock_qdrant_instance.upsert.call_args.kwargs
            self.assertEqual(len(called_kwargs['points'].payloads), 2)
            self.assertEqual(called_kwargs['points'].payloads[0], {"info": "test1"})
            self.assertEqual(called_kwargs['points'].payloads[1], {"info": "test2"})


            # Test synthesize_context
            # Mock the genai client aio models generate content
            mock_genai_instance = MagicMock()
            mock_genai_client.return_value = mock_genai_instance
            m.genai_client = mock_genai_instance

            mock_aio = MagicMock()
            mock_genai_instance.aio = mock_aio
            mock_models = MagicMock()
            mock_aio.models = mock_models

            mock_response = MagicMock()
            mock_response.text = "A clean narrative."

            # We mock the generate_content method which is now async
            mock_generate = AsyncMock()
            mock_generate.return_value = mock_response
            mock_models.generate_content = mock_generate

            result = await m.synthesize_context({"frame": 1}, ["past"])
            self.assertEqual(result, "A clean narrative.")
            mock_generate.assert_called_once()

        # After block, qdrant client close should have been called
        mock_qdrant_instance.close.assert_called_once()


    @patch.dict(os.environ, clear=True)
    async def test_missing_qdrant_url(self):
        manager = RAGManager()
        with self.assertRaises(ValueError) as context:
            async with manager:
                pass
        self.assertIn("QDRANT_URL environment variable is missing", str(context.exception))

    @patch.dict(os.environ, {"QDRANT_URL": "http://localhost:6333"}, clear=True)
    async def test_missing_gemini_api_key(self):
        manager = RAGManager()
        with self.assertRaises(ValueError) as context:
            async with manager:
                pass
        self.assertIn("GEMINI_API_KEY environment variable is missing", str(context.exception))

if __name__ == '__main__':

    unittest.main()
