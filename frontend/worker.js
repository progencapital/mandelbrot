// Mandelbrot Web Worker — computes fractal pixels off the main thread
// Receives render requests, returns pixel buffers via transferable objects

// Precompute palette (256 entries, Ultra Fractal style)
const palette = new Uint8Array(256 * 3);
(function initPalette() {
    const stops = [
        [0.0, 0, 7, 100],
        [0.16, 32, 107, 203],
        [0.42, 237, 255, 255],
        [0.6425, 255, 170, 0],
        [0.8575, 0, 2, 0],
        [1.0, 0, 7, 100],
    ];
    for (let i = 0; i < 256; i++) {
        const t = i / 256;
        let s0 = stops[0], s1 = stops[1];
        for (let j = 0; j < stops.length - 1; j++) {
            if (t >= stops[j][0] && t <= stops[j + 1][0]) {
                s0 = stops[j];
                s1 = stops[j + 1];
                break;
            }
        }
        const f = (t - s0[0]) / (s1[0] - s0[0]);
        palette[i * 3] = Math.round(s0[1] + (s1[1] - s0[1]) * f);
        palette[i * 3 + 1] = Math.round(s0[2] + (s1[2] - s0[2]) * f);
        palette[i * 3 + 2] = Math.round(s0[3] + (s1[3] - s0[3]) * f);
    }
})();

function computeMandelbrot(width, height, centerX, centerY, zoom, maxIter) {
    const buf = new ArrayBuffer(width * height * 4);
    const pixels = new Uint8Array(buf);

    const viewHeight = 3.0 / zoom;
    const viewWidth = viewHeight * (width / height);
    const xMin = centerX - viewWidth * 0.5;
    const yMin = centerY - viewHeight * 0.5;
    const dx = viewWidth / width;
    const dy = viewHeight / height;

    const log2 = Math.log(2);
    const invMaxIter = 1.0 / maxIter;

    for (let py = 0; py < height; py++) {
        const ci = yMin + py * dy;
        const rowOffset = py * width * 4;

        for (let px = 0; px < width; px++) {
            const cr = xMin + px * dx;

            // Cardioid check
            const q = (cr - 0.25) * (cr - 0.25) + ci * ci;
            if (q * (q + (cr - 0.25)) <= 0.25 * ci * ci) {
                const idx = rowOffset + px * 4;
                pixels[idx] = 0;
                pixels[idx + 1] = 0;
                pixels[idx + 2] = 0;
                pixels[idx + 3] = 255;
                continue;
            }

            // Period-2 bulb check
            const cr1 = cr + 1.0;
            if (cr1 * cr1 + ci * ci <= 0.0625) {
                const idx = rowOffset + px * 4;
                pixels[idx] = 0;
                pixels[idx + 1] = 0;
                pixels[idx + 2] = 0;
                pixels[idx + 3] = 255;
                continue;
            }

            let zr = 0, zi = 0;
            let zr2 = 0, zi2 = 0;
            let iter = 0;

            while (zr2 + zi2 <= 4.0 && iter < maxIter) {
                zi = 2.0 * zr * zi + ci;
                zr = zr2 - zi2 + cr;
                zr2 = zr * zr;
                zi2 = zi * zi;
                iter++;
            }

            const idx = rowOffset + px * 4;

            if (iter >= maxIter) {
                pixels[idx] = 0;
                pixels[idx + 1] = 0;
                pixels[idx + 2] = 0;
                pixels[idx + 3] = 255;
            } else {
                // Smooth coloring
                const logZn = Math.log(zr2 + zi2) * 0.5;
                const nu = Math.log(logZn / log2) / log2;
                const smooth = iter + 1 - nu;

                const t = smooth * 4.0;
                const idx1 = ((t | 0) & 255) * 3;
                const idx2 = (((t | 0) + 1) & 255) * 3;
                const frac = t - (t | 0);
                const inv = 1.0 - frac;

                pixels[idx] = (palette[idx1] * inv + palette[idx2] * frac) | 0;
                pixels[idx + 1] = (palette[idx1 + 1] * inv + palette[idx2 + 1] * frac) | 0;
                pixels[idx + 2] = (palette[idx1 + 2] * inv + palette[idx2 + 2] * frac) | 0;
                pixels[idx + 3] = 255;
            }
        }
    }

    return buf;
}

self.onmessage = function(e) {
    const { id, width, height, centerX, centerY, zoom, maxIter } = e.data;
    const t0 = performance.now();
    const buf = computeMandelbrot(width, height, centerX, centerY, zoom, maxIter);
    const elapsed = performance.now() - t0;

    // Transfer buffer (zero-copy)
    self.postMessage({ id, buf, elapsed, width, height }, [buf]);
};
