// 可调参数
const PIXEL_CSS = 2;
const LOOP_SECONDS = 90;
const SEED = 20261031;
const SHOOTING_STARS = 3;

// 鼠标互动参数
const MOUSE_RADIUS = 23;
const MOUSE_STRENGTH = 10;
const RETURN_SPEED = 0.18;

const LAYERS = [
  { k: 1, size: 1, per: 320, twinkle: 0.30 },
  { k: 2, size: 1, per: 640, twinkle: 0.30 },
  { k: 4, size: 2, per: 3200, twinkle: 0.60, sparkle: true },
];

const canvas = document.querySelector("#sky");
const ctx = canvas.getContext("2d");
const windowFrame = document.querySelector("#window-frame");

let W;
let H;
let stars;
let hazeTile;
let shooters;

const pointer = { x: -1000, y: -1000 };

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;

    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function updatePointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();

  pointer.x = ((clientX - rect.left) / rect.width) * W;
  pointer.y = ((clientY - rect.top) / rect.height) * H;
}

function clearPointer() {
  pointer.x = -1000;
  pointer.y = -1000;
}

// 鼠标直接在星空页面上移动时
window.addEventListener("pointermove", (event) => {
  updatePointer(event.clientX, event.clientY);
});

window.addEventListener("pointerleave", clearPointer);

// 鼠标在全屏 window iframe 上移动时
window.addEventListener("message", (event) => {
  if (event.source !== windowFrame.contentWindow) return;

  if (event.data?.type === "starfield-pointer") {
    updatePointer(event.data.x, event.data.y);
  }

  if (event.data?.type === "starfield-pointer-leave") {
    clearPointer();
  }
});

// 生成点阵银河
function makeHaze(random) {
  const haze = document.createElement("canvas");
  haze.width = W;
  haze.height = H;

  const hazeCtx = haze.getContext("2d");
  const image = hazeCtx.createImageData(W, H);
  const tau = Math.PI * 2;

  const waves = Array.from({ length: 6 }, () => ({
    fx: 1 + Math.floor(random() * 4),
    fy: 1 + Math.floor(random() * 5),
    phase: random() * tau,
    amplitude: 0.5 + random() * 0.5,
  }));

  const totalAmplitude = waves.reduce(
    (sum, wave) => sum + wave.amplitude,
    0
  );

  const bayer = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const bandY = 0.5 + 0.22 * Math.sin(tau * (u + 0.1));
      const distanceFromBand = (v - bandY) / 0.15;
      const band = Math.exp(-distanceFromBand * distanceFromBand);

      let noise = 0;

      for (const wave of waves) {
        noise += wave.amplitude * Math.sin(
          tau * (wave.fx * u + wave.fy * v) + wave.phase
        );
      }

      noise = (noise / totalAmplitude) * 0.5 + 0.5;

      const density = band * (0.1 + 0.9 * noise * noise) * 0.26;
      const threshold = (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

      if (density > threshold) {
        const index = (y * W + x) * 4;

        image.data[index] = 255;
        image.data[index + 1] = 255;
        image.data[index + 2] = 255;
        image.data[index + 3] = 255;
      }
    }
  }

  hazeCtx.putImageData(image, 0, 0);
  return haze;
}

// 建立星星、银河和流星
function build() {
  const random = mulberry32(SEED);
  stars = [];

  for (const layer of LAYERS) {
    const count = Math.round((W * H) / layer.per);

    for (let i = 0; i < count; i++) {
      stars.push({
        layer,
        x: Math.floor(random() * W),
        y: Math.floor(random() * H),
        twinkle: random() < layer.twinkle,
        flashes: 2 + Math.floor(random() * 10),
        phase: random(),
        duty: 0.35 + random() * 0.4,
        cross: Boolean(layer.sparkle) && random() < 0.35,
        pushX: 10,
        pushY: 10,
      });
    }
  }

  hazeTile = makeHaze(random);

  shooters = Array.from({ length: SHOOTING_STARS }, (_, i) => ({
    start: (i + random() * 0.6) / SHOOTING_STARS,
    x: W * (0.5 + random() * 0.45),
    y: H * (0.05 + random() * 0.4),
    vx: -W * (0.22 + random() * 0.1),
    vy: H * (0.18 + random() * 0.12),
  }));
}

function draw(p) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";

  // 平移并循环银河点阵
  const hazeX = Math.floor(LAYERS[0].k * W * p) % W;

  ctx.drawImage(hazeTile, -hazeX, 0);
  ctx.drawImage(hazeTile, W - hazeX, 0);

  // 绘制星星和鼠标排斥效果
  for (const star of stars) {
    const shift = Math.floor(star.layer.k * W * p);
    const baseX = (((star.x - shift) % W) + W) % W;
    const baseY = star.y;

    let dx = baseX - pointer.x;
    let dy = baseY - pointer.y;
    let distance = Math.hypot(dx, dy);

    let targetX = 0;
    let targetY = 0;

    if (distance < MOUSE_RADIUS) {
      if (distance < 0.1) {
        dx = 1;
        distance = 1;
      }

      const push =
        (1 - distance / MOUSE_RADIUS) * MOUSE_STRENGTH;

      targetX = (dx / distance) * push;
      targetY = (dy / distance) * push;
    }

    // 平滑地移开，再平滑地回位
    star.pushX += (targetX - star.pushX) * RETURN_SPEED;
    star.pushY += (targetY - star.pushY) * RETURN_SPEED;

    if (
      star.twinkle &&
      ((star.flashes * p + star.phase) % 1) >= star.duty
    ) {
      continue;
    }

    const x = Math.round(baseX + star.pushX);
    const y = Math.round(baseY + star.pushY);

    ctx.fillRect(x, y, star.layer.size, star.layer.size);

    if (star.cross) {
      ctx.fillRect(x - 2, y, 5, 1);
      ctx.fillRect(x, y - 2, 1, 5);
    }
  }

  // 绘制流星
  const duration = 1.4 / LOOP_SECONDS;

  for (const meteor of shooters) {
    let progress = (p - meteor.start) % 1;

    if (progress < 0) {
      progress += 1;
    }

    if (progress >= duration) continue;

    const t = progress / duration;

    for (let i = 0; i < 10; i++) {
      const tailProgress = t - i * 0.035;

      if (tailProgress < 0) break;
      if (i > 2 && i % 2) continue;

      const size = i === 0 ? 2 : 1;

      ctx.fillRect(
        Math.round(meteor.x + meteor.vx * tailProgress),
        Math.round(meteor.y + meteor.vy * tailProgress),
        size,
        size
      );
    }
  }
}

// 根据屏幕尺寸重建画布
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const blockSize = Math.max(1, Math.round(PIXEL_CSS * dpr));

  W = Math.ceil((window.innerWidth * dpr) / blockSize);
  H = Math.ceil((window.innerHeight * dpr) / blockSize);

  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${(W * blockSize) / dpr}px`;
  canvas.style.height = `${(H * blockSize) / dpr}px`;

  build();
}

function frame(now) {
  const progress = ((now / 1000) / LOOP_SECONDS) % 1;
  draw(progress);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);

resize();
requestAnimationFrame(frame);




