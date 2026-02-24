const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.F5AI_API_KEY;
const baseUrl = 'https://api.f5ai.ru/v2';

async function testConnection() {
    console.log('Testing F5AI API Key:', apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING');
    try {
        console.log('Fetching available models...');
        const response = await axios.get(`${baseUrl}/models`, {
            headers: {
                'X-Auth-Token': apiKey
            }
        });
        console.log('Models fetched successfully!');
        console.log('Response Structure (keys):', Object.keys(response.data));
        if (response.data.data) {
            console.log('First 5 models:', response.data.data.slice(0, 5).map(m => m.id));
        } else {
            console.log('Data field missing or not an array:', response.data);
        }
        
        console.log('\nTesting chat completion with gpt-4o-mini...');
        const chatResponse = await axios.post(`${baseUrl}/chat/completions`, {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Hello' }]
        }, {
            headers: {
                'X-Auth-Token': apiKey,
                'Content-Type': 'application/json'
            }
        });
        console.log('Chat completion successful!');
        console.log('Chat Response Structure:', JSON.stringify(chatResponse.data, null, 2));
    } catch (error) {
        console.error('API Test Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Message:', error.message);
        }
    }
}

testConnection();
