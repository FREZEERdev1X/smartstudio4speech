export interface VoiceOption {
  id: string;
  name: string;
  description: string;
}

export interface LanguageOption {
  code: string;
  name: string;
}

export const VOICES: VoiceOption[] = [
  { id: 'kore', name: 'Kore', description: 'Calm and professional' },
  { id: 'puck', name: 'Puck', description: 'Energetic and bright' },
  { id: 'charon', name: 'Charon', description: 'Deep and authoritative' },
  { id: 'fenrir', name: 'Fenrir', description: 'Warm and resonant' },
  { id: 'zephyr', name: 'Zephyr', description: 'Smooth and airy' },
];

export const LANGUAGES: LanguageOption[] = [
  { code: 'ar-SA', name: 'Arabic (العربية)' },
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'fr-FR', name: 'French (Français)' },
  { code: 'es-ES', name: 'Spanish (Español)' },
  { code: 'de-DE', name: 'German (Deutsch)' },
  { code: 'it-IT', name: 'Italian (Italiano)' },
  { code: 'ja-JP', name: 'Japanese (日本語)' },
];
