// Mandelbrot Explorer — Main Application
// Powered by Rust/WASM computation engine

// ===== Places of Interest =====
const PLACES_OF_INTEREST = [
    {
        name: "Full Set",
        description: "The complete Mandelbrot set",
        x: -0.5, y: 0, zoom: 1,
    },
    {
        name: "Seahorse Valley",
        description: "Intricate spiral patterns between the main cardioid and period-2 bulb",
        x: -0.7463, y: 0.1102, zoom: 200,
    },
    {
        name: "Elephant Valley",
        description: "Elephant-trunk shaped formations",
        x: 0.2815, y: 0.0085, zoom: 150,
    },
    {
        name: "Double Spiral",
        description: "A mesmerizing double spiral formation",
        x: -0.0452407411, y: 0.9868162204352258, zoom: 2000,
    },
    {
        name: "Lightning",
        description: "Fractal lightning bolt patterns",
        x: -1.315180982097868, y: 0.073481649996795, zoom: 50000,
    },
    {
        name: "Starfish",
        description: "Star-shaped formations deep in the set",
        x: -0.3558404221, y: 0.6428140572, zoom: 5000,
    },
    {
        name: "Spiral Galaxy",
        description: "Spiraling galaxy-like structure",
        x: -0.7436439, y: 0.1318259, zoom: 50000,
    },
    {
        name: "Mini Mandelbrot",
        description: "A miniature copy of the entire set",
        x: -1.7497591451303665, y: 0.0000000388, zoom: 300000,
    },
    {
        name: "Tendrils",
        description: "Delicate tendril formations at the boundary",
        x: -0.10109636384562, y: 0.9562865108091415, zoom: 20000,
    },
    {
        name: "Quad Spiral",
        description: "Four interleaving spirals",
        x: 0.27322626, y: 0.595153338, zoom: 60000,
    },
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
    wasmModule: null,
    renderPending: false,
    lastRenderTime: 0,
};

// ===== DOM Refs =====
const canvas = document.getElementById("fractal-canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: false });
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas.getContext("2d");
const loadingOverlay = document.getElementById("loading-overlay");
const hudCoords = document.getElementById("hud-coords");
const hudZoom = document.getElementById("hud-zoom");
const hudIter = document.getElementById("hud-iter");

// Controls
const controlsToggle = document.getElementById("controls-toggle");
const controlsPanel = document.getElementById("controls-panel");
const controlsClose = document.getElementById("controls-close");
const poiList = document.getElementById("poi-list");
const inputReal = document.getElementById("input-real");
const inputImag = document.getElementById("input-imag");
const inputZoom = document.getElementById("input-zoom");
const btnGoto = document.getElementById("btn-goto");

// Sliders
const sliderZoomSpeed = document.getElementById("slider-zoom-speed");
const sliderPanSpeed = document.getElementById("slider-pan-speed");
const sliderIterations = document.getElementById("slider-iterations");
const sliderResolution = document.getElementById("slider-resolution");
const zoomSpeedVal = document.getElementById("zoom-speed-val");
const panSpeedVal = document.getElementById("pan-speed-val");
const iterVal = document.getElementById("iter-val");
const resVal = document.getElementById("res-val");

// ===== WASM Initialization =====
async function initWasm() {
    try {
        const wasm = await import("/wasm/mandelbrot_wasm.js");
        await wasm.default();
        state.wasmModule = wasm;
        return true;
    } catch (err) {
        console.error("Failed to load WASM module:", err);
        return false;
    }
}

// ===== Rendering =====
let renderWidth = 0;
let renderHeight = 0;

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

function render() {
    if (!state.wasmModule || state.renderPending) return;
    state.renderPending = true;

    requestAnimationFrame(() => {
        const t0 = performance.now();
        const pixels = state.wasmModule.render(
            renderWidth,
            renderHeight,
            state.centerX,
            state.centerY,
            state.zoom,
            state.maxIter
        );

        const imageData = new ImageData(
            new Uint8ClampedArray(pixels),
            renderWidth,
            renderHeight
        );
        ctx.putImageData(imageData, 0, 0);
        state.lastRenderTime = performance.now() - t0;

        updateHUD();
        state.renderPending = false;
    });
}

// Debounced render for resize events
let resizeTimer = null;
function onResize() {
    resizeCanvas();
    render();
    // High-quality re-render after resize settles
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        resizeCanvas();
        render();
    }, 150);
}

// ===== Minimap =====
let minimapImageData = null;

function renderMinimap() {
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;

    if (!minimapImageData) {
        // Render minimap once at startup
        const pixels = state.wasmModule.render(mw, mh, -0.5, 0, 1, 200);
        minimapImageData = new ImageData(new Uint8ClampedArray(pixels), mw, mh);
    }

    minimapCtx.putImageData(minimapImageData, 0, 0);

    // Draw viewport indicator
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
    renderMinimap();
}

function formatZoom(z) {
    if (z >= 1e12) return z.toExponential(2);
    if (z >= 1e6) return (z / 1e6).toFixed(1) + "M";
    if (z >= 1e3) return (z / 1e3).toFixed(1) + "K";
    return z.toFixed(1);
}

// ===== Mouse / Touch Interaction =====
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragCenterX = 0;
let dragCenterY = 0;

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
    render();
});

canvas.addEventListener("pointerup", (e) => {
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "crosshair";
});

canvas.addEventListener("pointercancel", (e) => {
    isDragging = false;
    canvas.style.cursor = "crosshair";
});

// ===== Scroll Zoom =====
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (state.animating) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert mouse position to fractal coordinates
    const aspect = rect.width / rect.height;
    const viewHeight = 3.0 / state.zoom;
    const viewWidth = viewHeight * aspect;
    const fracX = state.centerX + (mouseX / rect.width - 0.5) * viewWidth;
    const fracY = state.centerY + (mouseY / rect.height - 0.5) * viewHeight;

    // Progressive zoom factor
    const zoomFactor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    const newZoom = state.zoom * zoomFactor;

    // Zoom toward cursor
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
    render();
}, { passive: false });

// ===== Pinch Zoom =====
let lastPinchDist = 0;
let pinchCenter = { x: 0, y: 0 };
const activePointers = new Map();

canvas.addEventListener("pointerdown", (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});

canvas.addEventListener("pointermove", (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
        const [p1, p2] = [...activePointers.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;

        if (lastPinchDist > 0) {
            const scale = dist / lastPinchDist;
            state.zoom *= scale;
            state.zoom = Math.max(0.1, state.zoom);
            adaptIterations();
            render();
        }

        lastPinchDist = dist;
        pinchCenter = { x: cx, y: cy };
        isDragging = false; // Cancel drag during pinch
    }
});

function onPointerEnd(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
        lastPinchDist = 0;
    }
}
canvas.addEventListener("pointerup", onPointerEnd);
canvas.addEventListener("pointercancel", onPointerEnd);

// ===== Keyboard Controls =====
document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (state.animating) return;

    const panAmount = 0.1 / state.zoom * 3.0;

    switch (e.key) {
        case "ArrowLeft":
        case "a":
            state.centerX -= panAmount;
            render();
            break;
        case "ArrowRight":
        case "d":
            state.centerX += panAmount;
            render();
            break;
        case "ArrowUp":
        case "w":
            state.centerY -= panAmount;
            render();
            break;
        case "ArrowDown":
        case "s":
            if (!e.ctrlKey && !e.metaKey) {
                state.centerY += panAmount;
                render();
            }
            break;
        case "+":
        case "=":
            state.zoom *= 1.5;
            adaptIterations();
            render();
            break;
        case "-":
            state.zoom = Math.max(0.1, state.zoom / 1.5);
            adaptIterations();
            render();
            break;
        case "r":
        case "R":
            animateTo(-0.5, 0, 1);
            break;
        case "f":
        case "F":
            toggleFullscreen();
            break;
    }

    // 'S' for settings toggle — only if not 's' for pan down
    if ((e.key === "S") && !e.shiftKey === false) {
        toggleControls();
    }
});

// ===== Adaptive Iterations =====
function adaptIterations() {
    // Auto-scale iterations with zoom depth for better detail
    const autoIter = Math.min(2000, Math.max(100, Math.round(200 + 50 * Math.log2(state.zoom + 1))));
    if (sliderIterations.dataset.manual !== "true") {
        state.maxIter = autoIter;
        sliderIterations.value = autoIter;
        iterVal.textContent = autoIter;
    }
}

// ===== Animation Engine =====
// Smooth animated transitions: zoom out → pan → zoom in
function animateTo(targetX, targetY, targetZoom) {
    if (state.animating) return;
    state.animating = true;
    document.body.classList.add("animating");

    const startX = state.centerX;
    const startY = state.centerY;
    const startZoom = state.zoom;

    // Phase 1: Zoom out to "overview" level
    // Phase 2: Pan to target
    // Phase 3: Zoom in to target

    const overviewZoom = Math.min(startZoom, targetZoom, 1); // Go to at least overview

    const totalPhases = 3;
    const zoomOutDuration = 1200 / state.zoomSpeed;
    const panDuration = 1000 / state.panSpeed;
    const zoomInDuration = 1500 / state.zoomSpeed;

    let startTime = null;
    let phase = 0;

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function easeOutExpo(t) {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function lerpZoom(from, to, t) {
        // Logarithmic interpolation for smooth zoom
        const logFrom = Math.log(from);
        const logTo = Math.log(to);
        return Math.exp(logFrom + (logTo - logFrom) * t);
    }

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;

        if (phase === 0) {
            // Phase 1: Zoom out
            const t = Math.min(1, elapsed / zoomOutDuration);
            const et = easeInOutCubic(t);
            state.zoom = lerpZoom(startZoom, overviewZoom, et);
            // Slightly drift toward target during zoom out
            state.centerX = startX + (targetX - startX) * et * 0.2;
            state.centerY = startY + (targetY - startY) * et * 0.2;
            adaptIterations();
            render();

            if (t >= 1) {
                phase = 1;
                startTime = timestamp;
            }
        } else if (phase === 1) {
            // Phase 2: Pan to target
            const panStartX = state.centerX;
            const panStartY = state.centerY;
            const t = Math.min(1, elapsed / panDuration);
            const et = easeInOutCubic(t);
            state.centerX = panStartX + (targetX - panStartX) * et;
            state.centerY = panStartY + (targetY - panStartY) * et;
            render();

            if (t >= 1) {
                state.centerX = targetX;
                state.centerY = targetY;
                phase = 2;
                startTime = timestamp;
            }
        } else if (phase === 2) {
            // Phase 3: Zoom in
            const t = Math.min(1, elapsed / zoomInDuration);
            const et = easeOutExpo(t);
            state.zoom = lerpZoom(overviewZoom, targetZoom, et);
            adaptIterations();
            render();

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
function toggleControls() {
    controlsPanel.classList.toggle("hidden");
}

controlsToggle.addEventListener("click", toggleControls);
controlsClose.addEventListener("click", () => controlsPanel.classList.add("hidden"));

// Close panel on outside click (mobile)
canvas.addEventListener("pointerdown", () => {
    if (!controlsPanel.classList.contains("hidden")) {
        controlsPanel.classList.add("hidden");
    }
});

// POI buttons
function buildPOI() {
    poiList.innerHTML = "";
    for (const poi of PLACES_OF_INTEREST) {
        const btn = document.createElement("button");
        btn.className = "poi-btn";
        btn.innerHTML = `
            <span class="poi-name">${poi.name}</span>
            <span class="poi-coords">${poi.x}, ${poi.y}i — zoom ${formatZoom(poi.zoom)}</span>
        `;
        btn.title = poi.description;
        btn.addEventListener("click", () => {
            controlsPanel.classList.add("hidden");
            animateTo(poi.x, poi.y, poi.zoom);
        });
        poiList.appendChild(btn);
    }
}

// Go to coordinates
btnGoto.addEventListener("click", () => {
    const x = parseFloat(inputReal.value);
    const y = parseFloat(inputImag.value);
    const z = parseFloat(inputZoom.value);
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
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}

// ===== Service Worker Registration =====
async function registerSW() {
    if ("serviceWorker" in navigator) {
        try {
            await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        } catch (err) {
            console.warn("SW registration failed:", err);
        }
    }
}

// ===== Boot =====
async function boot() {
    resizeCanvas();
    window.addEventListener("resize", onResize);

    const ok = await initWasm();
    if (!ok) {
        loadingOverlay.querySelector("p").textContent = "Failed to load WASM module. Please refresh.";
        return;
    }

    buildPOI();
    render();
    renderMinimap();

    // Fade out loading
    loadingOverlay.classList.add("fade-out");
    setTimeout(() => loadingOverlay.remove(), 600);

    registerSW();
}

boot();
