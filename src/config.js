// --- Configuration ---
export const PIXEL_WIDTH = 192;
export const PIXEL_HEIGHT = 256;
export const LOW_RES_WIDTH = PIXEL_WIDTH / 2;
export const LOW_RES_HEIGHT = PIXEL_HEIGHT / 2;
export const FPS = 3;
export const FRAME_INTERVAL = 1000 / FPS;
export const FADE_DURATION_MS = 10;
export const DEBUG = true; // Disables standalone being required

export const BUILT_IN_PALETTES = [
  "palettes/bastille-8-32x.png",
  "palettes/berry-nebula-32x.png",
  "palettes/calm-sunset-32x.png",
  "palettes/cga-palette-1-low-32x.png",
  "palettes/cyclope6-32x.png",
  "palettes/dawnbringers-8-color-32x.png",
  "palettes/eulbink-32x.png",
  "palettes/funkyfuture-8-32x.png",
  "palettes/galaxy-flame-32x.png",
  "palettes/golden-flame-32x.png",
  "palettes/ink-32x.png",
  "palettes/ink-crimson-32x.png",
  "palettes/japanese-woodblock-32x.png",
  "palettes/lost-century-32x.png",
  "palettes/midnight-ablaze-32x.png",
  "palettes/mushroom-32x.png",
  "palettes/na16-32x.png",
  "palettes/nintendo-gameboy-bgb-32x.png",
  "palettes/odd-feeling-32x.png",
  "palettes/oil-6-32x.png",
  "palettes/pollen8-32x.png",
  "palettes/rust-gold-8-32x.png",
  "palettes/seafoam-32x.png",
  "palettes/sirens-at-night-32x.png",
  "palettes/slso8-32x.png",
  "palettes/smooth-polished-silver-32x.png",
  "palettes/steam-lords-32x.png",
  "palettes/sunset-red-32x.png",
  "palettes/twilight-5-32x.png",
  "palettes/vividmemory8-32x.png",
  "palettes/wish-gb-32x.png",
];

// --- Layout Constants ---
export const LAYOUT = {
  PORTRAIT_TOP_CHROME_H: 20,
  PORTRAIT_BOTTOM_CHROME_H: 32,
  LANDSCAPE_SIDE_CHROME_W: 30,
  SHUTTER_RADIUS: 8.5,
  BUTTON_RADIUS: 5,
  SWATCH_SIZE: 5,
  PADDING: 2.5,
  BUTTON_GAP: 22,
};
