🎯 What: Fixed a CRLF log injection vulnerability on the FastAPI WebSocket `/api/stream` endpoint where the `origin` HTTP header was logged directly via `logger.warning()` without sanitization.

⚠️ Risk: Unsanitized logging of HTTP headers allows an attacker to inject newline characters (`\r\n`) into the logs. This can be exploited to forge log entries, spoof events, obscure malicious activity, or disrupt automated log ingestion and parsing systems.

🛡️ Solution: Updated `origin_is_allowed` connection rejection in `backend/app/api/stream.py` to sanitize the user-controlled `origin` string by calling `.replace('\r', '').replace('\n', '')` before logging it. A test case was added to `backend/test_stream_sec.py` to mock an incoming request with CRLF and verify that `caplog` does not contain the injected newline patterns.
