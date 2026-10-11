## 2024-05-24 - [process_frames_consumer Test Coverage]
**Learning:** Adding test coverage for internal exceptions in asynchronous consumer tasks ensures disconnect handling logic works as expected. We used `asyncio.Queue` and `cv2.imencode` to simulate processing errors and validated that the fallback `send_json` executes correctly.
**Action:** When testing similar async consumer pipelines, decouple network receiving from frame processing, and inject errors via mock side effects to verify error handling paths.

## 2026-09-13 - Optimize PyTorch tensor to Python list conversion
**Learning:** Converting PyTorch tensors (like Ultralytics detection boxes) to NumPy arrays and then to Python lists via `.cpu().numpy().tolist()` allocates unnecessary intermediate objects. PyTorch's native `.tolist()` is much more efficient, automatically handling device-to-host transfers and constructing the nested lists directly.
**Action:** When working with PyTorch outputs that need to be serialized or zipped in pure Python, call `.tolist()` directly on the tensor instead of routing through NumPy.
## $(date +%Y-%m-%d) - [Python Vector Validation Generator Expression]
**Learning:** [While replacing simple multi-line `for` loop property checks with one-line `any(generator expression)` is often stylistically preferred and requested for conciseness, benchmarks demonstrate that in standard CPython the function/generator overhead makes it marginally slower than a raw `for` loop early-exit.]
**Action:** [Implement concise code when requested, but always run real benchmarks. Do not assume shorter code is executed faster by the interpreter. Document the performance rationale clearly in PRs when satisfying stylistic constraints over raw millisecond execution time.]
## 2024-05-18 - Python Vector Validation Generator Expression Overhead
**Learning:** While replacing a simple multi-line `for` loop with a one-line `any(generator expression)` is often stylistically preferred for conciseness, benchmarks demonstrate that in standard CPython the function/generator setup overhead makes it marginally slower than a raw `for` loop early-exit for small lists.
**Action:** Implement concise code when requested or to improve readability, but run real benchmarks. Document the performance rationale clearly in PRs when a stylistic change is technically slower but preferred for maintainability or constraint adherence.
