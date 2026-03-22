// Mandelbrot computation worker
// Optimizations: cardioid/bulb rejection, periodicity detection, smooth coloring

const P = new Uint8Array(768); // 256 * 3 palette
(function() {
    const S = [
        [0.0,   0,   7, 100],
        [0.16, 32, 107, 203],
        [0.42,237, 255, 255],
        [0.6425,255,170,  0],
        [0.8575, 0,   2,  0],
        [1.0,   0,   7, 100],
    ];
    for (let i = 0; i < 256; i++) {
        const t = i / 256;
        let a = S[0], b = S[1];
        for (let j = 0; j < S.length - 1; j++) {
            if (t >= S[j][0] && t <= S[j+1][0]) { a = S[j]; b = S[j+1]; break; }
        }
        const f = (t - a[0]) / (b[0] - a[0]);
        P[i*3]   = a[1] + (b[1]-a[1]) * f + 0.5 | 0;
        P[i*3+1] = a[2] + (b[2]-a[2]) * f + 0.5 | 0;
        P[i*3+2] = a[3] + (b[3]-a[3]) * f + 0.5 | 0;
    }
})();

const LN2 = Math.log(2);

function compute(w, h, xMin, yStart, dx, dy, maxIter) {
    const buf = new ArrayBuffer(w * h << 2);
    const px = new Uint32Array(buf);

    // Periodicity detection period — check every 20 iterations
    const checkPeriod = 20;

    for (let py = 0; py < h; py++) {
        const ci = yStart + py * dy;
        const ci2 = ci * ci;
        const off = py * w;

        for (let pxx = 0; pxx < w; pxx++) {
            const cr = xMin + pxx * dx;

            // --- Cardioid check ---
            const cr25 = cr - 0.25;
            const q = cr25 * cr25 + ci2;
            if (q * (q + cr25) <= 0.25 * ci2) {
                px[off + pxx] = 0xFF000000; // black, opaque
                continue;
            }

            // --- Period-2 bulb ---
            const cr1 = cr + 1.0;
            if (cr1 * cr1 + ci2 <= 0.0625) {
                px[off + pxx] = 0xFF000000;
                continue;
            }

            // --- Escape iteration with periodicity detection ---
            let zr = 0.0, zi = 0.0, zr2 = 0.0, zi2 = 0.0;
            let iter = 0;
            let pzr = 0.0, pzi = 0.0; // period check saved values
            let pCount = 0;

            while (iter < maxIter) {
                zi = 2.0 * zr * zi + ci;
                zr = zr2 - zi2 + cr;
                zr2 = zr * zr;
                zi2 = zi * zi;
                iter++;

                if (zr2 + zi2 > 4.0) break;

                // Periodicity check: if orbit returns to a saved point, it's in the set
                if (zr === pzr && zi === pzi) {
                    iter = maxIter;
                    break;
                }
                pCount++;
                if (pCount >= checkPeriod) {
                    pzr = zr;
                    pzi = zi;
                    pCount = 0;
                }
            }

            if (iter >= maxIter) {
                px[off + pxx] = 0xFF000000;
            } else {
                // Smooth coloring
                const lzn = Math.log(zr2 + zi2) * 0.5;
                const nu = Math.log(lzn / LN2) / LN2;
                const s = (iter + 1 - nu) * 4.0;
                const i1 = ((s | 0) & 255) * 3;
                const i2 = (((s | 0) + 1) & 255) * 3;
                const f = s - (s | 0);
                const g = 1.0 - f;
                const r = P[i1]   * g + P[i2]   * f | 0;
                const gr= P[i1+1] * g + P[i2+1] * f | 0;
                const b = P[i1+2] * g + P[i2+2] * f | 0;
                px[off + pxx] = 0xFF000000 | (b << 16) | (gr << 8) | r;
            }
        }
    }
    return buf;
}

self.onmessage = function(e) {
    const d = e.data;
    const t0 = performance.now();
    const buf = compute(d.w, d.h, d.xMin, d.yMin, d.dx, d.dy, d.maxIter);
    self.postMessage({
        id: d.id,
        buf: buf,
        ms: performance.now() - t0,
        w: d.w,
        h: d.h,
        y: d.y
    }, [buf]);
};
