import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = 3000;

// Initialize Gemini
// Lazy initialize to prevent startup crashes if key is missing
let aiClient: GoogleGenAI | null = null;
function getAI() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set.");
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

// Chunk text function (chunk by sentence or max length)
function chunkText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  
  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.length > 0 ? chunks : [text];
}

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice, language } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const ai = getAI();
    const audioChunksBase64: string[] = [];

    const interaction = await ai.interactions.create({
      model: 'gemini-3.1-flash-tts-preview',
      input: text,
      response_modalities: ['audio'],
      generation_config: {
        speech_config: [{
          voice: voice || "Kore",
          language: language || "ar-SA"
        }]
      }
    });

    for (const step of interaction.steps) {
      if (step.type === 'model_output' && step.content) {
        const audioContent = step.content.find((c: any) => c.mime_type && c.mime_type.startsWith('audio/'));
        if (audioContent && (audioContent as any).data) {
          audioChunksBase64.push((audioContent as any).data);
        }
      }
    }

    res.json({ audioChunks: audioChunksBase64 });
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
