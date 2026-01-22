
import { GoogleGenAI, Type, Modality } from "@google/genai";
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

    const voiceName = langCode === 'bn' ? 'Kore' : 'Zephyr';
    
    // Wrapped text in a directive to force the model into "Reading Mode"
    // This prevents the model from trying to converse, which causes "non-audio response" errors.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: `Say this text exactly: "${text}"` }]
      },
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
        console.warn("Gemini TTS: No audio data returned.");
        return undefined;
    }

    return base64Audio;
  } catch (error) {
    console.error("Gemini TTS Failure:", error);
    return undefined;
  }
};
