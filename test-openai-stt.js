const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const client = new OpenAI({
  apiKey: process.env.F5AI_API_KEY,
  baseURL: 'https://api.f5ai.ru/v2',
  defaultHeaders: { 'X-Auth-Token': process.env.F5AI_API_KEY }
});

async function main() {
  console.log('Testing STT with OpenAI client...');
  console.log('API Key:', process.env.F5AI_API_KEY ? 'Present' : 'Missing');
  try {
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream('silent.wav'),
      model: 'whisper-1',
    });
    console.log('✅ Success!', transcription.text);
  } catch (err) {
    console.error('❌ Failed!', err.message);
  }
}
main();
