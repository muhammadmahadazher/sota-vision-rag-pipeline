## 2024-05-24 - Async cv2.imdecode
**Learning:** Synchronous cv2.imdecode blocking the event loop can drastically increase event loop latency (e.g. from 3ms up to 46ms max block during decoding).
**Action:** Always wrap `cv2.imdecode` (and similar cpu-bound tasks) in `asyncio.to_thread` when executing inside an async event loop (like FastAPI).
