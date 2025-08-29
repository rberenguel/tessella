// --- Configuration ---
// This array is copied directly from your canvas.js file.
// If you add more palettes there, you'll need to update this list.
import { BUILT_IN_PALETTES } from "./src/config.js";
import { getColorsFromSource } from "./src/palette.js";



let loadedPalettes = new Map(); // Stores palette source URL -> [ [r,g,b], ... ]

/**
 * Main function to render all palettes to the DOM.
 */
async function renderPalettes() {
  const container = document.getElementById("palettes-container");
  const paletteCountSpan = document.getElementById("palette-count");
  if (!container) {
    console.error("Container element not found!");
    return;
  }

  // Pre-load all built-in palettes and store them in the cache
  for (const paletteSrc of BUILT_IN_PALETTES) {
    if (!loadedPalettes.has(paletteSrc)) {
      loadedPalettes.set(paletteSrc, await getColorsFromSource(paletteSrc));
    }
  }

  // Update the palette count after loading
  if (paletteCountSpan) {
    paletteCountSpan.textContent = `(${BUILT_IN_PALETTES.length} palettes)`;
  }

  // Loop through each palette source URL from the built-in palettes
  for (const paletteSrc of BUILT_IN_PALETTES) {
    try {
      // Create the main container for this palette
      const paletteItem = document.createElement("div");
      paletteItem.className = "palette-item";

      // Create and append the title as a link
      const title = document.createElement("h2");
      const titleLink = document.createElement("a");
      const paletteName = paletteSrc
        .replace("palettes/", "")
        .replace("-32x.png", "");
      titleLink.textContent = paletteName.replace(/-/g, " ");
      titleLink.href = `https://lospec.com/palette-list/${paletteName}`;
      titleLink.target = "_blank"; // Open in new tab
      title.appendChild(titleLink);
      paletteItem.appendChild(title);

      // Create the container for the color swatches
      const swatchContainer = document.createElement("div");
      swatchContainer.className = "swatch-container";

      // Get colors from cache
      const colors = loadedPalettes.get(paletteSrc);

      // Create and append a swatch for each color
      colors.forEach((color) => {
        const swatch = document.createElement("div");
        swatch.className = "swatch";
        swatch.style.backgroundColor = `rgb(${color.join(",")})`;
        swatchContainer.appendChild(swatch);
      });

      paletteItem.appendChild(swatchContainer);
      container.appendChild(paletteItem);
    } catch (error) {
      console.error(`Failed to load or process palette: ${paletteSrc}`, error);
      // Optionally, display an error message in the UI for the failed palette
      const errorItem = document.createElement("div");
      errorItem.className = "palette-item";
      errorItem.innerHTML = `<h2>Error loading ${paletteSrc}</h2>`;
      container.appendChild(errorItem);
    }
  }
}

// Run the main function once the window has loaded
window.onload = renderPalettes;
