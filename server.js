const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = parseInt(process.env.PORT || "443", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "80", 10);
const CERT_DIR = path.join(__dirname, "certs");
const ROOT = path.join(__dirname, "frontend");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".ico":  "image/x-icon",
    ".webmanifest": "application/manifest+json",
};

function ensureCerts() {
    if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
    const c = path.join(CERT_DIR, "cert.pem"), k = path.join(CERT_DIR, "key.pem");
    if (!fs.existsSync(c) || !fs.existsSync(k)) {
        console.log("Generating self-signed SSL certificate...");
        execSync(
            `openssl req -x509 -nodes -days 365 -newkey rsa:2048 ` +
            `-keyout "${k}" -out "${c}" ` +
            `-subj "/C=US/ST=Dev/L=Dev/O=Mandelbrot/CN=localhost" ` +
            `-addext "subjectAltName=DNS:localhost,IP:0.0.0.0"`,
            { stdio: "pipe" }
        );
    }
    return { cert: fs.readFileSync(c), key: fs.readFileSync(k) };
}

function serve(req, res) {
    let p = req.url.split("?")[0];
    if (p === "/") p = "/index.html";
    if (p === "/health") { res.writeHead(200, {"Content-Type":"text/plain"}); res.end("ok\n"); return; }

    const fp = path.join(ROOT, p);
    if (!path.resolve(fp).startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

    fs.readFile(fp, (err, data) => {
        if (err) {
            // SPA fallback
            fs.readFile(path.join(ROOT, "index.html"), (e2, html) => {
                if (e2) { res.writeHead(500); res.end(); return; }
                res.writeHead(200, {"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});
                res.end(html);
            });
            return;
        }
        const ext = path.extname(fp);
        const h = {
            "Content-Type": MIME[ext] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
        };
        if (p === "/sw.js") h["Cache-Control"] = "no-store";
        else if (ext && ext !== ".html") h["Cache-Control"] = "public, max-age=604800, immutable";
        res.writeHead(200, h);
        res.end(data);
    });
}

const { cert, key } = ensureCerts();
https.createServer({ cert, key }, serve).listen(PORT, "0.0.0.0", () =>
    console.log(`HTTPS: https://0.0.0.0:${PORT}`)
);
http.createServer((req, res) => {
    const host = (req.headers.host || "").replace(/:.*/, "");
    res.writeHead(301, { Location: `https://${host}:${PORT}${req.url}` });
    res.end();
}).listen(HTTP_PORT, "0.0.0.0", () =>
    console.log(`HTTP redirect: http://0.0.0.0:${HTTP_PORT} -> HTTPS :${PORT}`)
);
