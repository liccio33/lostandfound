(() => {
  "use strict";

  /* =====================================================
     一、让整个页面按整数倍缩放（所有像素点一样大，也不会出现滚动条）
     ===================================================== */
  const STAGE_W = 400, STAGE_H = 225;       // 页面是 400 × 225 个"像素格子"

  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.floor(Math.min(
      (window.innerWidth * dpr) / STAGE_W,
      (window.innerHeight * dpr) / STAGE_H
    )));
    document.documentElement.style.setProperty("--px", s / dpr + "px");
  }
  fit();
  window.addEventListener("resize", fit);

  /* =====================================================
     二、可以自己改的设置
     ===================================================== */
  const COLS = 32;                          // 滚筒一圈有多少个位置（一圈就是一遍曲子）
  const BASE_SPEED = 5;                     // 滚筒每秒转过几个位置（越大越快）
  const SECONDS_PER_TURN = 6;               // 把手转一整圈，能播放多少秒
  const MAX_SPRING = 60;                    // 发条最多存多少秒

  // 12 根金属条，从高音到低音。用 C 大调五声音阶，所以随便怎么摆都不会难听。
  const NOTES = [
    { name: "D6", freq: 1174.66 }, { name: "C6", freq: 1046.5 },
    { name: "A5", freq: 880.0 },   { name: "G5", freq: 783.99 },
    { name: "E5", freq: 659.25 },  { name: "D5", freq: 587.33 },
    { name: "C5", freq: 523.25 },  { name: "A4", freq: 440.0 },
    { name: "G4", freq: 392.0 },   { name: "E4", freq: 329.63 },
    { name: "D4", freq: 293.66 },  { name: "C4", freq: 261.63 },
  ];
  const ROWS = NOTES.length;

  // DEMO 按钮里的小曲子：[第几个位置, 第几根金属条（0 是最高音）]
  const DEMO = [
    [0, 4], [0, 11], [2, 3], [4, 2], [6, 3], [8, 4], [8, 8], [10, 5], [12, 6], [14, 5],
    [16, 4], [16, 11], [18, 3], [20, 4], [22, 5], [24, 6], [24, 8], [26, 6], [28, 7], [30, 9],
    [4, 9], [12, 9], [20, 9], [28, 11],
  ];

  /* =====================================================
     三、小工具：在小画布上一格一格地画（不做抗锯齿）
     ===================================================== */
  const COLOR = {
    bg: "#000", white: "#fff", light: "#dfdfdf", face: "#c0c0c0", silver: "#a0a0a0",
    mid: "#808080", drum: "#7a7a7a", drumDark: "#606060", dark: "#404040", black: "#0a0a0a",
  };

  function raster(canvas) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const api = {
      ctx, W, H,
      clear(c = COLOR.bg) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); },
      rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
      dot(x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); },
      // 填充多边形：每个像素格取中心点判断
      poly(pts, c) {
        ctx.fillStyle = c;
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
      },
      // 1 格宽的线
      line(a, b, c) {
        ctx.fillStyle = c;
        let x0 = Math.floor(a[0]), y0 = Math.floor(a[1]);
        const x1 = Math.floor(b[0]), y1 = Math.floor(b[1]);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 800; guard++) {
          ctx.fillRect(x0, y0, 1, 1);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      },
      circle(cx, cy, r, c, seg = 28) {
        const pts = [];
        for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        api.poly(pts, c);
        return pts;
      },
      outline(pts, c) { for (let i = 0; i < pts.length; i++) api.line(pts[i], pts[(i + 1) % pts.length], c); },
    };
    return api;
  }

  /* =====================================================
     四、声音：用几个正弦波叠出"叮"的音色（音乐盒的金属条）
     ===================================================== */
  let audio, master;
  function ensureAudio() {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      const comp = audio.createDynamicsCompressor();
      master = audio.createGain();
      master.gain.value = 0.5;
      master.connect(comp).connect(audio.destination);
    }
    if (audio.state === "suspended") audio.resume();
  }

  function ding(freq) {
    if (!audio) return;
    const t = audio.currentTime;
    // 基音 + 几个不整数倍的泛音，高的泛音衰减得更快
    [[1, 0.5, 1.7], [2.76, 0.18, 0.7], [5.4, 0.07, 0.35], [8.9, 0.03, 0.2]].forEach(([mult, vol, dur]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine";
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  // 上发条时的"咔哒"声
  function click() {
    if (!audio) return;
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "square";
    o.frequency.value = 1500;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.04);
  }

  /* =====================================================
     五、八音盒的状态
     ===================================================== */
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));   // 哪里有凸起
  let pos = 0;                  // 滚筒转到哪了（0 ~ COLS）
  let spring = 0;               // 发条里还剩多少秒
  let keyAngle = 0;             // 把手的角度
  let paused = false;
  let dragWinding = false;      // 正在用鼠标转把手
  let keyWinding = false;       // 正在按空格上发条
  const vib = Array(ROWS).fill(-10);        // 每根金属条上次被拨的时间
  let hover = null;             // 鼠标指着滚筒上的哪个格子
  let lid = 1;                  // 盖子打开的程度：0 关着，1 完全打开（动画时是中间值）
  let lidTarget = 1;
  let lastNote = "--";
  let dirty = true;
  let plucks = 0;               // 一共拨了多少下（测试用）

  const COLW = 6, ROWH = 8;
  const pinCount = () => grid.reduce((s, r) => s + r.filter(Boolean).length, 0);
  const mod = (a, n) => ((a % n) + n) % n;

  function pluck(row) {
    ding(NOTES[row].freq);
    vib[row] = performance.now() / 1000;
    lastNote = NOTES[row].name;
    plucks++;
    updateStatus();
  }

  function windBy(rad) {
    if (rad <= 0 || spring >= MAX_SPRING) return;
    const before = Math.floor(keyAngle / (Math.PI / 6));
    spring = Math.min(MAX_SPRING, spring + (rad * SECONDS_PER_TURN) / (Math.PI * 2));
    keyAngle += rad;
    if (Math.floor(keyAngle / (Math.PI / 6)) !== before) click();      // 每转 30° 咔哒一下
    paused = false;
    syncStopButton();
    dirty = true;
  }

  /* =====================================================
     六、画：右边大窗口（金属条 + 滚筒）
     ===================================================== */
  const mech = raster(document.getElementById("mech"));
  const M = { rowsY: 14, capTop: 6, capBottom: 110, cylX: 72, cylW: COLS * COLW, tineX0: 28, tineX1: 70 };
  const TINE_T = [3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5];             // 低音的金属条更粗

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function drawScrew(r, x, y, slotUp) {
    r.circle(x, y, 3.4, COLOR.dark, 14);
    r.circle(x, y, 2.6, COLOR.light, 14);
    const a = slotUp ? [[x - 2, y + 2], [x + 2, y - 2]] : [[x - 2, y - 2], [x + 2, y + 2]];
    r.line(a[0], a[1], COLOR.dark);
  }

  function drawPin(r, cx, cy, ghost) {
    const body = [".##.", "####", "####", ".##."];
    const draw = (ox, oy, c) => body.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#") r.dot(ox + i, oy + j, c); }));
    if (ghost) { draw(cx - 2, cy - 2, COLOR.silver); return; }
    draw(cx - 1, cy - 1, COLOR.dark);                 // 影子
    draw(cx - 2, cy - 2, COLOR.light);                // 凸起
    r.dot(cx - 1, cy - 2, COLOR.white); r.dot(cx - 2, cy - 1, COLOR.white);   // 高光
  }

  function drawMech(now) {
    const r = mech, scroll = Math.floor(pos * COLW);
    r.clear();

    // 左边的底板（上面有两颗螺丝，和照片里一样）
    r.rect(0, 6, 24, 112, COLOR.face);
    r.rect(0, 6, 24, 1, COLOR.white); r.rect(0, 6, 1, 112, COLOR.white);
    r.rect(0, 117, 24, 1, COLOR.mid); r.rect(23, 6, 1, 112, COLOR.mid);
    drawScrew(r, 12, 98, true);
    drawScrew(r, 12, 109, false);
    r.rect(24, 12, 4, 100, COLOR.mid);                // 金属条的根

    // 金属条（被拨的时候会抖一下）
    for (let row = 0; row < ROWS; row++) {
      const t = now - vib[row];
      const off = t < 0.6 ? Math.round(Math.sin(t * 62) * Math.exp(-t * 7) * 1.7) : 0;
      const thick = TINE_T[row], yc = M.rowsY + row * ROWH + 4;
      const top = yc - Math.floor(thick / 2) + off;
      const hot = t < 0.12;
      const colors = [COLOR.white, COLOR.light, COLOR.light, COLOR.light, COLOR.mid].slice(0, thick - 1).concat([COLOR.mid]);
      for (let k = 0; k < thick; k++) r.rect(M.tineX0, top + k, 37, 1, colors[Math.min(k, colors.length - 1)]);
      const tipT = Math.max(1, thick - 2), tipTop = yc - Math.floor(tipT / 2) + off;
      for (let k = 0; k < tipT; k++) r.rect(65, tipTop + k, M.tineX1 - 65, 1, hot ? COLOR.white : (k === tipT - 1 ? COLOR.mid : COLOR.light));
    }

    // 滚筒
    const cx0 = M.cylX, cw = M.cylW, y0 = M.rowsY, y1 = y0 + ROWS * ROWH;
    r.rect(cx0, y0, cw, y1 - y0, COLOR.drum);
    for (let row = 1; row < ROWS; row++) for (let x = cx0; x < cx0 + cw; x += 2) r.dot(x, y0 + row * ROWH, COLOR.drumDark);   // 每根金属条对应的横线
    for (let c = 0; c < COLS; c += 4) {                                                             // 每 4 格一条竖线（一拍）
      const x = cx0 + mod(c * COLW - scroll, cw);
      r.rect(x, y0, 1, y1 - y0, c === 0 ? COLOR.light : "#929292");
    }
    // 滚筒上下两端的金属圈，上面的纹路会跟着转
    for (const [cy, cyh] of [[M.capTop, 8], [M.capBottom, 8]]) {
      r.rect(cx0, cy, cw, cyh, COLOR.face);
      r.rect(cx0, cy, cw, 1, COLOR.white);
      r.rect(cx0, cy + cyh - 1, cw, 1, COLOR.mid);
      for (let x = 0; x < cw; x += 3) r.rect(cx0 + mod(x - scroll, cw), cy + 2, 1, cyh - 4, COLOR.silver);
    }

    // 凸起（滚筒转一圈后从右边回来）
    r.ctx.save();
    r.ctx.beginPath(); r.ctx.rect(cx0, y0, cw, y1 - y0); r.ctx.clip();
    for (let row = 0; row < ROWS; row++) {
      for (let c = 0; c < COLS; c++) {
        if (!grid[row][c]) continue;
        let x = cx0 + mod(c * COLW + COLW / 2 - scroll, cw);
        const y = y0 + row * ROWH + ROWH / 2;
        drawPin(r, Math.floor(x), y);
        if (x < cx0 + 4) drawPin(r, Math.floor(x + cw), y);
      }
    }
    if (hover && !grid[hover.row][hover.col]) {
      const x = cx0 + mod(hover.col * COLW + COLW / 2 - scroll, cw);
      drawPin(r, Math.floor(x), y0 + hover.row * ROWH + ROWH / 2, true);
    }
    r.ctx.restore();

    // 右边缘用点阵变暗，像滚筒转到背面去了
    const fade = 28;
    for (let x = cx0 + cw - fade; x < cx0 + cw; x++) {
      const t = (x - (cx0 + cw - fade)) / fade;
      for (let y = y0; y < y1; y++) if (t * 16 > BAYER[(y & 3) * 4 + (x & 3)]) r.dot(x, y, COLOR.drumDark);
    }

    // 金属条碰到滚筒的那条线
    r.rect(cx0 - 1, M.capTop, 1, 112, COLOR.black);
    r.rect(cx0, y0, 1, y1 - y0, "#a8a8a8");
  }

  /* =====================================================
     七、画：左上小窗口（从盒子前方偏右的角度看：打开盖子的木盒 + 从右侧壁伸出来的摇把）

     做法和手机键盘那页一样：先在三维空间里摆好盒子、机芯和摇把，
     再用"相机"投影到小画布上一格格涂出来，所以摇把转起来、盖子开合都有立体感。
     世界坐标：x 向右，y 向上，z 朝向自己（盒子的前面）。
     ===================================================== */
  const side = raster(document.getElementById("side"));

  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vunit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // 盒子和摇把的尺寸
  const BOX3 = { w: 58, d: 36, hb: 24, wall: 3, floor: 8, lt: 6 };   // 宽、深、盒身高度、壁厚、底厚、盖子厚度
  const AXLE = { y: 16, z: 18, len: 9 };                              // 轴从右侧壁的这个位置伸出来，长 9
  const XC = BOX3.w + AXLE.len;                                       // 摇把杠杆所在的平面
  const CRANK = { arm: 13, armW: 2.4, armT: 2.6, grip: 10, gripR: 3 };
  const OPEN_MAX = (110 * Math.PI) / 180;                             // 盖子完全打开是 110°（微微往后仰）

  // 相机：在盒子前方偏右、稍微俯视。想换角度就改 EYE 的三个数
  const TARGET = [29, 20, 17];
  const EYE = [TARGET[0] + 70, TARGET[1] + 50, TARGET[2] + 60];
  const FWD = vunit(vsub(TARGET, EYE));
  const RIGHT3 = vunit(vcross(FWD, [0, 1, 0]));
  const UP3 = vcross(RIGHT3, FWD);
  const LIGHT3 = vunit([0.3, 1, 0.7]);                                // 光从上方偏前、偏右来

  let SCALE = 1, OX = 0, OY = 0;
  const P = (p) => {
    const d = vsub(p, EYE), z = vdot(d, FWD);
    return [OX + (SCALE * vdot(d, RIGHT3)) / z, OY - (SCALE * vdot(d, UP3)) / z];
  };

  // 盖子：绕着盒子后上方的那条边转。a = 0 是关着的
  const lidPt = (x, v, u, a) => [x, BOX3.hb + v * Math.cos(a) + u * Math.sin(a), -v * Math.sin(a) + u * Math.cos(a)];

  // 自动取景：盒子、完全打开的盖子、摇把转到任何角度，都完整放进画布（左边留给发条余量条）
  (function fitSide() {
    const { w, d, hb, lt } = BOX3, pts = [];
    for (const x of [0, w]) for (const y of [0, hb]) for (const z of [0, d]) pts.push([x, y, z]);
    for (const x of [0, w]) for (const v of [0, lt]) for (const u of [0, d]) pts.push(lidPt(x, v, u, OPEN_MAX));
    const reach = CRANK.arm + CRANK.gripR + 1;
    for (const x of [XC - 2, XC + CRANK.armT / 2 + CRANK.grip])
      for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; pts.push([x, AXLE.y + reach * Math.cos(t), AXLE.z + reach * Math.sin(t)]); }
    SCALE = 1; OX = 0; OY = 0;
    const q = pts.map(P), xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    SCALE = Math.min((122 - 20) / (maxX - minX), (89 - 3) / (maxY - minY));
    OX = 20 + ((122 - 20) - (maxX - minX) * SCALE) / 2 - minX * SCALE;
    OY = 3 + ((89 - 3) - (maxY - minY) * SCALE) / 2 - minY * SCALE;
  })();

  // 把画布上的一个点，还原成摇把所在平面上的位置，算出它在摇把的哪个角度
  function crankAngleAt(px, py) {
    const a = (px - OX) / SCALE, b = (OY - py) / SCALE;
    const d = vadd(vadd(vmul(RIGHT3, a), vmul(UP3, b)), FWD);
    const t = (XC - EYE[0]) / d[0];
    const q = vadd(EYE, vmul(d, t));
    const dy = q[1] - AXLE.y, dz = q[2] - AXLE.z;
    return { phi: Math.atan2(-dz, dy), dist: Math.hypot(dy, dz) };     // 从右边看，顺时针转 phi 变大
  }

  // 几套明暗：看这个面朝哪边（亮 → 暗）
  const shader = (palette) => (n) => {
    const v = vdot(vunit(n), LIGHT3);
    return palette[v > 0.62 ? 0 : v > 0.4 ? 1 : v > 0.18 ? 2 : v > -0.1 ? 3 : 4];
  };
  const metal = shader([COLOR.white, COLOR.light, COLOR.face, COLOR.mid, COLOR.dark]);
  const wood = shader(["#b0b0b0", "#a0a0a0", "#909090", "#808080", "#606060"]);
  const iron = shader(["#808080", "#707070", "#606060", "#505050", "#303030"]);
  const GRAIN = { "#b0b0b0": "#a0a0a0", "#a0a0a0": "#909090", "#909090": "#808080", "#808080": "#707070", "#606060": "#505050" };

  // 把一个平面图形沿 dir 方向拉出厚度（柱体），背对相机的面不画。hits 用来记录点击范围
  function prism(r, base, dir, len, colorFn, edge, hits) {
    const top = base.map((p) => vadd(p, vmul(dir, len)));
    const cen = (arr) => vmul(arr.reduce((s, p) => vadd(s, p), [0, 0, 0]), 1 / arr.length);
    const cm = vmul(vadd(cen(base), cen(top)), 0.5);
    for (let i = 0; i < base.length; i++) {
      const j = (i + 1) % base.length;
      const mid = vmul(vadd(vadd(base[i], base[j]), vadd(top[i], top[j])), 0.25);
      let n = vunit(vcross(vsub(base[j], base[i]), dir));
      if (vdot(n, vsub(mid, cm)) < 0) n = vmul(n, -1);
      if (vdot(n, vsub(EYE, mid)) <= 0) continue;
      const q = [P(base[i]), P(base[j]), P(top[j]), P(top[i])];
      r.poly(q, colorFn(n));
      if (hits) hits.push(q);
    }
    let cap = null, capN = null;
    if (vdot(dir, vsub(EYE, top[0])) > 0) { cap = top; capN = dir; }
    else if (vdot(vmul(dir, -1), vsub(EYE, base[0])) > 0) { cap = base; capN = vmul(dir, -1); }
    if (cap) {
      const pts = cap.map(P);
      r.poly(pts, colorFn(capN));
      if (edge) r.outline(pts, edge);
      if (hits) hits.push(pts);
    }
    return { cap, capN };
  }

  const ringYZ = (x, y, z, rad, seg = 12) => Array.from({ length: seg }, (_, i) => {
    const t = (i / seg) * Math.PI * 2;
    return [x, y + rad * Math.cos(t), z + rad * Math.sin(t)];
  });
  const rectXZ = (x0, z0, x1, z1, y) => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];

  // 伪随机（画木纹用，每次画出来都一样）
  function hash(n) { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); }

  // 在一个面上画木纹：O 是起点，A 是纹理方向（长 LA），B 是垂直方向（长 LB）
  function grainOn(r, O, A, LA, B, LB, color, seed) {
    for (let t = 2; t < LB; t += 3) {
      let x = 2 + Math.floor(hash(seed + t) * 8);
      while (x < LA - 2) {
        const len = 5 + Math.floor(hash(seed * 7 + t * 5 + x) * 12), x1 = Math.min(LA - 1, x + len);
        r.line(P(vadd(vadd(O, vmul(A, x)), vmul(B, t))), P(vadd(vadd(O, vmul(A, x1)), vmul(B, t))), color);
        x += len + 3 + Math.floor(hash(seed * 3 + t * 9 + x) * 8);
      }
    }
  }

  const lidHits = [];                  // 盖子在画面上占的位置（点盖子可以开合）

  // 盖子：一块厚木板，绕着盒子后上方那条边转
  function drawLid(r, a) {
    const { w, d, lt } = BOX3;
    const base = [lidPt(0, 0, 0, a), lidPt(w, 0, 0, a), lidPt(w, 0, d, a), lidPt(0, 0, d, a)];
    const dir = [0, Math.cos(a), -Math.sin(a)];                       // 盖子"厚度"方向
    prism(r, base, dir, lt, wood, null, lidHits);
    // 木纹画在两个大面上：朝上（外面）的和朝下（里面）的，哪个朝着相机就画哪个
    for (const [v, sign] of [[lt, 1], [0, -1]]) {
      const O = lidPt(0, v, 0, a), N = vmul(dir, sign);
      if (vdot(N, vsub(EYE, O)) <= 0) continue;
      const color = GRAIN[wood(N)] || "#707070";
      grainOn(r, O, [1, 0, 0], w, vsub(lidPt(0, v, 1, a), O), d, color, v + 3);
    }
  }

  // 盒身：外面的前壁和右壁、上沿，里面的后壁、左壁、底；里面放一个简化的机芯
  function drawBase(r) {
    const { w, d, hb, wall: t, floor: fl } = BOX3;
    const poly = (pts, color) => r.poly(pts.map(P), color);

    // 里面：后壁内侧、左壁内侧、底
    poly([[t, fl, t], [w - t, fl, t], [w - t, hb, t], [t, hb, t]], "#585858");
    poly([[t, fl, t], [t, fl, d - t], [t, hb, d - t], [t, hb, t]], "#4a4a4a");
    poly([[t, fl, t], [w - t, fl, t], [w - t, fl, d - t], [t, fl, d - t]], "#404040");

    // 机芯：金属底板 → 滚筒 → 一排金属条 → 右边黑色的发条盒
    prism(r, rectXZ(8, 6, 52, 30, fl), [0, 1, 0], 3, metal, COLOR.mid);
    const cy = fl + 3 + 5, cz = 12;
    prism(r, ringYZ(13, cy, cz, 5, 16), [1, 0, 0], 31, metal);
    for (let k = 0; k < 22; k++) {                                          // 滚筒上的小凸起
      const x = 15 + hash(k * 3.1) * 27, ang = -0.6 + hash(k * 7.7) * 2.2;
      const p = [x, cy + 5 * Math.cos(ang), cz + 5 * Math.sin(ang)];
      const n = [0, Math.cos(ang), Math.sin(ang)];
      if (vdot(n, vsub(EYE, p)) > 0) r.dot(...P(p), COLOR.dark);
    }
    for (let i = 0; i < 10; i++) {                                          // 金属条
      const x = 15 + i * 3.2;
      prism(r, rectXZ(x - 0.7, 17, x + 0.7, 29, fl + 3), [0, 1, 0], 0.7, metal);
    }
    prism(r, rectXZ(45, 7, 54, 27, fl), [0, 1, 0], 11, iron, COLOR.black);

    // 外面：前壁和右壁
    const front = [[0, 0, d], [w, 0, d], [w, hb, d], [0, hb, d]];
    const right = [[w, 0, d], [w, 0, 0], [w, hb, 0], [w, hb, d]];
    poly(right, wood([1, 0, 0]));
    poly(front, wood([0, 0, 1]));
    grainOn(r, [0, 0, d], [1, 0, 0], w, [0, 1, 0], hb, GRAIN[wood([0, 0, 1])], 11);
    grainOn(r, [w, 0, d], [0, 0, -1], d, [0, 1, 0], hb, GRAIN[wood([1, 0, 0])], 17);
    // 上沿
    const rim = wood([0, 1, 0]);
    poly(rectXZ(0, d - t, w, d, hb), rim);
    poly(rectXZ(w - t, 0, w, d - t, hb), rim);
    poly(rectXZ(0, 0, w, t, hb), rim);
    poly(rectXZ(0, t, t, d - t, hb), rim);
    // 棱边
    const L = (p, q, c) => r.line(P(p), P(q), c);
    L([0, 0, d], [0, hb, d], COLOR.face); L([0, hb, d], [w, hb, d], COLOR.face);
    L([w, hb, d], [w, hb, 0], COLOR.light); L([w, 0, d], [w, hb, d], COLOR.dark);
    L([0, 0, d], [w, 0, d], COLOR.black); L([w, 0, d], [w, 0, 0], COLOR.black);
  }

  function drawSide(now) {
    const r = side;
    r.clear();
    lidHits.length = 0;
    const a = lid * OPEN_MAX;

    if (a >= 0.8) drawLid(r, a);          // 打开的时候，盖子立在盒子后面，先画
    drawBase(r);
    if (a < 0.8) drawLid(r, a);           // 关着（或刚掀开一点）的时候，盖子在盒子上面，后画

    // 摇把
    const phi = keyAngle, c = Math.cos(phi), sn = Math.sin(phi);
    const AY = AXLE.y, AZ = AXLE.z, X = [1, 0, 0];
    const dirA = [c, -sn], perp = [sn, c];                  // 摇把在 (y, z) 平面里的方向（角度 0 指向正上方）
    const K = [AY + CRANK.arm * dirA[0], AZ + CRANK.arm * dirA[1]];

    // 提示：还没上发条的时候，用一圈小点标出摇把能转到的范围
    if (spring < 0.5 && !dragWinding) {
      for (let t = 0; t < Math.PI * 2; t += 0.16) r.dot(...P([XC, AY + CRANK.arm * Math.cos(t), AZ + CRANK.arm * Math.sin(t)]), "#c0c0c0");
    }

    // 轴孔的金属圈 → 从侧壁伸出来的轴
    prism(r, ringYZ(BOX3.w, AY, AZ, 3.6, 14), X, 0.8, metal, COLOR.black);
    prism(r, ringYZ(BOX3.w + 0.8, AY, AZ, 1.4, 8), X, XC - 1.1 - (BOX3.w + 0.8), metal);

    // 杠杆
    const w = CRANK.armW, x0 = XC - CRANK.armT / 2;
    const corner = (cy, cz) => [x0, cy, cz];
    prism(r, [
      corner(AY + perp[0] * w, AZ + perp[1] * w), corner(AY - perp[0] * w, AZ - perp[1] * w),
      corner(K[0] - perp[0] * w, K[1] - perp[1] * w), corner(K[0] + perp[0] * w, K[1] + perp[1] * w),
    ], X, CRANK.armT, metal, COLOR.black);
    prism(r, ringYZ(x0, AY, AZ, 3.4, 12), X, CRANK.armT + 0.5, metal, COLOR.black);     // 转轴上的小圆盖

    // 末端的圆柄：从杠杆端头向外伸出
    prism(r, ringYZ(XC + CRANK.armT / 2, K[0], K[1], CRANK.gripR, 12), X, CRANK.grip, metal, COLOR.black);

    // 左边的发条余量：10 格
    const segs = 10, filled = Math.ceil((spring / MAX_SPRING) * segs - 1e-6);
    r.rect(5, 5, 10, 82, COLOR.dark);
    r.rect(6, 6, 8, 80, COLOR.bg);
    for (let i = 0; i < segs; i++) {
      const y = 7 + (segs - 1 - i) * 8;
      r.rect(7, y, 6, 7, i < filled ? COLOR.light : COLOR.dark);
    }
  }

  /* =====================================================
     八、主循环：滚筒转动、拨金属条
     ===================================================== */
  function update(dt) {
    if (lid !== lidTarget) {                                         // 盖子慢慢开合
      lid += (lidTarget - lid) * (1 - Math.exp(-dt * 9));
      if (Math.abs(lid - lidTarget) < 0.002) lid = lidTarget;
      dirty = true;
    }
    if (keyWinding) windBy((Math.PI * 2 * dt) / 0.7);               // 按住空格：0.7 秒转一圈

    const playing = spring > 0 && !paused && !dragWinding && !keyWinding;
    if (playing) {
      const speed = BASE_SPEED * Math.min(1, spring / 3);           // 发条快没了，最后 3 秒慢慢变慢
      const prev = pos, cur = prev + speed * dt;
      for (let c = Math.floor(prev - 0.5) + 1; c <= Math.floor(cur - 0.5); c++) {
        const col = mod(c, COLS);
        for (let row = 0; row < ROWS; row++) if (grid[row][col]) pluck(row);
      }
      pos = cur >= COLS ? cur - COLS : cur;
      spring = Math.max(0, spring - dt);
      keyAngle -= (dt / SECONDS_PER_TURN) * Math.PI * 2;
      dirty = true;
    }
    return playing;
  }

  let last = performance.now();
  function frame(nowMs) {
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    const playing = update(dt);
    const now = nowMs / 1000;
    const vibrating = vib.some((t) => now - t < 0.6);
    if (dirty || playing || vibrating) {
      drawMech(now);
      drawSide(now);
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  /* =====================================================
     九、交互
     ===================================================== */
  const toPixel = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) * canvas.width) / rect.width, ((e.clientY - rect.top) * canvas.height) / rect.height];
  };

  function inside(poly, px, py) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // ---------- 右边：点滚筒，放/拿走凸起 ----------
  const mechEl = document.getElementById("mech");
  const cellAt = (e) => {
    const [x, y] = toPixel(mechEl, e);
    if (x < M.cylX || x >= M.cylX + M.cylW || y < M.rowsY || y >= M.rowsY + ROWS * ROWH) return null;
    const scroll = Math.floor(pos * COLW);
    return { col: mod(Math.floor((x - M.cylX + scroll) / COLW), COLS), row: Math.floor((y - M.rowsY) / ROWH) };
  };

  let paint = null;                          // "add" 或 "erase"：按下去的第一个格子决定
  function applyPaint(cell) {
    if (!cell) return;
    const has = grid[cell.row][cell.col];
    if (paint === "add" && !has) { grid[cell.row][cell.col] = true; ensureAudio(); ding(NOTES[cell.row].freq); lastNote = NOTES[cell.row].name; }
    else if (paint === "erase" && has) grid[cell.row][cell.col] = false;
    else return;
    updateStatus();
    dirty = true;
  }

  mechEl.addEventListener("pointerdown", (e) => {
    const cell = cellAt(e);
    if (!cell) return;
    e.preventDefault();
    ensureAudio();
    mechEl.setPointerCapture(e.pointerId);
    paint = grid[cell.row][cell.col] ? "erase" : "add";
    applyPaint(cell);
  });
  mechEl.addEventListener("pointermove", (e) => {
    const cell = cellAt(e);
    hover = cell;
    if (cell) lastNote = NOTES[cell.row].name;
    if (paint) applyPaint(cell);
    updateStatus();
    dirty = true;
  });
  const endPaint = () => { paint = null; };
  mechEl.addEventListener("pointerup", endPaint);
  mechEl.addEventListener("pointercancel", endPaint);
  mechEl.addEventListener("pointerleave", () => { hover = null; dirty = true; });

  // ---------- 左上：转摇把上发条 ----------
  const sideEl = document.getElementById("side");
  let lastAng = 0;
  const crankAt = (e) => { const [x, y] = toPixel(sideEl, e); return crankAngleAt(x, y); };

  sideEl.addEventListener("pointerdown", (e) => {
    const c = crankAt(e);
    if (c.dist > 26) {                       // 没点到摇把：如果点在盖子上，就开合盖子
      const [px, py] = toPixel(sideEl, e);
      if (lidHits.some((q) => inside(q, px, py))) { lidTarget = lidTarget ? 0 : 1; dirty = true; }
      return;
    }
    e.preventDefault();
    ensureAudio();
    sideEl.setPointerCapture(e.pointerId);
    dragWinding = true;
    sideEl.classList.add("winding");
    lastAng = c.phi;
  });
  sideEl.addEventListener("pointermove", (e) => {
    if (!dragWinding) return;
    const a = crankAt(e).phi;
    let d = a - lastAng;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    if (d > 0) windBy(d);                    // 只有顺时针才上发条，反着转没用（有棘轮）
    lastAng = a;
  });
  const endWind = () => { dragWinding = false; sideEl.classList.remove("winding"); dirty = true; };   // 松手 → 开始播放
  sideEl.addEventListener("pointerup", endWind);
  sideEl.addEventListener("pointercancel", endWind);

  // 按住空格也能上发条
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    e.preventDefault();
    ensureAudio();
    keyWinding = true;
  });
  document.addEventListener("keyup", (e) => { if (e.code === "Space") keyWinding = false; });

  // ---------- 按钮 ----------
  const stopBtn = document.getElementById("btn-stop");
  function syncStopButton() { stopBtn.textContent = paused ? "PLAY" : "STOP"; }
  stopBtn.addEventListener("click", () => { paused = !paused; syncStopButton(); dirty = true; });
  document.getElementById("btn-clear").addEventListener("click", () => {
    grid.forEach((row) => row.fill(false)); updateStatus(); dirty = true;
  });
  document.getElementById("btn-demo").addEventListener("click", () => {
    grid.forEach((row) => row.fill(false));
    DEMO.forEach(([c, r]) => { grid[r][c] = true; });
    updateStatus(); dirty = true;
  });

  const noteEl = document.getElementById("st-note"), pinsEl = document.getElementById("st-pins");
  function updateStatus() {
    noteEl.textContent = "NOTE " + lastNote;
    pinsEl.textContent = "PINS " + pinCount();
  }
  updateStatus();

  requestAnimationFrame(frame);

  // 方便在控制台里试：musicbox.state()
  window.musicbox = {
    state: () => ({ pos, spring, paused, pins: pinCount(), plucks, keyAngle, lid }),
    toggleLid: () => { lidTarget = lidTarget ? 0 : 1; dirty = true; },
    grid, wind: windBy,
    crankPoint: (phi, rad = 16) => P([XC, AXLE.y + rad * Math.cos(phi), AXLE.z - rad * Math.sin(phi)]),
  };

let topZIndex = 10;

document.querySelectorAll(".win").forEach((win) => {
  const titleBar = win.querySelector(".win-title");
  if (!titleBar) return;

  let drag = null;

  titleBar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;

    drag = {
      x: event.clientX,
      y: event.clientY,
      left: win.offsetLeft,
      top: win.offsetTop
    };

    win.style.zIndex = ++topZIndex;
    titleBar.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  titleBar.addEventListener("pointermove", (event) => {
    if (!drag) return;

    const unit =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--px")
      ) || 1;

    const left = drag.left + event.clientX - drag.x;
    const top = drag.top + event.clientY - drag.y;

    win.style.left = `${Math.round(left / unit) * unit}px`;
    win.style.top = `${Math.round(top / unit) * unit}px`;
  });

  const stopDragging = () => {
    drag = null;
  };

  titleBar.addEventListener("pointerup", stopDragging);
  titleBar.addEventListener("pointercancel", stopDragging);
});

})();