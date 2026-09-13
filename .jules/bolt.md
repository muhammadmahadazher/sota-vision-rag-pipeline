## 2024-05-24 - [process_frames_consumer Test Coverage]
**Learning:** Adding test coverage for internal exceptions in asynchronous consumer tasks ensures disconnect handling logic works as expected. We used `asyncio.Queue` and `cv2.imencode` to simulate processing errors and validated that the fallback `send_json` executes correctly.
**Action:** When testing similar async consumer pipelines, decouple network receiving from frame processing, and inject errors via mock side effects to verify error handling paths.
## 2024-11-06 - [Fix Token Validation Timing Attack]
**Learning:** Python's `secrets.compare_digest` is vulnerable to timing attacks if the input string lengths are not equal, as it checks length first.
**Action:** Always hash user-supplied tokens and expected tokens before comparing them using `secrets.compare_digest`.
