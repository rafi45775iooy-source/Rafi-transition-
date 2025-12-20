
import React from 'react';
import { TranslationHistoryItem } from '../types';
import { LANGUAGES } from '../constants.tsx';

interface HistoryListProps {
  history: TranslationHistoryItem[];
  onClear: () => void;
  onRestore: (item: TranslationHistoryItem) => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ history, onClear, onRestore }) => {
  if (history.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-10 bg-purple-500 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]"></div>
          <div>
            <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Signal_Archive</h3>
            <p className="text-[9px] jetbrains text-white/30 font-bold uppercase tracking-[0.4em] mt-1">Recently_Cached_Traces</p>
          </div>
        </div>
        <button
          onClick={onClear}
          className="px-6 py-2.5 text-[10px] jetbrains font-black uppercase text-white/20 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all border border-white/5"
        >
          Purge_Matrix
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {history.map((item) => {
          const sName = LANGUAGES.find(l => l.code === item.sourceLang)?.name || item.detectedLang || 'Auto';
          const tName = LANGUAGES.find(l => l.code === item.targetLang)?.name;
          
          return (
            <div
              key={item.id}
              onClick={() => onRestore(item)}
              className="group relative glass-shard p-8 rounded-[2rem] border-white/5 hover:border-purple-500/30 cursor-pointer transition-all duration-500 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]"
            >
              <div className="absolute top-8 right-8 text-[8px] jetbrains font-bold text-white/10 uppercase tracking-widest group-hover:text-purple-500/30">
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              <div className="flex items-center gap-3 mb-6">
                 <span className="text-[9px] font-black text-purple-400/80 bg-purple-400/10 px-3 py-1 rounded-lg uppercase tracking-widest border border-purple-400/10">
                    {sName}
                  </span>
                  <div className="w-4 h-[1px] bg-white/10"></div>
                  <span className="text-[9px] font-black text-rose-400/80 bg-rose-400/10 px-3 py-1 rounded-lg uppercase tracking-widest border border-rose-400/10">
                    {tName}
                  </span>
              </div>

              <div className="space-y-4">
                <p className="text-xl font-semibold text-white/80 line-clamp-1 group-hover:text-white transition-colors">{item.sourceText}</p>
                <div className="p-5 bg-white/[0.02] rounded-2xl border border-white/5 group-hover:bg-purple-500/[0.02] transition-all">
                  <p className="text-sm text-white/40 italic line-clamp-2 leading-relaxed font-medium">{item.translatedText}</p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                 <span className="text-[9px] jetbrains font-bold uppercase text-white/20 italic">Aura: {item.tone}</span>
                 <div className="flex items-center gap-2 text-purple-400 font-black text-[10px] uppercase tracking-tighter">
                   Restore_Trace
                   <svg className="w-4 h-4 bg-purple-500 text-slate-950 rounded-full p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                 </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryList;
