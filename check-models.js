const axios = require('axios');
require('dotenv').config();

async function main() {
    console.log('Fetching available models from F5AI...');
    try {
        const response = await axios.get('https://api.f5ai.ru/v2/models', {
            headers: {
                'X-Auth-Token': process.env.F5AI_API_KEY
            }
        });
        console.log('✅ Models found:', response.data.data.map(m => m.id).join(', '));
    } catch (err) {
        console.error('❌ Failed to fetch models:', err.response ? err.response.status : err.message);
        if (err.response) console.error('Data:', err.response.data);
    }
}
main();
