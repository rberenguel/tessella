# Camera Permissions Handling Plan

This document outlines the robust strategy for handling camera permissions, especially accounting for browsers like Safari on iOS where permissions can be revoked between sessions.

### 1. `idb-keyval` as the Source of Truth

- An `idb-keyval` item, `cameraPermissionGranted`, will be used to track the permission state across sessions.
- `true`: The app believes it has permission from a previous session.
- `false` or `null`: The app knows it does not have permission, or has not yet asked.

### 2. Startup Logic (`main.js`)

- On application load, the app will check `get('cameraPermissionGranted')`.
- **If `true`:**
  - The app will immediately attempt to start the camera (`startCameraWithConstraints`).
  - **Success:** The app functions normally.
  - **Failure (due to `NotAllowedError`):** This indicates the user has revoked permission since the last session. The `catch` block will:
    - Call `set('cameraPermissionGranted', false)`.
    - Trigger the "Permission Needed" UI state.
- **If `false` or `null`:**
  - The app will not attempt to start the camera.
  - It will immediately configure the UI to the "Permission Needed" state.

### 3. "Permission Needed" UI State (`ui.js`)

- The "Reverse Camera" button (`#reverseCameraBtn`) will be repurposed as a "Start Camera" button.
- Its icon will be changed from `iconoir-face-id` to `iconoir-camera`.
- A blinking CSS animation will be applied to the button to prompt the user for action.

### 4. User-Initiated Permission Request

- The primary action to get permission will be a click on the blinking "Start Camera" button.
- The event listener for this button will call `startCameraWithConstraints`.
- **On Success (`try` block):**
  - The camera stream will begin.
  - `set('cameraPermissionGranted', true)` will be called.
  - The button's icon, class, and event listener will be dynamically switched back to the standard "Reverse Camera" functionality. The blinking animation will be removed.
- **On Failure (`catch` block for `NotAllowedError`):**
  - `set('cameraPermissionGranted', false)` will be called to ensure the state is clean.
  - The button will stop blinking but remain in the "Start Camera" state, allowing the user to try again after changing system/browser settings.

This ensures the app always has a clear path to request permission when needed and can gracefully recover from permissions being revoked externally.
