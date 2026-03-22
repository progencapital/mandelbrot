'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Mandelbrot Explorer — WebGL2 GPU-accelerated rendering
//  Every pixel computed in parallel on the GPU every frame at 60fps.
//  No workers, no buffers, no swaps — just uniform updates + drawArrays.
// ═══════════════════════════════════════════════════════════════════════

// ── POINTS OF INTEREST ─────────────────────────────────────────────────
const POI = [
    // Classic Regions
    { cat:'Classic',  name:'Seahorse Valley',  x:-0.7436438870371587, y:0.1318259042053119,  z:200,    depth:'200×'   },
    { cat:'Classic',  name:'Elephant Valley',  x:0.30820836,          y:0.01990000,           z:150,    depth:'150×'   },
    { cat:'Classic',  name:'Triple Spiral',    x:-0.158586639,        y:1.033900685,          z:250,    depth:'250×'   },
    { cat:'Classic',  name:'West Spike',       x:-1.99985,            y:0.0,                  z:2000,   depth:'2e3×'   },
    // Deep Spirals
    { cat:'Deep Spirals', name:'Nautilus',       x:-0.74364388703, y:0.13182590421, z:8000,  depth:'8e3×'   },
    { cat:'Deep Spirals', name:'Double Whorl',   x:-0.74529938,    y:0.11300000,    z:3000,  depth:'3e3×'   },
    { cat:'Deep Spirals', name:'Fibonacci Arms', x:-0.7017681,     y:0.3839830,     z:2000,  depth:'2e3×'   },
    { cat:'Deep Spirals', name:'Spiral Nebula',  x:-0.7453,        y:0.1130,        z:700,   depth:'700×'   },
    // Mini Mandelbrots
    { cat:'Mini Brots', name:'Infant Brot',    x:-1.7549651,    y:0.0,          z:800,   depth:'800×'   },
    { cat:'Mini Brots', name:'Embedded Brot',  x:-0.17476619,   y:1.06554016,   z:3000,  depth:'3e3×'   },
    { cat:'Mini Brots', name:'Distant Clone',  x:-1.62917,      y:-0.0203968,   z:1000,  depth:'1e3×'   },
    // Tendrils
    { cat:'Tendrils', name:'Neural Web',   x:-0.56062,  y:-0.64228, z:500,   depth:'500×'   },
    { cat:'Tendrils', name:'Dendrite',     x:0.0,       y:1.0,      z:300,   depth:'300×'   },
    { cat:'Tendrils', name:'Feather Edge', x:0.42884,   y:-0.23116, z:300,   depth:'300×'   },
    { cat:'Tendrils', name:'Lightning',    x:-0.503397, y:0.563199, z:600,   depth:'600×'   },
    // Extra deep
    { cat:'Deep Zoom', name:'Double Spiral',   x:-0.0452407411, y:0.9868162204352258, z:2000,  depth:'2e3×'   },
    { cat:'Deep Zoom', name:'Starfish',        x:-0.3558404221, y:0.6428140572,       z:5000,  depth:'5e3×'   },
    { cat:'Deep Zoom', name:'Spiral Galaxy',   x:-0.7436439,    y:0.1318259,          z:50000, depth:'5e4×'   },
    { cat:'Deep Zoom', name:'Mini Mandelbrot', x:-1.7497591451303665, y:0.0000000388,  z:300000, depth:'3e5×' },
    { cat:'Deep Zoom', name:'Quad Spiral',     x:0.27322626,    y:0.595153338,        z:60000, depth:'6e4×'   },
];

// ── WEBGL2 SETUP ───────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    desynchronized: true,
});

if (!gl) {
    document.body.innerHTML = '<p style="color:#ff3d6e;padding:40px;font-family:monospace">WebGL2 not available — your browser does not support GPU-accelerated rendering.</p>';
    throw new Error('WebGL2 not available');
}

const DPR = Math.min(window.devicePixelRatio || 1, 2);
let rW = 0, rH = 0;

function resize() {
    const w = Math.floor(window.innerWidth  * DPR);
    const h = Math.floor(window.innerHeight * DPR);
    if (w === rW && h === rH) return;
    canvas.width = rW = w;
    canvas.height = rH = h;
    gl.viewport(0, 0, rW, rH);
}
window.addEventListener('resize', resize, { passive: true });

// ── Vertex shader ───────────────────────────────────────────────────
const VERT = `#version 300 es
precision highp float;
in  vec2 pos;
out vec2 uv;
void main() { gl_Position = vec4(pos,0,1); uv = pos; }`;

// ── Fragment shader — 4x unrolled loop, smooth escape ───────────────
const FRAG = `#version 300 es
precision highp float;
in  vec2  uv;
out vec4  o;

uniform vec2  center;
uniform float zoom;
uniform float maxIter;
uniform vec2  res;

vec3 pal(float t) {
  return clamp(
    vec3(0.5,0.5,0.5)
    + vec3(0.5,0.5,0.5) * cos(6.28318*(vec3(1.0,1.0,0.8)*t + vec3(0.0,0.2,0.55))),
    0.0, 1.0);
}

void main() {
  float ar = res.x / res.y;
  float cr = center.x + uv.x * ar / zoom;
  float ci = center.y + uv.y        / zoom;

  float zr=0., zi=0., zr2=0., zi2=0.;
  float n = 0.;
  float lim = maxIter - 4.;

  for (int i = 0; i < 512; i++) {
    if (n >= lim || zr2+zi2 > 256.) break;
    zi=2.*zr*zi+ci; zr=zr2-zi2+cr; n+=1.; zr2=zr*zr; zi2=zi*zi; if(zr2+zi2>256.) break;
    zi=2.*zr*zi+ci; zr=zr2-zi2+cr; n+=1.; zr2=zr*zr; zi2=zi*zi; if(zr2+zi2>256.) break;
    zi=2.*zr*zi+ci; zr=zr2-zi2+cr; n+=1.; zr2=zr*zr; zi2=zi*zi; if(zr2+zi2>256.) break;
    zi=2.*zr*zi+ci; zr=zr2-zi2+cr; n+=1.; zr2=zr*zr; zi2=zi*zi;
  }

  if (n >= maxIter) {
    o = vec4(0,0,0,1);
  } else {
    float t = (n + 2. - log2(log2(zr2+zi2)*0.5)) / maxIter;
    o = vec4(pal(t * 2.8 + 0.1), 1.0);
  }
}`;

function mkShader(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(s));
    return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, mkShader(VERT, gl.VERTEX_SHADER));
gl.attachShader(prog, mkShader(FRAG, gl.FRAGMENT_SHADER));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    console.error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const vbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
const pLoc = gl.getAttribLocation(prog, 'pos');
gl.enableVertexAttribArray(pLoc);
gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

const uCenter = gl.getUniformLocation(prog, 'center');
const uZoom   = gl.getUniformLocation(prog, 'zoom');
const uIter   = gl.getUniformLocation(prog, 'maxIter');
const uRes    = gl.getUniformLocation(prog, 'res');

// ── STATE ──────────────────────────────────────────────────────────────
let cx = -0.5, cy = 0.0, zoom = 0.42;
let maxIter = 256;
let autoZoom = false;
let animating = false;

// ── EASING ─────────────────────────────────────────────────────────────
const ss  = t => t*t*t*(t*(t*6-15)+10);  // smootherstep (Perlin quintic)
const ei3 = t => t*t*t;                   // ease-in cubic

// ── CINEMATIC NAVIGATION ───────────────────────────────────────────────
const OV = 0.42;  // overview zoom — full set visible

function zoomToPoint(tx, ty, tz, dur = 9.0) {
    if (animating) return;
    animating = true;
    setInteractive(false);

    const x0 = cx, y0 = cy, z0 = zoom;

    const nearOV = z0 <= OV * 1.5;
    const P1 = nearOV ? 0.03 : 0.25;
    const P2 = nearOV ? 0.60 : 0.68;

    const t0 = performance.now();
    const durMs = dur * 1000;

    function frame(now) {
        const p = Math.min((now - t0) / durMs, 1);

        if (p <= P1) {
            const pp = ss(p / P1);
            zoom = Math.exp(Math.log(z0) * (1-pp) + Math.log(OV) * pp);
            cx = x0; cy = y0;
        } else if (p <= P2) {
            const pp = ss((p - P1) / (P2 - P1));
            zoom = OV;
            cx = x0 + (tx - x0) * pp;
            cy = y0 + (ty - y0) * pp;
        } else {
            const pp = ei3((p - P2) / (1 - P2));
            cx = tx; cy = ty;
            zoom = Math.exp(Math.log(OV) * (1-pp) + Math.log(tz) * pp);
        }

        if (p < 1) {
            requestAnimationFrame(frame);
        } else {
            cx = tx; cy = ty; zoom = tz;
            animating = false;
            setInteractive(true);
            updateCoordInputs();
        }
    }

    requestAnimationFrame(frame);
}

// ── INPUT — Mouse wheel zoom ───────────────────────────────────────────
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (animating) return;
    const rect = canvas.getBoundingClientRect();
    const uvx =  (e.clientX - rect.left) / rect.width  * 2 - 1;
    const uvy = -((e.clientY - rect.top)  / rect.height * 2 - 1);
    const ar = rect.width / rect.height;
    const wx = cx + uvx * ar / zoom;
    const wy = cy + uvy       / zoom;
    const f  = e.deltaY < 0 ? 1.14 : 0.877;
    zoom = Math.max(0.15, Math.min(zoom * f, 1e13));
    cx = wx - uvx * ar / zoom;
    cy = wy - uvy       / zoom;
}, { passive: false });

// ── Input — Mouse drag pan ─────────────────────────────────────────────
let drag = false, dx = 0, dy = 0;
canvas.addEventListener('mousedown', e => {
    if (animating) return;
    drag = true; dx = e.clientX; dy = e.clientY;
    canvas.classList.add('grabbing');
});
window.addEventListener('mousemove', e => {
    if (!drag) return;
    const W = window.innerWidth, H = window.innerHeight;
    const ar = W / H;
    cx -= (e.clientX - dx) / H * 2 * ar / zoom;
    cy += (e.clientY - dy) / H * 2        / zoom;
    dx = e.clientX; dy = e.clientY;
}, { passive: true });
window.addEventListener('mouseup', () => { drag = false; canvas.classList.remove('grabbing'); });

// ── Input — Touch ──────────────────────────────────────────────────────
const touches = new Map();
let pinchD0 = 0, pinchZ0 = 0;

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) touches.set(t.identifier, {x:t.clientX, y:t.clientY});
    if (e.touches.length === 2) {
        const [a,b] = e.touches;
        pinchD0 = Math.hypot(b.clientX-a.clientX, b.clientY-a.clientY);
        pinchZ0 = zoom;
    }
}, {passive:false});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (animating) return;
    if (e.touches.length === 1) {
        const t = e.touches[0], p = touches.get(t.identifier);
        if (!p) return;
        const W = window.innerWidth, H = window.innerHeight;
        const ar = W / H;
        cx -= (t.clientX - p.x) / H * 2 * ar / zoom;
        cy += (t.clientY - p.y) / H * 2        / zoom;
        touches.set(t.identifier, {x:t.clientX, y:t.clientY});
    } else if (e.touches.length === 2) {
        const [a,b] = e.touches;
        zoom = Math.max(0.15, Math.min(pinchZ0*Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY)/pinchD0, 1e13));
    }
}, {passive:false});

canvas.addEventListener('touchend', e => {
    for (const t of e.changedTouches) touches.delete(t.identifier);
}, {passive:false});

// ── Keyboard ───────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (animating && e.key !== 'Escape') return;

    const p = 0.08 / zoom;
    const ar = window.innerWidth / window.innerHeight;
    switch (e.key) {
        case 'ArrowLeft':  case 'a': cx -= p * ar; break;
        case 'ArrowRight': case 'd': cx += p * ar; break;
        case 'ArrowUp':    case 'w': cy += p; break;
        case 'ArrowDown':
            if (!e.ctrlKey && !e.metaKey) cy -= p;
            break;
        case 's':
            if (!e.ctrlKey && !e.metaKey) cy -= p;
            break;
        case '+': case '=': zoom = Math.min(zoom * 1.5, 1e13); break;
        case '-':            zoom = Math.max(zoom / 1.5, 0.15); break;
        case 'r': case 'R':
            poiPanel.querySelectorAll('.poi-item').forEach(el => el.classList.remove('active'));
            poiLabel.textContent = 'DESTINATIONS';
            zoomToPoint(-0.5, 0, 0.42, 4.5);
            break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'u': case 'U': toggleUI(); break;
        case 'g': case 'G': toggleCoordPanel(); break;
        case 'a': case 'A':
            if (e.key === 'A') {
                autoZoom = !autoZoom;
                autoBtn.classList.toggle('active', autoZoom);
                showToast(autoZoom ? 'AUTO DRIFT ON' : 'AUTO DRIFT OFF');
            }
            break;
        case 'Escape':
            if (animating) { animating = false; setInteractive(true); }
            if (coordPanelEl.classList.contains('open')) coordPanelEl.classList.remove('open');
            if (poiPanel.classList.contains('open')) closeDD();
            break;
    }
});

// ── POI Dropdown ───────────────────────────────────────────────────────
const poiPanel   = document.getElementById('poiPanel');
const poiTrigger = document.getElementById('poiTrigger');
const poiLabel   = document.getElementById('poiLabel');

const cats = [...new Set(POI.map(p => p.cat))];
cats.forEach(cat => {
    const ch = document.createElement('div');
    ch.className = 'poi-cat'; ch.textContent = cat;
    poiPanel.appendChild(ch);
    POI.filter(p => p.cat === cat).forEach(poi => {
        const el = document.createElement('div');
        el.className = 'poi-item'; el.dataset.name = poi.name;
        el.innerHTML = `<span>${poi.name}</span><span class="poi-depth">${poi.depth}</span>`;
        el.addEventListener('click', () => { selectPOI(poi); closeDD(); });
        poiPanel.appendChild(el);
    });
});

const openDD  = () => { poiTrigger.classList.add('open');    poiPanel.classList.add('open');    };
const closeDD = () => { poiTrigger.classList.remove('open'); poiPanel.classList.remove('open'); };

poiTrigger.addEventListener('click', e => {
    e.stopPropagation();
    poiPanel.classList.contains('open') ? closeDD() : openDD();
});
document.addEventListener('click', closeDD);
poiPanel.addEventListener('click', e => e.stopPropagation());

function selectPOI(poi) {
    if (animating) return;
    poiPanel.querySelectorAll('.poi-item').forEach(el => {
        el.classList.toggle('active', el.dataset.name === poi.name);
    });
    poiLabel.textContent = poi.name;
    showToast(poi.name);
    zoomToPoint(poi.x, poi.y, poi.z);
}

// ── UI Controls ────────────────────────────────────────────────────────
const autoBtn = document.getElementById('autoBtn');

document.getElementById('resetBtn').addEventListener('click', () => {
    poiPanel.querySelectorAll('.poi-item').forEach(el => el.classList.remove('active'));
    poiLabel.textContent = 'DESTINATIONS';
    zoomToPoint(-0.5, 0, 0.42, 4.5);
});

autoBtn.addEventListener('click', () => {
    autoZoom = !autoZoom;
    autoBtn.classList.toggle('active', autoZoom);
    showToast(autoZoom ? 'AUTO DRIFT ON' : 'AUTO DRIFT OFF');
});

document.getElementById('fsBtn').addEventListener('click', toggleFullscreen);

const iterSlider = document.getElementById('iterSlider');
const iterVal    = document.getElementById('iterVal');
iterSlider.addEventListener('input', e => {
    maxIter = +e.target.value;
    iterVal.textContent = maxIter;
    document.getElementById('stIter').textContent = maxIter;
});

// ── Coordinate Panel ───────────────────────────────────────────────────
const coordPanelEl = document.getElementById('coordPanel');
const coordBtn     = document.getElementById('coordBtn');

function toggleCoordPanel() {
    coordPanelEl.classList.toggle('open');
    if (coordPanelEl.classList.contains('open')) updateCoordInputs();
}

coordBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleCoordPanel();
});
document.addEventListener('click', e => {
    if (!coordPanelEl.contains(e.target) && e.target !== coordBtn) {
        coordPanelEl.classList.remove('open');
    }
});
coordPanelEl.addEventListener('click', e => e.stopPropagation());

function updateCoordInputs() {
    document.getElementById('inRe').value = cx.toFixed(10);
    document.getElementById('inIm').value = cy.toFixed(10);
    document.getElementById('inZ').value = zoom.toFixed(4);
}

document.getElementById('btnGo').addEventListener('click', () => {
    const x = parseFloat(document.getElementById('inRe').value);
    const y = parseFloat(document.getElementById('inIm').value);
    const z = parseFloat(document.getElementById('inZ').value);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;
    coordPanelEl.classList.remove('open');
    showToast(`(${x.toFixed(4)}, ${y.toFixed(4)})`);
    zoomToPoint(x, y, Math.max(0.15, z));
});

// ── UI Toggle ──────────────────────────────────────────────────────────
const header   = document.getElementById('header');
const footer   = document.getElementById('footer');
const uiToggle = document.getElementById('uiToggle');
let uiOn = true;

function toggleUI() {
    uiOn = !uiOn;
    header.classList.toggle('hidden', !uiOn);
    footer.classList.toggle('hidden', !uiOn);
    uiToggle.classList.toggle('ui-hidden', !uiOn);
    if (!uiOn) coordPanelEl.classList.remove('open');
}
uiToggle.addEventListener('click', toggleUI);

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
}

function setInteractive(on) {
    document.querySelectorAll('.ibtn,.poi-trigger,.poi-item').forEach(el => {
        el.style.opacity = on ? '' : '0.35';
        el.style.pointerEvents = on ? '' : 'none';
    });
    canvas.style.pointerEvents = on ? '' : 'none';
}

let toastTimer;
const toastEl = document.getElementById('toast');
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

// ── RENDER LOOP ────────────────────────────────────────────────────────
const stX    = document.getElementById('stX');
const stY    = document.getElementById('stY');
const stZ    = document.getElementById('stZ');
const stIter = document.getElementById('stIter');
let lastStat = 0;

function render(ts) {
    requestAnimationFrame(render);

    if (autoZoom && !animating) zoom *= 1.0012;

    gl.uniform2f(uCenter, cx, cy);
    gl.uniform1f(uZoom,   zoom);
    gl.uniform1f(uIter,   maxIter);
    gl.uniform2f(uRes,    rW, rH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // DOM updates throttled to ~8fps
    if (ts - lastStat > 120) {
        stX.textContent = cx.toFixed(8);
        stY.textContent = cy.toFixed(8);
        stZ.textContent = zoom < 1e6
            ? zoom.toFixed(zoom < 10 ? 2 : 0) + '×'
            : zoom.toExponential(1) + '×';
        stIter.textContent = maxIter;
        lastStat = ts;
    }
}

// ── PWA ────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

// ── INIT ───────────────────────────────────────────────────────────────
resize();

const ldBar = document.getElementById('ldBar');
let lp = 0;
const lInt = setInterval(() => {
    lp = Math.min(lp + Math.random()*22, 93);
    ldBar.style.width = lp + '%';
}, 55);
setTimeout(() => {
    clearInterval(lInt); ldBar.style.width = '100%';
    setTimeout(() => {
        document.getElementById('loading').classList.add('done');
        render(0);
    }, 260);
}, 500);
