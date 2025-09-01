// --- State ---
export let currentPalette = null;
export let currentPaletteIndex = 0;
export let isLive = true;
export let frozenFrameSource = null;
export let lastProcessedFrame = null;
export let isLowRes = false;
export let isDithering = false;
export let isFrontCamera = false;
export let isDesktop = false;

export let allPalettes = []; // Stores palette objects: { name, id, colors, isCustom }

export let portraitHeight = null;
export let portraitWidth = null;

export function setCurrentPalette(palette) {
  currentPalette = palette;
}

export function setCurrentPaletteIndex(index) {
  currentPaletteIndex = index;
}

export function setLive(live) {
  isLive = live;
}

export function setFrozenFrameSource(source) {
  frozenFrameSource = source;
}

export function setLastProcessedFrame(frame) {
  lastProcessedFrame = frame;
}

export function setLowRes(lowRes) {
  isLowRes = lowRes;
}

export function setDithering(dithering) {
  isDithering = dithering;
}

export function setFrontCamera(frontCamera) {
  isFrontCamera = frontCamera;
}

export function setDesktop(desktop) {
  isDesktop = desktop;
}

export function setAllPalettes(palettes) {
  allPalettes = palettes;
}

export function setPortraitHeight(height) {
  portraitHeight = height;
}

export function setPortraitWidth(width) {
  portraitWidth = width;
}
