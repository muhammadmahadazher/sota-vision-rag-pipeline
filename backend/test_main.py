import unittest
import sys
import os

# Ensure the backend directory is in the PYTHONPATH if run from the root directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from backend.main import app

class TestCORSConfiguration(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = TestClient(app)

    def test_allowed_origin(self):
        headers = {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET"
        }
        response = self.client.options("/health", headers=headers)

        self.assertEqual(response.status_code, 200)
        self.assertIn("access-control-allow-origin", response.headers)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")

        # Test GET request
        headers = {"Origin": "http://localhost:3000"}
        response = self.client.get("/health", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn("access-control-allow-origin", response.headers)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")

    def test_disallowed_origin(self):
        headers = {
            "Origin": "http://malicious-site.com",
            "Access-Control-Request-Method": "GET"
        }
        response = self.client.options("/health", headers=headers)

        self.assertEqual(response.status_code, 400)
        self.assertNotIn("access-control-allow-origin", response.headers)

if __name__ == '__main__':
    unittest.main()
