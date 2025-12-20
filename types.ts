
export interface TranslationHistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLang?: string;
  tone: string;
  timestamp: number;
}

export interface Language {
  code: string;
  name: string;
  flag?: string;
}

export interface TranslationTone {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface TranslationResult {
  translation: string;
  detectedLanguage: string;
}
