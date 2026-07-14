import os
import unittest
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocketDisconnect
from starlette.websockets import WebSocketState

# Set required environment variables
os.environ["QDRANT_URL"] = "http://localhost:6333"
os.environ["GEMINI_API_KEY"] = "fake-key"
os.environ["API_TOKEN"] = "test-secret"

from main import app

class TestStreamAuth(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_websocket_auth_success(self):
        with self.client.websocket_connect("/api/stream?token=test-secret") as websocket:
            # If no exception is raised, connection was successful
            # Since TestClient manages its own state in a different way in newer starlette versions,
            # we just test that we can connect and receive a message or at least not get disconnected with 1008
            pass

    def test_websocket_auth_failure_missing_token(self):
        with self.assertRaises(WebSocketDisconnect) as context:
            with self.client.websocket_connect("/api/stream"):
                pass
        self.assertEqual(context.exception.code, 1008)

    def test_websocket_auth_failure_wrong_token(self):
        with self.assertRaises(WebSocketDisconnect) as context:
            with self.client.websocket_connect("/api/stream?token=wrong-secret"):
                pass
        self.assertEqual(context.exception.code, 1008)

if __name__ == '__main__':
    unittest.main()
