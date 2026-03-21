// Mandelbrot Explorer — Pure Vanilla JS
// Off-main-thread rendering via Web Workers

const PLACES_OF_INTEREST = [
    { name: "Full Set", description: "The complete Mandelbrot set", x: -0.5, y: 0, zoom: 1 },
    { name: "Seahorse Valley", description: "Intricate spiral patterns", x: -0.7463, y: 0.1102, zoom: 200 },
    { name: "Elephant Valley", description: "Elephant-trunk formations", x: 0.2815, y: 0.0085, zoom: 150 },
    { name: "Double Spiral", description: "Mesmerizing double spiral", x: -0.0452407411, y: 0.9868162204352258, zoom: 2000 },
    { name: "Lightning", description: "Fractal lightning patterns", x: -1.315180982097868, y: 0.073481649996795, zoom: 50000 },
    { name: "Starfish", description: "Star-shaped formations", x: -0.3558404221, y: 0.6428140572, zoom: 5000 },
    { name: "Spiral Galaxy", description: "Galaxy-like structure", x: -0.7436439, y: 0.1318259, zoom: 50000 },
    { name: "Mini Mandelbrot", description: "Self-similar miniature copy", x: -1.7497591451303665, y: 0.0000000388, zoom: 300000 },
    { name: "Tendrils", description: "Delicate boundary formations", x: -0.10109636384562, y: 0.9562865108091415, zoom: 20000 },
    { name: "Quad Spiral", description: "Four interleaving spirals", x: 0.27322626, y: 0.595153338, zoom: 60000 },
];

// ===== State =====
const state = {
    centerX: -0.5,
    centerY: 0,
    zoom: 1,
    maxIter: 300,
    resolutionScale: 1,
    zoomSpeed: 2,
    panSpeed: 2,
    animating: false,
    lastRenderTime: 0,
};

// ===== DOM =====
const canvas = document.getElementById("fractal-canvas");
const ctx = canvas.getContext("2d");
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas.getContext("2d");
const loadingOverlay = document.getElementById("loading-overlay");
const hudCoords = document.getElementById("hud-coords");
const hudZoom = document.getElementById("hud-zoom");
const hudIter = document.getElementById("hud-iter");
const controlsToggle = document.getElementById("controls-toggle");
const controlsPanel = document.getElementById("controls-panel");
const controlsClose = document.getElementById("controls-close");
const poiList = document.getElementById("poi-list");
const inputReal = document.getElementById("input-real");
const inputImag = document.getElementById("input-imag");
const inputZoom = document.getElementById("input-zoom");
const btnGoto = document.getElementById("btn-goto");
const sliderZoomSpeed = document.getElementById("slider-zoom-speed");
const sliderPanSpeed = document.getElementById("slider-pan-speed");
const sliderIterations = document.getElementById("slider-iterations");
const sliderResolution = document.getElementById("slider-resolution");
const zoomSpeedVal = document.getElementById("zoom-speed-val");
const panSpeedVal = document.getElementById("pan-speed-val");
const iterVal = document.getElementById("iter-val");
const resVal = document.getElementById("res-val");

// ===== Web Worker Pool =====
const WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 8);
const workers = [];
let renderIdCounter = 0;
let currentRenderId = 0;
let pendingChunks = 0;

for (let i = 0; i < WORKER_COUNT; i++) {
    const w = new Worker("/worker.js");
    w.onmessage = onWorkerMessage;
    workers.push(w);
}

// ===== Canvas sizing =====
let renderWidth = 0;
let renderHeight = 0;

// Track last rendered state for CSS transform feedback
let renderedCenterX = -0.5;
let renderedCenterY = 0;
let renderedZoom = 1;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const scale = state.resolutionScale * dpr;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    renderWidth = Math.round(w * scale);
    renderHeight = Math.round(h * scale);
    canvas.width = renderWidth;
    canvas.height = renderHeight;
}

// ===== Rendering with Worker Pool =====
// Split the image into horizontal strips, one per worker

function render() {
    renderIdCounter++;
    currentRenderId = renderIdCounter;
    const rid = currentRenderId;

    const rowsPerWorker = Math.ceil(renderHeight / WORKER_COUNT);

    pendingChunks = WORKER_COUNT;

    for (let i = 0; i < WORKER_COUNT; i++) {
        const yStart = i * rowsPerWorker;
        const yEnd = Math.min(yStart + rowsPerWorker, renderHeight);
        const chunkHeight = yEnd - yStart;
        if (chunkHeight <= 0) {
            pendingChunks--;
            continue;
        }

        // Compute the centerY offset for this strip
        const viewHeight = 3.0 / state.zoom;
        const viewWidth = viewHeight * (renderWidth / renderHeight);
        const stripCenterY = state.centerY + viewHeight * ((yStart + chunkHeight / 2) / renderHeight - 0.5);

        workers[i].postMessage({
            id: rid,
            width: renderWidth,
            height: chunkHeight,
            centerX: state.centerX,
            centerY: stripCenterY,
            zoom: state.zoom,
            maxIter: state.maxIter,
            _yStart: yStart,
        });
    }
}

function onWorkerMessage(e) {
    const { id, buf, elapsed, width, height } = e.data;

    // Discard stale renders
    if (id !== currentRenderId) return;

    const pixels = new Uint8ClampedArray(buf);
    const imageData = new ImageData(pixels, width, height);

    // Recover yStart from the worker message
    // We encode it; let's use a different approach: track per-worker
    const workerIdx = workers.indexOf(e.target);
    const rowsPerWorker = Math.ceil(renderHeight / WORKER_COUNT);
    const yStart = workerIdx * rowsPerWorker;

    ctx.putImageData(imageData, 0, yStart);

    state.lastRenderTime = Math.max(state.lastRenderTime, elapsed);
    pendingChunks--;

    if (pendingChunks <= 0) {
        renderedCenterX = state.centerX;
        renderedCenterY = state.centerY;
        renderedZoom = state.zoom;
        clearTransform();
        updateHUD();
    }
}

// ===== CSS Transform feedback =====
function applyTransformFeedback() {
    const screenH = window.innerHeight;
    const viewH = 3.0 / renderedZoom;
    const pxPerUnit = screenH / viewH;
    const dx = -(state.centerX - renderedCenterX) * pxPerUnit;
    const dy = -(state.centerY - renderedCenterY) * pxPerUnit;
    const s = state.zoom / renderedZoom;
    canvas.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
}

function clearTransform() {
    canvas.style.transform = "";
}

let settleTimer = null;
const SETTLE_DELAY = 60;

function scheduleRender() {
    applyTransformFeedback();
    updateHUD();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
        state.lastRenderTime = 0;
        render();
    }, SETTLE_DELAY);
}

// ===== Minimap =====
let minimapImageData = null;
const minimapWorker = new Worker("/worker.js");

function renderMinimap() {
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;

    if (!minimapImageData) {
        // Render minimap once using a dedicated worker
        minimapWorker.postMessage({
            id: -1,
            width: mw,
            height: mh,
            centerX: -0.5,
            centerY: 0,
            zoom: 1,
            maxIter: 200,
        });
        minimapWorker.onmessage = function(e) {
            if (e.data.id === -1) {
                minimapImageData = new ImageData(new Uint8ClampedArray(e.data.buf), mw, mh);
                drawMinimap();
            }
        };
        return;
    }

    drawMinimap();
}

function drawMinimap() {
    if (!minimapImageData) return;
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    minimapCtx.putImageData(minimapImageData, 0, 0);

    const viewWidth = 3.0 / state.zoom;
    const viewHeight = viewWidth * (mh / mw);
    const totalWidth = 3.0;
    const totalHeight = totalWidth * (mh / mw);

    const vx = ((state.centerX - viewWidth / 2) - (-0.5 - totalWidth / 2)) / totalWidth * mw;
    const vy = ((state.centerY - viewHeight / 2) - (0 - totalHeight / 2)) / totalHeight * mh;
    const vw = viewWidth / totalWidth * mw;
    const vh = viewHeight / totalHeight * mh;

    minimapCtx.strokeStyle = "rgba(108, 123, 255, 0.8)";
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(vx, vy, vw, vh);
}

// ===== HUD =====
function updateHUD() {
    hudCoords.textContent = `Re: ${state.centerX.toFixed(12)} Im: ${state.centerY.toFixed(12)}`;
    hudZoom.textContent = `Zoom: ${formatZoom(state.zoom)}`;
    hudIter.textContent = `${state.lastRenderTime.toFixed(0)}ms`;
    drawMinimap();
}

function formatZoom(z) {
    if (z >= 1e12) return z.toExponential(2);
    if (z >= 1e6) return (z / 1e6).toFixed(1) + "M";
    if (z >= 1e3) return (z / 1e3).toFixed(1) + "K";
    return z.toFixed(1);
}

// ===== Mouse / Touch =====
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragCenterX = 0, dragCenterY = 0;

canvas.addEventListener("pointerdown", (e) => {
    if (state.animating) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragCenterX = state.centerX;
    dragCenterY = state.centerY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const scale = 3.0 / (state.zoom * window.innerHeight);
    state.centerX = dragCenterX - dx * scale;
    state.centerY = dragCenterY - dy * scale;
    scheduleRender();
});

canvas.addEventListener("pointerup", (e) => {
    if (isDragging) {
        isDragging = false;
        canvas.releasePointerCapture(e.pointerId);
        canvas.style.cursor = "crosshair";
        clearTimeout(settleTimer);
        state.lastRenderTime = 0;
        render();
    }
});

canvas.addEventListener("pointercancel", () => {
    isDragging = false;
    canvas.style.cursor = "crosshair";
    clearTimeout(settleTimer);
    render();
});

// ===== Scroll Zoom =====
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (state.animating) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const aspect = rect.width / rect.height;
    const viewHeight = 3.0 / state.zoom;
    const viewWidth = viewHeight * aspect;
    const fracX = state.centerX + (mouseX / rect.width - 0.5) * viewWidth;
    const fracY = state.centerY + (mouseY / rect.height - 0.5) * viewHeight;

    const zoomFactor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    const newZoom = state.zoom * zoomFactor;

    const t = 1 - 1 / zoomFactor;
    if (e.deltaY < 0) {
        state.centerX += (fracX - state.centerX) * t;
        state.centerY += (fracY - state.centerY) * t;
    } else {
        state.centerX -= (fracX - state.centerX) * t * (zoomFactor - 1);
        state.centerY -= (fracY - state.centerY) * t * (zoomFactor - 1);
    }

    state.zoom = Math.max(0.1, newZoom);
    adaptIterations();
    scheduleRender();
}, { passive: false });

// ===== Pinch Zoom =====
let lastPinchDist = 0;
const activePointers = new Map();

canvas.addEventListener("pointerdown", (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});

canvas.addEventListener("pointermove", (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
        const [p1, p2] = [...activePointers.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (lastPinchDist > 0) {
            state.zoom *= dist / lastPinchDist;
            state.zoom = Math.max(0.1, state.zoom);
            adaptIterations();
            scheduleRender();
        }
        lastPinchDist = dist;
        isDragging = false;
    }
});

function onPointerEnd(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
        lastPinchDist = 0;
        if (activePointers.size === 0) {
            clearTimeout(settleTimer);
            render();
        }
    }
}
canvas.addEventListener("pointerup", onPointerEnd);
canvas.addEventListener("pointercancel", onPointerEnd);

// ===== Keyboard =====
document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (state.animating) return;

    const panAmount = 0.1 / state.zoom * 3.0;

    switch (e.key) {
        case "ArrowLeft": case "a": state.centerX -= panAmount; scheduleRender(); break;
        case "ArrowRight": case "d": state.centerX += panAmount; scheduleRender(); break;
        case "ArrowUp": case "w": state.centerY -= panAmount; scheduleRender(); break;
        case "ArrowDown": case "s":
            if (!e.ctrlKey && !e.metaKey) { state.centerY += panAmount; scheduleRender(); }
            break;
        case "+": case "=": state.zoom *= 1.5; adaptIterations(); scheduleRender(); break;
        case "-": state.zoom = Math.max(0.1, state.zoom / 1.5); adaptIterations(); scheduleRender(); break;
        case "r": case "R": animateTo(-0.5, 0, 1); break;
        case "f": case "F": toggleFullscreen(); break;
    }
    if (e.key === "S" && !e.shiftKey === false) toggleControls();
});

// ===== Adaptive Iterations =====
function adaptIterations() {
    const autoIter = Math.min(2000, Math.max(100, Math.round(200 + 50 * Math.log2(state.zoom + 1))));
    if (sliderIterations.dataset.manual !== "true") {
        state.maxIter = autoIter;
        sliderIterations.value = autoIter;
        iterVal.textContent = autoIter;
    }
}

// ===== Animation Engine =====
function animateTo(targetX, targetY, targetZoom) {
    if (state.animating) return;
    state.animating = true;
    document.body.classList.add("animating");

    const startX = state.centerX, startY = state.centerY, startZoom = state.zoom;
    const overviewZoom = Math.min(startZoom, targetZoom, 1);

    const zoomOutDur = 1200 / state.zoomSpeed;
    const panDur = 1000 / state.panSpeed;
    const zoomInDur = 1500 / state.zoomSpeed;

    let startTime = null, phase = 0;

    const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    const easeOutExpo = t => t === 1 ? 1 : 1 - Math.pow(2, -10*t);
    const lerpZoom = (a, b, t) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);

    function step(ts) {
        if (!startTime) startTime = ts;
        const elapsed = ts - startTime;

        if (phase === 0) {
            const t = Math.min(1, elapsed / zoomOutDur);
            const et = easeInOutCubic(t);
            state.zoom = lerpZoom(startZoom, overviewZoom, et);
            state.centerX = startX + (targetX - startX) * et * 0.2;
            state.centerY = startY + (targetY - startY) * et * 0.2;
            adaptIterations(); render();
            if (t >= 1) { phase = 1; startTime = ts; }
        } else if (phase === 1) {
            const px = state.centerX, py = state.centerY;
            const t = Math.min(1, elapsed / panDur);
            const et = easeInOutCubic(t);
            state.centerX = px + (targetX - px) * et;
            state.centerY = py + (targetY - py) * et;
            render();
            if (t >= 1) { state.centerX = targetX; state.centerY = targetY; phase = 2; startTime = ts; }
        } else if (phase === 2) {
            const t = Math.min(1, elapsed / zoomInDur);
            const et = easeOutExpo(t);
            state.zoom = lerpZoom(overviewZoom, targetZoom, et);
            adaptIterations(); render();
            if (t >= 1) {
                state.zoom = targetZoom;
                state.animating = false;
                document.body.classList.remove("animating");
                render();
                return;
            }
        }
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ===== Controls UI =====
function toggleControls() { controlsPanel.classList.toggle("hidden"); }
controlsToggle.addEventListener("click", toggleControls);
controlsClose.addEventListener("click", () => controlsPanel.classList.add("hidden"));
canvas.addEventListener("pointerdown", () => {
    if (!controlsPanel.classList.contains("hidden")) controlsPanel.classList.add("hidden");
});

function buildPOI() {
    poiList.innerHTML = "";
    for (const poi of PLACES_OF_INTEREST) {
        const btn = document.createElement("button");
        btn.className = "poi-btn";
        btn.innerHTML = `<span class="poi-name">${poi.name}</span><span class="poi-coords">${poi.x}, ${poi.y}i — zoom ${formatZoom(poi.zoom)}</span>`;
        btn.title = poi.description;
        btn.addEventListener("click", () => {
            controlsPanel.classList.add("hidden");
            animateTo(poi.x, poi.y, poi.zoom);
        });
        poiList.appendChild(btn);
    }
}

btnGoto.addEventListener("click", () => {
    const x = parseFloat(inputReal.value), y = parseFloat(inputImag.value), z = parseFloat(inputZoom.value);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;
    controlsPanel.classList.add("hidden");
    animateTo(x, y, Math.max(0.1, z));
});

// ===== Sliders =====
sliderZoomSpeed.addEventListener("input", () => {
    state.zoomSpeed = parseFloat(sliderZoomSpeed.value);
    zoomSpeedVal.textContent = state.zoomSpeed.toFixed(1) + "x";
});
sliderPanSpeed.addEventListener("input", () => {
    state.panSpeed = parseFloat(sliderPanSpeed.value);
    panSpeedVal.textContent = state.panSpeed.toFixed(1) + "x";
});
sliderIterations.addEventListener("input", () => {
    sliderIterations.dataset.manual = "true";
    state.maxIter = parseInt(sliderIterations.value);
    iterVal.textContent = state.maxIter;
    render();
});
sliderResolution.addEventListener("input", () => {
    state.resolutionScale = parseFloat(sliderResolution.value);
    resVal.textContent = state.resolutionScale.toFixed(2) + "x";
    resizeCanvas();
    render();
});

// ===== Fullscreen =====
function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
}

// ===== Resize =====
let resizeTimer = null;
function onResize() {
    resizeCanvas();
    render();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resizeCanvas(); render(); }, 150);
}

// ===== Service Worker =====
async function registerSW() {
    if ("serviceWorker" in navigator) {
        try { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); }
        catch (err) { console.warn("SW registration failed:", err); }
    }
}

// ===== Boot =====
(function boot() {
    resizeCanvas();
    window.addEventListener("resize", onResize);
    buildPOI();
    render();
    renderMinimap();

    loadingOverlay.classList.add("fade-out");
    setTimeout(() => loadingOverlay.remove(), 600);
    registerSW();
})();
