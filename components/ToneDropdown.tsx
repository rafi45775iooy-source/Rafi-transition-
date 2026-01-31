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
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center gap-3 px-5 py-2.5 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all hover:border-[#FFD700]/30 group"
      >
        <span className="text-lg filter grayscale group-hover:grayscale-0 transition-all">{currentTone.icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-white/80 group-hover:text-white">{currentTone.name}</span>
        <svg className={`w-3 h-3 text-white/30 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-64 neo-glass rounded-2xl p-1.5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 gap-1">
            {TONES.map((tone) => (
              <button 
                key={tone.id} 
                onClick={() => { onSelect(tone.id); setIsOpen(false); }} 
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left group
                   ${selectedTone === tone.id ? 'bg-white/10' : 'hover:bg-white/5'}
                `}
              >
                <span className="text-xl group-hover:scale-110 transition-transform">{tone.icon}</span>
                <div className="flex flex-col min-w-0">
                  <span className={`text-xs font-bold uppercase tracking-wide ${selectedTone === tone.id ? 'text-[#FFD700]' : 'text-white/80'}`}>{tone.name}</span>
                  <span className="text-[9px] text-white/30 truncate">{tone.description}</span>
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