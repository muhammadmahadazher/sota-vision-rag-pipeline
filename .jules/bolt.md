## 2023-10-25 - Cache streaming DB queries
**Learning:** High-frequency websocket consumers can easily overload downstream dependencies like vector databases if queries are executed per-frame.
**Action:** Implement temporal caching thresholds directly inside the event loop (e.g., `now - last_query_time >= 1.0`) to reuse context and drastically reduce external DB queries while preserving necessary semantic context for downstream generation tasks.
