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
    <div className="w-full animate-in fade-in slide-in-from-bottom-10 duration-1000">
      <div className="flex items-end justify-between mb-8 px-2">
         <div>
             <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                 <span className="w-2 h-2 bg-[#FFD700] rounded-full animate-pulse"></span>
                 Memory Archive
             </h3>
         </div>
        <button
          onClick={onClear}
          className="text-[10px] font-bold uppercase text-white/20 hover:text-red-400 transition-colors jetbrains"
        >
          [ Clear Data ]
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {history.map((item) => {
          const sName = LANGUAGES.find(l => l.code === item.sourceLang)?.name || item.detectedLang || 'Auto';
          const tName = LANGUAGES.find(l => l.code === item.targetLang)?.name;
          
          return (
            <div
              key={item.id}
              onClick={() => onRestore(item)}
              className="group relative bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-[#FFD700]/20 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:-translate-y-1"
            >
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                    <span>{sName}</span>
                    <span className="text-white/10">→</span>
                    <span className="text-[#FFD700]/80">{tName}</span>
                 </div>
                 <span className="text-[9px] jetbrains text-white/10">{new Date(item.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
              </div>

              <div className="space-y-2">
                <p className="text-white/90 text-sm line-clamp-1 font-medium group-hover:text-[#FFD700] transition-colors">{item.sourceText}</p>
                <p className="text-white/50 text-sm line-clamp-2 font-light">{item.translatedText}</p>
              </div>

              <div className="absolute inset-0 border border-transparent group-hover:border-[#FFD700]/10 rounded-2xl pointer-events-none transition-all"></div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryList;