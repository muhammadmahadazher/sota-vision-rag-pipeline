import os
import re

stream_file = "backend/app/api/stream.py"
with open(stream_file, "r") as f:
    content = f.read()

# Make sure secrets is imported
if "import secrets" not in content:
    content = re.sub(r'(import logging\n)', r'\1import secrets\n', content)

# Fix the timing attack and logging vulnerability
search = """    if token != expected_token:
        logger.warning(f"Unauthorized WebSocket connection attempt. Token: {token}")"""

replace = """    if not token or not secrets.compare_digest(token, expected_token):
        logger.warning("Unauthorized WebSocket connection attempt.")"""

if search in content:
    content = content.replace(search, replace)
    with open(stream_file, "w") as f:
        f.write(content)
    print("Backend patched for better security.")
else:
    print("Could not find search string.")
