
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeQRContent = async (content: string) => {
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the following content from a QR code and provide a professional summary in English. 
    Content: "${content}"
    
    Classify the content type (e.g., URL, Text, WiFi credentials, Contact info).
    Determine if it looks potentially harmful (like a phishing link).
    Suggest next steps for the user.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'A short, clear summary of the content.' },
          classification: { type: Type.STRING, description: 'The category of the content.' },
          safetyRating: { 
            type: Type.STRING, 
            description: 'Safe, Warning, or Dangerous' 
          },
          actions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: 'List of recommended actions (e.g., "Open Link", "Copy Text").'
          },
        },
        required: ["summary", "classification", "safetyRating", "actions"]
      }
    }
  });

  try {
    const jsonStr = (response.text || "").trim();
    if (!jsonStr) return null;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    return null;
  }
};
