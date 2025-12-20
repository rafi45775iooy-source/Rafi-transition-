
import React, { useState, useRef, useEffect } from 'react';
import { TONES } from '../constants.tsx';

interface ToneDropdownProps {
  selectedTone: string;
  onSelect: (toneId: string) => void;
}

const ToneDropdown: React.FC<ToneDropdownProps> = ({ selectedTone, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentTone = TONES.find(t => t.id === selectedTone) || TONES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-4 px-6 py-3 bg-transparent text-white rounded-2xl hover:bg-white/5 transition-all active:scale-95 group"
      >
        <span className="text-2xl group-hover:scale-110 transition-transform duration-500">{currentTone.icon}</span>
        <div className="flex flex-col items-start leading-none">
          <span className="text-[8px] jetbrains font-bold uppercase tracking-[0.2em] text-white/20 mb-1">Aura_Set</span>
          <span className="text-[11px] font-black uppercase tracking-tight">{currentTone.name}</span>
        </div>
        <svg className={`w-4 h-4 text-purple-500 transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-72 glass-shard border-white/10 rounded-[2rem] z-[100] p-3 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="px-5 py-3 mb-2 border-b border-white/5">
             <span className="text-[10px] jetbrains font-black uppercase text-purple-500 tracking-[0.3em]">Neural_Profiles</span>
          </div>
          <div className="grid grid-cols-1 gap-1 max-h-[400px] overflow-y-auto pr-1">
            {TONES.map((tone) => (
              <button
                key={tone.id}
                onClick={() => {
                  onSelect(tone.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-4 px-4 py-4 hover:bg-white/5 rounded-2xl transition-all text-left border ${selectedTone === tone.id ? 'bg-purple-500/10 border-purple-500/20' : 'border-transparent'}`}
              >
                <div className="w-11 h-11 bg-white/5 rounded-xl flex items-center justify-center text-xl shrink-0">
                  {tone.icon}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-bold text-white tracking-tight">{tone.name}</span>
                  <span className="text-[9px] text-white/30 font-bold truncate mt-0.5 uppercase tracking-tighter">{tone.description}</span>
                </div>
                {selectedTone === tone.id && (
                  <div className="ml-auto w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)]"></div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToneDropdown;
