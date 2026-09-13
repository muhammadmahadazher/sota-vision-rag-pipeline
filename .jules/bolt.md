## 2024-05-24 - [process_frames_consumer Test Coverage]
**Learning:** Adding test coverage for internal exceptions in asynchronous consumer tasks ensures disconnect handling logic works as expected. We used `asyncio.Queue` and `cv2.imencode` to simulate processing errors and validated that the fallback `send_json` executes correctly.
**Action:** When testing similar async consumer pipelines, decouple network receiving from frame processing, and inject errors via mock side effects to verify error handling paths.
## 2024-05-24 - Optimize Temporal Object Verifier Candidate Selection
**Learning:** Using Python generators (e.g. `any(...)`) inside nested loops over small collections can introduce measurable overhead compared to direct iterations or lookup tables. Furthermore, iterating over a flattened list checking an O(N^2) condition is much slower than partitioning the list into subsets by categorical keys.
**Action:** When implementing filtering passes over object detections (like NMS candidates), group objects by label and use standard `for` loops instead of complex generator expressions.
