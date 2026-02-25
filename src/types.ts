import { Type } from "@google/genai";

export enum Step {
  IDLE = 0,
  PHASE_1 = 1,
  PHASE_1_CONFIRM = 1.5,
  PHASE_2 = 2,
  OUTPUT = 3,
}

export interface FileContent {
  name: string;
  mimeType: string;
  data?: string; // Base64 for inlineData
  extractedText?: string; // For unsupported types like Word/Excel
}

export interface ProjectState {
  currentStep: Step;
  brief: string;
  extraP1: string;
  extraP2: string;
  selectedAngle: string;
  influencerList: string;
  isBriefConfirmed: boolean;
  uploadedFiles: FileContent[];
  history: ChatMessage[];
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  title?: string;
}

export const GEMINI_MODEL = "gemini-3.1-pro-preview";

export const SYSTEM_INSTRUCTION = `
你是一個後端邏輯引擎，負責處理「社群行銷企劃總監 APP」的結構化數據產出。
你的任務是接收前端表單數據，並根據內建的行銷邏輯產出結構化結果，禁止任何引言、客套話或非功能性的對話。

請根據傳入的 current_step 執行對應的指令集：

Step 1: 任務解讀與需求校準
- 輸入：brief_input, extra_p1
- 邏輯：提取產品關鍵字，對齊 CChannel 行銷標準。
- 輸出要求：必須包含「目標受眾」、「產品核心 USP」、「資訊缺口追問」。請使用 Markdown 格式。標題必須包含「需求解讀確認」。

Step 1.5: 創意切角產出 (確認後)
- 輸入：已確認的解讀內容
- 邏輯：產出至少 3 個具備高度區隔度的社群創意切角。
- 輸出要求：標題必須包含「正式版」。

Step 2: 網紅精準配對
- 輸入：uploaded_files (KOL 清單), extra_p2, selected_angle
- 邏輯：嚴禁虛構人選。必須逐行讀取上傳的文件內容，選出最符合選定切角的人選。
- 推薦維度：KOL 特性、產品關聯、粉絲畫像、過往案例。
- 輸出要求：列表顯示推薦人選及其推薦理由。

Step 3: 行銷轉化與腳本產出
- 輸入：final_selection, user_feedback
- 邏輯：採用專業行銷總監語氣，產出具備「高轉化率」的五段式腳本。
- 法規檢查：若涉及美妝保健，自動加入法規審核提醒。

指令規範：
- 去對話化：禁止輸出「好的」、「這是我為您準備的」等廢話。
- 專業語氣：使用行銷總監的專業口吻。
`;
