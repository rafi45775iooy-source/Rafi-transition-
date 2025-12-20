
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TranslationResult } from "../types";

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
    Source Language Requested: ${sourceLang === 'auto' ? 'Detect automatically' : sourceLang}
    Target Language: ${targetLang}
    Desired Tone: ${tone}
    
    Text to translate: "${text}"`,
    config: {
      systemInstruction: "You are 'Rafi Transition', a futuristic high-precision neural translation core. Translate accurately with the requested tone. Return JSON: {translation, detectedLanguage}.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translation: {
            type: Type.STRING,
            description: "Translated text.",
          },
          detectedLanguage: {
            type: Type.STRING,
            description: "Full English name of source language.",
          },
        },
        required: ["translation", "detectedLanguage"],
      },
    },
  });

  try {
    return JSON.parse(response.text) as TranslationResult;
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return {
      translation: response.text || "Neural Link Interrupted",
      detectedLanguage: "Unknown",
    };
  }
};

/**
 * Generates audio using Gemini TTS. 
 * Refined prompt to avoid "non-audio response" errors.
 */
export const generateGeminiTTS = async (text: string, langCode: string): Promise<string | undefined> => {
  try {
    const voiceName = langCode === 'bn' ? 'Kore' : 'Zephyr';
    
    // Explicit instructional prompt helps the model understand it MUST produce audio output.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Please read this text exactly as written: "${text}"` }] }],
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
      throw new Error("No audio payload received from Gemini Neural Core.");
    }
    return base64Audio;
  } catch (error) {
    console.error("Gemini TTS Critical Error:", error);
    return undefined;
  }
};
