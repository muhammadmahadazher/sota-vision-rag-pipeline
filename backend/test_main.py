import unittest
from fastapi.testclient import TestClient

import os
os.environ["QDRANT_URL"] = "http://localhost:6333"
os.environ["GEMINI_API_KEY"] = "fake-key"

from main import app

class TestMainAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

if __name__ == '__main__':
    unittest.main()
