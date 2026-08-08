const DEFAULT_PIXEL_DELTA = 28;
const DEFAULT_MIN_CHANGED_RATIO = 0.008;
const MIN_CHANGED_PIXELS = 24;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Finds the bounding region of meaningful luminance changes between two frames.
 * This intentionally small CPU fallback keeps the hosted demo useful even when
 * WebGPU, the optional object model, or its model host is unavailable.
 */
export function analyzeMotionPixels(
  current,
  previous,
  width,
  height,
  outputWidth = width,
  outputHeight = height,
  options = {},
) {
  if (
    !(current instanceof Uint8Array) ||
    !(previous instanceof Uint8Array) ||
    current.length !== previous.length ||
    current.length !== width * height ||
    width <= 0 ||
    height <= 0
  ) {
    return [];
  }

  const pixelDelta = options.pixelDelta ?? DEFAULT_PIXEL_DELTA;
  const minimumChanged = Math.max(
    MIN_CHANGED_PIXELS,
    Math.floor(current.length * (options.minChangedRatio ?? DEFAULT_MIN_CHANGED_RATIO)),
  );
  let changed = 0;
  let xmin = width;
  let ymin = height;
  let xmax = -1;
  let ymax = -1;

  for (let index = 0; index < current.length; index += 1) {
    if (Math.abs(current[index] - previous[index]) < pixelDelta) continue;
    changed += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    xmin = Math.min(xmin, x);
    ymin = Math.min(ymin, y);
    xmax = Math.max(xmax, x);
    ymax = Math.max(ymax, y);
  }

  if (changed < minimumChanged || xmax < xmin || ymax < ymin) return [];

  const padding = 2;
  const scaleX = outputWidth / width;
  const scaleY = outputHeight / height;
  const changedRatio = changed / current.length;
  return [{
    label: "motion region",
    score: clamp(0.56 + changedRatio * 2.5, 0.56, 0.94),
    box: {
      xmin: clamp((xmin - padding) * scaleX, 0, outputWidth),
      ymin: clamp((ymin - padding) * scaleY, 0, outputHeight),
      xmax: clamp((xmax + padding + 1) * scaleX, 0, outputWidth),
      ymax: clamp((ymax + padding + 1) * scaleY, 0, outputHeight),
    },
  }];
}
