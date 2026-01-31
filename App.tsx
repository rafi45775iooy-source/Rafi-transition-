import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LANGUAGES } from './constants.tsx';
import { TranslationHistoryItem } from './types';
import ToneDropdown from './components/ToneDropdown.tsx';
import HistoryList from './components/HistoryList.tsx';
import LiveInterface from './components/LiveInterface.tsx';
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
  const [showLiveMode, setShowLiveMode] = useState(false);
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  
  const [highlightedSourceWordIndex, setHighlightedSourceWordIndex] = useState<number | null>(null);
  const [highlightedTargetWordIndex, setHighlightedTargetWordIndex] = useState<number | null>(null);
  
  // Cache for Audio to solve "once or twice" replay issues
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  
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
      console.error("Audio playback error", e);
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

    // Determine Language
    let actualLangCode = langCode;
    if (langCode === 'auto' && detectedLanguageName) {
      const found = LANGUAGES.find(l => l.name.toLowerCase() === detectedLanguageName.toLowerCase());
      actualLangCode = found ? found.code : 'en';
    } else if (langCode === 'auto') {
      actualLangCode = 'en';
    }

    const cacheKey = `${actualLangCode}:${text.trim()}`;

    // Instant replay from cache
    if (audioCacheRef.current.has(cacheKey)) {
        await playNeuralAudio(audioCacheRef.current.get(cacheKey)!);
        return;
    }

    setIsSynthesizing(true);
    const audio = await generateGeminiTTS(text, actualLangCode);
    setIsSynthesizing(false);
    
    if (audio) {
      audioCacheRef.current.set(cacheKey, audio);
      await playNeuralAudio(audio);
      return;
    }

    // Fallback to Web Speech API
    console.log("Falling back to system speech for:", actualLangCode);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Prefer specific voices for Bangla if available
    if (actualLangCode === 'bn') {
        const voices = window.speechSynthesis.getVoices();
        const banglaVoice = voices.find(v => v.lang.includes('bn') || v.name.includes('Bangla') || v.name.includes('Bengali'));
        if (banglaVoice) utterance.voice = banglaVoice;
    }
    const locale = langToLocaleMap[actualLangCode] || actualLangCode;
    utterance.lang = locale;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
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
    <div className="min-h-screen pb-32 flex flex-col items-center relative z-10">
      
      {/* HEADER */}
      <header className="w-full max-w-7xl mx-auto p-6 md:p-8 flex justify-between items-center">
        <div className="flex items-center gap-4 group cursor-default">
            <div className="relative w-12 h-12 flex items-center justify-center">
                <div className="absolute inset-0 bg-[#FFD700] rounded-xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                <div className="relative w-full h-full bg-black/50 border border-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
                     <span className="text-xl">⚡</span>
                </div>
            </div>
            <div className="flex flex-col">
                <h1 className="text-2xl font-bold tracking-tight text-gradient-gold font-sans uppercase">Rafi Transition</h1>
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#00F0FF] rounded-full animate-pulse"></span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#00F0FF]/60 jetbrains">System Online</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
             <button 
                onClick={() => setShowLiveMode(true)}
                className="flex items-center gap-3 px-5 py-2.5 bg-red-500/5 border border-red-500/20 rounded-full hover:bg-red-500/10 transition-all group"
            >
                <div className="relative flex items-center justify-center w-2 h-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </div>
                <span className="text-xs font-bold text-red-400 uppercase tracking-widest group-hover:text-red-300">Live Link</span>
            </button>
            <ToneDropdown selectedTone={tone} onSelect={setTone} />
        </div>
      </header>

      {/* MAIN INTERFACE */}
      <main className="w-full max-w-7xl mx-auto px-4 mt-8 lg:mt-16 flex-1 flex flex-col justify-center">
        
        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20">
          
          {/* TRANSLATE BUTTON (FLOATING CENTER) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 hidden lg:block">
            <button 
                onClick={handleTranslate} 
                disabled={isTranslating || !sourceText}
                className={`
                    group relative w-24 h-24 rounded-full flex items-center justify-center 
                    backdrop-blur-xl border border-white/10
                    transition-all duration-500
                    ${isTranslating ? 'bg-black/80' : 'bg-black/60 hover:scale-110 hover:border-[#FFD700] hover:shadow-[0_0_60px_rgba(255,215,0,0.3)]'}
                `}
            >
                <div className="absolute inset-0 rounded-full border border-white/5 group-hover:scale-110 transition-transform duration-700"></div>
                <div className="absolute inset-2 rounded-full border border-white/5 group-hover:scale-90 transition-transform duration-700"></div>
                
                 {isTranslating ? (
                   <div className="quantum-loader"></div>
                ) : (
                   <svg className="w-8 h-8 text-white group-hover:text-[#FFD700] transition-colors group-hover:rotate-180 duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                   </svg>
                )}
            </button>
          </div>

          {/* SOURCE CARD */}
          <div className="glass-card rounded-[2rem] p-8 md:p-10 flex flex-col relative group">
             {/* Card Header */}
             <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                 <div className="flex items-center gap-3">
                     <div className="w-2 h-2 bg-[#FFD700] rounded-sm rotate-45"></div>
                     <span className="text-xs jetbrains text-[#FFD700] font-bold uppercase tracking-[0.2em]">Input Source</span>
                 </div>
                 
                 <div className="relative">
                    <select 
                        value={sourceLang} 
                        onChange={(e) => setSourceLang(e.target.value)} 
                        className="bg-transparent text-white/80 text-sm font-bold uppercase tracking-wider outline-none cursor-pointer text-right appearance-none hover:text-[#FFD700] transition-colors pr-6 py-1 select-hide-arrow"
                    >
                        {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-[#0a0a0a] text-white py-2">{l.code === 'auto' && detectedLanguageName ? `${detectedLanguageName}` : l.name}</option>)}
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                 </div>
             </div>

             {/* Text Area */}
             <div className="flex-grow flex flex-col relative min-h-[250px] lg:min-h-[350px]">
                {isEditingSource ? (
                  <textarea 
                    value={sourceText} 
                    onChange={(e) => setSourceText(e.target.value)} 
                    placeholder="Enter text or use voice command..." 
                    className="w-full h-full bg-transparent border-none outline-none text-3xl md:text-4xl text-white placeholder:text-white/10 resize-none font-light leading-snug tracking-wide" 
                    spellCheck="false"
                  />
                ) : (
                  <div 
                    onClick={() => setIsEditingSource(true)} 
                    className="w-full h-full flex flex-wrap content-start gap-x-2 gap-y-1 cursor-text"
                  >
                    {sourceWords.map((word, idx) => (
                      <span
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (word.trim()) speakText(word, sourceLang, 'source', idx);
                        }}
                        className={`text-3xl md:text-4xl font-light leading-snug transition-all duration-200 rounded px-1
                          ${word.trim() ? 'hover:text-[#FFD700] cursor-pointer' : ''}
                          ${highlightedSourceWordIndex === idx ? 'text-[#FFD700] bg-[#FFD700]/10 shadow-[0_0_15px_rgba(255,215,0,0.2)]' : 'text-white/90'}
                        `}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                )}
             </div>

             {/* Card Footer */}
             <div className="mt-6 flex justify-between items-center pt-4">
                 <div className="text-[10px] text-white/20 jetbrains font-bold tracking-widest">{sourceText.length} CHARACTERS</div>
                 <button 
                    onClick={startVoiceInput}
                    className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
                        ${isListening 
                            ? 'bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.4)] animate-pulse' 
                            : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white hover:scale-105'
                        }
                    `}
                 >
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                 </button>
             </div>
          </div>
          
          {/* MOBILE TRANSLATE BUTTON */}
          <div className="flex lg:hidden justify-center -my-6 z-20">
             <button onClick={handleTranslate} className="w-full max-w-xs py-4 bg-[#FFD700] text-black font-bold text-sm tracking-widest uppercase rounded-xl shadow-[0_10px_30px_rgba(255,215,0,0.2)] active:scale-95 transition-transform flex items-center justify-center gap-3">
                 {isTranslating ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div> : <span>Initialize Translation</span>}
             </button>
          </div>

          {/* TARGET CARD */}
          <div className="glass-card rounded-[2rem] p-8 md:p-10 flex flex-col relative group">
             {/* Card Header */}
             <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                 <div className="flex items-center gap-3">
                     <div className="w-2 h-2 bg-[#00F0FF] rounded-sm rotate-45"></div>
                     <span className="text-xs jetbrains text-[#00F0FF] font-bold uppercase tracking-[0.2em]">Output Target</span>
                 </div>
                 <div className="relative">
                    <select 
                        value={targetLang} 
                        onChange={(e) => setTargetLang(e.target.value)} 
                        className="bg-transparent text-white/80 text-sm font-bold uppercase tracking-wider outline-none cursor-pointer text-right appearance-none hover:text-[#00F0FF] transition-colors pr-6 py-1 select-hide-arrow"
                    >
                        {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code} className="bg-[#0a0a0a] text-white py-2">{l.name}</option>)}
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
             </div>

             {/* Text Area */}
             <div className="flex-grow flex flex-col relative min-h-[250px] lg:min-h-[350px]">
                {isTranslating ? (
                    <div className="absolute inset-0 flex items-center justify-center flex-col gap-6">
                        <div className="flex gap-1 h-8 items-end">
                            <div className="w-1.5 bg-[#00F0FF] animate-[pulse_1s_ease-in-out_infinite] h-4"></div>
                            <div className="w-1.5 bg-[#00F0FF] animate-[pulse_1.2s_ease-in-out_infinite] h-8"></div>
                            <div className="w-1.5 bg-[#00F0FF] animate-[pulse_0.8s_ease-in-out_infinite] h-6"></div>
                        </div>
                        <p className="text-[10px] jetbrains text-[#00F0FF] animate-pulse tracking-[0.3em] uppercase">Processing Neural Data</p>
                    </div>
                ) : (
                    <div className="w-full h-full flex flex-wrap content-start gap-x-2 gap-y-1">
                    {targetWords.map((word, idx) => (
                      <span
                        key={idx}
                        onClick={() => {
                          if (word.trim()) speakText(word, targetLang, 'target', idx);
                        }}
                        className={`text-3xl md:text-4xl font-light leading-snug transition-all duration-200 rounded px-1
                          ${word.trim() ? 'hover:text-[#00F0FF] cursor-pointer' : ''}
                          ${highlightedTargetWordIndex === idx ? 'text-[#00F0FF] bg-[#00F0FF]/10 shadow-[0_0_15px_rgba(0,240,255,0.2)]' : 'text-white/90'}
                        `}
                      >
                        {word}
                      </span>
                    ))}
                    {!translatedText && <span className="text-white/10 text-3xl font-light">Target translation output...</span>}
                  </div>
                )}
             </div>

             {/* Card Footer */}
             <div className="mt-6 flex justify-end items-center gap-4 pt-4">
                 <button 
                    onClick={() => speakText(translatedText, targetLang, 'target')}
                    disabled={isSynthesizing || !translatedText}
                    className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
                        ${isSpeaking 
                            ? 'bg-[#FFD700] text-black shadow-[0_0_25px_rgba(255,215,0,0.4)]' 
                            : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white hover:scale-105'
                        }
                    `}
                 >
                     {isSynthesizing ? (
                         <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                     ) : (
                         <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                     )}
                 </button>
                 <button 
                     onClick={startTargetVoiceInput}
                     className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
                        ${isListeningTarget 
                            ? 'bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.4)] animate-pulse' 
                            : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white hover:scale-105'
                        }
                    `}
                 >
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                 </button>
             </div>
          </div>

        </div>

        {/* HISTORY SECTION */}
        <section className="mt-24 lg:mt-32">
             <HistoryList history={history} onClear={() => setHistory([])} onRestore={(item) => { setSourceText(item.sourceText); setTranslatedText(item.translatedText); setSourceLang(item.sourceLang); setTargetLang(item.targetLang); window.scrollTo({top:0, behavior:'smooth'}); }} />
        </section>

      </main>
      
      {showLiveMode && <LiveInterface onClose={() => setShowLiveMode(false)} />}
    </div>
  );
};

export default App;