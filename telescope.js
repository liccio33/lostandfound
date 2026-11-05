const view = document.getElementById("view");
const canvas = document.getElementById("sky");
const ctx = canvas.getContext("2d");

// ---------- 对焦环设置 ----------
const RING_BLOCK = 2;

// 顺序是：[外层厚度, 内层厚度]，单位是像素块
const RING_THICKNESSES = [6,9];
const RING_COUNT = RING_THICKNESSES.length;
const RING_GAP_BLOCKS = 1;

// 固定最内层的内缘位置。
// 数字越大，两层圆环整体越往镜头中心移动。
// 当前设置下，15 可以让两层环都留在画布范围内。
const INNERMOST_INSET_BLOCKS = 14;

const TICK_DEG = 6;
const TICK_LONG_EVERY = 5;
const RING_RANGE = Math.PI * 4 / 3;
// --------------------------------

// 计算每一层环的内外半径。
// radius、返回值和 blockSize 使用相同单位。
function getRingBounds(radius, ringIndex, blockSize = RING_BLOCK) {
  const innerRingInner =
    radius - INNERMOST_INSET_BLOCKS * blockSize;

  // 内层环固定在最内侧
  if (ringIndex === RING_COUNT - 1) {
    const inner = innerRingInner;
    const outer =
      inner + RING_THICKNESSES[ringIndex] * blockSize;

    return { inner, outer };
  }

  // 外层环从内层环向外扩展
  let inner = innerRingInner;

  for (let i = RING_COUNT - 1; i > ringIndex; i--) {
    inner +=
      (RING_THICKNESSES[i] + RING_GAP_BLOCKS) * blockSize;
  }

  const outer =
    inner + RING_THICKNESSES[ringIndex] * blockSize;

  return { inner, outer };
}

function getInnermostRadius(radius) {
  return getRingBounds(radius, RING_COUNT - 1).inner;
}

// 创建两层白色像素圆环
function makeRing() {
  const n = Math.round(canvas.width / RING_BLOCK);
  const ringCanvas = document.createElement("canvas");
  ringCanvas.width = ringCanvas.height = n;

  const ringCtx = ringCanvas.getContext("2d");
  const image = ringCtx.createImageData(n, n);
  const center = n / 2;
  const radius = n * 0.49;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const distance = Math.hypot(
        x + 0.5 - center,
        y + 0.5 - center
      );

      for (let ringIndex = 0; ringIndex < RING_COUNT; ringIndex++) {
        // 这里的半径单位是低分辨率 canvas 的像素，
        // 所以 blockSize 用 1。
        const { inner, outer } =
          getRingBounds(radius, ringIndex, 1);

        if (distance >= inner && distance <= outer) {
          const pixel = (y * n + x) * 4;
          image.data[pixel] = 255;
          image.data[pixel + 1] = 255;
          image.data[pixel + 2] = 255;
          image.data[pixel + 3] = 255;
          break;
        }
      }
    }
  }

  ringCtx.putImageData(image, 0, 0);
  return ringCanvas;
}

const ringCanvas = makeRing();

let focus = 0;
const ringAngles = Array(RING_COUNT).fill(0);

let magnification = 1;
let cameraX = 0;
let cameraY = 0;
let seed = 82931;

function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const stars = Array.from({ length: 1200 }, () => ({
  x: random() * 9 - 4.5,
  y: random() * 9 - 4.5,
  size: random() > 0.9 ? 3 : random() > 0.56 ? 2 : 1,
  light: 0.35 + random() * 0.65
}));

const constellation = [
  [-0.48, -0.26],
  [-0.30, -0.48],
  [-0.10, -0.38],
  [0.10, -0.62],
  [0.30, -0.47],
  [0.52, -0.70],
  [-0.28, -0.10],
  [0.02, -0.12],
  [0.24, 0.10],
  [0.50, -0.08]
];

const connections = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [1, 6], [6, 7], [7, 3], [7, 8], [8, 9], [4, 9]
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// 在每一层白色圆环上画刻度
function drawTicks(center, radius, ringIndex) {
  const block = RING_BLOCK;
  const { inner, outer } = getRingBounds(radius, ringIndex);
  const count = Math.round(360 / TICK_DEG);

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "#070808";

  for (let i = 0; i < count; i++) {
    const angle =
      (i * TICK_DEG * Math.PI) / 180 +
      ringAngles[ringIndex] -
      Math.PI / 2;

    const length = i % TICK_LONG_EVERY === 0 ? 3 : 2;

    for (let j = 0; j < length; j++) {
      // 从圆环内侧往外画刻度
      const distance = inner + block * (1.5 + j);

      // 避免刻度画出圆环
      if (distance > outer) break;

      const x =
        Math.floor((center + distance * Math.cos(angle)) / block) *
        block;
      const y =
        Math.floor((center + distance * Math.sin(angle)) / block) *
        block;

      ctx.fillRect(x, y, block, block);
    }
  }

  ctx.restore();
}

// 固定在顶部的一个白色三角形指示标记
function drawIndicator(center, radius) {
  const { outer } = getRingBounds(radius, 0);
  const block = RING_BLOCK;
  const top = Math.floor((center - outer) / block) * block + 16 * block;

  const rows = [12, 10, 8, 6, 4, 2, 1];
  const outlineRows = [14, 14, 14, 12, 10, 8, 6, 4, 3];

  // 先画黑色描边
  ctx.fillStyle = "#070808";
  outlineRows.forEach((width, index) => {
    ctx.fillRect(
      center - (width * block) / 2,
      top - block + index * block,
      width * block,
      block
    );
  });

  // 再画白色三角形
  ctx.fillStyle = "#fff";
  rows.forEach((width, index) => {
    ctx.fillRect(
      center - (width * block) / 2,
      top + index * block,
      width * block,
      block
    );
  });
}

function draw() {
  const size = canvas.width;
  const center = size / 2;
  const radius = size * 0.49;
  const innerRadius = getInnermostRadius(radius);
  const scale = radius * 0.9 * magnification;

  ctx.clearRect(0, 0, size, size);

  // 圆形镜头视野
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, innerRadius + 1, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "#070808";
  ctx.fillRect(0, 0, size, size);

  // 星星随焦距逐渐变清晰
  ctx.filter = `blur(${(1 - focus / 100) * 5}px)`;

  for (const star of stars) {
    const x = center + (star.x - cameraX) * scale;
    const y = center + (star.y - cameraY) * scale;

    if (x < 0 || x > size || y < 0 || y > size) continue;

    ctx.globalAlpha = star.light * (0.48 + focus / 190);
    ctx.fillStyle = "#e1e3dc";
    ctx.fillRect(Math.round(x), Math.round(y), star.size, star.size);
  }

  // 星图只在镜头对准目标区域、并且焦距足够清晰时渐渐出现
  const targetX = center + (0 - cameraX) * scale;
  const targetY = center + (0 - cameraY) * scale;
  const targetDistance = Math.hypot(
    targetX - center,
    targetY - center
  );

  const alignment = 1 - targetDistance / (radius * 0.62);
  const alignmentFade = smoothstep(alignment);
  const focusFade = smoothstep((focus - 8) / 88);
  const reveal = alignmentFade * focusFade;

  if (reveal > 0.005) {
    ctx.filter = `blur(${(1 - reveal) * 2}px)`;
    ctx.globalAlpha = Math.min(0.85, reveal);
    ctx.strokeStyle = "#d8dbd3";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    for (const [a, b] of connections) {
      const ax = center + (constellation[a][0] - cameraX) * scale;
      const ay = center + (constellation[a][1] - cameraY) * scale;
      const bx = center + (constellation[b][0] - cameraX) * scale;
      const by = center + (constellation[b][1] - cameraY) * scale;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    for (const [x, y] of constellation) {
      const px = center + (x - cameraX) * scale;
      const py = center + (y - cameraY) * scale;

      ctx.fillStyle = "#e5e7df";
      ctx.fillRect(
        Math.round(px - 2),
        Math.round(py - 2),
        4,
        4
      );
    }
  }

  ctx.filter = "none";
  ctx.globalAlpha = 1;

  // 镜头边缘暗角
  const vignette = ctx.createRadialGradient(
    center,
    center,
    innerRadius * 0.62,
    center,
    center,
    innerRadius
  );

  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.78)");

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // 画两层圆环
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ringCanvas, 0, 0, canvas.width, canvas.height);

  // 每一层都画自己的刻度
  for (let ringIndex = 0; ringIndex < RING_COUNT; ringIndex++) {
    drawTicks(center, radius, ringIndex);
  }

  // 只画一个固定指示三角形
  drawIndicator(center, radius);
}

// ---------- 放大缩小 ----------
function setMagnification(value) {
  magnification = Math.max(0.3, Math.min(3.5, value));
  document.getElementById("zoom").textContent =
    `×${magnification.toFixed(1)}`;
  draw();
}

// ---------- 转动某一层对焦环 ----------
function setRing(ringIndex, angle) {
  ringAngles[ringIndex] = Math.max(
    0,
    Math.min(RING_RANGE, angle)
  );

  // 两层共同影响最终焦距
  const totalProgress = ringAngles.reduce(
    (sum, ringAngle) => sum + ringAngle / RING_RANGE,
    0
  );

  focus = (totalProgress / RING_COUNT) * 100;
  draw();
}

// 判断鼠标位于哪一层对焦环上
function getRingIndex(event) {
  const rect = view.getBoundingClientRect();
  const dx = (event.clientX - rect.left) / rect.width - 0.5;
  const dy = (event.clientY - rect.top) / rect.height - 0.5;

  const distance = Math.hypot(
    dx * canvas.width,
    dy * canvas.height
  );

  for (let ringIndex = 0; ringIndex < RING_COUNT; ringIndex++) {
    const { inner, outer } = getRingBounds(
      canvas.width * 0.49,
      ringIndex
    );

    if (distance >= inner && distance <= outer) {
      return ringIndex;
    }
  }

  return -1;
}

// 鼠标相对镜头中心的角度
function pointerAngle(event) {
  const rect = view.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return Math.atan2(
    event.clientY - centerY,
    event.clientX - centerX
  );
}

let ringDrag = null;
let panStart = null;

// ---------- 鼠标和触控操作 ----------
const pointers = new Map();
let pinchStart = null;

function pointerDistance() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

view.addEventListener("pointerdown", (event) => {
  const ringIndex = getRingIndex(event);

  if (ringIndex !== -1) {
    ringDrag = {
      id: event.pointerId,
      index: ringIndex,
      last: pointerAngle(event)
    };

    view.setPointerCapture(event.pointerId);
    view.style.cursor = "grabbing";
    return;
  }

pointers.set(event.pointerId, {
  x: event.clientX,
  y: event.clientY
});

view.setPointerCapture(event.pointerId);

if (pointers.size === 1) {
  panStart = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    cameraX,
    cameraY
  };
}

if (pointers.size === 2) {
  panStart = null;
  pinchStart = {
    dist: pointerDistance() || 1,
    mag: magnification
  };
}
});

function releasePointer(event) {
  if (ringDrag && event.pointerId === ringDrag.id) {
    ringDrag = null;
    view.style.cursor =
      getRingIndex(event) !== -1 ? "grab" : "crosshair";
    return;
  }

  pointers.delete(event.pointerId);
  pinchStart = null;
}

view.addEventListener("pointerup", releasePointer);
view.addEventListener("pointercancel", releasePointer);

view.addEventListener("pointermove", (event) => {
  // 拖动圆环：旋转对应的那一层
  if (ringDrag && event.pointerId === ringDrag.id) {
    const angle = pointerAngle(event);
    let difference = angle - ringDrag.last;

    if (difference > Math.PI) difference -= Math.PI * 2;
    if (difference < -Math.PI) difference += Math.PI * 2;

    ringDrag.last = angle;

    setRing(
      ringDrag.index,
      ringAngles[ringDrag.index] + difference
    );
    return;
  }

  if (pointers.has(event.pointerId)) {
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
  }

  // 双指捏合缩放
  if (pointers.size === 2 && pinchStart) {
    setMagnification(
      pinchStart.mag * pointerDistance() / pinchStart.dist
    );
    return;
  }

  // 按住并拖动才移动星空
  if (panStart && event.pointerId === panStart.id && pointers.size === 1) {
    const rect = view.getBoundingClientRect();
    const pixelsPerUnit = canvas.width * 0.49 * 0.9 * magnification;

    const dx = (event.clientX - panStart.x) * (canvas.width / rect.width);
    const dy = (event.clientY - panStart.y) * (canvas.height / rect.height);

    cameraX = panStart.cameraX - dx / pixelsPerUnit;
    cameraY = panStart.cameraY - dy / pixelsPerUnit;

    view.style.cursor = "grabbing";
    draw();
    return;
  }

  view.style.cursor = getRingIndex(event) !== -1 ? "grab" : "crosshair";
});

// WASD / 方向键移动视野
const KEY_STEP = 0.08;

const keyDirections = {
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1]
};

window.addEventListener("keydown", (event) => {
  const direction = keyDirections[event.code];
  if (!direction) return;

  event.preventDefault();

  cameraX += (direction[0] * KEY_STEP) / magnification;
  cameraY += (direction[1] * KEY_STEP) / magnification;
  draw();
});


// 滚轮缩放
view.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    const speed = event.ctrlKey ? 0.01 : 0.002;
    setMagnification(
      magnification * Math.exp(-event.deltaY * speed)
    );
  },
  { passive: false }
);

document.getElementById("zoomIn").addEventListener("click", () => {
  setMagnification(+(magnification + 0.2).toFixed(1));
});

document.getElementById("zoomOut").addEventListener("click", () => {
  setMagnification(+(magnification - 0.2).toFixed(1));
});

// 鼠标在控制栏上时不移动星空
const controls = document.querySelector(".controls");

["pointerdown", "pointermove"].forEach((type) => {
  controls.addEventListener(type, (event) => {
    event.stopPropagation();
  });
});

draw();