🔒 Fix constant-time comparison bypass in token validation

🎯 **What:**
Modified the `token_is_valid` function in `backend/app/api/stream.py` to enforce authentication securely by:
1. Returning `False` (fail-closed) when `expected_token` is `None`.
2. Hashing the incoming and expected tokens using SHA-256 prior to validation with `secrets.compare_digest`.
Additionally updated test assertions in `test_stream_auth.py` and test setups in `test_stream_sec.py` to correctly test the updated behavior.

⚠️ **Risk:**
If left unfixed, the WebSocket stream possessed two significant security risks:
1. **Fail-open behavior:** When tokens were unconfigured (`expected_token=None`), the function incorrectly returned `True`, granting any client unauthorized access to the stream.
2. **Length-leak timing attack:** Python's `secrets.compare_digest` returns early when string lengths do not match. By hashing the tokens before comparing them, we obscure both the expected and provided lengths, rendering such timing attacks ineffective.

🛡️ **Solution:**
The function now correctly rejects connection attempts when tokens are not configured in production settings, acting as a secure default. Both strings are coalesced to safe empty strings before being independently hashed and robustly compared using standard library cryptography, fully mitigating length-based timing leaks. Unidiomatic `object.__new__` test configurations have been refactored into explicitly constructed `Settings` objects for maintainable testing.
