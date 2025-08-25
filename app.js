import { quantize } from "./quantizer.js";
import { initHaptic, triggerHaptic } from "./haptic.js";

// --- Configuration ---
const PIXEL_WIDTH = 192; // 3 * 64
const PIXEL_HEIGHT = 256; // 4 * 64
const LOW_RES_WIDTH = PIXEL_WIDTH / 2; // ADD THIS
const LOW_RES_HEIGHT = PIXEL_HEIGHT / 2; // ADD THIS
const FPS = 1;
const FRAME_INTERVAL = 1000 / FPS;
const FADE_DURATION_MS = 250; // How long the fade between frames takes

// ls palettes/ | awk '{printf "\"palettes/%s\", ", $1}' | sed 's/, $//' | awk '{print "const DEFAULT_PALETTES = [" $0 "];"}'

const DEFAULT_PALETTES = [
  "palettes/berry-nebula-32x.png",
  "palettes/chocomilk-8-32x.png",
  "palettes/cl8uds-32x.png",
  "palettes/dawnbringers-8-color-32x.png",
  "palettes/eulbink-32x.png",
  "palettes/funkyfuture-8-32x.png",
  "palettes/hope-diamond-32x.png",
  "palettes/ink-32x.png",
  "palettes/inkpink-32x.png",
  "palettes/kirokaze-gameboy-32x.png",
  "palettes/midnight-ablaze-32x.png",
  "palettes/nintendo-gameboy-bgb-32x.png",
  "palettes/oil-6-32x.png",
  "palettes/pollen8-32x.png",
  "palettes/rust-gold-8-32x.png",
  "palettes/seafoam-32x.png",
  "palettes/slso8-32x.png",
  "palettes/twilight-5-32x.png",
  "palettes/wish-gb-32x.png",
];

// --- State ---
let currentPalette = null;
let currentPaletteIndex = 0;
let isLive = true;
let activeRenderLoop = null;
let frozenFrameSource = null;
let isLowRes = false;

// --- DOM Elements ---
const video = document.getElementById("videoFeed");
const canvas = document.getElementById("displayCanvas");
const shutterBtn = document.getElementById("shutterBtn");
const palettePreview = document.getElementById("palettePreview");
const imageInput = document.getElementById("imageInput");
const resToggleBtn = document.getElementById("resToggleBtn"); // ADD THIS
const transitionCanvas = document.getElementById("transitionCanvas"); // ADD THIS
const reverseCameraBtn = document.getElementById("reverseCameraBtn"); // ADD THIS

// --- Camera Constraints ---
const frontCameraConstraints = {
  video: {
    facingMode: "user",
  },
};

const backCameraConstraints = {
  video: {
    facingMode: "environment",
  },
};

// --- Main App Logic ---

async function _startCameraWithConstraints(constraints) {
  try {
    // Stop all tracks on the current stream before starting a new one
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // --- FIX #2: Explicitly play the video to fix the frozen/looping feed ---
    // We await this to ensure the video is playing before we start our render loop.
    await video.play();

    isLive = true;
    runLiveView(); // Start the render loop
  } catch (err) {
    // Handle orientation lock errors or camera permission errors
    if (err.name === "NotSupportedError") {
      // Orientation lock failed, but we can continue.
      console.warn("Screen orientation lock is not supported on this browser.");
    } else {
      alert("Could not access the camera. Please grant permission.");
      console.error("Camera access error:", err);
    }
  }
}

async function processFrame(source) {
  const targetWidth = isLowRes ? LOW_RES_WIDTH : PIXEL_WIDTH;
  const targetHeight = isLowRes ? LOW_RES_HEIGHT : PIXEL_HEIGHT;
  await new Promise((resolve) => setTimeout(resolve, 10));

  const lowResCanvas = document.createElement("canvas");
  lowResCanvas.width = targetWidth;
  lowResCanvas.height = targetHeight;
  const lowResCtx = lowResCanvas.getContext("2d");

  // --- Step 1: Create a correctly oriented temporary source ---
  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;
  const needsRotation =
    screen.orientation && screen.orientation.type.includes("landscape");

  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  if (needsRotation) {
    // If landscape, rotate it 90 degrees onto the temp canvas
    tempCanvas.width = sourceHeight;
    tempCanvas.height = sourceWidth;
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate(Math.PI / 2);
    tempCtx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2);
  } else {
    // If portrait, just copy it over
    tempCanvas.width = sourceWidth;
    tempCanvas.height = sourceHeight;
    tempCtx.drawImage(source, 0, 0);
  }
  // `tempCanvas` is now a correctly oriented portrait image source.

  // --- Step 2: Center-crop the oriented source onto the low-res canvas ---
  const s = { width: tempCanvas.width, height: tempCanvas.height };
  const sRatio = s.width / s.height;
  const tRatio = targetWidth / targetHeight;

  let sx = 0,
    sy = 0,
    sWidth = s.width,
    sHeight = s.height;

  if (sRatio > tRatio) {
    // Source is wider than target
    sWidth = s.height * tRatio;
    sx = (s.width - sWidth) / 2;
  } else {
    // Source is taller than target
    sHeight = s.width / tRatio;
    sy = (s.height - sHeight) / 2;
  }

  lowResCtx.drawImage(
    tempCanvas,
    sx,
    sy,
    sWidth,
    sHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  // --- Step 3: Quantize and display (unchanged) ---
  const imageData = lowResCtx.getImageData(0, 0, targetWidth, targetHeight);
  quantize(imageData, currentPalette);

  lowResCtx.putImageData(imageData, 0, 0);
  const displayCtx = canvas.getContext("2d");
  canvas.width = lowResCanvas.width;
  canvas.height = lowResCanvas.height;
  displayCtx.imageSmoothingEnabled = false;
  displayCtx.drawImage(lowResCanvas, 0, 0, canvas.width, canvas.height);

  //loader.style.display = 'none';
}

function updateTheme(palette) {
  const getLuminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const sorted = [...palette].sort(
    (a, b) => getLuminance(...a) - getLuminance(...b),
  );
  const darkest = sorted[0];
  const lightest = sorted[sorted.length - 1];

  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const themeColor = isDarkMode
    ? `rgb(${darkest.join(",")})`
    : `rgb(${lightest.join(",")})`;

  document.documentElement.style.setProperty("--chrome-bg", themeColor);
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", themeColor);
}

function displayPalette(palette) {
  palettePreview.innerHTML = "";
  palette.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.backgroundColor = `rgb(${color.join(",")})`;
    palettePreview.appendChild(swatch);
  });
}

async function loadPalette(source) {
  const img = new Image();
  img.src = source;
  await new Promise((resolve) => {
    img.onload = resolve;
  });

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = img.width;
  offscreenCanvas.height = img.height;
  const ctx = offscreenCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
  const uniqueColors = new Set();

  for (let i = 0; i < imageData.length; i += 4) {
    if (imageData[i + 3] < 255) continue;
    uniqueColors.add(`${imageData[i]},${imageData[i + 1]},${imageData[i + 2]}`);
  }

  currentPalette = Array.from(uniqueColors).map((str) =>
    str.split(",").map(Number),
  );

  if (source.startsWith("data:image")) {
    localStorage.setItem("savedPalette", source);
  }

  displayPalette(currentPalette);
  updateTheme(currentPalette);
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    video.srcObject = stream;

    // --- FIX #2: Explicitly play the video to fix the frozen/looping feed ---
    // We await this to ensure the video is playing before we start our render loop.
    await video.play();

    isLive = true;
    runLiveView(); // Start the render loop
  } catch (err) {
    // Handle orientation lock errors or camera permission errors
    if (err.name === "NotSupportedError") {
      // Orientation lock failed, but we can continue.
      console.warn("Screen orientation lock is not supported on this browser.");
    } else {
      alert("Could not access the camera. Please grant permission.");
      console.error("Camera access error:", err);
    }
  }
}

async function runLiveView() {
  if (!isLive) return; // Stop the loop if not live

  // --- Crossfade Logic ---
  // 1. Capture the "before" state onto the top (transition) canvas
  const transitionCtx = transitionCanvas.getContext("2d");
  transitionCanvas.width = canvas.width;
  transitionCanvas.height = canvas.height;
  // Only draw if the canvas has content, otherwise it's black
  if (canvas.width > 0) {
    transitionCtx.drawImage(canvas, 0, 0);
  }

  // 2. Make the top canvas visible instantly, holding the old frame
  transitionCanvas.style.transition = "none";
  transitionCanvas.style.opacity = "1";

  // 3. Process the NEW frame and draw it to the main (hidden) canvas
  await processFrame(video);

  // 4. Fade the transition canvas out to reveal the new frame
  transitionCanvas.style.transition = `opacity ${FADE_DURATION_MS}ms ease-out`;
  transitionCanvas.style.opacity = "0";

  // 5. Schedule the next frame
  setTimeout(runLiveView, FRAME_INTERVAL);
}

// --- Event Listeners ---

palettePreview.addEventListener("click", async () => {
  const originalPaletteIndex = currentPaletteIndex;
  currentPaletteIndex = (currentPaletteIndex + 1) % DEFAULT_PALETTES.length;

  // If the view is frozen and the palette is actually changing, animate it
  if (
    !isLive &&
    frozenFrameSource &&
    originalPaletteIndex !== currentPaletteIndex
  ) {
    // 1. Capture the "before" state onto the top canvas
    const transitionCtx = transitionCanvas.getContext("2d");
    transitionCanvas.width = canvas.width;
    transitionCanvas.height = canvas.height;
    transitionCtx.drawImage(canvas, 0, 0);

    // 2. Make the top canvas visible instantly
    transitionCanvas.style.transition = "none";
    transitionCanvas.style.opacity = "1";

    // 3. Load the new palette and re-process the image onto the hidden bottom canvas
    const nextPalette = DEFAULT_PALETTES[currentPaletteIndex];
    localStorage.setItem("savedPalette", ""); // Clear custom palette
    await loadPalette(nextPalette);
    await processFrame(frozenFrameSource);

    // 4. Use a tiny delay, then trigger the fade-out animation
    setTimeout(() => {
      transitionCanvas.style.transition = "opacity 0.3s ease-in-out";
      transitionCanvas.style.opacity = "0";
    }, 20);
  } else {
    // If live, or if the palette isn't changing, just load as normal
    const nextPalette = DEFAULT_PALETTES[currentPaletteIndex];
    await loadPalette(nextPalette);
  }
});

// --- Initialization ---

function handleShutterClickMobile() {
  isLive = !isLive; // Toggle the live state

  if (isLive) {
    // If we are resuming, restart the loop
    shutterBtn.style.borderColor = "#fff";
    runLiveView();
  } else {
    triggerHaptic();
    setTimeout(() => triggerHaptic(), 50);
    // If we are freezing, save the current video frame to our source canvas
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    frozenFrameSource = canvas; // This is the crucial missing step

    shutterBtn.style.borderColor = "#34c759";
    // The `while(isLive)` loop in runLiveView will now stop on its own
  }
}

function handleImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  isLive = false; // Stop any active camera loop
  cancelAnimationFrame(activeRenderLoop);

  const img = new Image();
  img.onload = () => {
    frozenFrameSource = img; // Save the loaded image as the source
    processFrame(frozenFrameSource); // Process it
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
}

resToggleBtn.addEventListener("click", () => {
  triggerHaptic();
  isLowRes = !isLowRes;
  resToggleBtn.classList.toggle("active", isLowRes);

  if (!isLive && frozenFrameSource) {
    processFrame(frozenFrameSource);
  }
});

// --- Main Initialization ---
async function init() {
  initHaptic();
  // Load the last used or default palette first
  const savedPalette = localStorage.getItem("savedPalette");
  if (savedPalette) {
    await loadPalette(savedPalette);
  } else {
    await loadPalette(DEFAULT_PALETTES[0]);
  }

  // Check if we are on a desktop-like device
  const isDesktop = window.innerWidth > 1000;

  if (isDesktop) {
    // On desktop, the shutter button opens the file chooser
    shutterBtn.addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", handleImageFile);
    // You can add a function here to draw a "Click shutter to start" message on the canvas
  } else {
    // On mobile, the shutter button controls the camera
    shutterBtn.addEventListener("click", handleShutterClickMobile);
    let isFrontCamera = false; // State to track current camera
    _startCameraWithConstraints(backCameraConstraints); // Start with back camera

    reverseCameraBtn.addEventListener("click", () => {
      triggerHaptic();
      isFrontCamera = !isFrontCamera;
      const constraints = isFrontCamera
        ? frontCameraConstraints
        : backCameraConstraints;
      _startCameraWithConstraints(constraints);
    });
  }
  let pressTimer = null;

  const startPress = async (e) => {
    e.preventDefault();

    pressTimer = setTimeout(async () => {
      try {
        const blob = await new Promise((resolve) => {
          const upscaleFactor = isLowRes ? 16 : 8;
          const upscaledCanvas = document.createElement("canvas");
          upscaledCanvas.width = canvas.width * upscaleFactor;
          upscaledCanvas.height = canvas.height * upscaleFactor;
          const upscaledCtx = upscaledCanvas.getContext("2d");

          upscaledCtx.imageSmoothingEnabled = false;
          upscaledCtx.drawImage(
            canvas,
            0,
            0,
            canvas.width,
            canvas.height,
            0,
            0,
            upscaledCanvas.width,
            upscaledCanvas.height,
          );
          upscaledCanvas.toBlob(resolve, "image/png");
        });
        const file = new File([blob], `tessella-${Date.now()}.png`, {
          type: "image/png",
        });

        // --- MODIFIED CONDITION ---
        // Only try to use the Share API if we're on a mobile device
        if (
          !isDesktop &&
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({
            files: [file],
            title: "Tesseŀla",
          });
        } else {
          // Fallback to a direct download on desktop or unsupported mobile browsers
          const link = document.createElement("a");
          link.download = file.name;
          link.href = URL.createObjectURL(blob);
          link.click();
          URL.revokeObjectURL(link.href);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Share/Download failed:", err);
        }
      }
    }, 500);
  };
  const cancelPress = () => {
    clearTimeout(pressTimer);
  };

  // Attach listeners (this part is unchanged)
  canvas.addEventListener("mousedown", startPress);
  canvas.addEventListener("touchstart", startPress, { passive: false });

  canvas.addEventListener("mouseup", cancelPress);
  canvas.addEventListener("mouseleave", cancelPress);
  canvas.addEventListener("touchend", cancelPress);
  canvas.addEventListener("touchcancel", cancelPress);

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const handleOrientation = () => {
    const isLandscape = window.innerWidth > window.innerHeight;
    document.body.classList.toggle("landscape", isLandscape);
  };

  window.addEventListener("resize", handleOrientation);
  handleOrientation(); // Initial check
}

init();
