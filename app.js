import { quantize } from "./quantizer.js";

// --- Configuration ---
const PIXEL_WIDTH = 192; // 3 * 64
const PIXEL_HEIGHT = 256; // 4 * 64
const DEFAULT_PALETTES = ["palettes/slso8-32x.png", "palettes/pollen8-32x.png"];

// --- State ---
let currentPalette = null;
let currentPaletteIndex = 0;
let isLive = true;
let activeRenderLoop = null;
let frozenFrameSource = null;

// --- DOM Elements ---
const video = document.getElementById("videoFeed");
const canvas = document.getElementById("displayCanvas");
const shutterBtn = document.getElementById("shutterBtn");
const palettePreview = document.getElementById("palettePreview");
const imageInput = document.getElementById("imageInput");
const transitionCanvas = document.getElementById("transitionCanvas"); // ADD THIS

// --- Main App Logic ---

async function processFrame(source) {
  // (This function replaces the previous processFrame)

  if (!currentPalette || currentPalette.length === 0) {
    if (!isDesktop) alert("Please load a palette first!");
    return;
  }

  //loader.style.display = 'block';
  await new Promise((resolve) => setTimeout(resolve, 10));

  const lowResCanvas = document.createElement("canvas");
  lowResCanvas.width = PIXEL_WIDTH;
  lowResCanvas.height = PIXEL_HEIGHT;
  const lowResCtx = lowResCanvas.getContext("2d");

  // --- Step 1: Create a correctly oriented temporary source ---
  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;
  const needsRotation = sourceWidth > sourceHeight;

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
  const tRatio = PIXEL_WIDTH / PIXEL_HEIGHT;

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
    PIXEL_WIDTH,
    PIXEL_HEIGHT,
  );

  // --- Step 3: Quantize and display (unchanged) ---
  const imageData = lowResCtx.getImageData(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);
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
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });

    isLive = true;
    renderLoop();
  } catch (err) {
    alert("Could not access the camera. Please grant permission.");
    console.error("Camera access error:", err);
  }
}

function renderLoop() {
  if (!isLive) return;
  processFrame(video);
  activeRenderLoop = requestAnimationFrame(renderLoop);
}

// --- Event Listeners ---

shutterBtn.addEventListener("click", () => {
  isLive = !isLive; // Toggle live view
  if (isLive) {
    shutterBtn.style.borderColor = "#fff";
    renderLoop();
  } else {
    shutterBtn.style.borderColor = "#000000"; // Black for frozen state
    cancelAnimationFrame(activeRenderLoop);
  }
});

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
  isLive = !isLive; // Toggle live view
  if (isLive) {
    shutterBtn.style.borderColor = "#fff";
    renderLoop();
  } else {
    // --- ADD THIS BLOCK ---
    // Save the current video frame to a temporary canvas
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    frozenFrameSource = canvas;
    // ----------------------

    shutterBtn.style.borderColor = "#34c759";
    cancelAnimationFrame(activeRenderLoop);
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

// --- Main Initialization ---
async function init() {
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
    startCamera(); // Start the camera immediately on mobile
  }
}

init();
