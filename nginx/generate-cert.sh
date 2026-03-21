#!/bin/sh
# Generate self-signed SSL certificate for development
set -e

SSL_DIR="/etc/nginx/ssl"
mkdir -p "$SSL_DIR"

if [ ! -f "$SSL_DIR/cert.pem" ]; then
    echo "Generating self-signed SSL certificate..."
    openssl req -x509 -nodes -days 365 \
        -newkey rsa:2048 \
        -keyout "$SSL_DIR/key.pem" \
        -out "$SSL_DIR/cert.pem" \
        -subj "/C=US/ST=Dev/L=Dev/O=Mandelbrot/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:0.0.0.0"
    echo "SSL certificate generated."
fi
