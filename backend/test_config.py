import os
import unittest
from unittest.mock import patch

from app.core.config import Settings


class TestConfig(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def test_default_values(self):
        settings = Settings.from_env()
        self.assertEqual(settings.app_name, "Aether Vision RAG API")
        self.assertEqual(settings.vision_mode, "auto")
        self.assertEqual(settings.vision_model, "yolov8s-worldv2.pt")
        self.assertIsNone(settings.api_token)
        self.assertEqual(settings.allowed_origins, ("http://127.0.0.1:3000", "http://localhost:3000"))
        self.assertIsNone(settings.qdrant_url)
        self.assertIsNone(settings.qdrant_api_key)
        self.assertIsNone(settings.gemini_api_key)
        self.assertEqual(settings.gemini_model, "gemini-2.5-flash")
        self.assertFalse(settings.rag_strict)
        self.assertEqual(settings.synthesis_interval_seconds, 4.0)
        self.assertEqual(settings.max_payload_bytes, 5 * 1024 * 1024)

    @patch.dict(
        os.environ,
        {
            "APP_NAME": "My Custom App",
            "VISION_MODE": "advanced",
            "VISION_MODEL": "yolov8n-worldv2.pt",
            "API_TOKEN": "secret-token",
            "ALLOWED_ORIGINS": "https://example.com",
            "QDRANT_URL": "http://qdrant:6333",
            "QDRANT_API_KEY": "qdrant-key",
            "GEMINI_API_KEY": "gemini-key",
            "GEMINI_MODEL": "gemini-pro",
            "RAG_STRICT": "true",
            "SYNTHESIS_INTERVAL_SECONDS": "2.5",
            "MAX_PAYLOAD_BYTES": "1048576",
        },
        clear=True,
    )
    def test_custom_valid_values(self):
        settings = Settings.from_env()
        self.assertEqual(settings.app_name, "My Custom App")
        self.assertEqual(settings.vision_mode, "advanced")
        self.assertEqual(settings.vision_model, "yolov8n-worldv2.pt")
        self.assertEqual(settings.api_token, "secret-token")
        self.assertEqual(settings.allowed_origins, ("https://example.com",))
        self.assertEqual(settings.qdrant_url, "http://qdrant:6333")
        self.assertEqual(settings.qdrant_api_key, "qdrant-key")
        self.assertEqual(settings.gemini_api_key, "gemini-key")
        self.assertEqual(settings.gemini_model, "gemini-pro")
        self.assertTrue(settings.rag_strict)
        self.assertEqual(settings.synthesis_interval_seconds, 2.5)
        self.assertEqual(settings.max_payload_bytes, 1024 * 1024)

    @patch.dict(os.environ, {"ALLOWED_ORIGINS": " http://localhost:3000 ,  , http://127.0.0.1:3000 "}, clear=True)
    def test_origins_parsing(self):
        settings = Settings.from_env()
        self.assertEqual(settings.allowed_origins, ("http://localhost:3000", "http://127.0.0.1:3000"))

    @patch.dict(os.environ, {"VISION_MODE": "invalid_mode"}, clear=True)
    def test_vision_mode_fallback(self):
        settings = Settings.from_env()
        self.assertEqual(settings.vision_mode, "auto")

    @patch.dict(os.environ, {"VISION_MODE": " LITE "}, clear=True)
    def test_vision_mode_parsing(self):
        settings = Settings.from_env()
        self.assertEqual(settings.vision_mode, "lite")

    @patch.dict(os.environ, {"API_TOKEN": "   "}, clear=True)
    def test_empty_string_to_none(self):
        settings = Settings.from_env()
        self.assertIsNone(settings.api_token)
        self.assertIsNone(settings.qdrant_url)
        self.assertIsNone(settings.qdrant_api_key)
        self.assertIsNone(settings.gemini_api_key)

    def test_boolean_parsing(self):
        truthy_values = ["1", "true", "yes", "on", " TRUE ", "Yes"]
        falsy_values = ["0", "false", "no", "off", "invalid", "", " "]

        for val in truthy_values:
            with patch.dict(os.environ, {"RAG_STRICT": val}, clear=True):
                settings = Settings.from_env()
                self.assertTrue(settings.rag_strict, f"Failed for {val}")

        for val in falsy_values:
            with patch.dict(os.environ, {"RAG_STRICT": val}, clear=True):
                settings = Settings.from_env()
                self.assertFalse(settings.rag_strict, f"Failed for {val}")

    @patch.dict(
        os.environ,
        {
            "SYNTHESIS_INTERVAL_SECONDS": "invalid",
            "MAX_PAYLOAD_BYTES": "invalid",
        },
        clear=True,
    )
    def test_numeric_invalid_fallback(self):
        settings = Settings.from_env()
        self.assertEqual(settings.synthesis_interval_seconds, 4.0)
        self.assertEqual(settings.max_payload_bytes, 5 * 1024 * 1024)

    @patch.dict(
        os.environ,
        {
            "SYNTHESIS_INTERVAL_SECONDS": "0.5",
            "MAX_PAYLOAD_BYTES": "1024",
        },
        clear=True,
    )
    def test_numeric_lower_bounds(self):
        settings = Settings.from_env()
        self.assertEqual(settings.synthesis_interval_seconds, 1.0)
        self.assertEqual(settings.max_payload_bytes, 256 * 1024)


if __name__ == "__main__":
    unittest.main()
