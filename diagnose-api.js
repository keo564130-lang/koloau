const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const API_KEY = process.env.F5AI_API_KEY;
const BASE_URL = 'https://api.f5ai.ru/v2';

async function testConnection() {
    console.log('--- F5AI API Diagnostics ---');
    console.log('API KEY:', API_KEY ? 'Present (Starts with ' + API_KEY.substring(0, 5) + '...)' : 'MISSING!');
    
    if (!API_KEY) return;

    // Test 1: Simple completion with a known safe model
    console.log('\nTest 1: Testing gpt-4o-mini (safe model)...');
    try {
        const res = await axios.post(`${BASE_URL}/chat/completions`, {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'hi' }]
        }, {
            headers: { 'X-Auth-Token': API_KEY, 'Content-Type': 'application/json' }
        });
        console.log('✅ Success! API is working.');
    } catch (err) {
        console.error('❌ Failed! Error:', err.response ? err.response.data : err.message);
    }

    // Test 2: Testing new 2026 models
    const testModels = ['gpt-5.3', 'claude-4.6-sonnet', 'deepseek-v4.1'];
    console.log('\nTest 2: Testing 2026 models...');
    for (const model of testModels) {
        try {
            console.log(`Checking ${model}...`);
            await axios.post(`${BASE_URL}/chat/completions`, {
                model: model,
                messages: [{ role: 'user', content: 'hi' }]
            }, {
                headers: { 'X-Auth-Token': API_KEY, 'Content-Type': 'application/json' }
            });
            console.log(`✅ ${model} works!`);
        } catch (err) {
            console.error(`❌ ${model} failed! (${err.response ? err.response.status : 'No response'})`);
        }
    }
}

testConnection();
