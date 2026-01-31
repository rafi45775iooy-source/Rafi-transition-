import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import { TranslationResult } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const translateText = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  tone: string
): Promise<TranslationResult> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following text.
    Source: ${sourceLang === 'auto' ? 'Auto-Detect' : sourceLang}
    Target: ${targetLang}
    Tone: ${tone}
    Text: "${text}"`,
    config: {
      systemInstruction: "You are 'Rafi Transition', an elite neural translation engine. Provide high-accuracy translations with the exact requested tone. Return JSON: {translation, detectedLanguage}.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translation: { type: Type.STRING },
          detectedLanguage: { type: Type.STRING },
        },
        required: ["translation", "detectedLanguage"],
      },
    },
  });

  try {
    return JSON.parse(response.text) as TranslationResult;
  } catch (error) {
    return {
      translation: response.text || "System Link Failure",
      detectedLanguage: "Unknown",
    };
  }
};

export const generateGeminiTTS = async (text: string, langCode: string): Promise<string | undefined> => {
  try {
    if (!text || !text.trim()) return undefined;

    // Specific optimization for Bangla (bn)
    // Using 'Kore' as it often provides a stable, clear voice for Asian languages in this model family
    const voiceName = langCode === 'bn' ? 'Kore' : 'Zephyr';
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{
        parts: [{ text: text.trim() }]
      }],
      config: {
        responseModalities: [Modality.AUDIO], 
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    
    if (!base64Audio) {
        return undefined;
    }

    return base64Audio;
  } catch (error) {
    console.warn("Gemini TTS Unavailable (Fallback to System):", error);
    return undefined;
  }
};

export const connectLiveSession = async (
    onMessage: (msg: LiveServerMessage) => void,
    onOpen: () => void,
    onClose: () => void,
    onError: (e: any) => void
) => {
    // Create new instance for Live to ensure clean session
    const liveAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return liveAi.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: "You are Rafi, a multilingual AI assistant. Speak naturally. For Bangla, pronounce words clearly and accurately.",
        },
        callbacks: {
            onopen: onOpen,
            onmessage: onMessage,
            onclose: onClose,
            onerror: onError
        }
    });
};

export function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}
  
export function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}