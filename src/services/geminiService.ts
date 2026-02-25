import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, GEMINI_MODEL, Step, FileContent } from "../types";

const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key === "") {
    throw new Error("GEMINI_API_KEY is not set. Please configure it in your environment variables.");
  }
  return new GoogleGenAI({ apiKey: key });
};

export async function processMarketingStep(
  step: Step,
  data: {
    brief?: string;
    extraP1?: string;
    extraP2?: string;
    influencerList?: string;
    selectedAngle?: string;
    userFeedback?: string;
    files?: FileContent[];
  }
) {
  const ai = getAI();
  const parts: any[] = [
    {
      text: `Current Step: ${step}\nData: ${JSON.stringify({ ...data, files: undefined })}`,
    },
  ];

  if (data.files && data.files.length > 0) {
    data.files.forEach((file) => {
      if (file.data) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data,
          },
        });
        parts.push({
          text: `附件檔案內容 (${file.name}) 已包含在上方數據中。`,
        });
      } else if (file.extractedText) {
        parts.push({
          text: `[附件檔案內容: ${file.name}]\n${file.extractedText}`,
        });
      }
    });
  }

  const model = ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: parts,
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
    },
  });

  const response = await model;
  return response.text || "無法產出結果，請檢查輸入內容。";
}

export async function chatWithDirector(
  message: string, 
  history: { role: string; parts: any[] }[],
  files?: FileContent[]
) {
  const ai = getAI();
  const chat = ai.chats.create({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
    history: history,
  });

  const parts: any[] = [{ text: message }];
  if (files && files.length > 0) {
    files.forEach(file => {
      if (file.data) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data
          }
        });
      } else if (file.extractedText) {
        parts.push({
          text: `[附件檔案內容: ${file.name}]\n${file.extractedText}`
        });
      }
    });
  }

  const result = await chat.sendMessage({ message: { parts } as any });
  return result.text || "抱歉，我現在無法回應。";
}
