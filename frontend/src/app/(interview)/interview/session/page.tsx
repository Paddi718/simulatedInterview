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
  user_answer_transcript?: string|null;
  is_favorited?: boolean;
}
interface QuestionScore {
  order_index: number; total_score: number;
  dimension_scores: Record<string, number>;
  evaluation: string; reference_answer: string; improvement_suggestion: string;
  error?: string;
}
// 状态机: generating->question->recording->transcribing->review->submitting->(next)question
type Phase = 'generating' | 'question' | 'recording' | 'transcribing' | 'review' | 'submitting' | 'scoring' | 'feedback';

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
  const [audioLoading, setAudioLoading] = useState(false);
  const [feedback, setFeedback] = useState<QuestionScore|null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [hasSpeechAPI, setHasSpeechAPI] = useState(true);
  // 流式出题状态: idle=正常 | waiting=等Q1(全屏动画) | streaming=已出Q1剩余生成中 | done=全部完成
  const [streamStatus, setStreamStatus] = useState<'idle'|'waiting'|'streaming'|'done'>('idle');
  const genStatusRef = useRef<'idle'|'waiting'|'streaming'|'done'>('idle'); // SSE 闭包内使用
  const [genTotal, setGenTotal] = useState(0);
  const [genCount, setGenCount] = useState(0);

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
  const recordingGenRef = useRef(0); // 录音代际，防止旧 SR 事件污染新会话
  const mountedRef = useRef(true); // 组件生命周期标记，防止卸载后异步回调执行

  const stopAll = () => {
    if (speechRef.current) { try { speechRef.current.abort(); } catch {} speechRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current = null; }
  };

  /* ---------- TTS Audio ---------- */
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);
  const audioPlayingRef = useRef(false); // 同步标记，避免React状态延迟

  // 确保 audio 元素存在
  const getAudioEl = useCallback(() => {
    if (!audioElRef.current) {
      audioElRef.current = new Audio();
      audioElRef.current.preload = 'auto';
    }
    return audioElRef.current;
  }, []);

  const stopTts = useCallback(() => {
    const el = audioElRef.current;
    if (el) {
      try { el.pause(); el.currentTime = 0; } catch {}
    }
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    audioPlayingRef.current = false;
    setTtsPlaying(false);
  }, []);

  // 使用 HTMLAudioElement 播放。调用者必须先 stopTts() 清理前一个音频。
  const playTts = (buf: ArrayBuffer) => {
    if (!mountedRef.current) return;
    try {
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      audioBlobUrlRef.current = url;
      const el = getAudioEl();
      el.src = url;
      el.onended = () => { audioPlayingRef.current = false; setTtsPlaying(false); };
      el.onerror = () => { console.warn('[TTS] Audio playback error'); audioPlayingRef.current = false; setTtsPlaying(false); };
      audioPlayingRef.current = true;
      setTtsPlaying(true);
      el.play().catch((e) => {
        console.warn('[TTS] play() rejected:', e.message);
        audioPlayingRef.current = false;
        if (mountedRef.current) setTtsPlaying(false);
      });
    } catch (e) {
      console.warn('[TTS] playTts error:', e);
      if (mountedRef.current) setTtsPlaying(false);
    }
  };

  /* ---------- WebSocket ---------- */
  const wsTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const connectWs = useCallback(() => {
    if (!interviewId) return;
    const t=localStorage.getItem('access_token'); if(!t) return;
    if(wsRef.current?.readyState===WebSocket.OPEN) return;
    if(wsRef.current?.readyState===WebSocket.CONNECTING) return;
    if(wsRef.current){ try{wsRef.current.close();}catch{} }
    // 延迟连接避免与 Next.js 路由导航冲突
    if (wsTimerRef.current) clearTimeout(wsTimerRef.current);
    wsTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || !interviewId) return;
      const ws=new WebSocket(`${getWsUrl()}/api/ws/interview/${interviewId}?token=${t}`);
      ws.binaryType='arraybuffer';
      ws.onopen=()=>{setWsConnected(true);};
      ws.onmessage=(e)=>{
        if(!mountedRef.current)return;
        if(e.data instanceof ArrayBuffer){stopTts();playTts(e.data);return;}
        try{const m=JSON.parse(e.data);
          if(m.type==='question_score'&&!m.error){setFeedback(m);setPhase('feedback');}
          else if(m.type==='question_score'&&m.error)setPhase('review');
        }catch{}
      };
      ws.onclose=()=>{setWsConnected(false);wsRef.current=null;};
      ws.onerror=()=>{setWsConnected(false);wsRef.current=null;};
      wsRef.current=ws;
    }, 800);
  },[interviewId]);

  // 通过 REST API 获取预生成的 Edge-TTS 音频并播放
  const playQuestionAudio=useCallback(async()=>{
    if(!interviewId||!questions[currentIndex])return;
    stopTts();
    setTtsPlaying(true);
    setAudioLoading(true);
    const orderIndex=questions[currentIndex].order_index;
    const token=localStorage.getItem('access_token');
    const apiBase=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
    const url=`${apiBase}/api/interview/${interviewId}/audio/${orderIndex}`;
    try{
      const res=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}});
      if(!mountedRef.current)return;
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const buf=await res.arrayBuffer();
      if(!mountedRef.current)return;
      setAudioLoading(false);
      playTts(buf);
    }catch(e){
      console.warn('[TTS] playQuestionAudio failed:', e);
      if(mountedRef.current){setTtsPlaying(false);setAudioLoading(false);}
    }
  },[interviewId,questions,currentIndex,stopTts]);

  // 收藏切换
  const toggleFavorite=useCallback(async()=>{
    if(!interviewId||!questions[currentIndex])return;
    const q=questions[currentIndex];
    try{
      const r=await api.post<{is_favorited:boolean}>(`/api/interview/${interviewId}/question/${q.order_index}/favorite`);
      setQuestions(prev=>prev.map((qq,i)=>i===currentIndex?{...qq,is_favorited:r.is_favorited}:qq));
    }catch{/* 网络错误不提示 */}
  },[interviewId,questions,currentIndex]);

  /* ---------- Load ---------- */
  const loadInterview=useCallback(async()=>{
    if(!interviewId){router.push('/dashboard');return;}
    try{setLoading(true);setError('');
      const d=await api.get<{questions:Question[];status:string}>(`/api/interview/${interviewId}`);
      if(d.status==='preparing')await api.post(`/api/interview/${interviewId}/start`);
      const qs = d.questions||[];
      setQuestions(qs);
      // 续答：跳到第一个未回答的题目
      const firstUnanswered = qs.findIndex(q => !q.user_answer_transcript);
      if(firstUnanswered>=0)setCurrentIndex(firstUnanswered);

      // 流式生成中 → 连接 SSE 逐题接收
      if(d.status==='generating'){
        genStatusRef.current='waiting';setStreamStatus('waiting');
        setPhase('generating');
        setGenTotal(0); setGenCount(qs.length);
        connectQuestionSSE();
      } else {
        genStatusRef.current='done';setStreamStatus('done');
      }
    }catch(e:any){setError(e.message||'加载失败');}finally{setLoading(false);}
  },[interviewId,router]);
  // SSE: 流式接收题目
  const questionSseRef = useRef<EventSource|null>(null);
  const connectQuestionSSE = useCallback(() => {
    if(!interviewId) return;
    if(questionSseRef.current){questionSseRef.current.close();questionSseRef.current=null;}
    const token=localStorage.getItem('access_token');
    const url=`${(process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000')}/api/interview/${interviewId}/stream-questions?token=${token}`;

    fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}}).then(async(res)=>{
      if(!res.ok||!res.body) return;
      const reader=res.body.getReader();
      const decoder=new TextDecoder();
      let buf='';
      while(true){
        const{done,value}=await reader.read();
        if(done||!mountedRef.current) break;
        buf+=decoder.decode(value,{stream:true});
        const lines=buf.split('\n');
        buf=lines.pop()||'';
        for(const line of lines){
          if(line.startsWith('data: ')){
            try{
              const data=JSON.parse(line.slice(6));
              if(data.type==='question'){
                setQuestions(prev=>{
                  const exists=prev.find(q=>q.order_index===data.index);
                  if(exists) return prev;
                  return [...prev,{
                    order_index:data.index,
                    question_text:data.question.question_text,
                    question_type:data.question.question_type,
                  }].sort((a,b)=>a.order_index-b.order_index);
                });
                setGenCount(data.index);
                setGenTotal(data.total);
                // Q1 到达 → 切换到答题模式
                if(data.index===1 && genStatusRef.current==='waiting'){
                  genStatusRef.current='streaming';
                  setStreamStatus('streaming');
                  setPhase('question');
                  // Q1就绪，触发自动朗读
                  setTimeout(()=>{
                    if(!mountedRef.current)return;
                    const autoRead=localStorage.getItem('tts_auto_read')==='true';
                    if(!autoRead||hasAutoReadRef.current)return;
                    setHasAutoRead(true);hasAutoReadRef.current=true;
                    const apiBase=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
                    const token=localStorage.getItem('access_token');
                    const url=`${apiBase}/api/interview/${interviewId}/audio/1`;
                    stopTts();setTtsPlaying(true);setAudioLoading(true);
                    fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}})
                      .then(res=>{if(!mountedRef.current)throw new Error('um');if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.arrayBuffer();})
                      .then(buf=>{if(mountedRef.current){setAudioLoading(false);playTts(buf);}})
                      .catch(e=>{if(e.message==='um')return;console.warn('[AutoRead SSE] failed:',e.message);if(mountedRef.current){setTtsPlaying(false);setAudioLoading(false);setHasAutoRead(false);hasAutoReadRef.current=false;}});
                  },800);
                } else if(genStatusRef.current==='waiting'){
                  genStatusRef.current='streaming';
                  setStreamStatus('streaming');
                }
              }else if(data.type==='done'){
                genStatusRef.current='done';
                setStreamStatus('done');
              }
            }catch{}
          }
        }
      }
    }).catch(()=>{
      // SSE 失败降级：轮询
      setTimeout(async()=>{
        if(!mountedRef.current||genStatusRef.current==='done') return;
        try{
          const d=await api.get<{questions:Question[];status:string}>(`/api/interview/${interviewId}`);
          const qs=d.questions||[];
          if(qs.length>0){
            setQuestions(qs);
            setGenCount(qs.length);
            genStatusRef.current='done';setStreamStatus('done');
            setPhase('question');
          }
        }catch{}
      },3000);
    });
  },[interviewId]);

  useEffect(()=>{loadInterview();connectWs();return ()=>{if(wsTimerRef.current)clearTimeout(wsTimerRef.current);if(questionSseRef.current){questionSseRef.current.close();questionSseRef.current=null;}};},[loadInterview,connectWs]);

  // 总耗时计时器：从进入面试页面到离开，全程计时
  useEffect(()=>{
    const totalTimer=setInterval(()=>{totalTimeRef.current+=1;},1000);
    return ()=>{clearInterval(totalTimer);};
  },[]);

  // 挂载时置位 mountedRef，卸载时清理所有资源
  // 注意：必须在挂载主体里重置 mountedRef=true，否则 StrictMode 双重挂载会导致它永久为 false
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (wsTimerRef.current) clearTimeout(wsTimerRef.current);
      if (audioElRef.current) { try { audioElRef.current.pause(); } catch {} audioElRef.current = null; }
      stopAll();
      stopTts();
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      try{(window as any).speechSynthesis?.cancel();}catch{}
    };
  }, [stopTts]);

  // 自动朗读 — 直接在 effect 中发起请求
  const [hasAutoRead, setHasAutoRead] = useState(false);
  const hasAutoReadRef = useRef(false);
  useEffect(()=>{hasAutoReadRef.current=hasAutoRead;},[hasAutoRead]);

  // 自动朗读（带重试：TTS可能尚未生成完）
  useEffect(()=>{
    if(phase!=='question'||!questions[currentIndex]||!interviewId)return;
    const autoRead=localStorage.getItem('tts_auto_read')==='true';
    if(!autoRead||hasAutoRead)return;

    const q = questions[currentIndex];
    const token=localStorage.getItem('access_token');
    const apiBase=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
    const url=`${apiBase}/api/interview/${interviewId}/audio/${q.order_index}`;

    const tryFetch = (retries: number) => {
      if(!mountedRef.current)return;
      stopTts();
      setTtsPlaying(true);
      setAudioLoading(true);
      fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}})
        .then(res=>{if(!mountedRef.current)throw new Error('unmounted');if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.arrayBuffer();})
        .then(buf=>{if(!mountedRef.current)return;setAudioLoading(false);setHasAutoRead(true);playTts(buf);})
        .catch(e=>{
          if(e.message==='unmounted')return;
          if(retries > 0){
            console.warn(`[AutoRead] retry in 2s (${retries} left):`, e.message);
            setTimeout(()=>tryFetch(retries-1), 2000);
          }else{
            console.warn('[AutoRead] failed after retries:', e.message);
            if(mountedRef.current){setTtsPlaying(false);setAudioLoading(false);setHasAutoRead(true);}
          }
        });
    };
    tryFetch(2);  // 原请求 + 2次重试 = 最多3次
  },[phase,currentIndex,questions,hasAutoRead,stopTts,interviewId]);

  useEffect(()=>{stopTts();setAudioLoading(false);try{(window as any).speechSynthesis?.cancel();}catch{}setHasAutoRead(false);},[currentIndex,stopTts]);

  // 切题时重置思考计数器
  useEffect(()=>{
    thinkingValueRef.current=0;setThinkingTime(0);setFinalThinkingTime(0);
  },[currentIndex]);

  /* ---------- Thinking timer (pauses during TTS playback) ---------- */
  useEffect(()=>{
    if(phase!=='question'||!questions[currentIndex]){
      if(thinkingRef.current){clearInterval(thinkingRef.current);thinkingRef.current=null;}
      return;
    }
    // TTS 播放期间暂停思考计时
    if(ttsPlaying||audioLoading){
      if(thinkingRef.current){clearInterval(thinkingRef.current);thinkingRef.current=null;}
      return;
    }
    // 已在运行则跳过
    if(thinkingRef.current)return;

    thinkingRef.current=setInterval(()=>{const v=thinkingValueRef.current+1;thinkingValueRef.current=v;setThinkingTime(v);},1000);
    return ()=>{if(thinkingRef.current){clearInterval(thinkingRef.current);thinkingRef.current=null;}};
  },[phase,currentIndex,questions,ttsPlaying,audioLoading]);

  /* ---------- Recording ---------- */
  const startRecording=useCallback(async()=>{
    // 立即停止 TTS 朗读，防止题目音频被录入麦克风
    stopTts();
    setAudioLoading(false);
    // 先彻底清理上一次录音的 SR 实例，防止旧事件残留
    if(speechRef.current){
      try{speechRef.current.abort();}catch{}
      speechRef.current=null;
    }
    if(thinkingRef.current){clearInterval(thinkingRef.current);thinkingRef.current=null;}
    setFinalThinkingTime(thinkingValueRef.current);
    // 重置所有状态&ref（新录音开始，一切从零开始）
    setTranscript('');setLiveText('');liveTextRef.current='';setTimer(0);setRecordedTime(0);timerValueRef.current=0;
    chunksRef.current=[];stoppingManuallyRef.current=false;connectWs();
    // 递增代际，所有旧 SR 事件将被忽略
    recordingGenRef.current++;
    const myGen = recordingGenRef.current;
    const SR=createSR();if(!SR)setHasSpeechAPI(false);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
      if(SR){speechRef.current=SR;
        SR.onresult=(e:any)=>{
          // 代际检查：防止旧 SR 事件污染新录音
          if(recordingGenRef.current !== myGen) return;
          for(let i=e.resultIndex;i<e.results.length;i++){
            const r=e.results[i];
            if(r.isFinal)liveTextRef.current+=r[0].transcript;
          }
          let interim='';
          for(let i=0;i<e.results.length;i++){
            if(!e.results[i].isFinal)interim+=e.results[i][0].transcript;
          }
          // 直接写 DOM 避免高频 setState 触发全组件重渲染
          const displayText=liveTextRef.current+interim;
          if(liveTextElRef.current)liveTextElRef.current.textContent=displayText;
          setLiveText(displayText);
        };
        SR.onerror=(e:any)=>{
          if(recordingGenRef.current !== myGen) return;
          if(e.error!=='no-speech'&&e.error!=='aborted')console.warn('SR error:',e.error);
        };
        SR.onend=()=>{
          if(recordingGenRef.current !== myGen) return;
          // 停顿后自动重启识别（continuous=true 在某些浏览器不可靠）
          if(!stoppingManuallyRef.current && mediaRecorderRef.current?.state==='recording'){
            try{speechRef.current?.start();}catch{}
          }
        };
        SR.start();}
      const mt=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
      const rec=new MediaRecorder(stream,{mimeType:mt});
      rec.ondataavailable=(e)=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      rec.onstop=()=>{
        if(speechRef.current){try{speechRef.current.stop();}catch{}}
        stream.getTracks().forEach(t=>t.stop());
        // 延迟 processAudio：等待浏览器 SpeechRecognition 的最终 onresult 事件 flush
        setTimeout(()=>{
          if(recordingGenRef.current === myGen) processAudio();
          else processAudio(); // 非活跃代际也处理（兜底），但 processAudio 内部会检查
        }, 250);
      };
      rec.start();mediaRecorderRef.current=rec;
      timerRef.current=setInterval(()=>{const v=timerValueRef.current+1;timerValueRef.current=v;setTimer(v);},1000);
      setPhase('recording');
    }catch{setPhase('recording');timerRef.current=setInterval(()=>{const v=timerValueRef.current+1;timerValueRef.current=v;setTimer(v);},1000);}
  },[connectWs]);

  const processAudio=async()=>{
    if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}
    const time=timerValueRef.current;setRecordedTime(time);timerValueRef.current=0;
    // 在 SR 完全停止后，捕获最终的浏览器转写文本
    const browserText=liveTextRef.current;
    setTranscript(browserText);
    // 同时更新 displayText（liveText 用于 UI 条件渲染）
    setLiveText(browserText);
    if(chunksRef.current.length===0){setPhase('review');return;}
    setAsrLoading(true);
    setPhase('review');
    try{
      const blob=new Blob(chunksRef.current,{type:'audio/webm'});
      const buf=await blob.arrayBuffer();
      const r=await api.post<{text:string}>(`/api/interview/${interviewId}/transcribe?order_index=${currentIndex+1}`,buf);
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
    // 1. 先停止 SpeechRecognition，立即触发 onend 和最终 onresult 事件 flush
    if(speechRef.current){try{speechRef.current.stop();}catch{}}
    // 2. 延迟停止 MediaRecorder，确保 SR 最终结果已在 liveTextRef 中
    setTimeout(()=>{
      if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){
        mediaRecorderRef.current.stop(); // 触发 rec.onstop → processAudio
      }else{
        processAudio();
      }
    }, 200);
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
    // 本地标记已答，续答时跳过此题
    setQuestions(prev => prev.map((q, i) => i === currentIndex ? {...q, user_answer_transcript: answerText} : q));
    moveToNextOrComplete();
  },[interviewId,currentIndex,questions,recordedTime]);

  const moveToNextOrComplete=useCallback(()=>{
    try{(window as any).speechSynthesis?.cancel();}catch{}
    // 找下一道未回答的题目（跳过已答的）
    let next = currentIndex + 1;
    while(next < questions.length){
      const q = questions[next] as any;
      if(!q.user_answer_transcript) break;
      next++;
    }
    if(next < questions.length){
      setCurrentIndex(next);setPhase('question');setTranscript('');setLiveText('');setTimer(0);setRecordedTime(0);setFeedback(null);
      // 思考计时器由 effect 统一管理，不再手动启动
    }
    else {setPhase('review');setShowConfirm(true);}
  },[currentIndex,questions]);

  // 最后一题：直接弹完成对话框，不提交、不调API、不走submitting
  const showFinish=useCallback(()=>{
    if(phase==='recording')stopRecording();
    setShowConfirm(true);
  },[phase,stopRecording]);
  const handleSkip=useCallback(()=>{if(phase==='scoring'||phase==='submitting')return;if(phase==='recording')stopRecording();setTimeout(()=>submitAnswer('',true),300);},[phase,stopRecording,submitAnswer]);
  const handleComplete=useCallback(async()=>{if(!interviewId||completing)return;stopTts();stopAll();setAudioLoading(false);setCompleting(true);try{await api.post(`/api/interview/${interviewId}/complete`);router.push(`/interview/result/${interviewId}`);}catch{setCompleting(false);setError('完成失败');}},[interviewId,completing,router]);

  /* ---------- Render ---------- */
  const total=questions.length,currentQ=questions[currentIndex];
  const isLastQ = currentIndex + 1 >= total;
  const progress = total>0 ? Math.round(((currentIndex+1)/total)*100) : 0;
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

  // Waiting state — 等 Q1，显示动画
  if(streamStatus === 'waiting' && questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-brand-100 dark:bg-brand-950/50 animate-ping opacity-30" />
            <div className="relative w-20 h-20 rounded-full bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-200 dark:shadow-brand-900">
              <Loader2 className="w-9 h-9 text-white animate-spin" />
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">AI 正在出题</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed">
            正在根据你的要求生成个性化面试题目，请稍候...
          </p>
          <div className="mt-6 flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{animationDelay:'0s'}} />
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{animationDelay:'0.15s'}} />
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{animationDelay:'0.3s'}} />
          </div>
        </div>
      </div>
    );
  }

  // No questions — 生成失败或异常
  if(!currentQ && questions.length === 0 && streamStatus === 'done' && !loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <FileText className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-semibold mb-1">暂无题目</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">面试题目生成失败，请返回重试</p>
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
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={()=>{audioPlayingRef.current?stopTts():playQuestionAudio();}}
                    disabled={audioLoading}
                    className="flex-shrink-0 w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center disabled:opacity-40 transition-all"
                    title={ttsPlaying||audioLoading?'停止朗读':'朗读题目'}>
                    {audioLoading?<Loader2 className="w-4 h-4 text-brand-500 animate-spin" />:ttsPlaying?<Square className="w-4 h-4 text-brand-500" />:<Volume2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                  </button>
                  <button onClick={toggleFavorite}
                    className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                      currentQ.is_favorited
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-500'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-amber-500'
                    }`} title={currentQ.is_favorited?'取消收藏':'收藏题目'}>
                    <Star className={`w-4 h-4 ${currentQ.is_favorited?'fill-current':''}`} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* ======== Phase-based rendering ======== */}
          <div className="px-6 sm:px-8 py-6 sm:py-8">

            {/* ---- generating: 过渡态（Q1已到但phase未切换的瞬态） ---- */}
            {phase==='generating'&&questions.length>0&&(
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                <p className="text-sm text-gray-500">题目加载中...</p>
                <div className="w-full space-y-1 max-h-36 overflow-y-auto">
                  {questions.map(q => (
                    <div key={q.order_index} className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="truncate">第{q.order_index}题: {q.question_text.slice(0, 50)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---- question: ready to record ---- */}
            {phase==='question'&&(
              <div className="flex flex-col items-center gap-6">
                {streamStatus === 'streaming' && (
                  <div className="flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/30 px-4 py-2 rounded-xl border border-brand-100 dark:border-brand-900">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    剩余题目生成中（{genCount}/{genTotal}），当前可答题
                  </div>
                )}
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
                  <button onClick={startRecording} disabled={ttsPlaying||audioLoading}
                    className="relative w-28 h-28 rounded-full bg-white dark:bg-gray-800 border-2 border-dashed border-brand-300 dark:border-brand-600 hover:border-brand-500 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-all flex items-center justify-center group shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    <Mic className="w-12 h-12 text-brand-500 dark:text-brand-400 group-hover:scale-105 transition-transform" />
                  </button>
                </div>
                {isLastQ ? (
                  <button onClick={showFinish}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm font-medium text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-all">
                    <Send className="w-4 h-4" />
                    完成面试
                  </button>
                ) : (
                  <button onClick={handleSkip}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                    <XCircle className="w-4 h-4" />
                    跳过此题
                  </button>
                )}
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

                {isLastQ ? (
                  <button onClick={showFinish}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm font-medium text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-all">
                    <Send className="w-4 h-4" />
                    提交并完成
                  </button>
                ) : (
                  <button onClick={handleSkip}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                    <XCircle className="w-4 h-4" />
                    跳过
                  </button>
                )}
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
                  {!isLastQ && (
                    <button onClick={handleSkip}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                      <XCircle className="w-4 h-4" />
                      跳过
                    </button>
                  )}
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

                {/* Next button — 如果下一题还没生成则禁用 */}
                {(()=>{
                  const nextQExists = currentIndex >= questions.length - 1 || questions[currentIndex + 1];
                  const nextUnanswered = (()=>{
                    let n=currentIndex+1;
                    while(n<questions.length){if(!questions[n]?.user_answer_transcript)return n;n++;}
                    return -1;
                  })();
                  const canAdvance = nextUnanswered >= 0 && questions[nextUnanswered];
                  return (
                    <button
                      onClick={canAdvance ? moveToNextOrComplete : undefined}
                      disabled={!canAdvance}
                      title={!canAdvance && (streamStatus === 'streaming' || streamStatus === 'waiting') ? '下一题尚未生成，请稍候...' : ''}
                      className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-white font-medium rounded-xl transition-all shadow-sm ${
                        canAdvance
                          ? 'bg-brand-500 hover:bg-brand-600 shadow-brand-200 dark:shadow-brand-900'
                          : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                      }`}
                    >
                      {(streamStatus === 'streaming' || streamStatus === 'waiting') && !nextQExists && currentIndex < questions.length - 1 ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 题目生成中...</>
                      ) : currentIndex < questions.length - 1 ? (
                        <>下一题 <ChevronRight className="w-4 h-4" /></>
                      ) : (
                        '查看面试结果'
                      )}
                    </button>
                  );
                  })()}
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
