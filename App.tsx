
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
      <header className="p-8 flex justify-between items-center max-w-7xl mx-auto border-b border-white/5 backdrop-blur-sm sticky top-0 z-50 bg-black/40">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gold/10 border border-gold/20 rounded-lg flex items-center justify-center relative overflow-hidden">
             <div className="absolute inset-0 bg-gold/10 animate-pulse"></div>
            <svg className="w-5 h-5 text-gold relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight gradient-text uppercase leading-none">Rafi_Transition</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1 h-1 rounded-full bg-green-500"></span>
              <p className="text-[9px] jetbrains tracking-[0.2em] text-white/40 uppercase">System_Online</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ToneDropdown selectedTone={tone} onSelect={setTone} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-12 space-y-16">
        
        {/* Main Interface Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-12 items-start relative">
          
          {/* Neural Link Decorator (Desktop) */}
          <div className="hidden lg:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-gold/10 to-transparent -z-10"></div>
          
          {/* Source Section */}
          <div className={`transition-all duration-500 flex flex-col gap-4 ${!isEditingSource ? 'opacity-60 grayscale-[50%]' : ''}`}>
             <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gold/50 rounded-full"></div>
                  <span className="text-[10px] jetbrains font-bold uppercase tracking-[0.2em] text-white/40">Input_Stream</span>
                </div>
                <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="bg-white/5 hover:bg-white/10 text-gold text-xs border border-white/5 rounded-lg px-3 py-1 outline-none font-bold uppercase tracking-widest cursor-pointer transition-colors appearance-none text-center min-w-[100px]">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-neutral-900">{l.code === 'auto' && detectedLanguageName ? `${detectedLanguageName}` : l.name}</option>)}
                </select>
              </div>

              <div className="glass-panel p-8 rounded-[2rem] min-h-[400px] relative border-gold/5 group gold-border-glow flex flex-col">
                {isEditingSource ? (
                  <textarea 
                    value={sourceText} 
                    onChange={(e) => setSourceText(e.target.value)} 
                    placeholder="ENTER_DATA..." 
                    className="w-full flex-grow bg-transparent border-none outline-none text-3xl font-medium leading-relaxed placeholder:text-white/5 text-white resize-none" 
                  />
                ) : (
                  <div 
                    onClick={() => setIsEditingSource(true)} 
                    className="flex flex-wrap gap-1 content-start cursor-text flex-grow"
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
                
                <div className="mt-auto pt-8 flex justify-between items-end border-t border-white/5">
                   <div className="text-[9px] jetbrains text-white/20">CHARS: {sourceText.length}</div>
                   <button onClick={startVoiceInput} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse' : 'bg-white/5 text-white/40 hover:text-gold hover:bg-gold/10'}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>
                </div>
              </div>
          </div>

          {/* Central Control Unit */}
          <div className="flex flex-col items-center justify-center h-full gap-6 lg:pt-32 z-10">
             <button onClick={handleTranslate} disabled={isTranslating || !sourceText} className={`group relative w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-300 ${isTranslating ? 'bg-gold/10 cursor-wait' : 'bg-gold hover:scale-110 shadow-[0_0_30px_rgba(212,175,55,0.3)]'}`}>
                {isTranslating ? (
                   <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
                ) : (
                   <svg className="w-8 h-8 text-black transition-transform duration-500 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                )}
             </button>
             
             {isTranslating && (
                <div className="hidden lg:flex flex-col items-center gap-2">
                   <span className="w-0.5 h-8 bg-gradient-to-b from-gold/50 to-transparent"></span>
                   <span className="text-[9px] jetbrains text-gold animate-pulse tracking-widest">SYNCING</span>
                </div>
             )}
          </div>

          {/* Target Section */}
          <div className={`transition-all duration-700 flex flex-col gap-4 ${translatedText || isTranslating ? 'opacity-100 translate-x-0' : 'opacity-50 lg:translate-x-10 grayscale'}`}>
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full"></div>
                   <span className="text-[10px] jetbrains font-bold uppercase tracking-[0.2em] text-white/40">Target_Stream</span>
                </div>
                <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="bg-white/5 hover:bg-white/10 text-white text-xs border border-white/5 rounded-lg px-3 py-1 outline-none font-bold uppercase tracking-widest cursor-pointer transition-colors appearance-none text-center min-w-[100px]">
                  {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code} className="bg-neutral-900">{l.name}</option>)}
                </select>
              </div>

              <div className="glass-panel p-8 rounded-[2rem] min-h-[400px] relative border-gold/5 group gold-border-glow flex flex-col">
                {isTranslating ? (
                  <div className="flex flex-col items-center justify-center flex-grow gap-6">
                    <div className="relative w-full max-w-[100px] h-1 bg-white/5 rounded-full overflow-hidden">
                       <div className="absolute inset-y-0 left-0 bg-gold w-1/3 animate-[flow_1s_ease-in-out_infinite]"></div>
                    </div>
                    <p className="text-[10px] jetbrains text-gold/40 animate-pulse tracking-[0.5em] uppercase">Processing_Matrix...</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 content-start flex-grow">
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
                
                <div className="mt-auto pt-8 flex justify-end gap-3 border-t border-white/5">
                  <button onClick={() => speakText(translatedText, targetLang, 'target')} disabled={isSynthesizing} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border border-white/5 ${isSpeaking ? 'bg-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]' : 'bg-white/5 text-white/40 hover:text-gold hover:bg-gold/10'}`}>
                    {isSynthesizing ? <span className="text-[8px] jetbrains font-black animate-pulse">AI</span> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                  </button>
                  <button onClick={startTargetVoiceInput} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border border-white/5 ${isListeningTarget ? 'bg-red-500 shadow-xl animate-pulse' : 'bg-white/5 text-white/40 hover:text-gold hover:bg-gold/10'}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>
                </div>
              </div>
          </div>

        </div>

        {/* History Section */}
        <section className="pt-24 pb-20 border-t border-white/5">
          <HistoryList history={history} onClear={() => setHistory([])} onRestore={(item) => { setSourceText(item.sourceText); setTranslatedText(item.translatedText); setSourceLang(item.sourceLang); setTargetLang(item.targetLang); window.scrollTo({top:0, behavior:'smooth'}); }} />
        </section>
      </main>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 glass-panel p-2 rounded-2xl flex items-center gap-4 border-gold/10 z-50">
        <div className="px-6 py-3 bg-black/40 rounded-xl flex items-center gap-4">
           <span className={`w-2 h-2 rounded-full ${isTranslating || isSpeaking || isListening ? 'bg-gold animate-ping' : 'bg-white/10'}`}></span>
           <span className="text-[10px] font-bold jetbrains uppercase tracking-[0.2em] text-white/40">
             Core_Status: {isTranslating ? 'Linking...' : isSpeaking ? 'Audio_Output' : isListening ? 'Acquiring_Signal' : 'Standby'}
           </span>
        </div>
      </div>
    </div>
  );
};

export default App;
