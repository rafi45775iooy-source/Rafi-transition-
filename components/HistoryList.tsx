
import React from 'react';
import { TranslationHistoryItem } from '../types.ts';
import { LANGUAGES } from '../constants.tsx';

interface HistoryListProps {
  history: TranslationHistoryItem[];
  onClear: () => void;
  onRestore: (item: TranslationHistoryItem) => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ history, onClear, onRestore }) => {
  if (history.length === 0) return null;

  return (
    <div className="animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <div className="w-1 h-8 bg-gold rounded-full"></div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight uppercase">History_Archive</h3>
            <p className="text-[9px] jetbrains text-white/30 tracking-[0.4em] mt-1">Recently_Analyzed</p>
          </div>
        </div>
        <button onClick={onClear} className="px-5 py-2 text-[10px] jetbrains font-bold uppercase text-white/20 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all border border-white/5">Purge</button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {history.map((item) => {
          const sName = LANGUAGES.find(l => l.code === item.sourceLang)?.name || item.detectedLang || 'Auto';
          const tName = LANGUAGES.find(l => l.code === item.targetLang)?.name;
          return (
            <div key={item.id} onClick={() => onRestore(item)} className="group glass-panel p-8 rounded-3xl border-white/5 hover:border-gold/20 cursor-pointer transition-all duration-500">
              <div className="flex items-center gap-3 mb-6">
                 <span className="text-[10px] font-bold text-gold/80 bg-gold/5 px-3 py-1 rounded-lg uppercase tracking-widest border border-gold/10">{sName}</span>
                 <span className="text-white/20 font-bold">→</span>
                 <span className="text-[10px] font-bold text-white/60 bg-white/5 px-3 py-1 rounded-lg uppercase tracking-widest border border-white/5">{tName}</span>
              </div>
              <p className="text-lg font-medium text-white/80 line-clamp-1 group-hover:text-white transition-colors mb-4">{item.sourceText}</p>
              <div className="p-4 bg-black/20 rounded-xl border border-white/5 group-hover:bg-gold/[0.02] transition-all">
                <p className="text-xs text-white/40 italic line-clamp-2 leading-relaxed">{item.translatedText}</p>
              </div>
              <div className="mt-6 flex justify-between items-center opacity-40 group-hover:opacity-100 transition-opacity">
                 <span className="text-[9px] jetbrains font-bold uppercase text-white/40 italic">Tone: {item.tone}</span>
                 <svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryList;
