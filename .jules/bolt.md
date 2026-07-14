## 2025-02-09 - Qdrant Vector Upsert Performance
**Learning:** In the `qdrant-client`, serializing a large list of `models.PointStruct` objects incurs significant overhead due to Pydantic validation (e.g. ~10s for 100k items).
**Action:** Always use `models.Batch(ids=..., vectors=..., payloads=...)` for bulk insertions (`upsert`), as it drastically reduces serialization time (e.g. ~4s for 100k items) and is the officially recommended approach for batch operations.
## 2025-02-24 - Efficient Bulk Operations in Qdrant \n**Learning:** Instantiating `models.Batch` explicitly rather than iterating over individual `models.PointStruct` objects leads to significantly lower Python serialization overhead. \n**Action:** Use `models.Batch(ids, vectors, payloads)` for all Qdrant `upsert` operations instead of passing lists of `PointStructs`.\n
## 2024-07-14 - Test FastAPI endpoints with TestClient
**Learning:** Testing FastAPI endpoints with `fastapi.testclient.TestClient` requires the `httpx` package, which may need to be installed manually if not present in `requirements.txt`.
**Action:** When creating tests using `TestClient`, always ensure `httpx` is included in the project's dependencies and update `requirements.txt` if necessary.
