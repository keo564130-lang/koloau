const axios = require('axios');
require('dotenv').config();

async function main() {
    console.log('Sending test completion request...');
    try {
        const response = await axios.post('https://api.f5ai.ru/v2/chat/completions', {
            model: 'gpt-5-mini',
            messages: [{ role: 'user', content: 'Say hello' }]
        }, {
            headers: {
                'X-Auth-Token': process.env.F5AI_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        console.log('✅ Full Response Data:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error('❌ Failed:', err.response ? err.response.status : err.message);
        if (err.response) console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
}
main();
