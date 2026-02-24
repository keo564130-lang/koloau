const { OpenAI } = require('openai');
require('dotenv').config();

const client = new OpenAI({
  apiKey: process.env.F5AI_API_KEY,
  baseURL: 'https://api.f5ai.ru/v2',
  defaultHeaders: { 'X-Auth-Token': process.env.F5AI_API_KEY }
});

async function main() {
  console.log('Testing completion...');
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'test' }]
    });
    console.log('✅ Success!', response.choices[0].message.content);
  } catch (err) {
    console.error('❌ Failed!');
    console.error('Message:', err.message);
    console.error('Status:', err.status);
    console.error('Type:', err.type);
    if (err.response) console.error('Data:', err.response.data);
  }
}
main();
