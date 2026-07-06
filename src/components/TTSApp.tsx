import React, { useState, useRef } from 'react';
import { Play, Download, Loader2, Volume2, Settings2, FileAudio, Check, AlertCircle } from 'lucide-react';
import { VOICES, LANGUAGES } from '../types';
import { motion, AnimatePresence } from 'motion/react';

// Helpers
async function base64ToArrayBuffer(base64: string) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(buffer: AudioBuffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const result = new Float32Array(buffer.length * numChannels);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) {
      result[i * numChannels + channel] = channelData[i];
    }
  }

  const dataLength = result.length * (bitDepth / 8);
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

export default function TTSApp() {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('ar-SA');
  const [voice, setVoice] = useState('kore');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chunkText = (text: string, maxLength: number): string[] => {
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
  };

  const generateAudio = async () => {
    if (!text.trim()) {
      setError('يرجى إدخال بعض النص للتحويل');
      return;
    }
    
    setError(null);
    setIsGenerating(true);
    setProgress(0);
    setAudioUrl(null);
    
    try {
      const chunks = chunkText(text, 1000); // 1000 characters chunk to be safe
      const allAudioChunks: string[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk.trim()) continue;
        
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk, language, voice })
        });
        
        let data;
        try {
          const responseText = await response.text();
          data = JSON.parse(responseText);
        } catch (e) {
          throw new Error('حدث خطأ في الاتصال بالخادم. قد يكون النص طويلاً جداً.');
        }
        
        if (!response.ok) {
          throw new Error(data.error || 'حدث خطأ أثناء التحويل');
        }

        if (data.audioChunks && data.audioChunks.length > 0) {
          allAudioChunks.push(...data.audioChunks);
        }
        
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      if (allAudioChunks.length === 0) {
        throw new Error('لم يتم استلام أي بيانات صوتية');
      }

      // Initialize AudioContext
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode all chunks (Gemini TTS returns 24000Hz 16-bit PCM mono)
      const buffers = await Promise.all(
        allAudioChunks.map(async (b64: string) => {
          const arrayBuffer = await base64ToArrayBuffer(b64);
          const pcm16 = new Int16Array(arrayBuffer);
          const float32 = new Float32Array(pcm16.length);
          for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768.0;
          }
          const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
          audioBuffer.copyToChannel(float32, 0);
          return audioBuffer;
        })
      );

      // Merge buffers
      const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
      const merged = audioCtx.createBuffer(
        buffers[0].numberOfChannels,
        totalLength,
        buffers[0].sampleRate
      );

      for (let channel = 0; channel < buffers[0].numberOfChannels; channel++) {
        const channelData = merged.getChannelData(channel);
        let offset = 0;
        for (const buf of buffers) {
          channelData.set(buf.getChannelData(channel), offset);
          offset += buf.length;
        }
      }

      // Encode back to WAV Blob
      const wavBlob = encodeWAV(merged);
      const url = URL.createObjectURL(wavBlob);
      
      setAudioUrl(url);
      
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col" dir="rtl">
      <nav className="flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">VoxReal AI</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium text-slate-500">
          <button className="text-indigo-600 hover:text-indigo-700 transition-colors">الاستوديو</button>
          <button className="hover:text-slate-800 transition-colors">المكتبة</button>
          <button className="hover:text-slate-800 transition-colors">الإعدادات</button>
        </div>
        <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
          <span className="text-xs font-bold text-slate-500">م.أ</span>
        </div>
      </nav>

      <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">تحويل النص إلى صوت بشري</h1>
          <p className="text-slate-500 text-base">
            قم بتحويل النصوص الطويلة إلى صوت واقعي بدقة عالية. ادعم ملفات ضخمة بلا حدود مع إمكانية التحميل.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-semibold text-slate-700">
                  النص المراد تحويله
                </label>
                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono font-medium border border-slate-200">
                  {text.trim().split(/\s+/).filter(Boolean).length} / 5000 كلمة
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="أدخل النص هنا للتحويل..."
                className="w-full min-h-[360px] p-5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none text-slate-700 text-lg leading-relaxed placeholder:text-slate-400 outline-none transition-all"
              />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {audioUrl && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-green-200"
              >
                <div className="flex items-center gap-3 mb-4 text-green-700">
                  <div className="p-1 bg-green-100 rounded-full">
                    <Check className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-sm">اكتمل التحويل بنجاح!</span>
                </div>
                <audio src={audioUrl} controls className="w-full mb-6" />
                <div className="flex gap-3">
                  <a
                    href={audioUrl}
                    download="audio_output.wav"
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>تحميل بصيغة WAV</span>
                  </a>
                </div>
              </motion.div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-6">
              <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-4">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-lg">إعدادات الصوت</h3>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">اللغة المستهدفة</label>
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-medium transition-all"
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">نبرة الصوت</label>
                  <div className="grid grid-cols-1 gap-3">
                    {VOICES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVoice(v.id)}
                        className={`text-right p-4 rounded-xl border transition-all ${
                          voice === v.id
                            ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-500'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className={`font-semibold ${voice === v.id ? 'text-indigo-900' : 'text-slate-700'}`}>{v.name}</span>
                          {voice === v.id && (
                            <span className="text-[10px] bg-indigo-100 px-2 py-0.5 rounded text-indigo-700 font-bold border border-indigo-200">محدد</span>
                          )}
                        </div>
                        <p className={`text-xs mt-1.5 ${voice === v.id ? 'text-indigo-600' : 'text-slate-500'}`}>{v.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={generateAudio}
                disabled={isGenerating || !text.trim()}
                className="w-full mt-4 flex items-center justify-center gap-2 py-4 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-semibold transition-all shadow-md shadow-indigo-600/20 disabled:shadow-none active:scale-[0.98]"
              >
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-1.5 w-full">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري المعالجة ({progress}%)...</span>
                    </div>
                    <div className="w-full bg-indigo-800/30 rounded-full h-1 mt-1 overflow-hidden">
                      <div className="bg-white h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>توليد الصوت</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
