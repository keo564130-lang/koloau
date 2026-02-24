const { OpenAI } = require('openai');

class F5AIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.f5ai.ru/v2',
            defaultHeaders: {
                'X-Auth-Token': apiKey
            }
        });
    }

    async chatCompletion(messages, model = 'gpt-5-nano', options = {}) {
        try {
            console.log(`[F5AI] Chat Completion with model: ${model}`);
            const response = await this.client.chat.completions.create({
                model,
                messages,
                ...options
            });
            return {
                message: response.choices[0].message,
                usage: response.usage
            };
        } catch (error) {
            console.error('[F5AI] Chat Error:', error.message);
            throw error;
        }
    }

    async transcribeAudio(buffer, model = 'whisper-1') {
        try {
            console.log(`[F5AI] Transcribing ${buffer.length} bytes with ${model}`);
            
            // F5AI docs specify endpoint: /v2/audio/transcription (singular)
            // The SDK by default hits /audio/transcriptions (plural)
            // We'll use a manual fetch/axios approach for this specific singular endpoint if SDK fails,
            // but first let's try to override the path or use a direct call.
            
            const formData = new (require('form-data'))();
            formData.append('file', buffer, { filename: 'audio.oga', contentType: 'audio/ogg' });
            formData.append('model', model);
            formData.append('language', 'ru');

            const axios = require('axios');
            const response = await axios.post('https://api.f5ai.ru/v2/audio/transcription', formData, {
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
