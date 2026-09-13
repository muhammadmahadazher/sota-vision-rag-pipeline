## 2024-05-24 - [process_frames_consumer Test Coverage]
**Learning:** Adding test coverage for internal exceptions in asynchronous consumer tasks ensures disconnect handling logic works as expected. We used `asyncio.Queue` and `cv2.imencode` to simulate processing errors and validated that the fallback `send_json` executes correctly.
**Action:** When testing similar async consumer pipelines, decouple network receiving from frame processing, and inject errors via mock side effects to verify error handling paths.

## 2026-09-13 - Optimize PyTorch tensor to Python list conversion
**Learning:** Converting PyTorch tensors (like Ultralytics detection boxes) to NumPy arrays and then to Python lists via `.cpu().numpy().tolist()` allocates unnecessary intermediate objects. PyTorch's native `.tolist()` is much more efficient, automatically handling device-to-host transfers and constructing the nested lists directly.
**Action:** When working with PyTorch outputs that need to be serialized or zipped in pure Python, call `.tolist()` directly on the tensor instead of routing through NumPy.
