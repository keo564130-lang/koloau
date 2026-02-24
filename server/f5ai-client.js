const axios = require('axios');

class F5AIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.f5ai.ru/v2';
    }

    async chatCompletion(messages, model = 'gpt-4o', options = {}) {
        try {
            const response = await axios.post(`${this.baseUrl}/chat/completions`, {
                model,
                messages,
                ...options
            }, {
                headers: {
                    'X-Auth-Token': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            });
            return response.data;
        } catch (error) {
            console.error('F5AI API Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = F5AIClient;
