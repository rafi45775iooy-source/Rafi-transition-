import React, { useEffect, useRef, useState } from 'react';
import { connectLiveSession, base64ToUint8Array, floatTo16BitPCM } from '../geminiService';
import { LiveServerMessage } from '@google/genai';

interface LiveInterfaceProps {
  onClose: () => void;
}

const LiveInterface: React.FC<LiveInterfaceProps> = ({ onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'listening' | 'speaking' | 'error'>('connecting');
  const [volume, setVolume] = useState(0); 
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const sessionRef = useRef<Promise<any> | null>(null);

  const cleanup = () => {
      if(mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if(audioContextRef.current) {
          audioContextRef.current.close();
      }
      if(processorRef.current) {
          processorRef.current.disconnect();
      }
      audioQueueRef.current = [];
  };

  const initSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const sessionPromise = connectLiveSession(
          async (msg: LiveServerMessage) => {
              const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audioData && audioContextRef.current) {
                  setStatus('speaking');
                  const ctx = audioContextRef.current;
                  const audioBytes = base64ToUint8Array(audioData);
                  const dataInt16 = new Int16Array(audioBytes.buffer);
                  
                  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
                  const channelData = buffer.getChannelData(0);
                  for(let i=0; i<dataInt16.length; i++) {
                      channelData[i] = dataInt16[i] / 32768.0;
                  }

                  const source = ctx.createBufferSource();
                  source.buffer = buffer;
                  source.connect(ctx.destination);
                  
                  const now = ctx.currentTime;
                  const start = Math.max(now, nextStartTimeRef.current);
                  source.start(start);
                  nextStartTimeRef.current = start + buffer.duration;
                  
                  audioQueueRef.current.push(source);
                  
                  source.onended = () => {
                      if(ctx.currentTime >= nextStartTimeRef.current - 0.1) {
                          setStatus('listening');
                      }
                  };
              }
              
              if (msg.serverContent?.interrupted) {
                  audioQueueRef.current.forEach(s => s.stop());
                  audioQueueRef.current = [];
                  nextStartTimeRef.current = 0;
                  setStatus('listening');
              }
          },
          () => {
             setStatus('listening');
             setupAudioInput(stream, sessionPromise);
          },
          () => console.log('Live Closed'),
          (e) => { console.error('Live Error', e); setStatus('error'); }
      );
      sessionRef.current = sessionPromise;

    } catch (e) {
      console.error("Failed to init live", e);
      setStatus('error');
    }
  };

  const setupAudioInput = (stream: MediaStream, sessionPromise: Promise<any>) => {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
           const inputData = e.inputBuffer.getChannelData(0);
           let sum = 0;
           for(let i=0; i<inputData.length; i+=10) sum += Math.abs(inputData[i]);
           setVolume(Math.min(100, (sum / (inputData.length/10)) * 500));

           const pcm16 = floatTo16BitPCM(inputData);
           let binary = '';
           const bytes = new Uint8Array(pcm16);
           const len = bytes.byteLength;
           for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(bytes[i]);
           }
           const base64 = btoa(binary);

           sessionPromise.then(session => {
               session.sendRealtimeInput({
                   media: {
                       mimeType: 'audio/pcm;rate=16000',
                       data: base64
                   }
               });
           });
      };
      
      source.connect(processor);
      processor.connect(inputCtx.destination);
      processorRef.current = processor;
  };

  useEffect(() => {
    initSession();
    return cleanup;
  }, []);

  return (
    <div className="fixed inset-0 bg-[#050505]/95 z-50 flex flex-col items-center justify-center animate-fade-in backdrop-blur-3xl">
        <button 
            onClick={onClose}
            className="absolute top-8 right-8 p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all z-10 border border-white/5 hover:rotate-90 duration-300"
        >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="relative">
            {/* Visualizer Orb */}
            <div 
                className={`w-80 h-80 rounded-full filter blur-[60px] transition-all duration-100 ease-out opacity-80 ${
                    status === 'speaking' ? 'bg-[#00F0FF]' : 
                    status === 'error' ? 'bg-red-500' :
                    'bg-[#FFD700]'
                }`}
                style={{
                    transform: `scale(${0.6 + volume/100})`
                }}
            />
            
            <div className="absolute inset-0 flex items-center justify-center">
                 <div className={`w-40 h-40 rounded-full border border-white/10 backdrop-blur-sm flex items-center justify-center ${status === 'connecting' ? 'animate-pulse' : ''}`}>
                    {status === 'connecting' && <div className="w-12 h-12 border-2 border-white/50 border-t-transparent rounded-full animate-spin"></div>}
                 </div>
            </div>
        </div>

        <div className="mt-20 text-center space-y-4 z-10">
            <h2 className="text-5xl font-light text-white tracking-tighter">
                {status === 'connecting' ? 'INITIALIZING' : 
                 status === 'listening' ? 'LISTENING' :
                 status === 'speaking' ? 'TRANSMITTING' : 'SIGNAL LOST'}
            </h2>
            <div className="flex items-center justify-center gap-3">
                 <span className={`w-2 h-2 rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
                 <p className="text-white/40 jetbrains text-xs uppercase tracking-[0.3em]">
                    Live Neural Connection Active
                 </p>
            </div>
        </div>
    </div>
  );
};

export default LiveInterface;