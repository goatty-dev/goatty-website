import { BAYER_8X8 } from "@/scripts/dither3d";

/**
 * Paints a static, Bayer-dithered orange glow into each
 * `canvas[data-dither-glow]`, the same pixel language as the wordmark art.
 * It is drawn once per size change, never animated.
 */

const CELL_PX = 3;
const GLOW_RGB = [255, 90, 0] as const;

function paint(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(rect.width / CELL_PX));
  const h = Math.max(1, Math.ceil(rect.height / CELL_PX));
  if (canvas.width === w && canvas.height === h) return;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const image = ctx.createImageData(w, h);
  const data = image.data;

  for (let y = 0; y < h; y++) {
    // The glow rises from below the window, like light spilling out of it.
    const ny = (y / h - 0.62) * 2.1;
    for (let x = 0; x < w; x++) {
      const nx = (x / w - 0.5) * 2;
      const dist = Math.sqrt(nx * nx * 0.75 + ny * ny * 1.5);
      const falloff = Math.max(0, 1 - dist);
      const intensity = falloff ** 1.7 * 0.95;
      const threshold = BAYER_8X8[(y % 8) * 8 + (x % 8)];
      if (intensity <= threshold) continue;

      const i = (y * w + x) * 4;
      data[i] = GLOW_RGB[0];
      data[i + 1] = GLOW_RGB[1];
      data[i + 2] = GLOW_RGB[2];
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
}

export function initDitherGlow(): void {
  const canvases = document.querySelectorAll<HTMLCanvasElement>(
    "canvas[data-dither-glow]",
  );
  if (canvases.length === 0) return;

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      paint(entry.target as HTMLCanvasElement);
    }
  });

  for (const canvas of canvases) {
    paint(canvas);
    observer.observe(canvas);
  }
}
