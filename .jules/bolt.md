## 2024-05-24 - [process_frames_consumer Test Coverage]
**Learning:** Adding test coverage for internal exceptions in asynchronous consumer tasks ensures disconnect handling logic works as expected. We used `asyncio.Queue` and `cv2.imencode` to simulate processing errors and validated that the fallback `send_json` executes correctly.
**Action:** When testing similar async consumer pipelines, decouple network receiving from frame processing, and inject errors via mock side effects to verify error handling paths.
