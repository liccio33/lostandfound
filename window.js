document.addEventListener("DOMContentLoaded", () => {
  const windows = document.querySelectorAll(".win");
  let topZIndex = 10;

  windows.forEach((win) => {
    const titleBar = win.querySelector(".win-title");

    if (!titleBar) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    titleBar.addEventListener("pointerdown", (event) => {
      // 点击最小化、最大化或关闭按钮时，不拖动窗口
      if (event.target.closest("button")) return;

      const rect = win.getBoundingClientRect();

      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      // 把正在拖动的窗口显示在其他窗口前面
      topZIndex += 1;
      win.style.zIndex = topZIndex;

      titleBar.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    titleBar.addEventListener("pointermove", (event) => {
      if (!isDragging) return;

      const moveX = event.clientX - startX;
      const moveY = event.clientY - startY;

      win.style.left = `${startLeft + moveX}px`;
      win.style.top = `${startTop + moveY}px`;
    });

    const stopDragging = () => {
      isDragging = false;
    };

    titleBar.addEventListener("pointerup", stopDragging);
    titleBar.addEventListener("pointercancel", stopDragging);
  });
});

window.addEventListener("pointermove", (event) => {
  window.parent.postMessage(
    {
      type: "starfield-pointer",
      x: event.clientX,
      y: event.clientY,
    },
    "*"
  );
});

window.addEventListener("pointerleave", () => {
  window.parent.postMessage(
    { type: "starfield-pointer-leave" },
    "*"
  );
});


// ================= 对话记录窗口：滚动条 + 加对话 =================

// 给带 has-vscroll 的窗口装上可用的滚动条：滑块、箭头、点击轨道翻页、拖动
function initScroll(win) {
  const content = win.querySelector(".win-scroll");
  const track = win.querySelector(".win-vscroll .win-track");
  const thumb = track.querySelector(".win-thumb");
  const up = win.querySelector(".win-vscroll .up");
  const down = win.querySelector(".win-vscroll .down");
  const u = parseFloat(getComputedStyle(win).getPropertyValue("--u")) || 1;
  const STEP = u * 16;                 // 点一下箭头滚多远

  function update() {
    const max = content.scrollHeight - content.clientHeight;
    const scrollable = max > 1;
    thumb.hidden = !scrollable;
    up.classList.toggle("is-off", !scrollable || content.scrollTop <= 0);
    down.classList.toggle("is-off", !scrollable || content.scrollTop >= max - 1);
    if (!scrollable) return;

    const trackH = track.clientHeight;
    const snap = (v) => Math.round(v / u) * u;      // 对齐到像素格
    const thumbH = Math.min(trackH, Math.max(u * 12, snap(trackH * content.clientHeight / content.scrollHeight)));
    thumb.style.height = thumbH + "px";
    thumb.style.top = snap((trackH - thumbH) * (content.scrollTop / max)) + "px";
  }

  // 拖动滑块
  let drag = null;
  thumb.addEventListener("pointerdown", (e) => {
    drag = { y: e.clientY, top: content.scrollTop };
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  thumb.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const room = track.clientHeight - thumb.offsetHeight;
    if (room <= 0) return;
    const ratio = (content.scrollHeight - content.clientHeight) / room;
    content.scrollTop = drag.top + (e.clientY - drag.y) * ratio;
  });
  const endDrag = () => { drag = null; };
  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);

  // 点轨道：翻一页
  track.addEventListener("pointerdown", (e) => {
    if (e.target === thumb) return;
    const r = thumb.getBoundingClientRect();
    content.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * content.clientHeight * 0.9 });
  });

  // 箭头：点一下滚一格，按住连续滚
  function hold(btn, dir) {
    let timer;
    const go = () => content.scrollBy({ top: dir * STEP });
    const stop = () => { clearTimeout(timer); clearInterval(timer); };
    btn.addEventListener("pointerdown", () => {
      go();
      timer = setTimeout(() => { timer = setInterval(go, 60); }, 350);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((t) => btn.addEventListener(t, stop));
  }
  hold(up, -1);
  hold(down, 1);

  content.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(content);
  new MutationObserver(update).observe(content, { childList: true, subtree: true });
  window.addEventListener("resize", update);
  update();
}

// 往对话记录里加一句话，并自动滚到最新
//   addDialogue(document.getElementById("log"), "UNKNOWN", "Hello?")
//   addDialogue(document.getElementById("log"), "YOU", "I'm here.", { me: true })
function addDialogue(log, who, text, { me = false } = {}) {
  const p = document.createElement("p");
  p.className = "line" + (me ? " me" : "");
  const w = document.createElement("span");
  w.className = "who";
  w.textContent = who;
  p.append(w, document.createTextNode(text));
  log.append(p);
  log.scrollTop = log.scrollHeight;
}

function initAllScrolls() {
  document.querySelectorAll(".win.has-vscroll").forEach(initScroll);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAllScrolls);
} else {
  initAllScrolls();
}