
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LANGUAGES, TONES } from './constants.tsx';
import { TranslationHistoryItem } from './types';
import ToneDropdown from './components/ToneDropdown';
import HistoryList from './components/HistoryList';
import { translateText, generateGeminiTTS } from './services/geminiService';

const App: React.FC = () => {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('bn');
  const [detectedLanguageName, setDetectedLanguageName] = useState<string | null>(null);
  const [tone, setTone] = useState('neutral');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isListeningTarget, setIsListeningTarget] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isEditingSource, setIsEditingSource] = useState(true);
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  
  const [highlightedSourceWordIndex, setHighlightedSourceWordIndex] = useState<number | null>(null);
  const [highlightedTargetWordIndex, setHighlightedTargetWordIndex] = useState<number | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const targetRecognitionRef = useRef<any>(null);
  const isInitialMount = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);

  const sourceWords = useMemo(() => sourceText.split(/(\s+)/), [sourceText]);
  const targetWords = useMemo(() => translatedText.split(/(\s+)/), [translatedText]);

  const langToLocaleMap: Record<string, string> = {
    'bn': 'bn-BD', 'hi': 'hi-IN', 'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR',
    'de': 'de-DE', 'ja': 'ja-JP', 'zh': 'zh-CN', 'ar': 'ar-SA', 'ru': 'ru-RU',
    'it': 'it-IT', 'pt': 'pt-BR', 'ko': 'ko-KR', 'tr': 'tr-TR', 'vi': 'vi-VN',
    'th': 'th-TH', 'nl': 'nl-NL', 'sv': 'sv-SE'
  };

  useEffect(() => {
    const saved = localStorage.getItem('rafi_aura_v3');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('rafi_aura_v3', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (isInitialMount.current) return;
    const lang = LANGUAGES.find(l => l.code === sourceLang);
    if (lang) {
      const msg = sourceLang === 'auto' ? "Auto Detection" : lang.name;
      speakText(msg, sourceLang === 'auto' ? 'en' : sourceLang, 'source');
    }
  }, [sourceLang]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const lang = LANGUAGES.find(l => l.code === targetLang);
    if (lang) {
      speakText(lang.name, targetLang, 'target');
    }
  }, [targetLang]);

  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000,
    numChannels: number = 1,
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const playNeuralAudio = async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioData = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(audioData, ctx);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      setIsSpeaking(true);
      source.onended = () => setIsSpeaking(false);
      source.start();
      return true;
    } catch (e) {
      console.error("Neural Playback Error:", e);
      return false;
    }
  };

  const speakWithGemini = async (text: string, langCode: string) => {
    setIsSynthesizing(true);
    const audio = await generateGeminiTTS(text, langCode);
    setIsSynthesizing(false);
    if (audio) {
      return await playNeuralAudio(audio);
    }
    return false;
  };

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setIsTranslating(true);
    setIsEditingSource(false);
    setHighlightedTargetWordIndex(null);
    try {
      const result = await translateText(sourceText, sourceLang, targetLang, tone);
      setTranslatedText(result.translation);
      
      if (sourceLang === 'auto') {
        setDetectedLanguageName(result.detectedLanguage);
      } else {
        setDetectedLanguageName(null);
      }
      
      const newHistoryItem: TranslationHistoryItem = {
        id: Date.now().toString(),
        sourceText,
        translatedText: result.translation,
        sourceLang,
        targetLang,
        detectedLang: result.detectedLanguage,
        tone,
        timestamp: Date.now()
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 15));
    } catch (error) {
      console.error("Neural Error:", error);
    } finally {
      setIsTranslating(false);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = sourceLang === 'auto' ? 'en-US' : (langToLocaleMap[sourceLang] || sourceLang);

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results).map((result: any) => result[0].transcript).join('');
        setSourceText(transcript);
        setIsEditingSource(true);
      };

      recognitionRef.current.onstart = () => setIsListening(true);
      recognitionRef.current.onend = () => setIsListening(false);
      recognitionRef.current.onerror = () => setIsListening(false);
    }

    if (isListening) recognitionRef.current.stop();
    else recognitionRef.current.start();
  };

  const startTargetVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!targetRecognitionRef.current) {
      targetRecognitionRef.current = new SpeechRecognition();
      targetRecognitionRef.current.continuous = false;
      targetRecognitionRef.current.interimResults = true;
      targetRecognitionRef.current.lang = langToLocaleMap[targetLang] || targetLang;

      targetRecognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results).map((result: any) => result[0].transcript).join('');
        setTranslatedText(transcript);
      };

      targetRecognitionRef.current.onstart = () => setIsListeningTarget(true);
      targetRecognitionRef.current.onend = () => {
        setIsListeningTarget(false);
        if (translatedText.trim()) {
           speakText(translatedText, targetLang, 'target', true);
        }
      };
      targetRecognitionRef.current.onerror = () => setIsListeningTarget(false);
    } else {
      targetRecognitionRef.current.lang = langToLocaleMap[targetLang] || targetLang;
    }

    if (isListeningTarget) targetRecognitionRef.current.stop();
    else targetRecognitionRef.current.start();
  };

  const speakText = async (text: string, langCode: string, section: 'source' | 'target', highlightAll: boolean = false, wordIndex?: number) => {
    if (!text || !text.trim()) return;
    
    let actualLangCode = langCode;
    if (langCode === 'auto' && detectedLanguageName) {
      const found = LANGUAGES.find(l => l.name.toLowerCase() === detectedLanguageName.toLowerCase());
      actualLangCode = found ? found.code : 'en';
    } else if (langCode === 'auto') {
      actualLangCode = 'en';
    }

    // Attempt Gemini Neural synthesis first for Bengali or if system chooses
    if (actualLangCode === 'bn') {
      const success = await speakWithGemini(text, 'bn');
      if (success) return;
    }

    // Web Speech API Fallback
    window.speechSynthesis.cancel();
    const locale = langToLocaleMap[actualLangCode] || actualLangCode;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    let voice: SpeechSynthesisVoice | undefined;
    if (actualLangCode === 'bn') {
        voice = voices.find(v => v.lang === 'bn-BD' || v.lang === 'bn-IN' || v.name.toLowerCase().includes('bengali'));
    } else {
        voice = voices.find(v => v.lang === locale) || voices.find(v => v.lang.startsWith(actualLangCode));
    }
    
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = locale;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      if (wordIndex !== undefined) {
        if (section === 'source') setHighlightedSourceWordIndex(wordIndex);
        else setHighlightedTargetWordIndex(wordIndex);
      }
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setHighlightedSourceWordIndex(null);
      setHighlightedTargetWordIndex(null);
    };

    if (highlightAll) {
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const charIndex = event.charIndex;
          let currentPos = 0;
          const currentWords = section === 'source' ? sourceWords : targetWords;
          for (let i = 0; i < currentWords.length; i++) {
            const part = currentWords[i];
            if (charIndex >= currentPos && charIndex < currentPos + part.length) {
              if (section === 'source') setHighlightedSourceWordIndex(i);
              else setHighlightedTargetWordIndex(i);
              break;
            }
            currentPos += part.length;
          }
        }
      };
    }
    window.speechSynthesis.speak(utterance);
  };

  const restoreFromHistory = (item: TranslationHistoryItem) => {
    setSourceText(item.sourceText);
    setTranslatedText(item.translatedText);
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
    setTone(item.tone);
    setIsEditingSource(false);
    if (item.detectedLang) setDetectedLanguageName(item.detectedLang);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200 pb-32">
      {/* Tactical Header */}
      <header className="fixed top-0 left-0 right-0 z-50 p-6 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 glass-shard rounded-xl flex items-center justify-center border border-cyan-500/20 group relative overflow-hidden transition-all hover:border-cyan-500/50">
             <div className="absolute inset-0 bg-cyan-500/5 scale-0 group-hover:scale-110 transition-transform duration-700"></div>
             <div className="scanline-effect"></div>
             <svg className="w-7 h-7 text-cyan-400 group-hover:rotate-90 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3zM9 11l3 3 3-3" />
             </svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-[0.15em] text-white/90">RAFI<span className="text-cyan-400">_</span>TRANSITION</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isListening || isListeningTarget || isSpeaking || isSynthesizing ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`}></span>
              <p className="text-[9px] jetbrains uppercase tracking-[0.3em] text-white/40 font-bold">Protocol_Nexus_v12.0</p>
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 glass-shard p-1.5 rounded-xl border-cyan-500/10">
          <ToneDropdown selectedTone={tone} onSelect={setTone} />
        </div>
      </header>

      {/* Main Interface Core */}
      <main className="max-w-4xl mx-auto px-6 pt-40 space-y-16">
        
        {/* Source Panel */}
        <div className={`relative transition-all duration-700 transform ${!isEditingSource ? 'opacity-40 scale-[0.97] blur-[1px]' : 'scale-100'}`}>
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-3">
               <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#00f2ff]"></div>
               <span className="text-[10px] jetbrains font-bold uppercase tracking-[0.4em] text-cyan-500/80">Input_Node</span>
            </div>
            <div className="relative group">
               <select 
                 value={sourceLang}
                 onChange={(e) => setSourceLang(e.target.value)}
                 className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-6 py-2 text-[11px] font-black text-white/50 focus:ring-1 focus:ring-cyan-500/50 outline-none hover:bg-cyan-500/10 transition-all appearance-none cursor-pointer min-w-[160px] text-center uppercase tracking-widest"
               >
                 {LANGUAGES.map(l => (
                   <option key={l.code} value={l.code} className="bg-slate-900">{l.code === 'auto' && detectedLanguageName ? `${detectedLanguageName}` : l.name}</option>
                 ))}
               </select>
            </div>
          </div>

          <div className="relative glass-shard tactical-border p-1 rounded-2xl">
            <div className="bg-[#0d1117]/80 rounded-[inherit] p-10 min-h-[280px] relative overflow-hidden">
                <div className="scanline-effect"></div>
                {isEditingSource ? (
                <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder="INITIATING_CAPTURE..."
                    className="w-full h-full bg-transparent border-none outline-none text-3xl font-bold placeholder:text-cyan-500/5 leading-snug resize-none text-white overflow-hidden"
                    rows={4}
                />
                ) : (
                <div 
                    onClick={() => setIsEditingSource(true)}
                    className="flex flex-wrap gap-x-2 gap-y-3 content-start cursor-text"
                >
                    {sourceWords.map((word, idx) => (
                    <span 
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); word.trim() && speakText(word, sourceLang, 'source', false, idx); }}
                        className={`text-3xl font-bold transition-all duration-300 rounded-lg px-1 whitespace-pre-wrap ${word.trim() ? 'hover:bg-cyan-500/20 hover:text-cyan-400' : ''} ${highlightedSourceWordIndex === idx ? 'bg-cyan-400 text-slate-950 scale-105 shadow-[0_0_20px_rgba(0,242,255,0.4)]' : 'text-white/80'}`}
                    >
                        {word}
                    </span>
                    ))}
                </div>
                )}
                
                <div className="absolute bottom-8 right-8 flex items-center gap-3">
                   <button 
                      onClick={startVoiceInput}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400'}`}
                   >
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                     </svg>
                   </button>
                   {sourceText && (
                     <button onClick={() => setSourceText('')} className="w-12 h-12 bg-white/5 hover:bg-rose-500/10 text-white/20 hover:text-rose-400 rounded-xl transition-all flex items-center justify-center">
                       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                   )}
                </div>
            </div>
          </div>
        </div>

        {/* Neural Link Hub */}
        <div className="flex justify-center -my-8 relative z-10">
          <button 
            onClick={handleTranslate}
            disabled={isTranslating || !sourceText}
            className={`w-24 h-24 rounded-2xl flex items-center justify-center transition-all duration-500 ${isTranslating ? 'rotate-180 bg-cyan-400/10 border-cyan-400/30' : 'glass-shard hover:scale-105 active:scale-95 border-cyan-400/20 group'}`}
          >
            {isTranslating ? (
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            ) : (
              <div className="relative">
                 <div className="absolute inset-0 bg-cyan-400/20 blur-xl scale-0 group-hover:scale-150 transition-transform rounded-full"></div>
                 <svg className="w-10 h-10 text-cyan-400 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                 </svg>
              </div>
            )}
          </button>
        </div>

        {/* Target Echo Panel */}
        <div className={`relative transition-all duration-1000 ${translatedText || isTranslating ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-10'}`}>
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-3">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#00ff8c]"></div>
               <span className="text-[10px] jetbrains font-bold uppercase tracking-[0.4em] text-emerald-500/80">Neural_Echo</span>
            </div>
            <select 
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-6 py-2 text-[11px] font-black text-white/50 focus:ring-1 focus:ring-emerald-500/50 outline-none hover:bg-emerald-500/10 transition-all appearance-none cursor-pointer min-w-[160px] text-center uppercase tracking-widest"
            >
              {LANGUAGES.filter(l => l.code !== 'auto').map(l => (
                <option key={l.code} value={l.code} className="bg-slate-900">{l.name}</option>
              ))}
            </select>
          </div>

          <div className="relative glass-shard tactical-border p-1 rounded-2xl border-emerald-500/10">
            <div className="bg-[#0d1117]/80 rounded-[inherit] p-10 min-h-[280px] relative overflow-hidden">
                <div className="scanline-effect" style={{ animationDelay: '2s' }}></div>
                {isTranslating ? (
                <div className="flex flex-col items-center justify-center h-40 space-y-4">
                    <div className="w-full max-w-[180px] h-0.5 bg-emerald-500/10 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 animate-[shimmer_1.5s_infinite]"></div>
                    </div>
                    <p className="text-[9px] jetbrains uppercase tracking-[0.4em] text-emerald-500/40 animate-pulse">Syncing_Matrices...</p>
                </div>
                ) : (
                <div className="flex flex-wrap gap-x-2 gap-y-3">
                    {targetWords.map((word, idx) => (
                    <span 
                        key={idx}
                        onClick={() => word.trim() && speakText(word, targetLang, 'target', false, idx)}
                        className={`text-3xl font-bold transition-all duration-300 rounded-lg px-1 whitespace-pre-wrap ${word.trim() ? 'hover:bg-emerald-500/20 hover:text-emerald-400 cursor-pointer' : ''} ${highlightedTargetWordIndex === idx ? 'bg-emerald-400 text-slate-950 scale-105 shadow-[0_0_20px_rgba(0,255,140,0.4)]' : 'text-white'}`}
                    >
                        {word}
                    </span>
                    ))}
                </div>
                )}

                <div className="absolute top-8 right-8 flex flex-col gap-3">
                <button 
                    onClick={() => speakText(translatedText, targetLang, 'target', true)}
                    disabled={isSynthesizing}
                    className={`w-12 h-12 flex items-center justify-center glass-shard rounded-xl transition-all ${isSpeaking ? 'bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(0,255,140,0.4)]' : 'text-emerald-400 hover:bg-emerald-500/10'} ${isSynthesizing ? 'opacity-40 animate-pulse' : ''}`}
                >
                    {isSynthesizing ? (
                        <span className="text-[10px] jetbrains font-black">AI</span>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    )}
                </button>
                
                <button 
                    onClick={startTargetVoiceInput}
                    className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all ${isListeningTarget ? 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'glass-shard text-white/30 hover:text-cyan-400'}`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                </button>

                <button 
                    onClick={() => navigator.clipboard.writeText(translatedText)}
                    className="w-12 h-12 flex items-center justify-center glass-shard text-white/20 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                </button>
                </div>

                <div className="absolute bottom-6 left-10">
                    {targetLang === 'bn' && (
                    <div className="px-3 py-1 bg-cyan-500/5 border border-cyan-500/20 rounded-lg text-[7px] jetbrains text-cyan-400/60 uppercase font-black tracking-widest flex items-center gap-2">
                        <span className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse"></span>
                        Neural_Core_Engaged
                    </div>
                    )}
                </div>
            </div>
          </div>
        </div>

        {/* Intelligence Stream History */}
        <section className="mt-40 border-t border-cyan-500/5 pt-20">
          <HistoryList history={history} onClear={() => setHistory([])} onRestore={restoreFromHistory} />
        </section>
      </main>

      {/* Global Controller Strip */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 p-2 glass-shard tactical-border rounded-xl z-[100] shadow-2xl">
         <div className="px-6 py-3 rounded-lg bg-black/40 flex items-center gap-6 group">
            <div className="flex flex-col">
               <span className="text-[8px] jetbrains font-bold text-white/20 uppercase tracking-[0.2em]">Core_Link</span>
               <div className="flex items-center gap-2 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isTranslating || isSpeaking || isListening || isListeningTarget || isSynthesizing ? 'bg-cyan-400 animate-ping shadow-[0_0_8px_#00f2ff]' : 'bg-slate-700'}`}></span>
                  <span className="text-[10px] font-black text-white/50 tracking-widest uppercase">
                     {isTranslating ? 'Linking...' : isSpeaking ? 'Outputting...' : isListening ? 'Capturing...' : isListeningTarget ? 'Verifying...' : isSynthesizing ? 'Neural_Sync...' : 'Active_Wait'}
                  </span>
               </div>
            </div>
         </div>
         <div className="w-[1px] h-8 bg-cyan-500/10 mx-1"></div>
         <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="p-4 hover:bg-cyan-500/10 text-cyan-400/30 hover:text-cyan-400 rounded-lg transition-all">
           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
         </button>
      </div>
    </div>
  );
};

export default App;
