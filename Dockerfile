# === Stage 1: Build WASM ===
FROM rust:1.83-bookworm AS wasm-builder

RUN cargo install wasm-pack
RUN rustup target add wasm32-unknown-unknown

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY crates/mandelbrot-wasm ./crates/mandelbrot-wasm
# Create a dummy server crate so workspace resolves
RUN mkdir -p crates/server/src && echo "fn main() {}" > crates/server/src/main.rs
COPY crates/server/Cargo.toml crates/server/Cargo.toml

RUN wasm-pack build crates/mandelbrot-wasm \
    --target web \
    --out-dir /build/wasm-out \
    --release \
    --no-typescript

# === Stage 2: Build Server ===
FROM rust:1.83-bookworm AS server-builder

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY crates ./crates

RUN cargo build --release -p mandelbrot-server

# === Stage 3: Production Image ===
FROM debian:bookworm-slim AS production

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -r -s /bin/false appuser

WORKDIR /app

# Copy server binary
COPY --from=server-builder /build/target/release/mandelbrot-server /app/server

# Assemble frontend
COPY frontend/index.html /app/frontend/dist/
COPY frontend/manifest.json /app/frontend/dist/
COPY frontend/sw.js /app/frontend/dist/
COPY frontend/static/ /app/frontend/dist/static/
COPY frontend/icons/ /app/frontend/dist/icons/
COPY --from=wasm-builder /build/wasm-out/ /app/frontend/dist/wasm/

# Clean up wasm-pack artifacts
RUN rm -f /app/frontend/dist/wasm/package.json \
          /app/frontend/dist/wasm/.gitignore \
          /app/frontend/dist/wasm/README.md

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

ENV MANDELBROT_HOST=0.0.0.0
ENV MANDELBROT_PORT=8080
ENV MANDELBROT_STATIC_DIR=/app/frontend/dist
ENV RUST_LOG=info

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["/app/server"]
