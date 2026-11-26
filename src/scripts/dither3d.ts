interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface BoxSpec {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  rx?: number;
  ry?: number;
  rz?: number;
  topScaleX?: number;
  topScaleZ?: number;
  floatAmp?: number;
  floatPhase?: number;
  pressAmp?: number;
  pressPhase?: number;
  arcIndex?: number;
}

// 8x8 Bayer ordered dithering matrix (64 threshold levels for smooth gradient transitions)
const BAYER_8X8_RAW = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];
export const BAYER_8X8 = BAYER_8X8_RAW.map((v) => (v + 0.5) / 64);

const CUBE_VERTS: readonly Vec3[] = [
  { x: -0.5, y: -0.5, z: -0.5 }, // 0 bottom
  { x: 0.5, y: -0.5, z: -0.5 }, // 1 bottom
  { x: 0.5, y: 0.5, z: -0.5 }, // 2 top
  { x: -0.5, y: 0.5, z: -0.5 }, // 3 top
  { x: -0.5, y: -0.5, z: 0.5 }, // 4 bottom
  { x: 0.5, y: -0.5, z: 0.5 }, // 5 bottom
  { x: 0.5, y: 0.5, z: 0.5 }, // 6 top
  { x: -0.5, y: 0.5, z: 0.5 }, // 7 top
];

interface FaceDef {
  indices: readonly [number, number, number, number];
  normal: Vec3;
}

const CUBE_FACES: readonly FaceDef[] = [
  { indices: [4, 5, 6, 7], normal: { x: 0, y: 0, z: 1 } },
  { indices: [1, 0, 3, 2], normal: { x: 0, y: 0, z: -1 } },
  { indices: [3, 2, 6, 7], normal: { x: 0, y: 1, z: 0 } },
  { indices: [0, 1, 5, 4], normal: { x: 0, y: -1, z: 0 } },
  { indices: [1, 5, 6, 2], normal: { x: 1, y: 0, z: 0 } },
  { indices: [4, 0, 3, 7], normal: { x: -1, y: 0, z: 0 } },
];

const LIGHT_DIR = normalize({ x: -0.46, y: 0.86, z: 0.52 });

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

interface ProjectedVertex {
  sx: number;
  sy: number;
  z: number;
  lum: number;
}

function rotatePointEuler(p: Vec3, rx: number, ry: number, rz: number): Vec3 {
  let { x, y, z } = p;
  if (rz !== 0) {
    const cz = Math.cos(rz);
    const sz = Math.sin(rz);
    const nx = x * cz - y * sz;
    const ny = x * sz + y * cz;
    x = nx;
    y = ny;
  }
  if (rx !== 0) {
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    const ny = y * cx - z * sx;
    const nz = y * sx + z * cx;
    y = ny;
    z = nz;
  }
  if (ry !== 0) {
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const nx = x * cy + z * sy;
    const nz = -x * sy + z * cy;
    x = nx;
    z = nz;
  }
  return { x, y, z };
}

function rotatePoint(
  p: Vec3,
  sinX: number,
  cosX: number,
  sinY: number,
  cosY: number,
): Vec3 {
  const x1 = p.x * cosY + p.z * sinY;
  const z1 = -p.x * sinY + p.z * cosY;
  const y2 = p.y * cosX - z1 * sinX;
  const z2 = p.y * sinX + z1 * cosX;
  return { x: x1, y: y2, z: z2 };
}

function edgeFn(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function rasterTri(
  a: ProjectedVertex,
  b: ProjectedVertex,
  c: ProjectedVertex,
  r: number,
  g: number,
  bCol: number,
  data: Uint8ClampedArray,
  zBuffer: Float32Array,
  bufW: number,
  bufH: number,
): void {
  const area = edgeFn(a.sx, a.sy, b.sx, b.sy, c.sx, c.sy);
  if (Math.abs(area) < 0.001) return;

  const minX = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx)));
  const maxX = Math.min(bufW - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx)));
  const minY = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy)));
  const maxY = Math.min(bufH - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy)));

  const invArea = 1 / area;

  for (let py = minY; py <= maxY; py++) {
    const cy = py + 0.5;
    const rowOffset = py * bufW;
    const bayerRow = (py & 7) * 8;

    for (let px = minX; px <= maxX; px++) {
      const cx = px + 0.5;
      const w0 = edgeFn(b.sx, b.sy, c.sx, c.sy, cx, cy) * invArea;
      const w1 = edgeFn(c.sx, c.sy, a.sx, a.sy, cx, cy) * invArea;
      const w2 = edgeFn(a.sx, a.sy, b.sx, b.sy, cx, cy) * invArea;

      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;

      const z = w0 * a.z + w1 * b.z + w2 * c.z;
      const idx = rowOffset + px;
      if (z <= zBuffer[idx]) continue;

      zBuffer[idx] = z;

      const lum = w0 * a.lum + w1 * b.lum + w2 * c.lum;
      const threshold = BAYER_8X8[bayerRow + (px & 7)];
      const pIdx = idx * 4;

      if (lum > threshold) {
        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = bCol;
        data[pIdx + 3] = 255;
      } else {
        data[pIdx + 3] = 0;
      }
    }
  }
}

function renderBoxes(
  imageData: ImageData,
  zBuffer: Float32Array,
  boxes: readonly BoxSpec[],
  pitch: number,
  yaw: number,
  hoverMix: number,
  timeSec: number,
  bufW: number,
  bufH: number,
  scale: number,
  camDist: number,
  lightSweepX = 0,
): void {
  const data = imageData.data;
  data.fill(0);
  zBuffer.fill(-1e9);

  const sinX = Math.sin(pitch);
  const cosX = Math.cos(pitch);
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);

  const halfW = bufW * 0.5;
  const halfH = bufH * 0.5;

  const rCol = Math.round(234 + (255 - 234) * hoverMix);
  const gCol = Math.round(234 + (90 - 234) * hoverMix);
  const bCol = Math.round(232 + (0 - 232) * hoverMix);

  const rotatedPoints: Vec3[] = new Array(8);
  const screenVerts: ProjectedVertex[] = new Array(8);

  for (const box of boxes) {
    let cx = box.cx;
    let cy = box.cy;
    let cz = box.cz;

    if (box.floatAmp && timeSec > 0) {
      cy += Math.sin(timeSec * 1.45 + (box.floatPhase ?? 0)) * box.floatAmp;
    }

    if (box.pressAmp && timeSec > 0) {
      const wave = Math.max(0, Math.sin(timeSec * 1.8 - (box.pressPhase ?? 0)));
      cy -= wave * wave * box.pressAmp;
    }

    if (box.arcIndex !== undefined) {
      const speed = 0.24;
      const t = (((timeSec * speed + box.arcIndex / 5) % 1) + 1) % 1;
      cx = -0.6 + t * 1.2;
      cy = 0.24 + Math.sin(t * Math.PI) * 0.34;
      cz = 0.16 - t * 0.32;
    }

    const lrx = box.rx ?? 0;
    const lry = box.ry ?? 0;
    const lrz = box.rz ?? 0;
    const tsx = box.topScaleX ?? 1;
    const tsz = box.topScaleZ ?? 1;

    for (let i = 0; i < 8; i++) {
      const cv = CUBE_VERTS[i];
      const isTop = cv.y > 0;
      const scaled: Vec3 = {
        x: cv.x * box.sx * (isTop ? tsx : 1),
        y: cv.y * box.sy,
        z: cv.z * box.sz * (isTop ? tsz : 1),
      };
      const localRot =
        lrx !== 0 || lry !== 0 || lrz !== 0
          ? rotatePointEuler(scaled, lrx, lry, lrz)
          : scaled;

      const world: Vec3 = {
        x: cx + localRot.x,
        y: cy + localRot.y,
        z: cz + localRot.z,
      };
      const rot = rotatePoint(world, sinX, cosX, sinY, cosY);
      rotatedPoints[i] = rot;
      const persp = camDist / (camDist - rot.z);
      screenVerts[i] = {
        sx: halfW + rot.x * scale * persp,
        sy: halfH - rot.y * scale * persp,
        z: rot.z,
        lum: 0.5,
      };
    }

    for (const face of CUBE_FACES) {
      const localNormal =
        lrx !== 0 || lry !== 0 || lrz !== 0
          ? rotatePointEuler(face.normal, lrx, lry, lrz)
          : face.normal;
      const rotNorm = rotatePoint(localNormal, sinX, cosX, sinY, cosY);
      if (rotNorm.z <= 0.02) continue;

      const baseDot = Math.max(
        0,
        rotNorm.x * LIGHT_DIR.x +
          rotNorm.y * LIGHT_DIR.y +
          rotNorm.z * LIGHT_DIR.z,
      );

      const [i0, i1, i2, i3] = face.indices;
      const faceVertIndices = [i0, i1, i2, i3];
      const faceVerts: ProjectedVertex[] = new Array(4);

      for (let k = 0; k < 4; k++) {
        const idx = faceVertIndices[k];
        const rp = rotatedPoints[idx];
        const sv = screenVerts[idx];

        const isWide = bufW > 240;
        const spatialGrad = isWide
          ? rp.y * 0.14 -
            rp.x * 0.03 +
            rp.z * 0.14 -
            (rp.x * rp.x * 0.008 + rp.y * rp.y * 0.03)
          : rp.y * 0.16 -
            rp.x * 0.11 +
            rp.z * 0.14 -
            (rp.x * rp.x + rp.y * rp.y) * 0.04;
        const sweepBoost =
          lightSweepX !== 0
            ? Math.max(0, 1 - Math.abs(rp.x - lightSweepX) * 0.45) * 0.24
            : 0;

        const lum = Math.max(
          isWide ? 0.14 : 0.08,
          Math.min(0.98, 0.22 + baseDot * 0.64 + spatialGrad + sweepBoost),
        );
        faceVerts[k] = { sx: sv.sx, sy: sv.sy, z: sv.z, lum };
      }

      rasterTri(
        faceVerts[0],
        faceVerts[1],
        faceVerts[2],
        rCol,
        gCol,
        bCol,
        data,
        zBuffer,
        bufW,
        bufH,
      );
      rasterTri(
        faceVerts[0],
        faceVerts[2],
        faceVerts[3],
        rCol,
        gCol,
        bCol,
        data,
        zBuffer,
        bufW,
        bufH,
      );
    }
  }
}

// 5x6 crisp pixel-font bitmaps for the 3D dithered bottom typographic artwork: "> goatty"
const PIXEL_FONT: Record<string, readonly string[]> = {
  ">": ["100", "010", "001", "010", "100", "000"],
  g: ["01110", "10001", "10001", "01111", "00001", "01110"],
  o: ["01110", "10001", "10001", "10001", "01110", "00000"],
  a: ["01110", "00001", "01111", "10001", "01111", "00000"],
  t: ["0100", "1110", "0100", "0100", "0011", "0000"],
  y: ["10001", "10001", "01111", "00001", "01110", "00000"],
};

function buildWordmarkBoxes(): BoxSpec[] {
  const glyphs = [">", " ", "g", "o", "a", "t", "t", "y"];
  const cell = 0.145;
  const gap = 0.15;

  const boxes: BoxSpec[] = [];
  let cursorCol = 0;

  for (const ch of glyphs) {
    if (ch === " ") {
      cursorCol += 1.6;
      continue;
    }
    const rows = PIXEL_FONT[ch];
    if (!rows) continue;
    const cols = rows[0].length;

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols; c++) {
        if (rows[r][c] !== "1") continue;
        const wx = (cursorCol + c + 0.5) * cell;
        const wy = (2.5 - r) * cell;
        boxes.push({
          cx: wx,
          cy: wy,
          cz: 0,
          sx: cell * 0.94,
          sy: cell * 0.94,
          sz: cell * 2.1,
          floatAmp: 0.045,
          floatPhase: (cursorCol + c) * 0.35 + r * 0.25,
        });
      }
    }
    cursorCol += cols + gap / cell;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.cx - box.sx * 0.5);
    maxX = Math.max(maxX, box.cx + box.sx * 0.5);
    minY = Math.min(minY, box.cy - box.sy * 0.5);
    maxY = Math.max(maxY, box.cy + box.sy * 0.5);
  }
  const offsetX = (minX + maxX) * 0.5;
  const offsetY = (minY + maxY) * 0.5;
  for (const box of boxes) {
    box.cx -= offsetX;
    box.cy -= offsetY;
  }

  return boxes;
}

export function initDitherWordmark(): void {
  const canvas = document.querySelector<HTMLCanvasElement>(
    "canvas[data-dither-wordmark]",
  );
  if (!canvas) return;

  const W = 360;
  const H = 100;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const imageData = ctx.createImageData(W, H);
  const zBuffer = new Float32Array(W * H);
  const boxes = buildWordmarkBoxes();
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const basePitch = 0.22;
  const baseYaw = 0;

  let currentPitch = basePitch;
  let currentYaw = baseYaw;
  let currentHover = 0;

  let targetPitch = basePitch;
  let targetYaw = baseYaw;
  let targetHover = 0;

  let isVisible = true;
  let rafId = 0;
  const startTime = performance.now();

  const drawFrame = (nowMs: number): void => {
    const timeSec = reducedMotion ? 0 : (nowMs - startTime) * 0.001;
    const idleYaw = reducedMotion ? 0 : Math.sin(timeSec * 0.55) * 0.11;
    const idlePitch = reducedMotion ? 0 : Math.cos(timeSec * 0.45) * 0.045;
    const sweepX = reducedMotion ? 0 : Math.sin(timeSec * 0.85) * 1.45;

    renderBoxes(
      imageData,
      zBuffer,
      boxes,
      currentPitch + idlePitch,
      currentYaw + idleYaw,
      currentHover,
      timeSec,
      W,
      H,
      50,
      8.5,
      sweepX,
    );
    ctx.putImageData(imageData, 0, 0);
  };

  const tick = (nowMs: number): void => {
    currentPitch += (targetPitch - currentPitch) * 0.1;
    currentYaw += (targetYaw - currentYaw) * 0.1;
    currentHover += (targetHover - currentHover) * 0.1;

    drawFrame(nowMs);

    if (isVisible && !reducedMotion) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  };

  const startLoop = (): void => {
    if (!rafId && isVisible && !reducedMotion) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0]?.isIntersecting ?? true;
      if (isVisible && !reducedMotion) startLoop();
    },
    { threshold: 0.05 },
  );
  observer.observe(canvas);

  const stage = canvas.closest(".wordmark-stage") ?? canvas;

  stage.addEventListener("pointerenter", () => {
    targetHover = 1;
    if (reducedMotion) {
      currentHover = 1;
      drawFrame(performance.now());
    } else {
      startLoop();
    }
  });

  stage.addEventListener("pointermove", (ev) => {
    const event = ev as PointerEvent;
    if (event.pointerType === "touch") return;
    const rect = stage.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    targetHover = 1;
    targetYaw = baseYaw + nx * 0.24;
    targetPitch = basePitch - ny * 0.16;
    if (!reducedMotion) startLoop();
  });

  stage.addEventListener("pointerleave", () => {
    targetHover = 0;
    targetYaw = baseYaw;
    targetPitch = basePitch;
    if (reducedMotion) {
      currentHover = 0;
      drawFrame(performance.now());
    }
  });

  drawFrame(startTime);
  if (!reducedMotion) startLoop();
}
