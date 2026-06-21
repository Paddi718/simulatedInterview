'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
// 状态机: question→recording→transcribing→review→submitting→(next)question
type Phase = 'question' | 'recording' | 'transcribing' | 'review' | 'submitting' | 'scoring' | 'feedback';

const QUESTION_TYPE_MAP: Record<string, string> = {
  introduction: '自我介绍', behavioral: '行为面试', technical: '专业技能',
  situational: '情景题', career: '职业规划',
};
const TYPE_COLORS: Record<string, string> = {
  introduction: 'bg-blue-50 text-blue-700 border-blue-200',
  behavioral: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  technical: 'bg-purple-50 text-purple-700 border-purple-200',
  situational: 'bg-amber-50 text-amber-700 border-amber-200',
  career: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const DIM_LABELS: Record<string, string> = {
  content_completeness: '内容完整性', professionalism: '专业度',
  expression: '表达能力', star_method: 'STAR法则',
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
      <div className={`w-10 h-10 border-4 ${white?'border-white':'border-blue-600'} border-t-transparent rounded-full animate-spin`} />
      <p className={`text-sm ${white?'text-white/80':'text-gray-500'}`}>{label}</p>
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
  const [recordedTime, setRecordedTime] = useState(0);   // 录音结束时的时长
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
  const timerValueRef = useRef(0);    // 计时器实时值
  const totalTimeRef = useRef(0);     // 累计总耗时
  const wsRef = useRef<WebSocket|null>(null);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<any>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const liveTextRef = useRef('');

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
    // 关闭旧的非 OPEN 连接
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
    ss.cancel();  // 先停止当前朗读
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

  // 自动朗读：进入 question 阶段 + autoRead 开启时自动朗读
  const [hasAutoRead, setHasAutoRead] = useState(false);
  useEffect(()=>{
    if(phase!=='question'||!questions[currentIndex])return;
    const autoRead=localStorage.getItem('tts_auto_read')==='true';
    if(!autoRead||hasAutoRead)return;
    setHasAutoRead(true);
    speak(questions[currentIndex].question_text);
  },[phase,currentIndex,questions,hasAutoRead,speak]);

  // 题目切换时停止朗读 + 重置 autoRead 标记
  useEffect(()=>{try{(window as any).speechSynthesis?.cancel();}catch{}setHasAutoRead(false);},[currentIndex]);

  /* ---------- Recording ---------- */
  const startRecording=useCallback(async()=>{
    setTranscript('');setLiveText('');liveTextRef.current='';setTimer(0);setRecordedTime(0);timerValueRef.current=0;
    chunksRef.current=[];connectWs();
    const SR=createSR();if(!SR)setHasSpeechAPI(false);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
      if(SR){speechRef.current=SR;
        SR.onresult=(e:any)=>{
          // 分离：已确定(追加) vs 暂定(仅预览)
          for(let i=e.resultIndex;i<e.results.length;i++){
            const r=e.results[i];
            if(r.isFinal)liveTextRef.current+=r[0].transcript;
          }
          // 显示 = 确定文本 + 当前暂定文本
          let interim='';
          for(let i=0;i<e.results.length;i++){
            if(!e.results[i].isFinal)interim+=e.results[i][0].transcript;
          }
          setLiveText(liveTextRef.current+interim);
        };
        SR.onerror=(e:any)=>{if(e.error!=='no-speech'&&e.error!=='aborted')console.warn('SR error:',e.error);};
        SR.onend=()=>{};
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
    // 先用浏览器实时识别结果，立即进入 review
    const browserText=liveTextRef.current;
    setTranscript(browserText);
    if(chunksRef.current.length===0){setPhase('review');return;}
    // 后台用 FunASR 精转（不阻塞界面），结果不同才更新
    setAsrLoading(true);
    setPhase('review');  // 立即进入 review，不显示转圈
    try{
      const blob=new Blob(chunksRef.current,{type:'audio/webm'});
      const buf=await blob.arrayBuffer();
      const r=await api.post<{text:string}>(`/api/interview/${interviewId}/transcribe`,buf);
      const asrText=r?.text||'';
      // 只有 FunASR 结果明显不同时才替换
      if(asrText&&asrText!==browserText&&asrText.length>browserText.length*0.5){
        setTranscript(asrText);
      }else if(!browserText&&asrText){
        setTranscript(asrText);
      }
    }catch{}  // 失败静默，保留浏览器结果
    setAsrLoading(false);
  };

  const stopRecording=useCallback(()=>{
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive')mediaRecorderRef.current.stop();
    else processAudio();
  },[]);

  /* ---------- Submit & Scoring ---------- */
  const submitAnswer=useCallback(async(answerText:string,skip:boolean)=>{
    if(!interviewId)return;
    const q=questions[currentIndex];if(!q)return;
    // 提交答案（后台评分，不阻塞用户）
    setPhase('submitting');
    try{
      await api.post(`/api/interview/${interviewId}/submit-answer`,{
        order_index:q.order_index,
        answer_transcript:answerText,
        duration_seconds:skip?0:recordedTime
      });
    }catch{
      setPhase('review');
      return;
    }
    // 立即进入下一题或完成，评分在后端后台线程执行
    moveToNextOrComplete();
  },[interviewId,currentIndex,questions,recordedTime]);

  const moveToNextOrComplete=useCallback(()=>{
    try{(window as any).speechSynthesis?.cancel();}catch{}
    if(currentIndex<questions.length-1){setCurrentIndex(i=>i+1);setPhase('question');setTranscript('');setLiveText('');setTimer(0);setRecordedTime(0);setFeedback(null);}
    else setShowConfirm(true);
  },[currentIndex,questions.length]);

  const handleSkip=useCallback(()=>{if(phase==='scoring'||phase==='submitting')return;if(phase==='recording')stopRecording();setTimeout(()=>submitAnswer('',true),300);},[phase,stopRecording,submitAnswer]);
  const handleComplete=useCallback(async()=>{if(!interviewId||completing)return;setCompleting(true);try{await api.post(`/api/interview/${interviewId}/complete`);router.push(`/interview/result/${interviewId}`);}catch{setCompleting(false);setError('完成失败');}},[interviewId,completing,router]);

  /* ---------- Render ---------- */
  const total=questions.length,currentQ=questions[currentIndex];
  const progress=total>0?(currentIndex/total)*100:0;
  const displayText=transcript||liveText||'';
  const showTimer=recordedTime>0;

  if(loading)return<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"/></div>;
  if(error&&!currentQ)return<div className="flex flex-col items-center justify-center min-h-screen gap-4"><p className="text-red-500">{error}</p><Link href="/dashboard" className="text-blue-600">返回首页</Link></div>;
  if(!currentQ)return<div className="flex flex-col items-center justify-center min-h-screen gap-4"><p>暂无题目</p><Link href="/dashboard" className="text-blue-600">返回首页</Link></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">

        {/* ---- Top Bar ---- */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>返回首页
          </Link>
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${wsConnected?'bg-green-500':'bg-gray-300'}`}/>
            <span className="text-xs text-gray-400">AI 面试</span>
          </div>
        </div>

        {/* ---- Progress + Timer ---- */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">第 <span className="text-blue-600 font-bold">{currentIndex+1}</span> / {total} 题</span>
            <div className="flex items-center gap-4">
              {/* 非 question 阶段显示已用时 */}
              {showTimer && (phase==='review'||phase==='scoring'||phase==='feedback') && (
                <span className="text-xs text-gray-400">⏱ 本题用时 {formatTime(recordedTime)}</span>
              )}
              <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
            </div>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500" style={{width:`${progress}%`}}/>
          </div>
        </div>

        {/* ---- Question Card ---- */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-0">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS[currentQ.question_type]??''}`}>{QUESTION_TYPE_MAP[currentQ.question_type]??currentQ.question_type}</span>
          </div>
          <div className="px-5 sm:px-7 pt-4 pb-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 leading-relaxed flex-1">{currentQ.question_text}</h2>
              {phase==='question'&&(<button onClick={()=>speak(currentQ.question_text)} disabled={ttsPlaying} className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center disabled:opacity-40" title="朗读题目"><svg className={`w-5 h-5 text-blue-600 ${ttsPlaying?'animate-pulse':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg></button>)}
            </div>
          </div>
          <div className="border-t border-gray-100"/>

          {/* ======== Phase-based rendering ======== */}
          <div className="px-5 sm:px-7 py-6 sm:py-8">

            {/* ---- question: ready to record ---- */}
            {phase==='question'&&(
              <div className="flex flex-col items-center gap-6">
                {!hasSpeechAPI&&<p className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded">浏览器不支持语音识别，录音后将通过AI转写</p>}
                <p className="text-sm text-gray-400">准备好后，点击下方按钮开始录音回答</p>
                <button onClick={startRecording} className="relative w-24 h-24 rounded-full bg-white border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center group">
                  <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-3 0h6m-3-4a4 4 0 01-4-4V6a4 4 0 118 0v5a4 4 0 01-4 4z"/></svg>
                </button>
                <button onClick={handleSkip} className="px-6 py-2.5 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100">跳过此题</button>
              </div>
            )}

            {/* ---- recording: mic active ---- */}
            {phase==='recording'&&(
              <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-mono font-bold text-gray-800 tabular-nums">{formatTime(timer)}</div>
                  <p className="text-xs text-gray-400 mt-1">录音时长</p>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 rounded-full animate-ping bg-red-400/30"/>
                  <button onClick={stopRecording} className="relative w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-lg flex items-center justify-center active:scale-95">
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/></svg>
                  </button>
                </div>
                <p className="text-sm font-medium text-red-500 animate-pulse">录音中 · 点击停止</p>
                {liveText&&(<div className="w-full bg-blue-50 rounded-xl p-3 border border-blue-100 max-h-32 overflow-y-auto"><p className="text-xs text-blue-500 mb-1">实时转写：</p><p className="text-sm text-gray-600">{liveText}</p></div>)}
                <button onClick={handleSkip} className="px-6 py-2 text-sm text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600">跳过</button>
              </div>
            )}

            {/* ---- transcribing: ASR processing ---- */}
            {phase==='transcribing'&&(<Spinner label="AI 正在识别语音…"/> )}

            {/* ---- review: show transcript ---- */}
            {phase==='review'&&(
              <div className="flex flex-col gap-5">
                <div>{/* 时长标签 */}
                  {showTimer&&<p className="text-xs text-gray-400">⏱ 录音时长 {formatTime(recordedTime)}</p>}
                  <label className="block text-sm font-medium text-gray-600 mb-2 mt-2">你的回答</label>
                  <div className="bg-gray-50 rounded-xl p-4 min-h-[100px] border border-gray-200">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{displayText||'（未检测到回答内容）'}</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={()=>submitAnswer(displayText,false)} className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">提交回答</button>
                  <button onClick={startRecording} className="px-6 py-3 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100">重新录音</button>
                  <button onClick={handleSkip} className="px-6 py-3 text-sm text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600">跳过</button>
                </div>
              </div>
            )}

            {/* ---- submitting: saving answer (fast) ---- */}
            {phase==='submitting'&&(<Spinner label="正在保存回答…"/> )}

            {/* ---- scoring: LLM evaluating (deprecated — now background) ---- */}
            {phase==='scoring'&&(<Spinner label="AI 正在评分，请稍候…"/> )}

            {/* ---- feedback: results (deprecated — now shown on result page) ---- */}
            {phase==='feedback'&&feedback&&(
              <div className="flex flex-col gap-5">
                {/* 耗时信息 */}
                <p className="text-xs text-gray-400 text-center">⏱ 本题作答耗时 {formatTime(recordedTime)}</p>

                {/* 总分 */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <span className="text-2xl font-bold">{feedback.total_score}</span><span className="text-xs ml-0.5 mt-1">分</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">本题评分</p>
                </div>

                {/* 维度分 */}
                {feedback.dimension_scores&&(
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(feedback.dimension_scores).map(([k,v])=>(
                      <div key={k} className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-blue-600">{v}</div>
                        <div className="text-xs text-gray-500">{DIM_LABELS[k]||k}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 评语 */}
                {feedback.evaluation&&<div><label className="block text-sm font-medium text-gray-600 mb-2">评语</label><div className="bg-blue-50 rounded-xl p-4 border border-blue-100"><p className="text-sm text-gray-700 leading-relaxed">{feedback.evaluation}</p></div></div>}

                {/* 参考答案 */}
                {feedback.reference_answer&&<div><label className="block text-sm font-medium text-gray-600 mb-2">参考答案</label><div className="bg-green-50 rounded-xl p-4 border border-green-100"><p className="text-sm text-gray-700 leading-relaxed">{feedback.reference_answer}</p></div></div>}

                {/* 改进建议 */}
                {feedback.improvement_suggestion&&<div><label className="block text-sm font-medium text-gray-600 mb-2">改进建议</label><div className="bg-amber-50 rounded-xl p-4 border border-amber-100"><p className="text-sm text-gray-700 leading-relaxed">{feedback.improvement_suggestion}</p></div></div>}

                <button onClick={moveToNextOrComplete} className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700">
                  {currentIndex<questions.length-1?'下一题':'查看面试结果'}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-5">请在安静环境中回答，语速清晰</p>
      </div>

      {/* ---- Completion Modal ---- */}
      {showConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 sm:p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center"><svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">全部回答完成</h3>
            <p className="text-sm text-gray-500 mb-6">你已回答全部 {total} 道题目。⏱ 总耗时 {formatTime(totalTimeRef.current)}</p>
            <div className="flex gap-3">
              <button onClick={()=>setShowConfirm(false)} disabled={completing} className="flex-1 px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50">再看看</button>
              <button onClick={handleComplete} disabled={completing} className="flex-1 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">{completing?<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>生成报告中…</>:'完成面试'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"/></div>}><SessionContent/></Suspense>;
}
