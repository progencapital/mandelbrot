// Mandelbrot Explorer
// Architecture: CSS transforms for instant feedback, Web Worker pool for computation,
// progressive rendering (low-res preview → full-res settle)

// ===== POIs =====
const POI = [
    { name: "Full Set",        x: -0.5,   y: 0,    z: 1,      desc: "The complete Mandelbrot set" },
    { name: "Seahorse Valley", x: -0.7463, y: 0.1102, z: 200,  desc: "Intricate spiral patterns" },
    { name: "Elephant Valley", x: 0.2815,  y: 0.0085, z: 150,  desc: "Elephant-trunk formations" },
    { name: "Double Spiral",   x: -0.0452407411, y: 0.9868162204352258, z: 2000, desc: "Mesmerizing double spiral" },
    { name: "Lightning",       x: -1.315180982097868, y: 0.073481649996795, z: 50000, desc: "Fractal lightning patterns" },
    { name: "Starfish",        x: -0.3558404221, y: 0.6428140572, z: 5000, desc: "Star-shaped formations" },
    { name: "Spiral Galaxy",   x: -0.7436439, y: 0.1318259, z: 50000, desc: "Galaxy-like spiraling structure" },
    { name: "Mini Mandelbrot", x: -1.7497591451303665, y: 0.0000000388, z: 300000, desc: "Self-similar miniature copy" },
    { name: "Tendrils",        x: -0.10109636384562, y: 0.9562865108091415, z: 20000, desc: "Delicate boundary formations" },
    { name: "Quad Spiral",     x: 0.27322626, y: 0.595153338, z: 60000, desc: "Four interleaving spirals" },
];

// ===== State =====
const S = {
    cx: -0.5, cy: 0, zoom: 1,
    maxIter: 300,
    resFactor: 1,
    zoomSpeed: 2, panSpeed: 2,
    animating: false,
    renderMs: 0,
};

// ===== DOM =====
const $ = id => document.getElementById(id);
const canvas   = $("canvas");
const ctx      = canvas.getContext("2d");
const mmCanvas = $("minimap");
const mmCtx    = mmCanvas.getContext("2d");

// ===== Workers =====
const N_WORKERS = Math.min(navigator.hardwareConcurrency || 4, 16);
const workers = [];
for (let i = 0; i < N_WORKERS; i++) {
    const w = new Worker("/worker.js");
    w.onmessage = onChunk;
    workers.push(w);
}

// ===== Canvas size =====
let rW = 0, rH = 0;

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = S.resFactor * dpr;
    rW = window.innerWidth * s + 0.5 | 0;
    rH = window.innerHeight * s + 0.5 | 0;
    canvas.width = rW;
    canvas.height = rH;
    canvas.style.width  = window.innerWidth  + "px";
    canvas.style.height = window.innerHeight + "px";
}

// ===== Render tracking =====
let renderId = 0;       // monotonically increasing
let activeId = 0;       // currently expected render id
let chunks = 0;         // pending chunk count
let maxMs = 0;          // slowest chunk time for current render
// What the canvas currently shows (for CSS transform delta)
let rCx = -0.5, rCy = 0, rZoom = 1;

// ===== Core render =====
function render(lowRes) {
    renderId++;
    activeId = renderId;
    const id = activeId;

    let w = rW, h = rH;
    if (lowRes) {
        // Quarter resolution for preview
        w = w * 0.25 + 0.5 | 0;
        h = h * 0.25 + 0.5 | 0;
        if (w < 1) w = 1;
        if (h < 1) h = 1;
    }

    const vH = 3.0 / S.zoom;
    const vW = vH * (w / h);
    const xMin = S.cx - vW * 0.5;
    const yMin = S.cy - vH * 0.5;
    const dx = vW / w;
    const dy = vH / h;

    const rows = Math.ceil(h / N_WORKERS);
    chunks = 0;
    maxMs = 0;

    for (let i = 0; i < N_WORKERS; i++) {
        const y0 = i * rows;
        const y1 = Math.min(y0 + rows, h);
        const ch = y1 - y0;
        if (ch <= 0) continue;
        chunks++;
        workers[i].postMessage({
            id, w, h: ch,
            xMin, yMin: yMin + y0 * dy,
            dx, dy,
            maxIter: S.maxIter,
            y: y0,
            totalH: h,
            lowRes: !!lowRes,
        });
    }

    // Store what we're rendering so onChunk can update tracking
    render._w = w;
    render._h = h;
    render._lowRes = !!lowRes;
}

function onChunk(e) {
    const d = e.data;
    if (d.id !== activeId) return;

    const img = new ImageData(new Uint8ClampedArray(d.buf), d.w, d.h);

    if (render._lowRes) {
        // Scale up low-res preview to fill canvas
        const offscreen = new OffscreenCanvas(d.w, d.h);
        offscreen.getContext("2d").putImageData(img, 0, 0);
        // Only draw this strip's portion scaled up
        const scaleX = rW / render._w;
        const scaleY = rH / render._h;
        ctx.drawImage(offscreen, 0, 0, d.w, d.h, 0, d.y * scaleY, d.w * scaleX, d.h * scaleY);
    } else {
        ctx.putImageData(img, 0, d.y);
    }

    if (d.ms > maxMs) maxMs = d.ms;
    chunks--;

    if (chunks <= 0) {
        S.renderMs = maxMs;
        rCx = S.cx; rCy = S.cy; rZoom = S.zoom;
        clearTransform();
        updateHUD();

        // If this was a low-res preview, queue full-res
        if (render._lowRes) {
            render(false);
        }
    }
}

// ===== CSS Transform (instant visual feedback) =====
function applyTransform() {
    const ppu = window.innerHeight / (3.0 / rZoom);
    const tx = -(S.cx - rCx) * ppu;
    const ty = -(S.cy - rCy) * ppu;
    const sc = S.zoom / rZoom;
    canvas.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`;
}
function clearTransform() { canvas.style.transform = ""; }

// ===== Debounced render scheduling =====
let settleTimer = null;

function scheduleRender() {
    applyTransform();
    updateHUD();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { render(true); }, 80);
}

function renderNow() {
    clearTimeout(settleTimer);
    render(true);
}

// ===== Minimap =====
let mmData = null;
const mmWorker = new Worker("/worker.js");
mmWorker.onmessage = function(e) {
    if (e.data.id !== -1) return;
    const mw = mmCanvas.width, mh = mmCanvas.height;
    mmData = new ImageData(new Uint8ClampedArray(e.data.buf), mw, mh);
    drawMinimap();
};

function initMinimap() {
    const mw = mmCanvas.width, mh = mmCanvas.height;
    const mvh = 3.0, mvw = mvh * (mw / mh);
    mmWorker.postMessage({
        id: -1, w: mw, h: mh,
        xMin: -0.5 - mvw * 0.5, yMin: -mvh * 0.5,
        dx: mvw / mw, dy: mvh / mh,
        maxIter: 200, y: 0, totalH: mh, lowRes: false,
    });
}

function drawMinimap() {
    if (!mmData) return;
    const mw = mmCanvas.width, mh = mmCanvas.height;
    mmCtx.putImageData(mmData, 0, 0);

    const vw = 3.0 / S.zoom;
    const vh = vw * (mh / mw);
    const tw = 3.0, th = tw * (mh / mw);
    const x = ((S.cx - vw/2) - (-0.5 - tw/2)) / tw * mw;
    const y = ((S.cy - vh/2) - (0 - th/2)) / th * mh;

    mmCtx.strokeStyle = "rgba(108,123,255,0.8)";
    mmCtx.lineWidth = 1.5;
    mmCtx.strokeRect(x, y, vw/tw*mw, vh/th*mh);
}

// ===== HUD =====
function updateHUD() {
    $("hud-c").textContent = `Re: ${S.cx.toFixed(12)}  Im: ${S.cy.toFixed(12)}`;
    $("hud-z").textContent = `Zoom: ${fmtZ(S.zoom)}`;
    $("hud-ms").textContent = `${S.renderMs.toFixed(0)}ms`;
    drawMinimap();
}
function fmtZ(z) {
    if (z >= 1e12) return z.toExponential(2);
    if (z >= 1e6) return (z/1e6).toFixed(1) + "M";
    if (z >= 1e3) return (z/1e3).toFixed(1) + "K";
    return z.toFixed(1);
}

// ===== Interaction: Drag to Pan =====
let dragging = false, dsx = 0, dsy = 0, dcx = 0, dcy = 0;

canvas.addEventListener("pointerdown", e => {
    if (S.animating) return;
    dragging = true;
    dsx = e.clientX; dsy = e.clientY;
    dcx = S.cx; dcy = S.cy;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const scale = 3.0 / (S.zoom * window.innerHeight);
    S.cx = dcx - (e.clientX - dsx) * scale;
    S.cy = dcy - (e.clientY - dsy) * scale;
    // CSS transform only — no render
    applyTransform();
    updateHUD();
});

canvas.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "crosshair";
    renderNow();
});

canvas.addEventListener("pointercancel", () => {
    dragging = false;
    canvas.style.cursor = "crosshair";
    renderNow();
});

// ===== Interaction: Wheel Zoom =====
canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (S.animating) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const asp = rect.width / rect.height;
    const vH = 3.0 / S.zoom;
    const vW = vH * asp;
    const fx = S.cx + (mx / rect.width  - 0.5) * vW;
    const fy = S.cy + (my / rect.height - 0.5) * vH;

    // Normalize delta
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 36;
    if (e.deltaMode === 2) d *= window.innerHeight;
    d = Math.max(-200, Math.min(200, d));

    const zf = Math.pow(1.0015, -d);
    const nz = Math.max(0.1, S.zoom * zf);

    // Zoom toward cursor
    const t = 1 - S.zoom / nz;
    S.cx += (fx - S.cx) * t;
    S.cy += (fy - S.cy) * t;
    S.zoom = nz;

    adaptIter();
    scheduleRender();
}, { passive: false });

// ===== Interaction: Pinch Zoom =====
let lastPinch = 0;
const ptrs = new Map();

canvas.addEventListener("pointerdown", e => ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }));
canvas.addEventListener("pointermove", e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(b.x-a.x, b.y-a.y);
        if (lastPinch > 0) {
            S.zoom = Math.max(0.1, S.zoom * (dist / lastPinch));
            adaptIter();
            scheduleRender();
        }
        lastPinch = dist;
        dragging = false;
    }
});
function ptrEnd(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) {
        lastPinch = 0;
        if (ptrs.size === 0) renderNow();
    }
}
canvas.addEventListener("pointerup", ptrEnd);
canvas.addEventListener("pointercancel", ptrEnd);

// ===== Keyboard =====
document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || S.animating) return;
    const p = 0.1 / S.zoom * 3.0;
    switch (e.key) {
        case "ArrowLeft": case "a": S.cx -= p; renderNow(); break;
        case "ArrowRight": case "d": S.cx += p; renderNow(); break;
        case "ArrowUp": case "w": S.cy -= p; renderNow(); break;
        case "ArrowDown": case "s":
            if (!e.ctrlKey && !e.metaKey) { S.cy += p; renderNow(); } break;
        case "+": case "=": S.zoom *= 1.5; adaptIter(); renderNow(); break;
        case "-": S.zoom = Math.max(0.1, S.zoom / 1.5); adaptIter(); renderNow(); break;
        case "r": case "R": flyTo(-0.5, 0, 1); break;
        case "f": case "F": toggleFS(); break;
        case "S": togglePanel(); break;
    }
});

// ===== Adaptive iterations =====
function adaptIter() {
    const v = Math.min(2000, Math.max(100, 200 + 50 * Math.log2(S.zoom + 1) + 0.5 | 0));
    const sl = $("sl-iter");
    if (sl.dataset.manual !== "true") {
        S.maxIter = v;
        sl.value = v;
        $("v-iter").textContent = v;
    }
}

// ===== Fly-to Animation =====
function flyTo(tx, ty, tz) {
    if (S.animating) return;
    S.animating = true;
    document.body.classList.add("animating");

    const sx = S.cx, sy = S.cy, sz = S.zoom;
    const oz = Math.min(sz, tz, 1);
    const d1 = 1200 / S.zoomSpeed, d2 = 1000 / S.panSpeed, d3 = 1500 / S.zoomSpeed;

    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
    const eOut = t => t === 1 ? 1 : 1 - Math.pow(2,-10*t);
    const lz = (a,b,t) => Math.exp(Math.log(a) + (Math.log(b)-Math.log(a)) * t);

    let t0 = null, phase = 0;
    let panSx, panSy;

    function step(ts) {
        if (!t0) t0 = ts;
        const el = ts - t0;

        if (phase === 0) {
            const t = Math.min(1, el / d1);
            const e = ease(t);
            S.zoom = lz(sz, oz, e);
            S.cx = sx + (tx - sx) * e * 0.2;
            S.cy = sy + (ty - sy) * e * 0.2;
            adaptIter(); render(true);
            if (t >= 1) { phase = 1; t0 = ts; panSx = S.cx; panSy = S.cy; }
        } else if (phase === 1) {
            const t = Math.min(1, el / d2);
            const e = ease(t);
            S.cx = panSx + (tx - panSx) * e;
            S.cy = panSy + (ty - panSy) * e;
            render(true);
            if (t >= 1) { S.cx = tx; S.cy = ty; phase = 2; t0 = ts; }
        } else {
            const t = Math.min(1, el / d3);
            const e = eOut(t);
            S.zoom = lz(oz, tz, e);
            adaptIter(); render(true);
            if (t >= 1) {
                S.zoom = tz;
                S.animating = false;
                document.body.classList.remove("animating");
                render(false);
                return;
            }
        }
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

function buildPOI() {
    const list = $("poi-list");
    list.innerHTML = "";
    for (const p of POI) {
        const b = document.createElement("button");
        b.className = "poi-btn";
        b.innerHTML = `<span class="poi-name">${p.name}</span><span class="poi-sub">${p.desc}</span>`;
        b.addEventListener("click", () => { togglePanel(); flyTo(p.x, p.y, p.z); });
        list.appendChild(b);
    }
}

$("btn-go").addEventListener("click", () => {
    const x = parseFloat($("in-re").value);
    const y = parseFloat($("in-im").value);
    const z = parseFloat($("in-z").value);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;
    togglePanel();
    flyTo(x, y, Math.max(0.1, z));
});

// Sliders
$("sl-zspeed").addEventListener("input", e => {
    S.zoomSpeed = parseFloat(e.target.value);
    $("v-zspeed").textContent = S.zoomSpeed.toFixed(1) + "x";
});
$("sl-pspeed").addEventListener("input", e => {
    S.panSpeed = parseFloat(e.target.value);
    $("v-pspeed").textContent = S.panSpeed.toFixed(1) + "x";
});
$("sl-iter").addEventListener("input", e => {
    e.target.dataset.manual = "true";
    S.maxIter = parseInt(e.target.value);
    $("v-iter").textContent = S.maxIter;
    render(false);
});
$("sl-res").addEventListener("input", e => {
    S.resFactor = parseFloat(e.target.value);
    $("v-res").textContent = S.resFactor.toFixed(2) + "x";
    resize(); render(false);
});

function toggleFS() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
}

// ===== Resize =====
let rzTimer = null;
function onResize() {
    resize(); render(true);
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => { resize(); render(false); }, 200);
}

// ===== Service Worker =====
async function regSW() {
    if ("serviceWorker" in navigator) {
        try { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); }
        catch(e) { /* ok */ }
    }
}

// ===== Boot =====
resize();
window.addEventListener("resize", onResize);
buildPOI();
render(false);
initMinimap();
$("loading").classList.add("fade-out");
setTimeout(() => $("loading").remove(), 600);
regSW();
