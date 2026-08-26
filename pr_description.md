🎯 **What:** The testing gap addressed
Added a comprehensive test file for `StreamController.tsx` because it was previously under-tested for its core lifecycle events like rendering the UI, starting and stopping streams via WebSockets, and correctly handling `onPacketUpdate` callbacks.

📊 **Coverage:** What scenarios are now tested
- Validates default view rendering correctly ("Use camera" buttons).
- Simulates clicking the camera stream start and stop buttons and interacting with `navigator.mediaDevices.getUserMedia`.
- Mocks WebSocket connections and verifies `onPacketUpdate` fires properly with constructed simulated frames containing bounding box info.

✨ **Result:** The improvement in test coverage
The component now has deterministic tests handling happy path media starts/stops and ensuring prop events for incoming AI detections are forwarded successfully, creating a safety net for future UI refactoring.
