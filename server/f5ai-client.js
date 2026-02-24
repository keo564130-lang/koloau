const { OpenAI } = require('openai');
const axios = require('axios');

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

    async chatCompletion(messages, model = 'gpt-5-mini', options = {}) {
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
            const formData = new (require('form-data'))();
            formData.append('file', buffer, { filename: 'audio.oga', contentType: 'audio/ogg' });
            formData.append('model', model);
            formData.append('language', 'ru');

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

    async generateImage(prompt, model = 'dall-e-3', size = '1024x1024') {
        try {
            console.log(`[F5AI] Generating image: ${prompt.substring(0, 30)}...`);
            const response = await axios.post('https://api.f5ai.ru/v2/images/generations', {
                prompt,
                model,
                size
            }, {
                headers: {
                    'X-Auth-Token': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            return response.data; // Usually { data: [{ url: '...' }] }
        } catch (error) {
            console.error('[F5AI] Image Generation Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }

    async generateSpeech(text, model = 'tts-1', voice = 'alloy') {
        try {
            console.log(`[F5AI] Generating speech: ${text.substring(0, 30)}...`);
            const response = await axios.post('https://api.f5ai.ru/v2/audio/speech', {
                model,
                text,
                voice
            }, {
                headers: {
                    'X-Auth-Token': this.apiKey,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('[F5AI] TTS Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }
}

module.exports = F5AIClient;
