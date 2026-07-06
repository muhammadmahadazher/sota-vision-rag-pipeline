## 2025-02-09 - Qdrant Vector Upsert Performance
**Learning:** In the `qdrant-client`, serializing a large list of `models.PointStruct` objects incurs significant overhead due to Pydantic validation (e.g. ~10s for 100k items).
**Action:** Always use `models.Batch(ids=..., vectors=..., payloads=...)` for bulk insertions (`upsert`), as it drastically reduces serialization time (e.g. ~4s for 100k items) and is the officially recommended approach for batch operations.
