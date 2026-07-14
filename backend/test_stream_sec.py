import asyncio
import unittest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import WebSocket

# Import the module to test
from app.api.stream import websocket_stream, MAX_PAYLOAD_SIZE_BYTES

class TestStreamSecurity(unittest.IsolatedAsyncioTestCase):
    async def test_large_payload_rejected(self):
        # Create a mock WebSocket
        mock_ws = AsyncMock(spec=WebSocket)

        # We need to simulate the receive_bytes method returning a large payload
        # Create a payload that is slightly larger than MAX_PAYLOAD_SIZE_BYTES
        mock_payload = b"0" * (MAX_PAYLOAD_SIZE_BYTES + 1)
        mock_ws.receive_bytes.return_value = mock_payload

        # Mock app.state because process_frames_consumer is started as a task
        mock_app = MagicMock()
        mock_app.state.vision_pipeline = MagicMock()
        mock_ws.app = mock_app

        # Call the websocket endpoint
        # websocket_stream creates a task that we need to ensure doesn't block
        # Instead of a dummy coroutine, let's mock asyncio.create_task to just swallow the coroutine
        # and prevent the warning by awaiting and closing it, or not returning a coroutine at all from process_frames_consumer

        # Easy way to suppress RuntimeWarning for unawaited coroutine: mock the target function to return None
        # But create_task expects a coroutine. So we just patch create_task to consume it.
        def mock_create_task(coro):
            coro.close() # Close coroutine to avoid unawaited warning
            mock_task = MagicMock()
            mock_task.cancel = MagicMock()
            return mock_task

        with patch('asyncio.create_task', side_effect=mock_create_task):
            # Wait for it to return (it breaks out of the while True loop)
            await websocket_stream(mock_ws)

            # The websocket should have accepted the connection
            mock_ws.accept.assert_called_once()

            # The websocket should have closed with code 1009
            mock_ws.close.assert_called_once_with(code=1009, reason="Message Too Big")

if __name__ == '__main__':
    unittest.main()
