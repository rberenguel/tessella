# Refactoring Plan for canvas.js

This document outlines the plan to refactor the monolithic `canvas.js` file into a modular structure within a `src/` directory.

## 1. Directory Structure

- Create a new `src/` directory to house all JavaScript source code.

## 2. File Splitting and Responsibilities

The existing `canvas.js` will be broken down into the following modules:

-   **`src/config.js`**: Will contain all static configuration and constants, such as `PIXEL_WIDTH`, `PIXEL_HEIGHT`, `BUILT_IN_PALETTES`, and the `LAYOUT` object.
-   **`src/state.js`**: Will manage the application's dynamic state. All state variables (`currentPalette`, `isLive`, `isLowRes`, etc.) will be defined and exported from here, along with functions to modify them.
-   **`src/camera.js`**: Will handle all camera-related functionality, including initialization (`startCameraWithConstraints`) and camera switching logic.
-   **`src/palette.js`**: Will be responsible for palette management, including loading palettes from sources (`getColorsFromSource`), applying them (`loadPalette`), and updating the UI theme (`displayPalette`, `updateTheme`).
-   **`src/ui.js`**: Will manage all user interface interactions and event handling. This includes setting up event listeners for buttons, modals, and handling orientation or resize events.
-   **`src/rendering.js`**: Will contain the core rendering pipeline, including processing video or image frames (`processFrame`) and drawing them to the canvas (`drawScene`, `runLiveView`).
-   **`src/main.js`**: Will serve as the main entry point for the application. It will import necessary modules and call the main `init()` function to start the application.

## 3. File Migration

- The following existing files and directories will be moved into the new `src/` directory:
    - `canvas.js` (as a temporary source for refactoring)
    - `quantizer.js`
    - `haptic.js`
    - `libs/`

## 4. HTML Update

- The `index.html` file will be updated to point to the new main entry point:
  ```html
  <script src="src/main.js" type="module"></script>
  ```

## 5. Execution Flow

1.  Create the `src/` directory.
2.  Move the specified files and directories into `src/`.
3.  Create the new empty module files (`config.js`, `state.js`, etc.) inside `src/`.
4.  Populate each new module by extracting the relevant code from the original `src/canvas.js`.
5.  Replace the old `canvas.js` with the new `main.js` and other modules, ensuring all imports and exports are correctly wired.
6.  Update the `<script>` tag in `index.html`.
7.  Delete the original `src/canvas.js` after all its code has been migrated.
