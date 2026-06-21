'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, Volume2, Mic, Square, Loader2,
  Clock, Brain, Send, RotateCcw, XCircle, CheckCircle2,
  Sparkles, Target, Zap, FileText, Star, AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api';

/* ---------- Types ---------- */
interface Question {
  order_index: number; question_text: string;
  question_type: 'introduction' | 'behavioral' | 'technical' | 'situational' | 'career';
}
interface QuestionScore {
  order_index: number; total_score: number;
  dimension_scores: Record<string, number>;
  evaluation: string; reference_answer: string; improvement_suggestion: string;
  error?: string;
}
// 状态机: question->recording->transcribing->review->submitting->(next)question
type Phase = 'question' | 'recording' | 'transcribing' | 'review' | 'submitting' | 'scoring' | 'feedback';

const QUESTION_TYPE_MAP: Record<string, string> = {
  introduction: '自我介绍', behavioral: '行为面试', technical: '专业技能',
  situational: '情景题', career: '职业规划',
};
const TYPE_COLORS: Record<string, string> = {
  introduction: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  behavioral: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800',
  technical: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800',
  situational: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  career: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
};
const TYPE_ICONS: Record<string, any> = {
  introduction: Sparkles,
  behavioral: Target,
  technical: Brain,
  situational: Zap,
  career: FileText,
};
const DIM_LABELS: Record<string, string> = {
  content_completeness: '内容完整性', professionalism: '专业度',
  expression: '表达能力', star_method: 'STAR法则',
};
const DIM_COLORS: Record<string, string> = {
  content_completeness: 'border-t-brand-400 dark:border-t-brand-500',
  professionalism: 'border-t-purple-400 dark:border-t-purple-600',
  expression: 'border-t-amber-400 dark:border-t-amber-600',
  star_method: 'border-t-emerald-400 dark:border-t-emerald-600',
};
const DIM_ICONS: Record<string, any> = {
  content_completeness: FileText,
  professionalism: Brain,
  expression: Target,
  star_method: Star,
};

function getWsUrl() { return (process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000').replace(/^http/,'ws'); }
function formatTime(s: number) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }

/* ========== SpeechRecognition wrapper ========== */
function createSR(): any {
  const S = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!S) return null;
  const sr = new S(); sr.lang='zh-CN'; sr.interimResults=true; sr.continuous=true;
  return sr;
}

/* ========== Spinner ========== */
function Spinner({ label, white }: { label: string; white?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <Loader2 className={`w-8 h-8 animate-spin ${white ? 'text-white' : 'text-brand-500 dark:text-brand-400'}`} />
      <p className={`text-sm ${white ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{label}</p>
    </div>
  );
}

/* ========== SessionContent ========== */
function SessionContent() {
  const router = useRouter(); const searchParams = useSearchParams();
  const interviewId = searchParams.get('id');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [recordedTime, setRecordedTime] = useState(0);
  const [thinkingTime, setThinkingTime] = useState(0);
  const [finalThinkingTime, setFinalThinkingTime] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [liveText, setLiveText] = useState('');
  const [asrLoading, setAsrLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [feedback, setFeedback] = useState<QuestionScore|null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [hasSpeechAPI, setHasSpeechAPI] = useState(true);

  const timerRef = useRef<NodeJS.Timeout|null>(null);
  const timerValueRef = useRef(0);
  const thinkingRef = useRef<NodeJS.Timeout|null>(null);
  const thinkingValueRef = useRef(0);
  const totalTimeRef = useRef(0);
  const wsRef = useRef<WebSocket|null>(null);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<any>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const liveTextRef = useRef('');
  const liveTextElRef = useRef<HTMLParagraphElement|null>(null);
  const stoppingManuallyRef = useRef(false);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopAll();
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    try{(window as any).speechSynthesis?.cancel();}catch{}
  }, []);

  const stopAll = () => {
    if (speechRef.current) { try { speechRef.current.stop(); } catch {} speechRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current = null; }
  };

  /* ---------- TTS ---------- */
  const playTts = async (buf: ArrayBuffer) => {
    try { const c=new AudioContext(); const a=await c.decodeAudioData(buf.slice(0)); const s=c.createBufferSource(); s.buffer=a; s.connect(c.destination); setTtsPlaying(true); s.onended=()=>{setTtsPlaying(false);c.close();}; s.start(); } catch {}
  };

  /* ---------- WebSocket ---------- */
  const connectWs = useCallback(() => {
    if (!interviewId) return;
    const t=localStorage.getItem('access_token'); if(!t) return;
    if(wsRef.current&&wsRef.current.readyState!==WebSocket.OPEN){
      try{wsRef.current.close();}catch{}
    }
    const ws=new WebSocket(`${getWsUrl()}/api/ws/interview/${interviewId}?token=${t}`);
    ws.binaryType='arraybuffer';
    ws.onopen=()=>setWsConnected(true);
    ws.onmessage=(e)=>{
      if(e.data instanceof ArrayBuffer){playTts(e.data);return;}
      try{const m=JSON.parse(e.data);
        if(m.type==='question_score'&&!m.error){setFeedback(m);setPhase('feedback');}
        else if(m.type==='question_score'&&m.error)setPhase('review');
      }catch{}
    };
    ws.onclose=()=>{setWsConnected(false);wsRef.current=null;};
    ws.onerror=()=>{setWsConnected(false);wsRef.current=null;};
    wsRef.current=ws;
  },[interviewId]);

  const speak=useCallback((text:string)=>{
    const ss=(window as any).speechSynthesis;
    if(!ss)return;
    ss.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang='zh-CN';u.rate=1.0;
    ss.speak(u);
  },[]);

  /* ---------- Load ---------- */
  const loadInterview=useCallback(async()=>{
    if(!interviewId){router.push('/dashboard');return;}
    try{setLoading(true);setError('');
      const d=await api.get<{questions:Question[];status:string}>(`/api/interview/${interviewId}`);
      if(d.status==='preparing')await api.post(`/api/interview/${interviewId}/start`);
      setQuestions(d.questions||[]);
    }catch(e:any){setError(e.message||'加载失败');}finally{setLoading(false);}
  },[interviewId,router]);
  useEffect(()=>{loadInterview();connectWs();},[loadInterview,connectWs]);

  // 自动朗读
  const [hasAutoRead, setHasAutoRead] = useState(false);
  useEffect(()=>{
    if(phase!=='question'||!questions[currentIndex])return;
    const autoRead=localStorage.getItem('tts_auto_read')==='true';
    if(!autoRead||hasAutoRead)return;
    setHasAutoRead(true);
    speak(questions[currentIndex].question_text);
  },[phase,currentIndex,questions,hasAutoRead,speak]);

  useEffect(()=>{try{(window as any).speechSynthesis?.cancel();}catch{}setHasAutoRead(false);},[currentIndex]);

  /* ---------- Thinking timer ---------- */
  // 兜底：如果 moveToNextOrComplete 已启动计时器则跳过，否则在此启动
  useEffect(()=>{
    if(phase!=='question'||!questions[currentIndex])return;
    if(thinkingRef.current)return; // 已在 moveToNextOrComplete 中启动
    thinkingValueRef.current=0;setThinkingTime(0);setFinalThinkingTime(0);
    thinkingRef.current=setInterval(()=>{const v=thinkingValueRef.current+1;thinkingValueRef.current=v;setThinkingTime(v);},1000);
    return ()=>{if(thinkingRef.current){clearInterval(thinkingRef.current);thinkingRef.current=null;}};
  },[phase,currentIndex,questions]);

  /* ---------- Recording ---------- */
  const startRecording=useCallback(async()=>{
    if(thinkingRef.current){clearInterval(thinkingRef.current);thinkingRef.current=null;}
    setFinalThinkingTime(thinkingValueRef.current);
    setTranscript('');setLiveText('');liveTextRef.current='';setTimer(0);setRecordedTime(0);timerValueRef.current=0;
    chunksRef.current=[];stoppingManuallyRef.current=false;connectWs();
    const SR=createSR();if(!SR)setHasSpeechAPI(false);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
      if(SR){speechRef.current=SR;
        SR.onresult=(e:any)=>{
          for(let i=e.resultIndex;i<e.results.length;i++){
            const r=e.results[i];
            if(r.isFinal)liveTextRef.current+=r[0].transcript;
          }
          let interim='';
          for(let i=0;i<e.results.length;i++){
            if(!e.results[i].isFinal)interim+=e.results[i][0].transcript;
          }
          // 直接写 DOM 避免高频 setState 触发全组件重渲染（新 UI 元素重）
          const displayText=liveTextRef.current+interim;
          if(liveTextElRef.current)liveTextElRef.current.textContent=displayText;
          setLiveText(displayText); // 保持 state 同步（低频用于 UI 条件渲染）
        };
        SR.onerror=(e:any)=>{if(e.error!=='no-speech'&&e.error!=='aborted')console.warn('SR error:',e.error);};
        SR.onend=()=>{
          // 停顿后自动重启识别（continuous=true 在某些浏览器不可靠）
          if(!stoppingManuallyRef.current && mediaRecorderRef.current?.state==='recording'){
            try{speechRef.current?.start();}catch{}
          }
        };
        SR.start();}
      const mt=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
      const rec=new MediaRecorder(stream,{mimeType:mt});
      rec.ondataavailable=(e)=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      rec.onstop=()=>{if(speechRef.current){try{speechRef.current.stop();}catch{}}stream.getTracks().forEach(t=>t.stop());processAudio();};
      rec.start();mediaRecorderRef.current=rec;
      timerRef.current=setInterval(()=>{const v=timerValueRef.current+1;timerValueRef.current=v;setTimer(v);},1000);
      setPhase('recording');
    }catch{setPhase('recording');timerRef.current=setInterval(()=>{const v=timerValueRef.current+1;timerValueRef.current=v;setTimer(v);},1000);}
  },[connectWs]);

  const processAudio=async()=>{
    if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}
    const time=timerValueRef.current;setRecordedTime(time);totalTimeRef.current+=time;timerValueRef.current=0;
    const browserText=liveTextRef.current;
    setTranscript(browserText);
    if(chunksRef.current.length===0){setPhase('review');return;}
    setAsrLoading(true);
    setPhase('review');
    try{
      const blob=new Blob(chunksRef.current,{type:'audio/webm'});
      const buf=await blob.arrayBuffer();
      const r=await api.post<{text:string}>(`/api/interview/${interviewId}/transcribe`,buf);
      const asrText=r?.text||'';
      if(asrText&&asrText!==browserText&&asrText.length>browserText.length*0.5){
        setTranscript(asrText);
      }else if(!browserText&&asrText){
        setTranscript(asrText);
      }
    }catch{}
    setAsrLoading(false);
  };

  const stopRecording=useCallback(()=>{
    stoppingManuallyRef.current=true;
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive')mediaRecorderRef.current.stop();
    else processAudio();
  },[]);

  /* ---------- Submit & Scoring ---------- */
  const submitAnswer=useCallback(async(answerText:string,skip:boolean)=>{
    if(!interviewId)return;
    const q=questions[currentIndex];if(!q)return;
    setPhase('submitting');
    try{
      await api.post(`/api/interview/${interviewId}/submit-answer`,{
        order_index:q.order_index,
        answer_transcript:answerText,
        duration_seconds:skip?0:recordedTime,
        thinking_duration_seconds:skip?0:finalThinkingTime,
      });
    }catch{
      setPhase('review');
      return;
    }
    moveToNextOrComplete();
  },[interviewId,currentIndex,questions,recordedTime]);

  const moveToNextOrComplete=useCallback(()=>{
    try{(window as any).speechSynthesis?.cancel();}catch{}
    if(currentIndex<questions.length-1){
      setCurrentIndex(i=>i+1);setPhase('question');setTranscript('');setLiveText('');setTimer(0);setRecordedTime(0);setFeedback(null);
      // 立即启动思考计时器，避免 useEffect 延迟导致的闪烁
      if(thinkingRef.current){clearInterval(thinkingRef.current);}
      thinkingValueRef.current=0;setThinkingTime(0);setFinalThinkingTime(0);
      thinkingRef.current=setInterval(()=>{const v=thinkingValueRef.current+1;thinkingValueRef.current=v;setThinkingTime(v);},1000);
    }
    else setShowConfirm(true);
  },[currentIndex,questions.length]);

  const handleSkip=useCallback(()=>{if(phase==='scoring'||phase==='submitting')return;if(phase==='recording')stopRecording();setTimeout(()=>submitAnswer('',true),300);},[phase,stopRecording,submitAnswer]);
  const handleComplete=useCallback(async()=>{if(!interviewId||completing)return;setCompleting(true);try{await api.post(`/api/interview/${interviewId}/complete`);router.push(`/interview/result/${interviewId}`);}catch{setCompleting(false);setError('完成失败');}},[interviewId,completing,router]);

  /* ---------- Render ---------- */
  const total=questions.length,currentQ=questions[currentIndex];
  const progress=total>0?(currentIndex/total)*100:0;
  const displayText=transcript||liveText||'';
  const showTimer=recordedTime>0;

  // Loading state
  if(loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-brand-500 dark:text-brand-400 animate-spin" />
          <p className="text-sm text-gray-400 dark:text-gray-500">加载面试信息...</p>
        </div>
      </div>
    );
  }

  // Error state
  if(error&&!currentQ) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-semibold mb-1">加载失败</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">{error}</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-all">
            <ChevronLeft className="w-4 h-4" />
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  // No questions state
  if(!currentQ) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <FileText className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-semibold mb-1">暂无题目</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">面试题目尚未生成</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-all">
            <ChevronLeft className="w-4 h-4" />
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const TypeIcon = TYPE_ICONS[currentQ.question_type] || Star;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10">

        {/* ---- Top Bar ---- */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            返回首页
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {wsConnected ? '已连接' : '未连接'}
              </span>
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
              AI 面试
            </span>
          </div>
        </div>

        {/* ---- Progress Bar (slim) ---- */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              第 <span className="text-brand-500 dark:text-brand-400 font-bold tabular-nums">{currentIndex+1}</span> / {total} 题
            </span>
            <div className="flex items-center gap-3">
              {showTimer && (phase==='review'||phase==='scoring'||phase==='feedback') && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  本题 {formatTime(recordedTime)}
                </span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{Math.round(progress)}%</span>
            </div>
          </div>
          <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-500 dark:from-brand-500 dark:to-brand-400 rounded-full transition-all duration-500 ease-out"
              style={{width:`${progress}%`}}
            />
          </div>
        </div>

        {/* ---- Question Card ---- */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">

          {/* Question header */}
          <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-0">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS[currentQ.question_type]??'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'}`}>
              <TypeIcon className="w-3 h-3" />
              {QUESTION_TYPE_MAP[currentQ.question_type]??currentQ.question_type}
            </span>
          </div>
          <div className="px-6 sm:px-8 pt-4 pb-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 leading-relaxed flex-1">
                {currentQ.question_text}
              </h2>
              {phase==='question'&&(
                <button onClick={()=>speak(currentQ.question_text)} disabled={ttsPlaying}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center disabled:opacity-40 transition-all" title="朗读题目">
                  <Volume2 className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${ttsPlaying?'animate-pulse':''}`} />
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* ======== Phase-based rendering ======== */}
          <div className="px-6 sm:px-8 py-6 sm:py-8">

            {/* ---- question: ready to record ---- */}
            {phase==='question'&&(
              <div className="flex flex-col items-center gap-6">
                {!hasSpeechAPI&&(
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 rounded-xl border border-amber-100 dark:border-amber-900">
                    <AlertCircle className="w-3.5 h-3.5" />
                    浏览器不支持语音识别，录音后将通过AI转写
                  </div>
                )}
                {thinkingTime>0&&(
                  <div className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500">
                    <Brain className="w-4 h-4" />
                    思考中 {formatTime(thinkingTime)}
                  </div>
                )}
                <p className="text-sm text-gray-400 dark:text-gray-500">准备好后，点击下方按钮开始录音回答</p>
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-brand-100 dark:bg-brand-950/50 animate-pulse opacity-50" />
                  <button onClick={startRecording}
                    className="relative w-28 h-28 rounded-full bg-white dark:bg-gray-800 border-2 border-dashed border-brand-300 dark:border-brand-600 hover:border-brand-500 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-all flex items-center justify-center group shadow-sm">
                    <Mic className="w-12 h-12 text-brand-500 dark:text-brand-400 group-hover:scale-105 transition-transform" />
                  </button>
                </div>
                <button onClick={handleSkip}
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                  <XCircle className="w-4 h-4" />
                  跳过此题
                </button>
              </div>
            )}

            {/* ---- recording: mic active ---- */}
            {phase==='recording'&&(
              <div className="flex flex-col items-center gap-6">
                {/* Timer */}
                <div className="text-center">
                  <div className="text-5xl sm:text-6xl font-mono font-bold text-gray-800 dark:text-gray-200 tabular-nums tracking-wider">
                    {formatTime(timer)}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">录音时长</p>
                </div>

                {/* Large red stop button with pulse ring */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full animate-ping bg-red-400/30 dark:bg-red-600/20" />
                  <div className="absolute inset-0 rounded-full animate-pulse bg-red-500/10" />
                  <button onClick={stopRecording}
                    className="relative w-28 h-28 rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-200/50 dark:shadow-red-900/40 flex items-center justify-center active:scale-95 transition-transform hover:shadow-xl">
                    <Square className="w-11 h-11 text-white" />
                  </button>
                </div>

                <p className="text-sm font-medium text-red-500 dark:text-red-400 animate-pulse flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  录音中 · 点击停止
                </p>

                {/* Live transcription — DOM ref 直接更新避免高频重渲染 */}
                <div className={`w-full bg-brand-50/80 dark:bg-brand-950/30 rounded-2xl p-4 border border-brand-100 dark:border-brand-900 max-h-36 overflow-y-auto ${liveText?'':'hidden'}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Mic className="w-3.5 h-3.5 text-brand-500 dark:text-brand-400" />
                    <p className="text-xs font-medium text-brand-500 dark:text-brand-400">实时转写</p>
                  </div>
                  <p ref={liveTextElRef} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{liveText}</p>
                </div>

                <button onClick={handleSkip}
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                  <XCircle className="w-4 h-4" />
                  跳过
                </button>
              </div>
            )}

            {/* ---- transcribing: ASR processing ---- */}
            {phase==='transcribing'&&(<Spinner label="AI 正在识别语音…"/> )}

            {/* ---- review: show transcript ---- */}
            {phase==='review'&&(
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                  {finalThinkingTime>0&&(
                    <span className="inline-flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5" />
                      思考 {formatTime(finalThinkingTime)}
                    </span>
                  )}
                  {showTimer&&(
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      回答 {formatTime(recordedTime)}
                    </span>
                  )}
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 mb-2.5">
                    <Mic className="w-4 h-4" />
                    你的回答
                  </label>
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 min-h-[100px] border border-gray-100 dark:border-gray-800">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {displayText||'（未检测到回答内容）'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={()=>submitAnswer(displayText,false)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-500 text-white font-medium rounded-xl hover:bg-brand-600 transition-all shadow-sm shadow-brand-200 dark:shadow-brand-900">
                    <Send className="w-4 h-4" />
                    提交回答
                  </button>
                  <button onClick={startRecording}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-all">
                    <RotateCcw className="w-4 h-4" />
                    重新录音
                  </button>
                  <button onClick={handleSkip}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                    <XCircle className="w-4 h-4" />
                    跳过
                  </button>
                </div>
              </div>
            )}

            {/* ---- submitting: saving answer ---- */}
            {phase==='submitting'&&(<Spinner label="正在保存回答…"/> )}

            {/* ---- scoring: LLM evaluating ---- */}
            {phase==='scoring'&&(<Spinner label="AI 正在评分，请稍候…"/> )}

            {/* ---- feedback: results ---- */}
            {phase==='feedback'&&feedback&&(
              <div className="flex flex-col gap-6">
                {/* Time info */}
                <div className="flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                  {finalThinkingTime>0&&(
                    <span className="inline-flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5" />
                      思考 {formatTime(finalThinkingTime)}
                    </span>
                  )}
                  {recordedTime>0&&(
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      回答 {formatTime(recordedTime)}
                    </span>
                  )}
                </div>

                {/* Score circle */}
                <div className="text-center">
                  <div className="relative inline-flex">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="5"
                        className="text-gray-100 dark:text-gray-800" />
                      <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - feedback.total_score / 100)}`}
                        className="text-brand-500 transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{feedback.total_score}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">本题评分</p>
                </div>

                {/* Dimension scores - 2x2 grid */}
                {feedback.dimension_scores&&(
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(feedback.dimension_scores).map(([k,v])=>{
                      const DimIcon = DIM_ICONS[k] || Star;
                      return (
                        <div key={k} className={`bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800 border-t-4 ${DIM_COLORS[k]||'border-t-gray-400'}`}>
                          <div className="w-7 h-7 mx-auto mb-1.5 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700">
                            <DimIcon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                          </div>
                          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{v}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{DIM_LABELS[k]||k}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Evaluation */}
                {feedback.evaluation&&(
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 mb-2.5">
                      <Sparkles className="w-4 h-4 text-brand-500" />
                      评语
                    </label>
                    <div className="pl-4 border-l-2 border-brand-400 dark:border-brand-500">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{feedback.evaluation}</p>
                    </div>
                  </div>
                )}

                {/* Reference answer */}
                {feedback.reference_answer&&(
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 mb-2.5">
                      <FileText className="w-4 h-4 text-emerald-500" />
                      参考答案
                    </label>
                    <div className="pl-4 border-l-2 border-emerald-400 dark:border-emerald-600">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{feedback.reference_answer}</p>
                    </div>
                  </div>
                )}

                {/* Improvement suggestion */}
                {feedback.improvement_suggestion&&(
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 mb-2.5">
                      <Target className="w-4 h-4 text-amber-500" />
                      改进建议
                    </label>
                    <div className="pl-4 border-l-2 border-amber-400 dark:border-amber-600">
                      <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">{feedback.improvement_suggestion}</p>
                    </div>
                  </div>
                )}

                {/* Next button */}
                <button onClick={moveToNextOrComplete}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-500 text-white font-medium rounded-xl hover:bg-brand-600 transition-all shadow-sm shadow-brand-200 dark:shadow-brand-900">
                  {currentIndex<questions.length-1 ? (
                    <>下一题 <ChevronRight className="w-4 h-4" /></>
                  ) : (
                    '查看面试结果'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-600 text-center mt-6">
          请在安静环境中回答，语速清晰
        </p>
      </div>

      {/* ---- Completion Modal ---- */}
      {showConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-modal max-w-sm w-full p-8 text-center animate-fade-in border border-gray-100 dark:border-gray-800">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">全部回答完成</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              你已回答全部 {total} 道题目
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-7">
              总耗时 {formatTime(totalTimeRef.current)}
            </p>
            <div className="flex gap-3">
              <button onClick={()=>setShowConfirm(false)} disabled={completing}
                className="flex-1 px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-all">
                再看看
              </button>
              <button onClick={handleComplete} disabled={completing}
                className="flex-1 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-60 transition-all shadow-sm shadow-brand-200 dark:shadow-brand-900 flex items-center justify-center gap-2">
                {completing?<><Loader2 className="w-4 h-4 animate-spin"/>生成报告中…</>:'完成面试'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 dark:text-brand-400 animate-spin" />
      </div>
    }>
      <SessionContent />
    </Suspense>
  );
}
