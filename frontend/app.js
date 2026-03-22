// Mandelbrot Explorer
// Double-buffered atomic swap. CSS translate for pan only (geometrically exact).
// No CSS scale — zoom always re-renders via worker pool. Chained render pipeline.

const POI = [
    { name: "Full Set",        x: -0.5,   y: 0,    z: 1,      d: "The complete Mandelbrot set" },
    { name: "Seahorse Valley", x: -0.7463, y: 0.1102, z: 200,  d: "Intricate spiral patterns" },
    { name: "Elephant Valley", x: 0.2815,  y: 0.0085, z: 150,  d: "Elephant-trunk formations" },
    { name: "Double Spiral",   x: -0.0452407411, y: 0.9868162204352258, z: 2000, d: "Mesmerizing double spiral" },
    { name: "Lightning",       x: -1.315180982097868, y: 0.073481649996795, z: 50000, d: "Fractal lightning patterns" },
    { name: "Starfish",        x: -0.3558404221, y: 0.6428140572, z: 5000, d: "Star-shaped formations" },
    { name: "Spiral Galaxy",   x: -0.7436439, y: 0.1318259, z: 50000, d: "Galaxy-like spiraling structure" },
    { name: "Mini Mandelbrot", x: -1.7497591451303665, y: 0.0000000388, z: 300000, d: "Self-similar miniature copy" },
    { name: "Tendrils",        x: -0.10109636384562, y: 0.9562865108091415, z: 20000, d: "Delicate boundary formations" },
    { name: "Quad Spiral",     x: 0.27322626, y: 0.595153338, z: 60000, d: "Four interleaving spirals" },
];

// ===== State =====
const V = {
    cx: -0.5, cy: 0, zoom: 1,
    maxIter: 300,
    resFactor: 1,
    zoomSpeed: 2, panSpeed: 2,
    animating: false,
    renderMs: 0,
};

// ===== DOM =====
const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx    = canvas.getContext("2d");
const mmC    = $("minimap");
const mmX    = mmC.getContext("2d");

// ===== Workers =====
const NW = Math.min(navigator.hardwareConcurrency || 4, 16);
const workers = [];
for (let i = 0; i < NW; i++) {
    const w = new Worker("/worker.js");
    w.onmessage = onChunk;
    workers.push(w);
}

// ===== Canvas sizing =====
let rW = 0, rH = 0;

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = V.resFactor * dpr;
    rW = window.innerWidth * s + 0.5 | 0;
    rH = window.innerHeight * s + 0.5 | 0;
    canvas.width = rW;
    canvas.height = rH;
    canvas.style.width  = window.innerWidth  + "px";
    canvas.style.height = window.innerHeight + "px";
    offscreen.width = rW;
    offscreen.height = rH;
}

// ===== Double buffer =====
const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d");

// ===== Render engine =====
let rendering = false;
let dirty = false;
let renderId = 0;
let activeId = 0;
let chunks = 0;
let maxMs = 0;

// What the visible canvas currently shows
let shownCx = -0.5, shownCy = 0, shownZoom = 1;
// What is currently being rendered
let pendCx = 0, pendCy = 0, pendZoom = 0;

function render() {
    if (rendering) { dirty = true; return; }
    rendering = true;
    dirty = false;
    renderId++;
    activeId = renderId;

    pendCx = V.cx; pendCy = V.cy; pendZoom = V.zoom;

    const vH = 3.0 / V.zoom;
    const vW = vH * (rW / rH);
    const xMin = V.cx - vW * 0.5;
    const yMin = V.cy - vH * 0.5;
    const dx = vW / rW;
    const dy = vH / rH;

    const rows = Math.ceil(rH / NW);
    chunks = 0; maxMs = 0;

    for (let i = 0; i < NW; i++) {
        const y0 = i * rows;
        const ch = Math.min(rows, rH - y0);
        if (ch <= 0) continue;
        chunks++;
        workers[i].postMessage({
            id: activeId, w: rW, h: ch,
            xMin, yMin: yMin + y0 * dy,
            dx, dy, maxIter: V.maxIter, y: y0,
        });
    }
}

function onChunk(e) {
    const d = e.data;
    if (d.id !== activeId) return;

    offCtx.putImageData(new ImageData(new Uint8ClampedArray(d.buf), d.w, d.h), 0, d.y);
    if (d.ms > maxMs) maxMs = d.ms;
    if (--chunks > 0) return;

    // All strips done — atomic swap in next paint
    V.renderMs = maxMs;
    const swapCx = pendCx, swapCy = pendCy, swapZoom = pendZoom;

    requestAnimationFrame(() => {
        ctx.drawImage(offscreen, 0, 0);
        shownCx = swapCx; shownCy = swapCy; shownZoom = swapZoom;

        // If user panned during render, re-apply translate for the delta
        panTransform();
        updateHUD();

        rendering = false;
        if (dirty) render();
    });
}

// ===== Pan-only CSS translate =====
// Only used during drag. Geometrically exact — no scale, no zoom transform.
function panTransform() {
    if (V.zoom !== shownZoom || (V.cx === shownCx && V.cy === shownCy)) {
        canvas.style.transform = "";
        return;
    }
    const ppu = window.innerHeight / (3.0 / shownZoom);
    const tx = -(V.cx - shownCx) * ppu;
    const ty = -(V.cy - shownCy) * ppu;
    canvas.style.transform = `translate(${tx}px,${ty}px)`;
}

function clearTransform() { canvas.style.transform = ""; }

// ===== Render scheduling =====
let settleTimer = null;

function renderSoon() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(render, 50);
}

function renderNow() {
    clearTimeout(settleTimer);
    render();
}

// ===== Minimap =====
let mmData = null;
const mmWorker = new Worker("/worker.js");
mmWorker.onmessage = e => {
    if (e.data.id !== -1) return;
    mmData = new ImageData(new Uint8ClampedArray(e.data.buf), mmC.width, mmC.height);
    drawMM();
};

function initMM() {
    const mw = mmC.width, mh = mmC.height;
    const vh = 3.0, vw = vh * (mw / mh);
    mmWorker.postMessage({
        id: -1, w: mw, h: mh,
        xMin: -0.5 - vw * 0.5, yMin: -vh * 0.5,
        dx: vw / mw, dy: vh / mh,
        maxIter: 200, y: 0,
    });
}

function drawMM() {
    if (!mmData) return;
    const mw = mmC.width, mh = mmC.height;
    mmX.putImageData(mmData, 0, 0);
    const vw = 3.0 / V.zoom, vh = vw * (mh / mw);
    const tw = 3.0, th = tw * (mh / mw);
    mmX.strokeStyle = "rgba(108,123,255,0.8)";
    mmX.lineWidth = 1.5;
    mmX.strokeRect(
        ((V.cx - vw/2) - (-0.5 - tw/2)) / tw * mw,
        ((V.cy - vh/2) - (0 - th/2)) / th * mh,
        vw / tw * mw, vh / th * mh
    );
}

// ===== HUD =====
function updateHUD() {
    $("hud-c").textContent = `Re: ${V.cx.toFixed(12)}  Im: ${V.cy.toFixed(12)}`;
    $("hud-z").textContent = `Zoom: ${fmtZ(V.zoom)}`;
    $("hud-ms").textContent = `${V.renderMs.toFixed(0)}ms`;
    drawMM();
}
function fmtZ(z) {
    if (z >= 1e12) return z.toExponential(2);
    if (z >= 1e6) return (z/1e6).toFixed(1) + "M";
    if (z >= 1e3) return (z/1e3).toFixed(1) + "K";
    return z.toFixed(1);
}

// ===== Drag to Pan =====
let dragging = false, dsx = 0, dsy = 0, dcx = 0, dcy = 0;

canvas.addEventListener("pointerdown", e => {
    if (V.animating) return;
    dragging = true;
    dsx = e.clientX; dsy = e.clientY;
    dcx = V.cx; dcy = V.cy;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const scale = 3.0 / (V.zoom * window.innerHeight);
    V.cx = dcx - (e.clientX - dsx) * scale;
    V.cy = dcy - (e.clientY - dsy) * scale;
    // Pure CSS translate — geometrically exact, zero computation
    panTransform();
    updateHUD();
});

canvas.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "crosshair";
    clearTransform();
    renderNow();
});

canvas.addEventListener("pointercancel", () => {
    dragging = false;
    canvas.style.cursor = "crosshair";
    clearTransform();
    renderNow();
});

// ===== Wheel Zoom =====
// No CSS transform — just debounced re-render. Workers are fast enough.
canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (V.animating) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const asp = rect.width / rect.height;
    const vH = 3.0 / V.zoom, vW = vH * asp;
    const fx = V.cx + (mx / rect.width  - 0.5) * vW;
    const fy = V.cy + (my / rect.height - 0.5) * vH;

    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 36;
    if (e.deltaMode === 2) d *= window.innerHeight;
    d = Math.max(-300, Math.min(300, d));

    const zf = Math.pow(1.0012, -d);
    const nz = Math.max(0.1, V.zoom * zf);
    const t = 1 - V.zoom / nz;
    V.cx += (fx - V.cx) * t;
    V.cy += (fy - V.cy) * t;
    V.zoom = nz;
    adaptIter();
    renderSoon();
    updateHUD();
}, { passive: false });

// ===== Pinch Zoom =====
let lastPinch = 0;
const ptrs = new Map();

canvas.addEventListener("pointerdown", e => ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }));
canvas.addEventListener("pointermove", e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (lastPinch > 0) {
            V.zoom = Math.max(0.1, V.zoom * (dist / lastPinch));
            adaptIter();
            renderSoon();
            updateHUD();
        }
        lastPinch = dist;
        dragging = false;
    }
});
function ptrEnd(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) {
        lastPinch = 0;
        if (ptrs.size === 0 && !dragging) renderNow();
    }
}
canvas.addEventListener("pointerup", ptrEnd);
canvas.addEventListener("pointercancel", ptrEnd);

// ===== Keyboard =====
document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || V.animating) return;
    const p = 0.1 / V.zoom * 3.0;
    switch (e.key) {
        case "ArrowLeft": case "a": V.cx -= p; renderNow(); break;
        case "ArrowRight": case "d": V.cx += p; renderNow(); break;
        case "ArrowUp": case "w": V.cy -= p; renderNow(); break;
        case "ArrowDown": case "s":
            if (!e.ctrlKey && !e.metaKey) { V.cy += p; renderNow(); } break;
        case "+": case "=": V.zoom *= 1.5; adaptIter(); renderNow(); break;
        case "-": V.zoom = Math.max(0.1, V.zoom / 1.5); adaptIter(); renderNow(); break;
        case "r": case "R": flyTo(-0.5, 0, 1); break;
        case "f": case "F": toggleFS(); break;
        case "S": togglePanel(); break;
    }
});

// ===== Adaptive Iterations =====
function adaptIter() {
    const v = Math.min(2000, Math.max(100, 200 + 50 * Math.log2(V.zoom + 1) + 0.5 | 0));
    const sl = $("sl-iter");
    if (sl.dataset.manual !== "true") {
        V.maxIter = v; sl.value = v; $("v-iter").textContent = v;
    }
}

// ===== Fly-to Animation =====
// 3 phases: zoom out → pan → zoom in.
// Each rAF: update state, fire render (chains at worker speed).
// No CSS transforms during animation — every frame is a real render.
function flyTo(tx, ty, tz) {
    if (V.animating) return;
    V.animating = true;
    document.body.classList.add("animating");

    const sx = V.cx, sy = V.cy, sz = V.zoom;
    const oz = Math.min(sz, tz, 1);
    const d1 = 1200 / V.zoomSpeed, d2 = 1000 / V.panSpeed, d3 = 1500 / V.zoomSpeed;

    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
    const eOut = t => t === 1 ? 1 : 1 - Math.pow(2, -10*t);
    const lz = (a, b, t) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);

    let t0 = null, phase = 0, panSx, panSy;

    function step(ts) {
        if (!t0) t0 = ts;
        const el = ts - t0;

        if (phase === 0) {
            const t = Math.min(1, el / d1), e = ease(t);
            V.zoom = lz(sz, oz, e);
            V.cx = sx + (tx - sx) * e * 0.2;
            V.cy = sy + (ty - sy) * e * 0.2;
            adaptIter();
            if (t >= 1) { phase = 1; t0 = ts; panSx = V.cx; panSy = V.cy; }
        } else if (phase === 1) {
            const t = Math.min(1, el / d2), e = ease(t);
            V.cx = panSx + (tx - panSx) * e;
            V.cy = panSy + (ty - panSy) * e;
            if (t >= 1) { V.cx = tx; V.cy = ty; phase = 2; t0 = ts; }
        } else {
            const t = Math.min(1, el / d3), e = eOut(t);
            V.zoom = lz(oz, tz, e);
            adaptIter();
            if (t >= 1) {
                V.zoom = tz;
                V.animating = false;
                document.body.classList.remove("animating");
                renderNow();
                return;
            }
        }

        updateHUD();
        render();
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ===== UI =====
function togglePanel() { $("panel").classList.toggle("hidden"); }
$("btn-toggle").addEventListener("click", togglePanel);
$("btn-close").addEventListener("click", () => $("panel").classList.add("hidden"));
canvas.addEventListener("pointerdown", () => {
    if (!$("panel").classList.contains("hidden")) $("panel").classList.add("hidden");
});

(function buildPOI() {
    const list = $("poi-list");
    for (const p of POI) {
        const b = document.createElement("button");
        b.className = "poi-btn";
        b.innerHTML = `<span class="poi-name">${p.name}</span><span class="poi-sub">${p.d}</span>`;
        b.addEventListener("click", () => { $("panel").classList.add("hidden"); flyTo(p.x, p.y, p.z); });
        list.appendChild(b);
    }
})();

$("btn-go").addEventListener("click", () => {
    const x = parseFloat($("in-re").value);
    const y = parseFloat($("in-im").value);
    const z = parseFloat($("in-z").value);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;
    $("panel").classList.add("hidden");
    flyTo(x, y, Math.max(0.1, z));
});

$("sl-zspeed").addEventListener("input", e => {
    V.zoomSpeed = parseFloat(e.target.value);
    $("v-zspeed").textContent = V.zoomSpeed.toFixed(1) + "x";
});
$("sl-pspeed").addEventListener("input", e => {
    V.panSpeed = parseFloat(e.target.value);
    $("v-pspeed").textContent = V.panSpeed.toFixed(1) + "x";
});
$("sl-iter").addEventListener("input", e => {
    e.target.dataset.manual = "true";
    V.maxIter = parseInt(e.target.value);
    $("v-iter").textContent = V.maxIter;
    renderNow();
});
$("sl-res").addEventListener("input", e => {
    V.resFactor = parseFloat(e.target.value);
    $("v-res").textContent = V.resFactor.toFixed(2) + "x";
    resize(); renderNow();
});

function toggleFS() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
}

let rzTimer = null;
window.addEventListener("resize", () => {
    resize(); render();
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => { resize(); renderNow(); }, 200);
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

// ===== Boot =====
resize();
render();
initMM();
$("loading").classList.add("fade-out");
setTimeout(() => $("loading").remove(), 600);
