
import { Language, TranslationTone } from './types';

export const LANGUAGES: Language[] = [
  { code: 'auto', name: 'Detect Language' },
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'Bangla' },
  { code: 'hi', name: 'Hindi' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ru', name: 'Russian' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ko', name: 'Korean' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
];

export const TONES: TranslationTone[] = [
  { id: 'neutral', name: 'Neutral', description: 'Standard balanced translation', icon: '⚖️' },
  { id: 'professional', name: 'Professional', description: 'Formal, polite, and business-ready', icon: '💼' },
  { id: 'friendly', name: 'Friendly', description: 'Warm, casual, and approachable', icon: '😊' },
  { id: 'humorous', name: 'Humorous', description: 'Adds wit and light-hearted flair', icon: '🎭' },
  { id: 'empathetic', name: 'Empathetic', description: 'Compassionate and understanding', icon: '🫂' },
  { id: 'urgent', name: 'Urgent', description: 'Direct and time-sensitive', icon: '🚨' },
  { id: 'poetic', name: 'Poetic', description: 'Artistic, rhythmic, and expressive', icon: '📜' },
  { id: 'slang', name: 'Street/Slang', description: 'Modern, youthful, and informal', icon: '🔥' },
];
