const axios = require('axios');
const FormData = require('form-data');

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
                timeout: 60000 // 60 seconds timeout
            });
            return response.data;
        } catch (error) {
            console.error('F5AI API Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async transcribeAudio(stream, model = 'whisper-1') {
        const formData = new FormData();
        formData.append('file', stream, { filename: 'audio.oga' });
        formData.append('model', model);

        try {
            const response = await axios.post(`${this.baseUrl}/audio/transcriptions`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'X-Auth-Token': this.apiKey
                }
            });
            return response.data;
        } catch (error) {
            console.error('F5AI Transcription Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = F5AIClient;
