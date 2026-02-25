import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Briefcase, 
  Brain, 
  ArrowRight, 
  ArrowUp, 
  Copy, 
  History,
  Paperclip,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import { Step, ProjectState, FileContent } from "./types";
import { processMarketingStep, chatWithDirector } from "./services/geminiService";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [state, setState] = useState<ProjectState>({
    currentStep: Step.IDLE,
    brief: "",
    extraP1: "",
    extraP2: "",
    selectedAngle: "",
    influencerList: "",
    isBriefConfirmed: false,
    uploadedFiles: [],
    history: [],
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [progress, setProgress] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<FileContent[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev;
          const increment = prev < 60 ? 5 : (prev < 85 ? 2 : 0.5);
          return Math.min(prev + increment, 98);
        });
      }, 200);
    } else {
      setProgress(100);
      const timeout = setTimeout(() => setProgress(0), 500);
      return () => clearTimeout(timeout);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [state.history]);

  const handleStart = () => setState(prev => ({ ...prev, currentStep: Step.PHASE_1 }));

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isChat: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      let fileContent: FileContent;
      const mimeType = file.type || "application/octet-stream";
      const isSupportedInline = [
        "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif",
        "application/pdf"
      ].includes(mimeType);

      if (isSupportedInline) {
        const base64 = await readFileAsBase64(file);
        fileContent = {
          name: file.name,
          mimeType: mimeType,
          data: base64,
        };
      } else {
        // Extract text for unsupported types
        let extractedText = "";
        const arrayBuffer = await file.arrayBuffer();

        if (mimeType.includes("wordprocessingml") || file.name.endsWith(".docx")) {
          const result = await mammoth.extractRawText({ arrayBuffer });
          extractedText = result.value;
        } else if (mimeType.includes("spreadsheetml") || file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv")) {
          const workbook = XLSX.read(arrayBuffer);
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          extractedText = XLSX.utils.sheet_to_txt(worksheet);
        } else if (file.name.endsWith(".txt")) {
          extractedText = await file.text();
        } else {
          // Fallback to text if possible, or warn
          extractedText = await file.text();
        }

        fileContent = {
          name: file.name,
          mimeType: mimeType,
          extractedText: extractedText,
        };
      }

      if (isChat) {
        setPendingFiles(prev => [...prev, fileContent]);
      } else {
        setState(prev => ({
          ...prev,
          uploadedFiles: [...prev.uploadedFiles, fileContent],
          brief: prev.brief + `\n[已讀取附件: ${file.name}]`
        }));
      }
    } catch (error) {
      console.error("File read error:", error);
      alert("檔案讀取或解析失敗");
    } finally {
      setLoading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleProcessStep1 = async () => {
    if (!state.brief && state.uploadedFiles.length === 0) return alert("請輸入專案內容或上傳附件");
    setLoading(true);
    try {
      const result = await processMarketingStep(Step.PHASE_1, {
        brief: state.brief,
        extraP1: state.extraP1,
        files: state.uploadedFiles,
      });
      setState(prev => ({
        ...prev,
        currentStep: Step.OUTPUT,
        history: [...prev.history, { role: "model", content: result, title: "需求解讀確認 (校準中)" }]
      }));
    } catch (error) {
      console.error(error);
      alert("產出失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBrief = async () => {
    setLoading(true);
    try {
      const result = await processMarketingStep(Step.PHASE_1_CONFIRM as any, {
        brief: state.brief,
        extraP1: state.extraP1,
        files: state.uploadedFiles,
      });
      setState(prev => ({
        ...prev,
        isBriefConfirmed: true,
        history: [...prev.history, { role: "model", content: result, title: "創意切角提案 (正式版)" }]
      }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessStep2 = async () => {
    if (!state.influencerList) return alert("請提供網紅名單內容");
    setLoading(true);
    try {
      const result = await processMarketingStep(Step.PHASE_2, {
        influencerList: state.influencerList,
        extraP2: state.extraP2,
        selectedAngle: state.selectedAngle || "預設切角",
        files: state.uploadedFiles,
      });
      setState(prev => ({
        ...prev,
        currentStep: Step.OUTPUT,
        history: [...prev.history, { role: "model", content: result, title: "階段 2: 網紅精準配對結果" }]
      }));
    } catch (error) {
      console.error(error);
      alert("配對失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!userInput.trim() && pendingFiles.length === 0) return;
    const msg = userInput;
    const files = [...pendingFiles];
    setUserInput("");
    setPendingFiles([]);
    
    const displayMsg = msg + (files.length > 0 ? `\n[附件: ${files.map(f => f.name).join(", ")}]` : "");
    const newHistory = [...state.history, { role: "user" as const, content: displayMsg }];
    setState(prev => ({ ...prev, history: newHistory }));

    setLoading(true);
    try {
      const geminiHistory = newHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.content }]
      }));
      const result = await chatWithDirector(msg, geminiHistory, files);
      setState(prev => ({
        ...prev,
        history: [...prev.history, { role: "model", content: result, title: "行銷總監回饋" }]
      }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const isApiKeyMissing = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {isApiKeyMissing && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
          <Sparkles size={14} className="text-amber-500" />
          未偵測到 API Key，請在環境變數中設定 GEMINI_API_KEY
        </div>
      )}
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: sidebarOpen ? (window.innerWidth < 768 ? "85%" : 288) : 0, 
          padding: sidebarOpen ? 24 : 0,
          x: sidebarOpen ? 0 : -288
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={cn(
          "glass-sidebar h-full flex flex-col z-30 overflow-hidden fixed md:relative",
          !sidebarOpen && "pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between mb-10 min-w-[240px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Sparkles size={20} />
            </div>
            <span className="font-bold text-xl tracking-tight">企劃總監 v3</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-black transition">
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="space-y-6 min-w-[240px]">
          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-black text-white rounded-2xl py-3.5 flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus size={18} /> 新發起專案
          </button>
          
          <div className="space-y-1">
            <p className="px-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">專案紀錄</p>
            {state.history.length > 0 && (
              <div className="ios-card p-4 cursor-pointer hover:bg-white/50 border-none transition group">
                <div className="flex items-center gap-2 mb-1">
                  <History size={12} className="text-gray-400" />
                  <p className="text-xs font-semibold truncate">當前進行中專案</p>
                </div>
                <p className="text-[10px] text-gray-400">正在編輯...</p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative h-full">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-6 py-4 border-b border-black/5 bg-white/80 backdrop-blur-xl z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center text-white">
              <Sparkles size={16} />
            </div>
            <span className="font-bold text-lg">企劃總監</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <Plus size={20} />
          </button>
        </div>

        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="hidden md:flex fixed left-6 top-8 z-40 w-10 h-10 bg-white rounded-full shadow-md items-center justify-center text-gray-400 hover:text-black transition"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* Header / Stepper */}
        {state.currentStep !== Step.IDLE && (
          <div className="px-6 md:px-10 pt-6 md:pt-8 pb-4 bg-white/80 backdrop-blur-md z-10">
            <div className="flex gap-2 md:gap-4 mb-2">
              {[1, 2, 3].map((s) => (
                <div 
                  key={s} 
                  className={cn(
                    "h-1 md:h-1.5 rounded-full flex-1 transition-all duration-500",
                    s <= (state.currentStep === Step.OUTPUT ? 3 : state.currentStep) ? "bg-black" : "bg-[#E5E5EA]"
                  )} 
                />
              ))}
            </div>
            <div className="flex justify-between px-1">
              <div className={cn("text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-colors", state.currentStep === Step.PHASE_1 ? "text-black" : "text-gray-400")}>1. 需求解讀</div>
              <div className={cn("text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-colors", state.currentStep === Step.PHASE_2 ? "text-black" : "text-gray-400")}>2. 網紅配對</div>
              <div className={cn("text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-colors", state.currentStep === Step.OUTPUT ? "text-black" : "text-gray-400")}>3. 專業腳本</div>
            </div>
          </div>
        )}

        <div ref={viewportRef} className="flex-1 overflow-y-auto px-6 md:px-10 pb-40 no-scrollbar">
          <AnimatePresence mode="wait">
            {state.currentStep === Step.IDLE && (
              <motion.section
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto py-20 text-center"
              >
                <h1 className="text-6xl font-extrabold mb-8 tracking-tighter">智能企劃總監</h1>
                <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">整合需求解讀、名單篩選與腳本產出。確保每一個步驟都與您的創意目標對焦。</p>
                <button 
                  onClick={handleStart}
                  className="bg-black text-white px-12 py-4 rounded-2xl text-lg font-semibold shadow-xl hover:scale-105 active:scale-95 transition flex items-center mx-auto gap-3"
                >
                  進入解讀環節 <ArrowRight size={20} />
                </button>
              </motion.section>
            )}

            {state.currentStep === Step.PHASE_1 && (
              <motion.section
                key="phase1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-2xl mx-auto pt-4 space-y-6 md:space-y-8"
              >
                <div className="px-1">
                  <h3 className="text-2xl md:text-3xl font-bold mb-2">步驟 1.1：需求單解讀</h3>
                  <p className="text-gray-400 font-medium italic text-sm md:text-base">「磨刀不誤砍柴工，先與 AI 對齊您的核心 Brief。」</p>
                </div>
                <div className="space-y-4 md:space-y-6">
                  <div className="ios-card p-5 md:p-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                      <label className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest text-gray-400">上傳需求單或輸入 Brief</label>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-bold text-black bg-white px-3 py-1.5 rounded-full shadow-sm hover:shadow-md transition-all"
                      >
                        <Paperclip size={12} /> 上傳附件
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".doc,.docx,.ppt,.pptx,.xls,.xlsx,.pdf"
                        onChange={(e) => handleFileUpload(e, false)}
                      />
                    </div>
                    <textarea 
                      value={state.brief}
                      onChange={(e) => setState(prev => ({ ...prev, brief: e.target.value }))}
                      className="w-full bg-transparent border-none focus:ring-0 text-base md:text-lg placeholder:text-gray-300 min-h-[140px] md:min-h-[160px] resize-none" 
                      placeholder="輸入產品描述、目標受眾或必提關鍵字..."
                    />
                  </div>
                  <div className="ios-card p-5 md:p-8">
                    <label className="block text-[10px] md:text-[11px] font-bold mb-4 uppercase tracking-widest text-gray-400">使用者補充說明 (階段 1)</label>
                    <textarea 
                      value={state.extraP1}
                      onChange={(e) => setState(prev => ({ ...prev, extraP1: e.target.value }))}
                      className="w-full bg-transparent border-none focus:ring-0 text-xs md:text-sm italic min-h-[70px] md:min-h-[80px] resize-none" 
                      placeholder="任何變數或特定需求，例如：避開競品關鍵字..."
                    />
                  </div>
                  <button 
                    onClick={handleProcessStep1}
                    disabled={loading}
                    className="w-full bg-black text-white rounded-2xl py-3.5 md:py-4 font-bold shadow-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? "處理中..." : "開始解讀需求"}
                  </button>
                </div>
              </motion.section>
            )}

            {state.currentStep === Step.PHASE_2 && (
              <motion.section
                key="phase2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-2xl mx-auto pt-4 space-y-8"
              >
                <div>
                  <h3 className="text-3xl font-bold mb-2">網紅精準配對</h3>
                  <p className="text-gray-400">請提供網紅名單內容，系統將根據切角進行四維度匹配。</p>
                </div>
                <div className="space-y-6">
                  <div className="ios-card p-8 border-2 border-dashed border-black/10 hover:border-black/30 transition-all">
                    <label className="block text-[11px] font-bold mb-4 uppercase tracking-widest text-gray-400">網紅名單 (請貼上文字內容)</label>
                    <textarea 
                      value={state.influencerList}
                      onChange={(e) => setState(prev => ({ ...prev, influencerList: e.target.value }))}
                      className="w-full bg-transparent border-none focus:ring-0 text-sm min-h-[200px] resize-none" 
                      placeholder="請貼上 KOL 名稱、特性、粉絲數等資訊..."
                    />
                  </div>
                  <div className="ios-card p-8">
                    <label className="block text-[11px] font-bold mb-4 uppercase tracking-widest text-gray-400">選定切角</label>
                    <input 
                      type="text"
                      value={state.selectedAngle}
                      onChange={(e) => setState(prev => ({ ...prev, selectedAngle: e.target.value }))}
                      className="w-full bg-transparent border-none focus:ring-0 text-base" 
                      placeholder="例如：切角 A: 質感生活開箱"
                    />
                  </div>
                  <div className="ios-card p-8">
                    <label className="block text-[11px] font-bold mb-4 uppercase tracking-widest text-gray-400">使用者補充說明 (階段 2)</label>
                    <textarea 
                      value={state.extraP2}
                      onChange={(e) => setState(prev => ({ ...prev, extraP2: e.target.value }))}
                      className="w-full bg-transparent border-none focus:ring-0 text-sm italic min-h-[80px] resize-none" 
                      placeholder="例如：指定優先合作名單、指定排除名單..."
                    />
                  </div>
                  <button 
                    onClick={handleProcessStep2}
                    disabled={loading}
                    className="w-full bg-black text-white rounded-2xl py-4 font-bold shadow-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? "處理中..." : "執行網紅配對"}
                  </button>
                </div>
              </motion.section>
            )}

            {state.currentStep === Step.OUTPUT && (
              <motion.section
                key="output"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-3xl mx-auto pt-4 space-y-6"
              >
                {state.history.map((msg, i) => (
                  <div key={i} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.role === "model" ? (
                      <div className="ios-card p-8 bg-[#F2F2F7]/60 w-full relative mb-6">
                        <div className="flex justify-between items-center mb-6">
                          <span className="text-[10px] font-bold bg-black text-white px-3 py-1 rounded-full uppercase tracking-tighter">
                            {msg.title || "AI 回應"}
                          </span>
                          <button 
                            onClick={() => copyToClipboard(msg.content)} 
                            className="text-gray-400 hover:text-black transition"
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                        <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                        
                        {i === state.history.length - 1 && msg.title?.includes("需求解讀確認") && !state.isBriefConfirmed && (
                          <div className="mt-8 flex items-center gap-3 p-4 bg-white rounded-2xl border border-black/5 shadow-sm">
                            <input 
                              type="checkbox" 
                              id="confirm-brief" 
                              className="ios-checkbox" 
                              checked={state.isBriefConfirmed}
                              onChange={(e) => {
                                if (e.target.checked) handleConfirmBrief();
                              }}
                            />
                            <label htmlFor="confirm-brief" className="text-xs font-bold text-gray-700 cursor-pointer">
                              我已確認解讀內容無誤，進入「創意切角產出」
                            </label>
                          </div>
                        )}

                        {i === state.history.length - 1 && msg.title?.includes("正式版") && (
                          <button 
                            onClick={() => setState(prev => ({ ...prev, currentStep: Step.PHASE_2 }))}
                            className="mt-8 w-full bg-black text-white rounded-2xl py-4 font-bold shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
                          >
                            進入階段 2: 網紅配對 <ArrowRight size={18} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="bg-black text-white px-5 py-3 rounded-2xl rounded-tr-none text-sm shadow-xl max-w-[80%] mb-6">
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start mb-6">
                    <div className="ios-card p-4 bg-[#F2F2F7]/60 flex items-center gap-3">
                      <div className="w-2 h-2 bg-black rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Chat Bar */}
        {state.currentStep !== Step.IDLE && (
          <div className={cn(
            "fixed bottom-6 md:bottom-10 transform -translate-x-1/2 w-full max-w-2xl px-4 md:px-6 transition-all duration-500 z-40",
            sidebarOpen ? "left-1/2 md:left-[calc(50%+144px)]" : "left-1/2"
          )}>
            {pendingFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 px-4">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="bg-black/5 backdrop-blur-md border border-black/5 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2">
                    <Paperclip size={10} /> {f.name}
                    <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white/90 backdrop-blur-2xl border-2 border-black/5 rounded-[32px] p-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_6px_-1px_rgba(0,0,0,0.1)] flex items-center gap-2">
              <button 
                onClick={() => chatFileInputRef.current?.click()}
                className="w-10 h-10 rounded-full hover:bg-gray-100 transition text-gray-400 ml-2 flex items-center justify-center"
              >
                <Plus size={20} />
              </button>
              <input 
                type="file" 
                ref={chatFileInputRef} 
                className="hidden" 
                accept=".doc,.docx,.ppt,.pptx,.xls,.xlsx,.pdf"
                onChange={(e) => handleFileUpload(e, true)}
              />
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChatSubmit()}
                className="flex-1 bg-transparent border-none focus:ring-0 text-base py-3" 
                placeholder="提出回饋、改寫或推進階段..."
              />
              <button 
                onClick={handleChatSubmit}
                disabled={loading || (!userInput.trim() && pendingFiles.length === 0)}
                className="w-11 h-11 bg-black text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition disabled:opacity-50"
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Floating Loading Progress */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-24 right-10 z-50 bg-white/90 backdrop-blur-xl border border-black/5 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 min-w-[200px]"
            >
              <div className="relative w-16 h-16">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    className="text-gray-100"
                  />
                  <motion.circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    strokeDasharray="175.9"
                    animate={{ strokeDashoffset: 175.9 - (175.9 * progress) / 100 }}
                    className="text-black"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin text-black" size={20} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-black">系統處理中...</p>
                <p className="text-[10px] font-mono text-gray-400 mt-1">{Math.round(progress)}% 完成</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
