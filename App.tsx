
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LANGUAGES } from './constants.tsx';
import { TranslationHistoryItem } from './types';
import ToneDropdown from './components/ToneDropdown.tsx';
import HistoryList from './components/HistoryList.tsx';
import { translateText, generateGeminiTTS } from './geminiService.ts';

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
  const audioContextRef = useRef<AudioContext | null>(null);

  const sourceWords = useMemo(() => sourceText.split(/(\s+)/), [sourceText]);
  const targetWords = useMemo(() => translatedText.split(/(\s+)/), [translatedText]);

  const langToLocaleMap: Record<string, string> = {
    'bn': 'bn-BD', 'hi': 'hi-IN', 'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR',
    'de': 'de-DE', 'ja': 'ja-JP', 'zh': 'zh-CN', 'ar': 'ar-SA', 'ru': 'ru-RU'
  };

  useEffect(() => {
    const saved = localStorage.getItem('rafi_elysium_v1');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('rafi_elysium_v1', JSON.stringify(history));
  }, [history]);

  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
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
      source.onended = () => {
        setIsSpeaking(false);
        setHighlightedSourceWordIndex(null);
        setHighlightedTargetWordIndex(null);
      };
      source.start();
      return true;
    } catch (e) {
      setIsSpeaking(false);
      return false;
    }
  };

  const speakText = async (text: string, langCode: string, section: 'source' | 'target', wordIndex?: number) => {
    if (!text.trim()) return;
    
    // Set highlight for the single word if provided
    if (wordIndex !== undefined) {
      if (section === 'source') setHighlightedSourceWordIndex(wordIndex);
      else setHighlightedTargetWordIndex(wordIndex);
    }

    let actualLangCode = langCode;
    if (langCode === 'auto' && detectedLanguageName) {
      const found = LANGUAGES.find(l => l.name.toLowerCase() === detectedLanguageName.toLowerCase());
      actualLangCode = found ? found.code : 'en';
    } else if (langCode === 'auto') {
      actualLangCode = 'en';
    }

    if (actualLangCode === 'bn') {
      setIsSynthesizing(true);
      const audio = await generateGeminiTTS(text, 'bn');
      setIsSynthesizing(false);
      if (audio) {
        await playNeuralAudio(audio);
        return;
      }
    }

    // Fallback Web Speech
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const locale = langToLocaleMap[actualLangCode] || actualLangCode;
    utterance.lang = locale;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setHighlightedSourceWordIndex(null);
      setHighlightedTargetWordIndex(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setHighlightedSourceWordIndex(null);
      setHighlightedTargetWordIndex(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setIsTranslating(true);
    setIsEditingSource(false);
    try {
      const result = await translateText(sourceText, sourceLang, targetLang, tone);
      setTranslatedText(result.translation);
      if (sourceLang === 'auto') setDetectedLanguageName(result.detectedLanguage);
      
      setHistory(prev => [{
        id: Date.now().toString(),
        sourceText,
        translatedText: result.translation,
        sourceLang,
        targetLang,
        detectedLang: result.detectedLanguage,
        tone,
        timestamp: Date.now()
      }, ...prev].slice(0, 10));
    } finally {
      setIsTranslating(false);
    }
  };

  const startVoiceInput = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRec();
      recognitionRef.current.onresult = (e: any) => {
        setSourceText(e.results[0][0].transcript);
        setIsEditingSource(true);
      };
      recognitionRef.current.onstart = () => setIsListening(true);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    isListening ? recognitionRef.current.stop() : recognitionRef.current.start();
  };

  const startTargetVoiceInput = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    if (!targetRecognitionRef.current) {
      targetRecognitionRef.current = new SpeechRec();
      targetRecognitionRef.current.lang = langToLocaleMap[targetLang] || targetLang;
      targetRecognitionRef.current.onresult = (e: any) => setTranslatedText(e.results[0][0].transcript);
      targetRecognitionRef.current.onstart = () => setIsListeningTarget(true);
      targetRecognitionRef.current.onend = () => setIsListeningTarget(false);
    }
    isListeningTarget ? targetRecognitionRef.current.stop() : targetRecognitionRef.current.start();
  };

  return (
    <div className="min-h-screen pb-40">
      <header className="p-8 flex justify-between items-center max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gold/10 border border-gold/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight gradient-text uppercase">Rafi_Transition</h1>
            <p className="text-[10px] jetbrains tracking-[0.4em] text-white/30 uppercase">Neural_Core_v1.0</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ToneDropdown selectedTone={tone} onSelect={setTone} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-12 space-y-16">
        {/* Source */}
        <div className={`transition-all duration-500 ${!isEditingSource ? 'opacity-40 scale-[0.98]' : ''}`}>
          <div className="flex justify-between items-center mb-6">
            <span className="text-[11px] jetbrains font-bold uppercase tracking-[0.3em] text-gold/60">Input_Source</span>
            <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="bg-transparent text-white/60 text-xs border-none outline-none font-bold uppercase tracking-widest cursor-pointer">
              {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-neutral-900">{l.code === 'auto' && detectedLanguageName ? `${detectedLanguageName}` : l.name}</option>)}
            </select>
          </div>
          <div className="glass-panel p-8 rounded-3xl min-h-[250px] relative border-gold/5 group gold-border-glow">
            {isEditingSource ? (
              <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="INITIALIZE_TEXT..." className="w-full h-full bg-transparent border-none outline-none text-3xl font-medium leading-relaxed placeholder:text-white/5 text-white resize-none" rows={4} />
            ) : (
              <div 
                onClick={() => setIsEditingSource(true)} 
                className="flex flex-wrap gap-1 content-start cursor-text min-h-[100px]"
              >
                {sourceWords.map((word, idx) => (
                  <span
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (word.trim()) speakText(word, sourceLang, 'source', idx);
                    }}
                    className={`text-3xl font-medium leading-relaxed transition-all duration-200 rounded-md px-0.5
                      ${word.trim() ? 'hover:bg-gold/20 hover:text-gold cursor-pointer' : ''}
                      ${highlightedSourceWordIndex === idx ? 'bg-gold/30 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' : 'text-white/80'}
                    `}
                  >
                    {word}
                  </span>
                ))}
              </div>
            )}
            <div className="absolute bottom-8 right-8 flex gap-4">
              <button onClick={startVoiceInput} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-white/40 hover:text-gold hover:bg-gold/10'}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="flex justify-center -my-8 z-10 relative">
          <button onClick={handleTranslate} disabled={isTranslating || !sourceText} className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all ${isTranslating ? 'animate-pulse bg-gold/10 scale-90' : 'bg-gold hover:bg-gold-bright hover:scale-105 active:scale-95 shadow-xl shadow-gold/20'}`}>
            {isTranslating ? (
              <div className="flex gap-1"><span className="w-1.5 h-1.5 bg-gold rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-gold rounded-full animate-bounce delay-100"></span></div>
            ) : (
              <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
            )}
          </button>
        </div>

        {/* Result */}
        <div className={`transition-all duration-700 ${translatedText || isTranslating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="flex justify-between items-center mb-6">
            <span className="text-[11px] jetbrains font-bold uppercase tracking-[0.3em] text-gold/60">Target_Result</span>
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="bg-transparent text-white/60 text-xs border-none outline-none font-bold uppercase tracking-widest cursor-pointer">
              {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code} className="bg-neutral-900">{l.name}</option>)}
            </select>
          </div>
          <div className="glass-panel p-8 rounded-3xl min-h-[250px] relative border-gold/5 group gold-border-glow">
            {isTranslating ? (
              <div className="flex flex-col items-center justify-center h-40 gap-4">
                <div className="w-32 h-0.5 bg-gold/20 overflow-hidden"><div className="h-full bg-gold animate-[shimmer_1.5s_infinite]"></div></div>
                <p className="text-[10px] jetbrains text-gold/40 animate-pulse tracking-[0.5em]">PROCESSING...</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 content-start min-h-[100px]">
                {targetWords.map((word, idx) => (
                  <span
                    key={idx}
                    onClick={() => {
                      if (word.trim()) speakText(word, targetLang, 'target', idx);
                    }}
                    className={`text-3xl font-medium leading-relaxed transition-all duration-200 rounded-md px-0.5
                      ${word.trim() ? 'hover:bg-gold/20 hover:text-gold cursor-pointer' : ''}
                      ${highlightedTargetWordIndex === idx ? 'bg-gold/30 text-gold shadow-[0_0_10px_rgba(212,175,55,0.3)]' : 'text-white'}
                    `}
                  >
                    {word}
                  </span>
                ))}
              </div>
            )}
            <div className="absolute top-8 right-8 flex flex-col gap-4">
              <button onClick={() => speakText(translatedText, targetLang, 'target')} disabled={isSynthesizing} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all glass-panel border-white/5 ${isSpeaking ? 'bg-gold text-black border-gold shadow-[0_0_15px_rgba(212,175,55,0.4)]' : 'text-white/40 hover:text-gold hover:bg-gold/5'}`}>
                {isSynthesizing ? <span className="text-[8px] jetbrains font-black">AI</span> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
              </button>
              <button onClick={startTargetVoiceInput} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all glass-panel border-white/5 ${isListeningTarget ? 'bg-red-500 shadow-xl' : 'text-white/40 hover:text-gold hover:bg-gold/5'}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </button>
            </div>
          </div>
        </div>

        <section className="pt-24">
          <HistoryList history={history} onClear={() => setHistory([])} onRestore={(item) => { setSourceText(item.sourceText); setTranslatedText(item.translatedText); setSourceLang(item.sourceLang); setTargetLang(item.targetLang); window.scrollTo({top:0, behavior:'smooth'}); }} />
        </section>
      </main>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 glass-panel p-2 rounded-2xl flex items-center gap-4 border-gold/10">
        <div className="px-6 py-3 bg-black/40 rounded-xl flex items-center gap-4">
           <span className={`w-2 h-2 rounded-full ${isTranslating || isSpeaking || isListening ? 'bg-gold animate-ping' : 'bg-white/10'}`}></span>
           <span className="text-[10px] font-bold jetbrains uppercase tracking-[0.2em] text-white/40">Status: {isTranslating ? 'Linking' : isSpeaking ? 'Output' : isListening ? 'Listening' : 'Ready'}</span>
        </div>
      </div>
    </div>
  );
};

export default App;
