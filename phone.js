(() => {
  "use strict";

  /* =====================================================
     一、让整个页面按整数倍缩放（所有像素点一样大，也不会出现滚动条）
     ===================================================== */
  const STAGE_W = 360, STAGE_H = 200;       // 页面是 360 × 200 个"像素格子"

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
     二、可以自己改的内容（短信、联系人、通话结果……）
     ===================================================== */
  const SETTINGS = { sound: true };         // 按键声音，也可以在手机的 SETS 里开关

  // 想固定显示某个时间的话，把 null 换成 { hm: "11:57", ampm: "PM", date: "THU AUG 01" }
  const FIXED_CLOCK = null;

  const MESSAGES = [
    { from: "UNKNOWN", text: "ARE YOU THERE? IT IS VERY QUIET HERE. I CAN ONLY SEE STARS." },
    { from: "UNKNOWN", text: "PLEASE ANSWER." },
    { from: "MOM",     text: "CALL ME BACK WHEN YOU CAN." },
  ];

  const CONTACTS = [
    { name: "UNKNOWN", number: "000" },
    { name: "MOM",     number: "555 0101" },
    { name: "HOME",    number: "555 0102" },
  ];

  const CALL_LOG = [
    { name: "UNKNOWN", number: "000", note: "MISSED 11:57 PM" },
    { name: "MOM",     number: "555 0101", note: "DIALED YESTERDAY" },
  ];

  const NOTES = [
    { title: "NOTE 1", text: "DON'T FORGET TO LOOK UP TONIGHT." },
  ];

  // 拨某个号码以后显示的内容（号码里只看数字）。没写的号码都是 NO ANSWER。
  const CALLS = {
    "000": ["...HELLO?", "I CAN HEAR YOU.", "DON'T HANG UP."],
  };

  /* =====================================================
     三、手机里的应用（菜单里的 9 个图标）
     ===================================================== */
  const APPS = [
    { id: "msg",  label: "MSG",  title: "MESSAGES", type: "list",
      items: () => MESSAGES.map((m) => ({ label: m.from, text: m.text })) },
    { id: "name", label: "NAME", title: "CONTACTS", type: "list",
      items: () => CONTACTS.map((c) => ({ label: c.name, number: c.number, text: c.name + "\n" + c.number })) },
    { id: "log",  label: "LOG",  title: "CALLS", type: "list",
      items: () => CALL_LOG.map((c) => ({ label: c.name, number: c.number, text: c.name + "\n" + c.number + "\n" + c.note })) },
    { id: "note", label: "NOTE", title: "NOTES", type: "list",
      items: () => NOTES.map((n) => ({ label: n.title, text: n.text })) },
    { id: "pics", label: "PICS", title: "PICTURES", type: "text", text: "NO PICTURES" },
    { id: "clok", label: "CLOK", title: "CLOCK", type: "clock" },
    { id: "scop", label: "SCOP", title: "SCOPE", type: "text", text: "NO SIGNAL" },
    { id: "sets", label: "SETS", title: "SETTINGS", type: "list",
      items: () => [{ label: "SOUND " + (SETTINGS.sound ? "ON" : "OFF"), toggle: () => { SETTINGS.sound = !SETTINGS.sound; } }] },
    { id: "info", label: "INFO", title: "INFO", type: "text", text: "PIXEL PHONE\nVERSION 1.0" },
  ];
  const APP_BY_ID = Object.fromEntries(APPS.map((a) => [a.id, a]));

  /* =====================================================
     四、屏幕和按键逻辑
     ===================================================== */
  const COLS = 13;                          // 一行 13 个字
  const VISIBLE = 9;                        // 列表一屏能显示 9 行

  const viewEl = document.getElementById("view");
  const softL = document.getElementById("soft-l");
  const softR = document.getElementById("soft-r");
  const keypad = document.getElementById("keypad");

  let stack = [{ name: "home" }];
  let callTimer = 0;
  const current = () => stack[stack.length - 1];
  const isDigit = (k) => /^[0-9*#]$/.test(k);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 把一段话按每行 13 个字折行
  function wrap(text, cols = COLS) {
    const out = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (let word of para.split(" ")) {
        while (word.length > cols) {
          if (line) { out.push(line); line = ""; }
          out.push(word.slice(0, cols));
          word = word.slice(cols);
        }
        if (!line) line = word;
        else if ((line + " " + word).length <= cols) line += " " + word;
        else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  }

  const WEEK = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function clock() {
    if (FIXED_CLOCK) return FIXED_CLOCK;
    const d = new Date();
    const h = d.getHours();
    return {
      hm: `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`,
      ampm: h >= 12 ? "PM" : "AM",
      date: `${WEEK[d.getDay()]} ${MONTH[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`,
    };
  }

  const digitsOf = (s) => String(s).replace(/\D/g, "");
  const contactName = (num) => (CONTACTS.find((c) => digitsOf(c.number) === digitsOf(num)) || {}).name;

  // ---------- 跳转 ----------
  function leave(s) { if (s.name === "calling") clearTimeout(callTimer); }
  function go(screen) { stack.push(screen); draw(); }
  function back() { if (stack.length > 1) leave(stack.pop()); draw(); }
  function home() { stack.forEach(leave); stack = [{ name: "home" }]; draw(); }

  function openApp(app) {
    if (app.type === "list") go({ name: "list", app, items: app.items(), sel: 0, top: 0 });
    else if (app.type === "clock") go({ name: "clock" });
    else go({ name: "text", title: app.title, lines: wrap(app.text), top: 0 });
  }

  function startCall(number, name) {
    const digits = digitsOf(number);
    const s = { name: "calling", number, label: name || contactName(number) || number, phase: "dialing", lines: [] };
    go(s);
    callTimer = setTimeout(() => {
      if (current() !== s) return;
      s.phase = "result";
      s.lines = wrap(CALLS[digits] ? CALLS[digits].join("\n") : "NO ANSWER");
      draw();
    }, 2400);
  }

  // ---------- 每个画面：怎么画 + 按键怎么响应 ----------
  const SCREENS = {
    home: {
      view() {
        const t = clock();
        return {
          html: `<div class="face"><div class="clock">${t.hm}</div><div class="sub">${t.ampm}<br>${t.date}</div></div>`,
          soft: ["MENU", "NAMES"],
        };
      },
      key(s, k) {
        if (isDigit(k)) go({ name: "dial", number: k });
        else if (k === "ok" || k === "soft-l") go({ name: "menu", sel: 0 });
        else if (k === "soft-r") openApp(APP_BY_ID.name);
        else if (k === "call") openApp(APP_BY_ID.log);
      },
    },

    menu: {
      view(s) {
        const cells = APPS.map((a, i) =>
          `<div class="cell${i === s.sel ? " sel" : ""}"><i class="ico" style="--g: var(--ico-${a.id})"></i><span>${a.label}</span></div>`
        ).join("");
        return { html: `<div class="menu">${cells}</div>`, soft: ["SELECT", "BACK"] };
      },
      key(s, k) {
        const n = APPS.length;
        if (k === "left") s.sel = s.sel % 3 === 0 ? Math.min(s.sel + 2, n - 1) : s.sel - 1;
        else if (k === "right") s.sel = s.sel % 3 === 2 || s.sel === n - 1 ? s.sel - (s.sel % 3) : s.sel + 1;
        else if (k === "up") s.sel = (s.sel - 3 + n) % n;
        else if (k === "down") s.sel = (s.sel + 3) % n;
        else if (k === "ok" || k === "soft-l") return openApp(APPS[s.sel]);
        else if (/^[1-9]$/.test(k)) { if (APPS[+k - 1]) openApp(APPS[+k - 1]); return; }
        else if (k === "soft-r" || k === "c") return back();
        else if (k === "end") return home();
        draw();
      },
    },

    list: {
      view(s) {
        const n = s.items.length;
        const rows = s.items.slice(s.top, s.top + VISIBLE).map((it, i) =>
          `<div class="row${s.top + i === s.sel ? " sel" : ""}">${esc(it.label.slice(0, COLS - 1))}</div>`
        ).join("");
        return {
          html: `<div class="title"><span>${esc(s.app.title)}</span><span>${n ? s.sel + 1 + "/" + n : ""}</span></div>` +
                (rows || `<div class="empty">EMPTY</div>`),
          soft: [s.app.id === "sets" ? "TOGGLE" : "OPEN", "BACK"],
        };
      },
      key(s, k) {
        const n = s.items.length, it = s.items[s.sel];
        if (k === "up" || k === "down") {
          if (!n) return;
          s.sel = (s.sel + (k === "up" ? -1 : 1) + n) % n;
          if (s.sel < s.top) s.top = s.sel;
          if (s.sel >= s.top + VISIBLE) s.top = s.sel - VISIBLE + 1;
        } else if (k === "ok" || k === "soft-l") {
          if (!it) return;
          if (it.toggle) { it.toggle(); s.items = s.app.items(); }
          else return go({ name: "text", title: it.label, lines: wrap(it.text), top: 0 });
        } else if (k === "call") {
          if (it && it.number) return startCall(it.number, it.label);
          return;
        } else if (k === "soft-r" || k === "c") return back();
        else if (k === "end") return home();
        else return;
        draw();
      },
    },

    text: {
      view(s) {
        const rows = s.lines.slice(s.top, s.top + VISIBLE).map((l) => `<div class="row">${esc(l)}</div>`).join("");
        return { html: `<div class="title"><span>${esc(s.title.slice(0, COLS))}</span></div>${rows}`, soft: ["", "BACK"] };
      },
      key(s, k) {
        const max = Math.max(0, s.lines.length - VISIBLE);
        if (k === "up") s.top = Math.max(0, s.top - 1);
        else if (k === "down") s.top = Math.min(max, s.top + 1);
        else if (k === "soft-r" || k === "c" || k === "ok") return back();
        else if (k === "end") return home();
        else return;
        draw();
      },
    },

    clock: {
      view() {
        const t = clock();
        return {
          html: `<div class="title"><span>CLOCK</span></div><div><div class="face" style="top: calc(var(--px) * 28)"><div class="clock">${t.hm}</div><div class="sub">${t.ampm}<br>${t.date}</div></div></div>`,
          soft: ["", "BACK"],
        };
      },
      key(s, k) {
        if (k === "soft-r" || k === "c" || k === "ok") back();
        else if (k === "end") home();
      },
    },

    dial: {
      view(s) {
        return {
          html: `<div class="title"><span>DIAL</span></div><div class="dial"><div class="num">${esc(s.number.slice(-COLS + 1))}</div></div>`,
          soft: ["CALL", "CLEAR"],
        };
      },
      key(s, k) {
        if (isDigit(k)) { if (s.number.length < 20) s.number += k; }
        else if (k === "c" || k === "soft-r") { s.number = s.number.slice(0, -1); if (!s.number) return back(); }
        else if (k === "call" || k === "soft-l" || k === "ok") { if (s.number) startCall(s.number); return; }
        else if (k === "end") return home();
        else return;
        draw();
      },
    },

    calling: {
      view(s) {
        const body = s.phase === "dialing"
          ? `<div class="state">CALLING<span class="dots"><i>.</i><i>.</i><i>.</i></span></div>`
          : `<div class="lines">${s.lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
        return { html: `<div class="calling"><div class="who">${esc(s.label.slice(0, COLS))}</div>${body}</div>`, soft: ["", "END"] };
      },
      key(s, k) { if (k === "end" || k === "soft-r" || k === "c") home(); },
    },
  };

  function draw() {
    const s = current();
    const v = SCREENS[s.name].view(s);
    viewEl.className = "view s-" + s.name;
    viewEl.innerHTML = v.html;
    softL.textContent = v.soft[0];
    softR.textContent = v.soft[1];
  }

  // ---------- 按键声音 ----------
  let audio;
  function beep(k) {
    if (!SETTINGS.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      const i = "0123456789*#".indexOf(k);
      o.type = "square";
      o.frequency.value = i >= 0 ? 520 + i * 45 : 440;
      g.gain.value = 0.03;
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.045);
    } catch (e) { /* 浏览器不支持声音就算了 */ }
  }

  function press(k) {
    beep(k);
    const s = current();
    SCREENS[s.name].key(s, k);
  }

  // ---------- 鼠标 / 触摸点键盘 ----------
  keypad.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-key]");
    if (!b) return;
    e.preventDefault();
    press(b.dataset.key);
  });

  // ---------- 电脑键盘也能按 ----------
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Enter: "ok", Backspace: "c", Escape: "end", " ": "call",
    z: "soft-l", Z: "soft-l", x: "soft-r", X: "soft-r",
  };
  const REPEATABLE = ["up", "down", "left", "right", "c"];

  function flash(k) {
    const b = keypad.querySelector(`[data-key="${k}"]`);
    if (!b) return;
    b.classList.add("is-down");
    setTimeout(() => b.classList.remove("is-down"), 110);
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYMAP[e.key] || (isDigit(e.key) ? e.key : null);
    if (!k) return;
    e.preventDefault();
    if (e.repeat && !REPEATABLE.includes(k)) return;
    flash(k);
    press(k);
  });

  // 主屏幕和时钟每秒刷新一次
  setInterval(() => {
    const n = current().name;
    if (n === "home" || n === "clock") draw();
  }, 1000);

  draw();

  // 方便在控制台里试：phone.press("1")
  window.phone = { press, home };
})();