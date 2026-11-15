/* =====================================================
   手机键盘特写：从左上方斜着看的像素画面（可以点）

   做法：先在三维空间里摆好机身、边框和每一个按键，
   再用"相机"从左上方投影到一块很小的画布上，一格格涂出来，
   最后把画布整数倍放大。所以画面是真的有透视的，又保持像素风格。

   用法：
     const pad = Keypad.init({ canvas, onPress: (key) => { ... } });
     pad.flash("5");        // 让某个键按下去一下（电脑键盘操作时用）
   ===================================================== */
const Keypad = (() => {
  "use strict";

  const W = 150, H = 172;                       // 画布大小（像素格子）

  const COLOR = {
    bg: "#000", white: "#fff", light: "#dfdfdf", face: "#c0c0c0",
    mid: "#808080", dark: "#404040", black: "#0a0a0a",
  };

  /* ---------- 三维小工具 ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

  /* ---------- 相机：站在手机的左边、上方、靠近自己的一侧 ----------
     世界坐标：x 向右，y 向上，z 朝向自己（手机的"下面"）。键盘表面在 y = 0。 */
  const TARGET = [26, 0, 46];
  const EYE = [TARGET[0] - 50, 275, TARGET[2] + 175];   // 想换角度就改这三个数：x 越负越偏左，y 越大越俯视
  const FWD = unit(sub(TARGET, EYE));
  const RIGHT = unit(cross(FWD, [0, 1, 0]));
  const UP = cross(RIGHT, FWD);

  let SCALE = 1, OX = 0, OY = 0;
  function project(p) {
    const d = sub(p, EYE);
    const z = dot(d, FWD);
    return [OX + (SCALE * dot(d, RIGHT)) / z, OY - (SCALE * dot(d, UP)) / z];
  }

  // 自动算缩放和位置：让键盘区占满画布宽度，机身上方被"裁掉"，像近距离特写
  (function fit() {
    SCALE = 1; OX = 0; OY = 0;
    const well = [[4, 0, 8], [48, 0, 8], [48, 0, 86], [4, 0, 86]].map(project);
    const bottom = [[0, 0, 90], [52, 0, 90], [0, -9, 90], [52, -9, 90]].map(project);
    const wx = well.map((p) => p[0]);
    const minX = Math.min(...wx), maxX = Math.max(...wx);
    const maxY = Math.max(...bottom.map((p) => p[1]));
    SCALE = (W * 0.8) / (maxX - minX);
    OX = (W - (maxX - minX) * SCALE) / 2 - minX * SCALE;
    OY = H - 5 - maxY * SCALE;
  })();

  /* ---------- 画布上的"一格一格"绘制 ---------- */
  let ctx;

  // 填充多边形：每个像素格取中心点判断，不做抗锯齿
  function fillPoly(pts, color) {
    ctx.fillStyle = color;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(H - 1, Math.floor(maxY - 0.5));
    const n = pts.length;
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
          xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.max(0, Math.ceil(xs[i] - 0.5)), x1 = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5));
        if (x1 >= x0) ctx.fillRect(x0, y, x1 - x0 + 1, 1);
      }
    }
  }

  // 画一条 1 格宽的线
  function line(a, b, color) {
    ctx.fillStyle = color;
    let x0 = Math.floor(a[0]), y0 = Math.floor(a[1]);
    const x1 = Math.floor(b[0]), y1 = Math.floor(b[1]);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 600; guard++) {
      if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function inside(poly, px, py) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  /* ---------- 形状 ---------- */
  const rot = (x, z, ang) => [x * Math.cos(ang) - z * Math.sin(ang), x * Math.sin(ang) + z * Math.cos(ang)];

  // 圆角矩形（在键盘表面上的平面图形），返回一圈 [x, z] 点
  function rrect(cx, cz, hx, hz, rc, ang = 0, seg = 4) {
    const out = [];
    const centers = [[hx - rc, hz - rc], [-(hx - rc), hz - rc], [-(hx - rc), -(hz - rc)], [hx - rc, -(hz - rc)]];
    centers.forEach(([ox, oz], q) => {
      for (let i = 0; i <= seg; i++) {
        const a = ((q * 90 + (i * 90) / seg) * Math.PI) / 180;
        const [rx, rz] = rot(ox + rc * Math.cos(a), oz + rc * Math.sin(a), ang);
        out.push([cx + rx, cz + rz]);
      }
    });
    return out;
  }

  // 圆环的一块扇形（方向键用）
  function sector(cx, cz, r1, r2, a0, a1, seg = 7) {
    const out = [];
    for (let i = 0; i <= seg; i++) { const a = a0 + ((a1 - a0) * i) / seg; out.push([cx + r1 * Math.cos(a), cz + r1 * Math.sin(a)]); }
    for (let i = seg; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / seg; out.push([cx + r2 * Math.cos(a), cz + r2 * Math.sin(a)]); }
    return out;
  }

  // 每条边朝外的方向（单位向量）
  function edgeNormals(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
    return poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return area > 0 ? [dz / l, -dx / l] : [-dz / l, dx / l];
    });
  }

  const LIGHT = unit([-0.7, 1, 0.55]);        // 光从左上方来
  function shade(n) {
    const v = dot(unit(n), LIGHT);
    return v > 0.5 ? COLOR.white : v > 0.1 ? COLOR.light : v > -0.35 ? COLOR.mid : COLOR.dark;
  }

  const at = (poly, y) => poly.map(([x, z]) => project([x, y, z]));

  /* ---------- 点阵字符（5 × 7），直接"贴"在按键表面上 ---------- */
  const FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
    "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "X": ["10001", "01010", "00100", "01010", "10001", "00000", "00000"],
    "call": ["0111110", "1100011", "1100011"],
    "dash": ["11111"],
    "up": ["00100", "01110", "11111"],
  };
  // 方向箭头：把"向上"的点阵转 90° 的整数倍
  function rotated(cells, quarter) {
    let g = cells.map((r) => r.split(""));
    for (let q = 0; q < quarter; q++) {
      const h = g.length, w = g[0].length;
      const n = Array.from({ length: w }, () => Array(h).fill("0"));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) n[x][h - 1 - y] = g[y][x];
      g = n;
    }
    return g.map((r) => r.join(""));
  }

  // 把点阵字符画到键面上：每个点投影成屏幕上的一小块
  function glyph(rows, cx, cz, y, ang, gs, color) {
    ctx.fillStyle = color;
    const h = rows.length, w = rows[0].length;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (rows[j][i] !== "1") continue;
        const ox = (i - (w - 1) / 2) * gs, oz = (j - (h - 1) / 2) * gs;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
          const [rx, rz] = rot(ox + dx * gs, oz + dz * gs, ang);
          const [sx, sy] = project([cx + rx, y, cz + rz]);
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
        const x0 = Math.floor(minX + 0.25), y0 = Math.floor(minY + 0.25);
        const x1 = Math.max(x0, Math.ceil(maxX - 0.25) - 1), y1 = Math.max(y0, Math.ceil(maxY - 0.25) - 1);
        ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      }
    }
  }

  /* ---------- 摆放：机身、按键 ---------- */
  const BODY_T = 9;                            // 机身厚度
  const KEY_H = 2.6, KEY_DOWN = 0.9;           // 按键高度 / 按下去以后的高度

  const KEYS = [
    { id: "soft-l", x: 9.5, z: 15, hx: 4.8, hz: 2.5, ang: -0.9, glyph: "dash" },
    { id: "soft-r", x: 42.5, z: 15, hx: 4.8, hz: 2.5, ang: 0.9, glyph: "dash" },
    { id: "call", x: 12, z: 38, hx: 6.2, hz: 3.4, glyph: "call" },
    { id: "c", x: 26, z: 38, hx: 5.2, hz: 3.4, glyph: "C" },
    { id: "end", x: 40, z: 38, hx: 6.2, hz: 3.4, glyph: "X", dark: true },
  ];
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].forEach((d, i) => {
    KEYS.push({ id: d, x: [12, 26, 40][i % 3], z: 49 + Math.floor(i / 3) * 10, hx: 5.8, hz: 3.9, glyph: d });
  });

  const DPAD = { x: 26, z: 21, r1: 10, r2: 4.4, h: 1.8 };   // 方向键圆环
  const OK = { x: 26, z: 21, r: 4, h: 3 };                // 中间的 OK 键
  const DIRS = [                                            // 方向键的四块扇形
    { id: "up", mid: -Math.PI / 2, quarter: 0 },
    { id: "right", mid: 0, quarter: 1 },
    { id: "down", mid: Math.PI / 2, quarter: 2 },
    { id: "left", mid: Math.PI, quarter: 3 },
  ];

  let pressed = new Set();
  let hits = [];                                            // 每个键在画面上占的位置（点击判断用）

  function addHit(id, poly) {
    let h = hits.find((x) => x.id === id);
    if (!h) { h = { id, polys: [] }; hits.push(h); }
    h.polys.push(poly);
  }

  // 一圈侧面（背对相机的不画）
  function drawSides(base, top, y0, y1, slant, id) {
    const norms = edgeNormals(base);
    for (let i = 0; i < base.length; i++) {
      const j = (i + 1) % base.length, n = norms[i];
      const mx = (base[i][0] + base[j][0]) / 2, mz = (base[i][1] + base[j][1]) / 2;
      if (n[0] * (EYE[0] - mx) + n[1] * (EYE[2] - mz) <= 0) continue;
      const quad = [
        project([base[i][0], y0, base[i][1]]), project([base[j][0], y0, base[j][1]]),
        project([top[j][0], y1, top[j][1]]), project([top[i][0], y1, top[i][1]]),
      ];
      fillPoly(quad, shade([n[0], slant, n[1]]));
      if (id) addHit(id, quad);
    }
  }

  // 顶面的描边：朝着光的边画白，其余画灰
  function drawRim(top, y, flat) {
    const norms = edgeNormals(top);
    for (let i = 0; i < top.length; i++) {
      const j = (i + 1) % top.length;
      const lit = !flat && dot([norms[i][0], 0.4, norms[i][1]], LIGHT) > 0.3;
      line(project([top[i][0], y, top[i][1]]), project([top[j][0], y, top[j][1]]), lit ? COLOR.white : COLOR.mid);
    }
  }

  function drawBody() {
    // 机身：向上一直延伸到画面外
    const outline = rrect(26, 15, 26, 75, 12, 0, 6);
    drawSides(outline, outline, 0, -BODY_T, 0, null);
    fillPoly(at(outline, 0), COLOR.face);                       // 边框（浅灰）
    drawRim(outline, 0);

    // 键盘区：凹进去的深灰底，描一圈黑线
    const well = rrect(26, 47, 22, 39, 6, 0, 4);
    fillPoly(at(well, 0), COLOR.mid);
    const wellPts = at(well, 0);
    for (let i = 0; i < wellPts.length; i++) line(wellPts[i], wellPts[(i + 1) % wellPts.length], COLOR.black);

    // 边框上的小螺丝和话筒孔
    for (const [sx, sz] of [[7, 8.5], [45, 8.5], [7, 86.5], [45, 86.5]]) {
      const dotPoly = rrect(sx, sz, 1.1, 1.1, 1.1, 0, 2);
      fillPoly(at(dotPoly, 0), COLOR.dark);
    }
    fillPoly(at(rrect(26, 88, 4, 0.6, 0.6, 0, 2), 0), COLOR.dark);
  }

  function drawKey(k) {
    const isDown = pressed.has(k.id);
    const h = isDown ? KEY_DOWN : KEY_H, rc = Math.min(k.hx, k.hz);
    const base = rrect(k.x, k.z, k.hx, k.hz, rc, k.ang || 0, 4);
    const bevel = 0.9;
    const top = rrect(k.x, k.z, k.hx - bevel, k.hz - bevel, Math.max(0.6, rc - bevel), k.ang || 0, 4);

    // 影子（光从左边来，影子落在右后方）
    fillPoly(at(base.map(([x, z]) => [x + h * 0.7, z - h * 0.5]), 0.02), COLOR.dark);
    drawSides(base, top, 0, h, 0.4, k.id);

    const topColor = k.dark ? COLOR.dark : isDown ? COLOR.face : COLOR.light;
    const topPoly = at(top, h);
    fillPoly(topPoly, topColor);
    addHit(k.id, topPoly);
    drawRim(top, h);

    const ink = k.dark ? COLOR.white : COLOR.black;
    if (k.glyph === "dash") glyph(FONT.dash, k.x, k.z, h, k.ang || 0, 0.9, ink);
    else glyph(FONT[k.glyph], k.x, k.z, h, 0, k.glyph === "call" ? 0.8 : 0.62, ink);
  }

  function drawDpad() {
    // 圆环下面的凹槽
    fillPoly(at(rrect(DPAD.x, DPAD.z, DPAD.r1 + 1.2, DPAD.r1 + 1.2, DPAD.r1 + 1.2, 0, 8), 0.02), COLOR.dark);
    const gap = 0.1;
    const items = DIRS.map((d) => ({ d, poly: sector(DPAD.x, DPAD.z, DPAD.r1, DPAD.r2, d.mid - Math.PI / 4 + gap, d.mid + Math.PI / 4 - gap) }));
    // 离相机远的先画
    items.sort((a, b) => depthOf(b.d.mid) - depthOf(a.d.mid));
    for (const { d, poly } of items) {
      const isDown = pressed.has(d.id), h = isDown ? 0.7 : DPAD.h;
      drawSides(poly, poly, 0, h, 0, d.id);
      const topPoly = at(poly, h);
      fillPoly(topPoly, isDown ? COLOR.face : COLOR.light);
      addHit(d.id, topPoly);
      drawRim(poly, h);
      // 箭头
      const ar = (DPAD.r1 + DPAD.r2) / 2;
      glyph(rotated(FONT.up, d.quarter), DPAD.x + ar * Math.cos(d.mid), DPAD.z + ar * Math.sin(d.mid), h, 0, 0.62, COLOR.black);
    }
    // 中间的 OK 键
    const isDown = pressed.has("ok"), h = isDown ? 1.6 : OK.h;
    const base = rrect(OK.x, OK.z, OK.r, OK.r, OK.r, 0, 8);
    const top = rrect(OK.x, OK.z, OK.r - 0.9, OK.r - 0.9, OK.r - 0.9, 0, 8);
    drawSides(base, top, 0, h, 0.4, "ok");
    const topPoly = at(top, h);
    fillPoly(topPoly, isDown ? COLOR.face : COLOR.white);
    addHit("ok", topPoly);
    drawRim(top, h, true);
  }

  const depthOf = (angle) => {                 // 圆环某个方向离相机有多远（越大越远）
    const p = [DPAD.x + DPAD.r1 * Math.cos(angle), 0, DPAD.z + DPAD.r1 * Math.sin(angle)];
    return Math.hypot(p[0] - EYE[0], p[1] - EYE[1], p[2] - EYE[2]);
  };

  function render() {
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, W, H);
    hits = [];
    drawBody();

    // 所有按键按"离相机的远近"排序，远的先画，近的盖在上面
    const dist = (x, z) => Math.hypot(x - EYE[0], EYE[1], z - EYE[2]);
    const things = KEYS.map((k) => ({ d: dist(k.x, k.z), draw: () => drawKey(k) }));
    things.push({ d: dist(DPAD.x, DPAD.z), draw: drawDpad });
    things.sort((a, b) => b.d - a.d);
    things.forEach((t) => t.draw());
  }

  /* ---------- 交互 ---------- */
  function hitTest(px, py) {
    for (let i = hits.length - 1; i >= 0; i--) {          // 后画的在上面，先判断
      if (hits[i].polys.some((poly) => inside(poly, px, py))) return hits[i].id;
    }
    return null;
  }

  function init({ canvas, onPress }) {
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d");
    render();

    const toPixel = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
    };

    let active = null;
    const release = () => {
      if (active === null) return;
      pressed.delete(active); active = null; render();
    };

    canvas.addEventListener("pointerdown", (e) => {
      const id = hitTest(...toPixel(e));
      if (!id) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      release();
      active = id;
      pressed.add(id);
      render();
      onPress(id);
    });
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointermove", (e) => {
      canvas.style.cursor = hitTest(...toPixel(e)) ? "pointer" : "default";
    });

    return {
      // 电脑键盘按下时，让对应的键也"按下去"一小会儿
      flash(id) {
        pressed.add(id); render();
        setTimeout(() => { if (active !== id) { pressed.delete(id); render(); } }, 110);
      },
      // 鼠标位置对应哪个键（没点到键就是 null）
      keyAt(clientX, clientY) { return hitTest(...toPixel({ clientX, clientY })); },
      // 这个键在画面上的中心（测试用）
      centerOf(id) {
        const h = hits.find((x) => x.id === id);
        if (!h) return null;
        const p = h.polys[h.polys.length - 1];
        return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
      },
    };
  }

  return { init };
})();