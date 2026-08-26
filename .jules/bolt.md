## 2025-02-09 - Qdrant Vector Upsert Performance
**Learning:** In the `qdrant-client`, serializing a large list of `models.PointStruct` objects incurs significant overhead due to Pydantic validation (e.g. ~10s for 100k items).
**Action:** Always use `models.Batch(ids=..., vectors=..., payloads=...)` for bulk insertions (`upsert`), as it drastically reduces serialization time (e.g. ~4s for 100k items) and is the officially recommended approach for batch operations.
## 2025-02-24 - Efficient Bulk Operations in Qdrant \n**Learning:** Instantiating `models.Batch` explicitly rather than iterating over individual `models.PointStruct` objects leads to significantly lower Python serialization overhead. \n**Action:** Use `models.Batch(ids, vectors, payloads)` for all Qdrant `upsert` operations instead of passing lists of `PointStructs`.\n
## 2024-07-14 - Test FastAPI endpoints with TestClient
**Learning:** Testing FastAPI endpoints with `fastapi.testclient.TestClient` requires the `httpx` package, which may need to be installed manually if not present in `requirements.txt`.
**Action:** When creating tests using `TestClient`, always ensure `httpx` is included in the project's dependencies and update `requirements.txt` if necessary.
## 2025-02-23 - Unoptimized Qdrant Batch Indexing
**Learning:** The benchmark script was iterating over vectors to insert them one-by-one via `index_entity`, which generates excessive HTTP/network overhead due to the N+1 query problem. Changing to a single batch insertion with `index_entities` brings indexing time down from over 1 second to ~0.02 seconds for 100 items.
**Action:** Always prefer bulk/batch API calls like `index_entities` over looping single insertions when dealing with multiple items to reduce latency and overhead.
## 2024-05-23 - Suboptimal Array Manipulation in Bounding Box Conversion
**Learning:** Calling `.tolist()` on individual rows of a NumPy array inside a Python loop (e.g., `for box in boxes: box.tolist()`) introduces significant overhead compared to converting the entire array at once upfront (e.g., `boxes.tolist()`).
**Action:** When extracting data from NumPy arrays, use vectorized operations like `.tolist()` on the whole array *before* iterating over the elements.
