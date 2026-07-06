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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateAudio = async () => {
    if (!text.trim()) {
      setError('يرجى إدخال بعض النص للتحويل');
      return;
    }
    
    setError(null);
    setIsGenerating(true);
    setAudioUrl(null);
    
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language, voice })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'حدث خطأ أثناء التحويل');
      }

      if (!data.audioChunks || data.audioChunks.length === 0) {
        throw new Error('لم يتم استلام أي بيانات صوتية');
      }

      // Initialize AudioContext
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode all chunks (Gemini TTS returns 24000Hz 16-bit PCM mono)
      const buffers = await Promise.all(
        data.audioChunks.map(async (b64: string) => {
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
    <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <header className="mb-10 text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-6 shadow-lg shadow-indigo-600/20">
            <Volume2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-3">استوديو الصوت الذكي</h1>
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            قم بتحويل النصوص الطويلة إلى صوت بشري واقعي بدقة عالية. ادعم ملفات ضخمة بلا حدود وصيغ تحميل متعددة.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-4 px-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                  النص المراد تحويله
                </label>
                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">
                  {text.trim().split(/\s+/).filter(Boolean).length} / 5000 كلمة
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="أدخل النص هنا للتحويل..."
                className="w-full min-h-[320px] p-6 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 resize-none text-slate-700 text-lg leading-relaxed placeholder:text-slate-400 outline-none"
              />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100"
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
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200"
              >
                <div className="flex items-center gap-3 mb-4 text-green-600">
                  <div className="p-1 bg-green-100 rounded-full">
                    <Check className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-sm">اكتمل التحويل بنجاح!</span>
                </div>
                <audio src={audioUrl} controls className="w-full mb-6" />
                <div className="flex gap-3">
                  <a
                    href={audioUrl}
                    download="audio_output.wav"
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>تحميل بصيغة WAV</span>
                  </a>
                  {/* You could add more download formats here if a converter exists, but WAV is standard uncompressed. */}
                </div>
              </motion.div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col gap-6">
              <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-4">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-lg">إعدادات الصوت</h3>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">اللغة المستهدفة</label>
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
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
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">نبرة الصوت</label>
                  <div className="grid grid-cols-1 gap-2">
                    {VOICES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVoice(v.id)}
                        className={`text-right p-3 rounded-xl border transition-all ${
                          voice === v.id
                            ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-500'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className={`font-semibold ${voice === v.id ? 'text-indigo-900' : 'text-slate-700'}`}>{v.name}</span>
                          {voice === v.id && (
                            <span className="text-[10px] bg-indigo-100 px-2 py-0.5 rounded text-indigo-700 font-bold">محدد</span>
                          )}
                        </div>
                        <p className={`text-xs mt-1 ${voice === v.id ? 'text-indigo-600' : 'text-slate-500'}`}>{v.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={generateAudio}
                disabled={isGenerating || !text.trim()}
                className="w-full mt-4 flex items-center justify-center gap-2 py-4 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التوليد بدقة عالية...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>تحويل النص إلى صوت</span>
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
