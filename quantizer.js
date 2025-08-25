// --- Helper Functions ---
const getLuminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const colorDistance = (c1, c2) =>
  (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2;

// --- K-Means Clustering ---
function kmeans(pixels, k) {
  // 1. Initialize k centroids randomly from the pixel data
  let centroids = [];
    const step = Math.floor(pixels.length / k);
    for (let i = 0; i < k; i++) {
    // Pick colors at even intervals instead of randomly
    centroids.push(pixels[i * step]);
}

  let assignments = new Array(pixels.length);
  for (let iter = 0; iter < 15; iter++) {
    // Limit iterations
    // 2. Assign each pixel to the closest centroid
    for (let i = 0; i < pixels.length; i++) {
      let minDistance = Infinity;
      for (let j = 0; j < k; j++) {
        const distance = colorDistance(pixels[i], centroids[j]);
        if (distance < minDistance) {
          minDistance = distance;
          assignments[i] = j;
        }
      }
    }

    // 3. Recalculate centroids as the mean of assigned pixels
    let newCentroids = new Array(k).fill(0).map(() => [0, 0, 0]);
    let counts = new Array(k).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      const clusterIndex = assignments[i];
      newCentroids[clusterIndex][0] += pixels[i][0];
      newCentroids[clusterIndex][1] += pixels[i][1];
      newCentroids[clusterIndex][2] += pixels[i][2];
      counts[clusterIndex]++;
    }
    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) {
        newCentroids[i][0] /= counts[i];
        newCentroids[i][1] /= counts[i];
        newCentroids[i][2] /= counts[i];
      } else {
        // Handle empty clusters
        newCentroids[i] = pixels[Math.floor(Math.random() * pixels.length)];
      }
    }

    // 4. Check for convergence (or just use fixed iterations for simplicity)
    centroids = newCentroids;
  }
  return { centroids, assignments };
}

// --- Palette Mapping ---
function mapPalettesByLuminance(imagePalette, targetPalette) {
  const sortedImage = imagePalette
    .map((c, i) => ({ color: c, lum: getLuminance(...c), index: i }))
    .sort((a, b) => a.lum - b.lum);
  const sortedTarget = [...targetPalette].sort(
    (a, b) => getLuminance(...a) - getLuminance(...b),
  );

  const mapping = new Array(imagePalette.length);
  for (let i = 0; i < imagePalette.length; i++) {
    mapping[sortedImage[i].index] = sortedTarget[i];
  }
  return mapping;
}

// --- Main Quantization Logic ---
export function quantize(imageData, targetPalette) {
  const useKmeans = true,
    useDithering = true;
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Convert Uint8ClampedArray to a simple array of [r,g,b] pixels
  const originalPixels = [];
  for (let i = 0; i < data.length; i += 4) {
    originalPixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  let finalColors = new Array(originalPixels.length);

  if (useKmeans && targetPalette.length > 0) {
    // Step 1: K-Means on source image
    const { centroids: imagePalette, assignments } = kmeans(
      originalPixels,
      targetPalette.length,
    );

    // Step 2: Map the two palettes by luminance
    const colorMap = mapPalettesByLuminance(imagePalette, targetPalette);

    // Step 3: Assign the final mapped color to each pixel
    for (let i = 0; i < originalPixels.length; i++) {
      finalColors[i] = colorMap[assignments[i]];
    }
  } else if (targetPalette.length > 0) {
    // Direct mapping
    for (let i = 0; i < originalPixels.length; i++) {
      let minDistance = Infinity;
      let closestColor = targetPalette[0];
      for (const paletteColor of targetPalette) {
        const dist = colorDistance(originalPixels[i], paletteColor);
        if (dist < minDistance) {
          minDistance = dist;
          closestColor = paletteColor;
        }
      }
      finalColors[i] = closestColor;
    }
  } else {
    // No palette loaded, just return
    return;
  }

  // --- Final Render Pass (with optional dithering) ---
  if (useDithering) {
    const floatPixels = new Float32Array(originalPixels.flat());
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const i4 = i * 4;
        const finalColor = finalColors[i];

        const errR = floatPixels[i * 3] - finalColor[0];
        const errG = floatPixels[i * 3 + 1] - finalColor[1];
        const errB = floatPixels[i * 3 + 2] - finalColor[2];

        data[i4] = finalColor[0];
        data[i4 + 1] = finalColor[1];
        data[i4 + 2] = finalColor[2];

        const diffuse = (dx, dy, factor) => {
          if (x + dx >= 0 && x + dx < width && y + dy < height) {
            const ni = ((y + dy) * width + (x + dx)) * 3;
            floatPixels[ni] += errR * factor;
            floatPixels[ni + 1] += errG * factor;
            floatPixels[ni + 2] += errB * factor;
          }
        };
        diffuse(1, 0, 7 / 16);
        diffuse(-1, 1, 3 / 16);
        diffuse(0, 1, 5 / 16);
        diffuse(1, 1, 1 / 16);
      }
    }
  } else {
    // No dithering
    for (let i = 0; i < finalColors.length; i++) {
      const i4 = i * 4;
      data[i4] = finalColors[i][0];
      data[i4 + 1] = finalColors[i][1];
      data[i4 + 2] = finalColors[i][2];
    }
  }
}
