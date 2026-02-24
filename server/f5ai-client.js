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
            // Adapt OpenAI response format to what BotManager expects
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
            
            // OpenAI SDK expects a File-like object or a stream. 
            // We can use a trick to pass a buffer as a file.
            const file = await OpenAI.toFile(buffer, 'audio.oga', { type: 'audio/ogg' });
            
            const transcription = await this.client.audio.transcriptions.create({
                file: file,
                model: model,
            });
            return transcription;
        } catch (error) {
            console.error('[F5AI] Transcription Error:', error.message);
            throw error;
        }
    }
}

module.exports = F5AIClient;
