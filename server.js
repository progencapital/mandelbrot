const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = parseInt(process.env.PORT || "443", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "80", 10);
const CERT_DIR = path.join(__dirname, "certs");
const FRONTEND_DIR = path.join(__dirname, "frontend");

// MIME types
const MIME = {
    ".html": "text/html",
    ".js":   "application/javascript",
    ".css":  "text/css",
    ".json": "application/json",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".ico":  "image/x-icon",
};

// Generate self-signed cert if needed
function ensureCerts() {
    if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
    const certPath = path.join(CERT_DIR, "cert.pem");
    const keyPath = path.join(CERT_DIR, "key.pem");

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.log("Generating self-signed SSL certificate...");
        execSync(
            `openssl req -x509 -nodes -days 365 -newkey rsa:2048 ` +
            `-keyout "${keyPath}" -out "${certPath}" ` +
            `-subj "/C=US/ST=Dev/L=Dev/O=Mandelbrot/CN=localhost" ` +
            `-addext "subjectAltName=DNS:localhost,IP:0.0.0.0"`,
            { stdio: "inherit" }
        );
    }
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
}

// Serve static files
function handleRequest(req, res) {
    let urlPath = req.url.split("?")[0];
    if (urlPath === "/") urlPath = "/index.html";
    if (urlPath === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok\n");
        return;
    }

    const filePath = path.join(FRONTEND_DIR, urlPath);
    const safePath = path.resolve(filePath);
    if (!safePath.startsWith(FRONTEND_DIR)) {
        res.writeHead(403); res.end("Forbidden"); return;
    }

    const ext = path.extname(safePath);
    const contentType = MIME[ext] || "application/octet-stream";

    fs.readFile(safePath, (err, data) => {
        if (err) {
            // SPA fallback
            if (err.code === "ENOENT") {
                fs.readFile(path.join(FRONTEND_DIR, "index.html"), (e2, html) => {
                    if (e2) { res.writeHead(500); res.end("Error"); return; }
                    res.writeHead(200, {
                        "Content-Type": "text/html",
                        "Cache-Control": "no-cache",
                    });
                    res.end(html);
                });
                return;
            }
            res.writeHead(500); res.end("Error"); return;
        }

        const headers = { "Content-Type": contentType };

        // Cache static assets, not service worker
        if (urlPath === "/sw.js") {
            headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        } else if (ext && ext !== ".html") {
            headers["Cache-Control"] = "public, max-age=604800, immutable";
        }

        // Security headers
        headers["X-Frame-Options"] = "SAMEORIGIN";
        headers["X-Content-Type-Options"] = "nosniff";

        res.writeHead(200, headers);
        res.end(data);
    });
}

// Start
const { cert, key } = ensureCerts();

// HTTPS server
https.createServer({ cert, key }, handleRequest).listen(PORT, "0.0.0.0", () => {
    console.log(`HTTPS server running on https://0.0.0.0:${PORT}`);
});

// HTTP -> HTTPS redirect
http.createServer((req, res) => {
    const host = (req.headers.host || "").replace(/:.*/, "");
    res.writeHead(301, { Location: `https://${host}:${PORT}${req.url}` });
    res.end();
}).listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`HTTP redirect on http://0.0.0.0:${HTTP_PORT} -> HTTPS`);
});
