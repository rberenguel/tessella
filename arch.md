### High-Level Overview (20250826)

The application is a real-time camera effects app that renders its entire interface—both the video feed and the UI controls—onto a single HTML `<canvas>` element.

The core of its architecture is a **responsive layout system** designed to remain visually stable and consistent across device orientations (portrait/landscape) and despite the unpredictable resizing of mobile browser viewports (e.g., when the URL bar appears or disappears).

---

### Core Architectural Principles

The entire rendering pipeline is built on three key principles:

1.  **A Stable Unit System:** The layout is not defined in pixels or simple percentages of width/height, which can be unreliable. Instead, it's based on a single, consistent source of truth: a **`unit`**, where `1 unit = 1% of the screen's shortest dimension`. All sizes, positions, and spacing for UI elements and layout areas are defined in terms of this stable unit. This ensures that a button defined as being `8 units` in radius will have the exact same apparent size relative to the screen in both portrait and landscape modes.

2.  **Declarative Layout via a Centralized `LAYOUT` Object:** All the "magic numbers" that define the app's appearance are centralized in a single `LAYOUT` constant object at the top of the file. This object declaratively defines the proportions of the chrome bands, the sizes of the buttons, and the spacing between them. This makes the app's design explicit and incredibly easy to tune without digging through rendering logic.

3.  **"Chrome & Viewfinder" Rendering Model:** The screen is partitioned into distinct areas before anything is drawn. First, we reserve **"chrome bands"** at the edges of the screen (top/bottom in portrait, left/right in landscape). Then, the remaining central area becomes the **"viewfinder"**. The video feed is drawn to fill this viewfinder, while the UI is drawn exclusively within the chrome bands. This model guarantees that the UI never overlaps the video and that the camera feed is always maximized in the available space.

---

### Component Breakdown & Data Flow

The rendering process for each frame follows a clear sequence orchestrated by a few key functions.

#### 1. `init()` & `handleOrientationAndResize()` - The Orchestrator

- The `init()` function sets up the application, attaching event listeners for user input (`click`, `long-press`) and, most importantly, the `resize` event.
- The `handleOrientationAndResize()` function is the cornerstone of the app's responsiveness. It fires whenever the screen size or orientation changes and immediately **resizes the canvas's drawing buffer** to match the new viewport dimensions. It then triggers a `drawScene` call to render the updated layout.

#### 2. `processFrame(source)` - The Image Processor

- This function's sole responsibility is to take a raw video frame and convert it into the final, low-resolution, pixel-art style image.
- It's **orientation-aware**: it looks at the viewport's aspect ratio and produces a `processedCanvas` that matches (e.g., a wide, low-res image for landscape; a tall, low-res image for portrait).
- It intelligently **crops** the source video to fit this target aspect ratio, ensuring no stretching or distortion.

#### 3. `drawScene(source)` - The Master Renderer

- This is the heart of the rendering pipeline for every frame.
- **Step 1: Calculate Layout:** It reads the constants from the `LAYOUT` object and, using the `unit` system, calculates the precise pixel dimensions of the chrome bands and the central viewfinder for the current screen size.
- **Step 2: Render Video:** It takes the `processedCanvas` from `processFrame()` and draws it into the viewfinder rectangle. It uses a **"cover" scaling algorithm**, ensuring the video feed completely fills the viewfinder, maximizing the field of view by cropping any overflow.
- **Step 3: Delegate UI:** It finishes by calling `drawUI()` to render the controls on top.

#### 4. `drawUI(ctx)` - The UI Renderer

- This function is responsible for drawing all the user interface elements.
- It uses the exact same `LAYOUT` constants and `unit` calculations as `drawScene` to determine the sizes and positions for the palette and buttons.
- It then draws these elements squarely within the chrome bands, guaranteeing they are correctly positioned, consistently sized, and never overlap the video feed.
