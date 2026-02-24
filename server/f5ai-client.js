const axios = require('axios');
const FormData = require('form-data');

class F5AIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.f5ai.ru/v2';
    }

    async chatCompletion(messages, model = 'gpt-5-nano', options = {}) {
        try {
            console.log(`[F5AI] Sending chat completion request with model: ${model}`);
            const response = await axios.post(`${this.baseUrl}/chat/completions`, {
                model,
                messages,
                ...options
            }, {
                headers: {
                    'X-Auth-Token': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            });
            return response.data;
        } catch (error) {
            console.error('[F5AI] Chat Completion Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }

    async transcribeAudio(buffer, model = 'whisper-1') {
        const formData = new FormData();
        // Use buffer instead of stream for more reliability with form-data in Node
        formData.append('file', buffer, { filename: 'audio.oga', contentType: 'audio/ogg' });
        formData.append('model', model);

        try {
            console.log(`[F5AI] Sending transcription request for ${buffer.length} bytes`);
            const response = await axios.post(`${this.baseUrl}/audio/transcriptions`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'X-Auth-Token': this.apiKey
                }
            });
            return response.data;
        } catch (error) {
            console.error('[F5AI] Transcription Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }
}

module.exports = F5AIClient;
