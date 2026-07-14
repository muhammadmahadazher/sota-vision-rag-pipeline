import os
import unittest
from unittest.mock import patch, AsyncMock

# Set required environment variables for tests
os.environ["QDRANT_URL"] = "http://localhost:6333"
os.environ["GEMINI_API_KEY"] = "fake-key"

from fastapi import FastAPI
from main import lifespan

class TestLifespan(unittest.IsolatedAsyncioTestCase):
    @patch('main.RAGManager')
    async def test_lifespan_success(self, mock_rag_manager_class):
        # Setup mock for RAGManager's async context manager
        mock_rag_manager_instance = AsyncMock()
        mock_rag_manager_class.return_value = mock_rag_manager_instance

        # When `async with RAGManager() as rag_manager:` is called,
        # it calls __aenter__ and __aexit__
        mock_rag_manager_instance.__aenter__.return_value = mock_rag_manager_instance

        app = FastAPI()

        # We need a mock to capture yielding
        async with lifespan(app):
            # The body of the async with block
            self.assertEqual(app.state.rag_engine, mock_rag_manager_instance)

        # Verify it was called correctly
        mock_rag_manager_instance.__aenter__.assert_called_once()
        mock_rag_manager_instance.__aexit__.assert_called_once()

    @patch('main.RAGManager')
    async def test_lifespan_exception(self, mock_rag_manager_class):
        # Setup mock for RAGManager's async context manager to raise an exception
        mock_rag_manager_instance = AsyncMock()
        mock_rag_manager_class.return_value = mock_rag_manager_instance

        # Make __aenter__ raise an exception
        mock_rag_manager_instance.__aenter__.side_effect = Exception("Initialization failed")

        app = FastAPI()

        async with lifespan(app):
            # The body of the async with block
            # In case of exception, it yields and sets app.state.rag_engine = None
            self.assertIsNone(app.state.rag_engine)

        # Verify __aenter__ was called and raised the exception
        mock_rag_manager_instance.__aenter__.assert_called_once()
        # __aexit__ shouldn't be called if __aenter__ raised an exception
        mock_rag_manager_instance.__aexit__.assert_not_called()


from fastapi.testclient import TestClient
from main import app

class TestCORS(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_cors_preflight_allowed(self):
        headers = {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization"
        }
        response = self.client.options("/health", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:3000")

    def test_cors_preflight_disallowed(self):
        headers = {
            "Origin": "http://evil.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization"
        }
        response = self.client.options("/health", headers=headers)
        self.assertEqual(response.status_code, 400)

if __name__ == '__main__':
    unittest.main()
