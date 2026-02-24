const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const API_KEY = process.env.F5AI_API_KEY;
const BASE_URL = 'https://api.f5ai.ru/v2';

async function testTranscription() {
    console.log('--- F5AI Transcription Diagnostics (V2) ---');
    const dummyBuffer = Buffer.allocUnsafe(100000).fill(0); // 100KB of zeros
    const models = ['whisper-1', 'scribe_v1'];

    for (const model of models) {
        console.log(`\nTesting ${model} with X-Auth-Token...`);
        const fd1 = new FormData();
        fd1.append('file', dummyBuffer, { filename: 'test.wav', contentType: 'audio/wav' });
        fd1.append('model', model);
        try {
            const res = await axios.post(`${BASE_URL}/audio/transcriptions`, fd1, {
                headers: { ...fd1.getHeaders(), 'X-Auth-Token': API_KEY }
            });
            console.log('✅ Success!', res.data);
        } catch (e) { console.log('❌ Failed X-Auth:', e.response ? e.response.status : e.message); }

        console.log(`Testing ${model} with Bearer token...`);
        const fd2 = new FormData();
        fd2.append('file', dummyBuffer, { filename: 'test.wav', contentType: 'audio/wav' });
        fd2.append('model', model);
        try {
            const res = await axios.post(`${BASE_URL}/audio/transcriptions`, fd2, {
                headers: { ...fd2.getHeaders(), 'Authorization': `Bearer ${API_KEY}` }
            });
            console.log('✅ Success!', res.data);
        } catch (e) { console.log('❌ Failed Bearer:', e.response ? e.response.status : e.message); }
    }
}
testTranscription();
