const fs = require('fs');

function generateSilentWav(filename) {
    const sampleRate = 8000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const duration = 1; // 1 second
    const dataSize = sampleRate * numChannels * (bitsPerSample / 8) * duration;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    fs.writeFileSync(filename, buffer);
    console.log(`Generated ${filename} (${buffer.length} bytes)`);
}

generateSilentWav('silent.wav');
