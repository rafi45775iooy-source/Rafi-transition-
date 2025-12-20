
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
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-4 px-6 py-3 glass-panel rounded-2xl hover:border-gold/40 transition-all border-white/5 active:scale-95 group">
        <span className="text-xl">{currentTone.icon}</span>
        <div className="flex flex-col items-start">
          <span className="text-[8px] jetbrains font-bold uppercase tracking-[0.2em] text-white/20 mb-1">Tone</span>
          <span className="text-[11px] font-black uppercase tracking-widest">{currentTone.name}</span>
        </div>
        <svg className={`w-4 h-4 text-gold transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-72 glass-panel border-gold/10 rounded-3xl z-[100] p-2 animate-in fade-in zoom-in-95 duration-300">
          <div className="grid grid-cols-1 gap-1">
            {TONES.map((tone) => (
              <button key={tone.id} onClick={() => { onSelect(tone.id); setIsOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-3 hover:bg-gold/5 rounded-2xl transition-all text-left ${selectedTone === tone.id ? 'bg-gold/10 border-gold/20' : 'border-transparent'}`}>
                <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center text-xl shrink-0">{tone.icon}</div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-bold text-white tracking-tight">{tone.name}</span>
                  <span className="text-[9px] text-white/30 truncate uppercase tracking-tighter">{tone.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToneDropdown;
