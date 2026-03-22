// Mandelbrot computation worker
// Optimizations: cardioid/bulb rejection, periodicity detection, smooth coloring, Uint32 packing

const P = new Uint8Array(768);
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
const BLACK = 0xFF000000;

self.onmessage = function(e) {
    const d = e.data;
    const w = d.w, h = d.h, xMin = d.xMin, yMin = d.yMin;
    const dx = d.dx, dy = d.dy, maxIter = d.maxIter;

    const buf = new ArrayBuffer(w * h << 2);
    const px = new Uint32Array(buf);
    const t0 = performance.now();

    for (let py = 0; py < h; py++) {
        const ci = yMin + py * dy;
        const ci2 = ci * ci;
        const off = py * w;

        for (let pxx = 0; pxx < w; pxx++) {
            const cr = xMin + pxx * dx;

            // Cardioid
            const cr25 = cr - 0.25;
            const q = cr25 * cr25 + ci2;
            if (q * (q + cr25) <= 0.25 * ci2) { px[off + pxx] = BLACK; continue; }

            // Period-2 bulb
            const cr1 = cr + 1.0;
            if (cr1 * cr1 + ci2 <= 0.0625) { px[off + pxx] = BLACK; continue; }

            let zr = 0.0, zi = 0.0, zr2 = 0.0, zi2 = 0.0;
            let iter = 0;
            // Periodicity detection
            let pzr = 0.0, pzi = 0.0, pCnt = 0, pPer = 8;

            while (iter < maxIter) {
                zi = 2.0 * zr * zi + ci;
                zr = zr2 - zi2 + cr;
                zr2 = zr * zr;
                zi2 = zi * zi;
                iter++;

                if (zr2 + zi2 > 4.0) break;

                // Periodicity: if orbit returns to saved point, it's interior
                if (zr === pzr && zi === pzi) { iter = maxIter; break; }
                if (++pCnt >= pPer) {
                    pzr = zr; pzi = zi; pCnt = 0;
                    pPer = pPer < 512 ? pPer << 1 : 512; // adaptive period growth
                }
            }

            if (iter >= maxIter) {
                px[off + pxx] = BLACK;
            } else {
                const lzn = Math.log(zr2 + zi2) * 0.5;
                const nu = Math.log(lzn / LN2) / LN2;
                const s = (iter + 1 - nu) * 4.0;
                const si = s | 0;
                const i1 = (si & 255) * 3;
                const i2 = ((si + 1) & 255) * 3;
                const f = s - si;
                const g = 1.0 - f;
                const r = P[i1]   * g + P[i2]   * f | 0;
                const gn= P[i1+1] * g + P[i2+1] * f | 0;
                const b = P[i1+2] * g + P[i2+2] * f | 0;
                // ABGR for little-endian Uint32
                px[off + pxx] = 0xFF000000 | (b << 16) | (gn << 8) | r;
            }
        }
    }

    self.postMessage({
        id: d.id, buf, ms: performance.now() - t0,
        w, h, y: d.y
    }, [buf]);
};
