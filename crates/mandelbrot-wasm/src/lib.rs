use wasm_bindgen::prelude::*;

/// Color palette entry (r, g, b)
const PALETTE_SIZE: usize = 256;

/// Precomputed color palette for smooth coloring.
static mut PALETTE: [(u8, u8, u8); PALETTE_SIZE] = [(0, 0, 0); PALETTE_SIZE];
static mut PALETTE_INITIALIZED: bool = false;

fn init_palette() {
    unsafe {
        if PALETTE_INITIALIZED {
            return;
        }
        for i in 0..PALETTE_SIZE {
            let t = i as f64 / PALETTE_SIZE as f64;
            // Ultra Fractal-inspired coloring
            let r = (9.0 * (1.0 - t) * t * t * t * 255.0) as u8;
            let g = (15.0 * (1.0 - t) * (1.0 - t) * t * t * 255.0) as u8;
            let b = (8.5 * (1.0 - t) * (1.0 - t) * (1.0 - t) * t * 255.0) as u8;
            PALETTE[i] = (r, g, b);
        }
        PALETTE_INITIALIZED = true;
    }
}

/// Compute escape iteration for a single point using optimized algorithm.
#[inline(always)]
fn mandelbrot_escape(cr: f64, ci: f64, max_iter: u32) -> f64 {
    let mut zr = 0.0_f64;
    let mut zi = 0.0_f64;
    let mut zr2 = 0.0_f64;
    let mut zi2 = 0.0_f64;

    // Cardioid check
    let q = (cr - 0.25) * (cr - 0.25) + ci * ci;
    if q * (q + (cr - 0.25)) <= 0.25 * ci * ci {
        return max_iter as f64;
    }

    // Period-2 bulb check
    if (cr + 1.0) * (cr + 1.0) + ci * ci <= 0.0625 {
        return max_iter as f64;
    }

    let mut i: u32 = 0;
    while i < max_iter && zr2 + zi2 <= 4.0 {
        zi = 2.0 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
        zr2 = zr * zr;
        zi2 = zi * zi;
        i += 1;
    }

    if i == max_iter {
        return max_iter as f64;
    }

    // Smooth coloring using logarithmic escape
    let log_zn = (zr2 + zi2).ln() / 2.0;
    let nu = (log_zn / std::f64::consts::LN_2).ln() / std::f64::consts::LN_2;
    i as f64 + 1.0 - nu
}

/// Render a region of the Mandelbrot set into an RGBA pixel buffer.
///
/// Returns a Vec<u8> of length width * height * 4 (RGBA).
#[wasm_bindgen]
pub fn render(
    width: u32,
    height: u32,
    center_x: f64,
    center_y: f64,
    zoom: f64,
    max_iter: u32,
) -> Vec<u8> {
    init_palette();

    let w = width as usize;
    let h = height as usize;
    let mut pixels = vec![0u8; w * h * 4];

    let aspect = w as f64 / h as f64;
    let view_height = 3.0 / zoom;
    let view_width = view_height * aspect;

    let x_min = center_x - view_width / 2.0;
    let y_min = center_y - view_height / 2.0;

    let x_step = view_width / w as f64;
    let y_step = view_height / h as f64;

    for py in 0..h {
        let ci = y_min + py as f64 * y_step;
        let row_offset = py * w * 4;
        for px in 0..w {
            let cr = x_min + px as f64 * x_step;
            let iter = mandelbrot_escape(cr, ci, max_iter);
            let offset = row_offset + px * 4;

            if iter >= max_iter as f64 {
                // Inside the set: black
                pixels[offset] = 0;
                pixels[offset + 1] = 0;
                pixels[offset + 2] = 0;
                pixels[offset + 3] = 255;
            } else {
                // Smooth color interpolation
                let idx = iter % PALETTE_SIZE as f64;
                let idx_floor = idx.floor() as usize % PALETTE_SIZE;
                let idx_ceil = (idx_floor + 1) % PALETTE_SIZE;
                let frac = idx - idx.floor();

                unsafe {
                    let (r1, g1, b1) = PALETTE[idx_floor];
                    let (r2, g2, b2) = PALETTE[idx_ceil];
                    pixels[offset] = (r1 as f64 * (1.0 - frac) + r2 as f64 * frac) as u8;
                    pixels[offset + 1] = (g1 as f64 * (1.0 - frac) + g2 as f64 * frac) as u8;
                    pixels[offset + 2] = (b1 as f64 * (1.0 - frac) + b2 as f64 * frac) as u8;
                    pixels[offset + 3] = 255;
                }
            }
        }
    }

    pixels
}

/// Get the iteration count for a specific coordinate (for info display).
#[wasm_bindgen]
pub fn get_iteration(cr: f64, ci: f64, max_iter: u32) -> f64 {
    mandelbrot_escape(cr, ci, max_iter)
}
