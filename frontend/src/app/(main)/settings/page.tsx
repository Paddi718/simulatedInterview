'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getWsUrl } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  User,
  Mic,
  Keyboard,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Volume2,
  ChevronRight,
} from 'lucide-react';

interface VoiceItem {
  id: string;
  name: string;
  gender: string;
  style: string;
}

interface UserData {
  id: string;
  username: string;
  email: string | null;
  tts_preference: { voice: string; speed: number; auto_read: boolean } | null;
  llm_config: { api_key: string; api_base: string; model: string } | null;
  created_at: string;
}

export default function SettingsPage() {
  const router = useRouter();

  // ── State ──
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDone, setProfileDone] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState('');

  // TTS
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voice, setVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [speed, setSpeed] = useState(1.0);
  const [autoRead, setAutoRead] = useState(false);
  const [ttsSaving, setTtsSaving] = useState(false);
  const [ttsDone, setTtsDone] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

  // API Config
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiModel, setApiModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiSaving, setApiSaving] = useState(false);
  const [apiDone, setApiDone] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  // ── Load ──
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.push('/login'); return; }

    // 从 localStorage 恢复 TTS 设置（即时生效）
    const storedVoice = localStorage.getItem('tts_voice');
    const storedSpeed = localStorage.getItem('tts_speed');
    const storedAuto = localStorage.getItem('tts_auto_read');
    if (storedVoice) setVoice(storedVoice);
    if (storedSpeed) setSpeed(parseFloat(storedSpeed));
    if (storedAuto) setAutoRead(storedAuto === 'true');

    Promise.all([
      api.get<UserData>('/api/auth/me'),
      api.get<VoiceItem[]>('/api/auth/voices'),
    ]).then(([u, v]) => {
      setUser(u);
      setUsername(u.username);
      setEmail(u.email || '');
      // 服务端 tts_preference 为权威源（跨设备同步）：
      // 有值就覆盖本地 state 与 localStorage，避免 localStorage 残留旧值
      // 导致"必须点保存才生效"。
      if (u.tts_preference) {
        const p = u.tts_preference;
        if (p.voice) { setVoice(p.voice); localStorage.setItem('tts_voice', p.voice); }
        if (p.speed) { setSpeed(p.speed); localStorage.setItem('tts_speed', String(p.speed)); }
        if (p.auto_read !== undefined) {
          setAutoRead(p.auto_read);
          localStorage.setItem('tts_auto_read', String(p.auto_read));
        }
      }
      if (u.llm_config) {
        const key = u.llm_config.api_key || '';
        if (key === '***') {
          setHasExistingKey(true);  // 已配置但脱敏，不清空字段
        } else {
          setHasExistingKey(false);
          if (key) setApiKey(key);
        }
        setApiBase(u.llm_config.api_base || '');
        setApiModel(u.llm_config.model || '');
      }
      if (Array.isArray(v)) setVoices(v);
    }).catch(() => {
      localStorage.removeItem('access_token');
      router.push('/login');
    }).finally(() => setLoading(false));
  }, [router]);

  // ── Flash helper ──
  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // ── Save profile ──
  const saveProfile = async () => {
    if (!username.trim() || username.trim().length < 2) return;
    setProfileSaving(true);
    try {
      const updated = await api.put<UserData>('/api/auth/me', {
        username: username.trim(),
        email: email.trim() || null,
      });
      setUser(updated);
      flash(setProfileDone);
    } catch (err: any) {
      alert(err.message || '保存失败');
    }
    setProfileSaving(false);
  };

  // ── Save password ──
  const savePassword = async () => {
    setPwError('');
    if (!currentPw) { setPwError('请输入当前密码'); return; }
    if (!newPw || newPw.length < 6) { setPwError('新密码至少 6 位'); return; }
    if (newPw !== confirmPw) { setPwError('两次密码不一致'); return; }
    setPwSaving(true);
    try {
      await api.put<UserData>('/api/auth/me', {
        current_password: currentPw,
        new_password: newPw,
      });
      flash(setPwDone);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      setPwError(err.message || '密码修改失败');
    }
    setPwSaving(false);
  };

  // ── Save TTS ──
  const saveTTS = async () => {
    setTtsSaving(true);
    const pref = { voice, speed, auto_read: autoRead };
    // 写入 localStorage（即时生效）
    localStorage.setItem('tts_voice', voice);
    localStorage.setItem('tts_speed', String(speed));
    localStorage.setItem('tts_auto_read', String(autoRead));
    // 同步到服务端
    try {
      await api.put('/api/auth/me', { tts_preference: pref });
    } catch (err) {
      console.warn('Failed to sync TTS settings to server:', err);
    }
    flash(setTtsDone);
    setTtsSaving(false);
  };

  // ── Save API ──
  const saveAPI = async () => {
    setApiSaving(true);
    try {
      // 如果 Key 是掩码值 *** 或为空，不传 api_key（保留已存值）
      const config: Record<string, string> = {
        api_base: apiBase,
        model: apiModel,
      };
      if (apiKey && apiKey !== '***') {
        config.api_key = apiKey;
      }
      await api.put('/api/auth/me', { llm_config: config });
      flash(setApiDone);
    } catch (err: any) {
      alert(err.message || '保存失败');
    }
    setApiSaving(false);
  };

  // ── Test connection ──
  const testConnection = async () => {
    setTesting(true);
    try {
      await api.post('/api/auth/test-llm', {
        api_key: apiKey, api_base: apiBase, model: apiModel,
      });
      alert('连接成功！API 配置有效。');
    } catch (err: any) {
      alert('连接失败：' + (err.message || '未知错误'));
    }
    setTesting(false);
  };

  // ── Voice preview ──
  const previewVoice = useCallback(async (voiceId: string) => {
    if (previewing) return;
    setPreviewing(voiceId);
    try {
      const t = localStorage.getItem('access_token');
      const ws = new WebSocket(`${getWsUrl()}/api/ws/interview/00000000-0000-0000-0000-000000000000?token=${t}`);
      ws.binaryType = 'arraybuffer';
      const audioContext = new AudioContext();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 8000);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: 'tts_request',
            text: '你好，我是你的AI面试官，很高兴为你服务。',
            voice: voiceId,
            speed: speed,
          }));
        };
        ws.onmessage = async (e) => {
          clearTimeout(timeout);
          if (e.data instanceof ArrayBuffer) {
            try {
              const audio = await audioContext.decodeAudioData(e.data.slice(0));
              const source = audioContext.createBufferSource();
              source.buffer = audio;
              source.connect(audioContext.destination);
              source.onended = () => { audioContext.close(); resolve(); };
              source.start();
            } catch { resolve(); }
          }
          ws.close();
        };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('ws error')); };
      });
    } catch {
      // 预览失败静默
    }
    setPreviewing(null);
  }, [previewing, speed]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">设置</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">管理个人信息与应用偏好</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          返回
        </Link>
      </div>

      <div className="space-y-6">
        {/* ═══════════════════════════════════════════
            个人信息
            ═══════════════════════════════════════════ */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-brand-500" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">个人信息</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                用户名
              </label>
              <input
                type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                邮箱 {user?.email ? <span className="text-green-600 dark:text-green-400 font-normal text-xs ml-1">✓ 已验证</span> : <span className="text-gray-400 font-normal">（选填）</span>}
              </label>
              <input
                type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={user?.email ? "" : "example@mail.com"}
                disabled={!!user?.email}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all",
                  user?.email
                    ? "bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed"
                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                )}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                注册时间：{new Date(user.created_at).toLocaleDateString('zh-CN')}
              </p>
              <Button size="sm" onClick={saveProfile} disabled={profileSaving}>
                {profileSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {profileDone ? <Check className="w-3.5 h-3.5 mr-1.5" /> : null}
                {profileDone ? '已保存' : '保存'}
              </Button>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            密码修改
            ═══════════════════════════════════════════ */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-brand-500" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">密码修改</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {pwError && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                {pwError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">当前密码</label>
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">新密码</label>
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">确认新密码</label>
                <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={savePassword} disabled={pwSaving}>
                {pwSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {pwDone ? <Check className="w-3.5 h-3.5 mr-1.5" /> : null}
                {pwDone ? '已修改' : '修改密码'}
              </Button>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            语音偏好
            ═══════════════════════════════════════════ */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-brand-500" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">语音偏好</h2>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {/* Voice selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                AI 面试官音色
              </label>
              <div className="grid grid-cols-2 gap-2">
                {voices.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all text-left',
                      voice === v.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 ring-1 ring-brand-500/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <div>
                      <span className="font-medium">{v.name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">
                        {v.gender === 'female' ? '女' : '男'} · {v.style}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); previewVoice(v.id); }}
                      disabled={previewing === v.id}
                      title="试听"
                      className="shrink-0 ml-2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 disabled:opacity-50 transition-colors"
                    >
                      {previewing === v.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </button>
                ))}
              </div>
            </div>

            {/* Speed slider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                语速
                <span className="ml-2 text-xs font-mono text-brand-500 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded-full">
                  {speed.toFixed(1)}x
                </span>
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">0.5x</span>
                <input
                  type="range" min="0.5" max="2.0" step="0.1" value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-sm"
                />
                <span className="text-xs text-gray-400">2.0x</span>
              </div>
            </div>

            {/* Auto-read toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  自动朗读题目
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  进入每道题时 AI 面试官自动朗读题目内容
                </p>
              </div>
              <button
                onClick={() => setAutoRead(!autoRead)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors shrink-0',
                  autoRead ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                    autoRead ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={saveTTS} disabled={ttsSaving}>
                {ttsSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {ttsDone ? <Check className="w-3.5 h-3.5 mr-1.5" /> : null}
                {ttsDone ? '已保存' : '保存语音设置'}
              </Button>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            API 配置
            ═══════════════════════════════════════════ */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-brand-500" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">API 配置</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs text-gray-400 -mt-1">
              自定义 LLM API，留空则使用系统默认配置。你的密钥将加密存储在服务端。
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                API Key
                {hasExistingKey && !apiKey && (
                  <span className="text-green-600 dark:text-green-400 font-normal text-xs ml-1">✓ 已保存（安全隐藏）</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'} value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setHasExistingKey(false); }}
                  placeholder={hasExistingKey ? '留空则不修改已保存的 Key' : 'sk-...'}
                  className="w-full px-3 py-2 pr-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">API Base URL</label>
              <input
                type="text" value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://api.deepseek.com/v1"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Model</label>
              <input
                type="text" value={apiModel}
                onChange={(e) => setApiModel(e.target.value)}
                placeholder="deepseek-chat"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={testConnection} disabled={testing || !apiKey}>
                {testing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                测试连接
              </Button>
              <Button size="sm" onClick={saveAPI} disabled={apiSaving}>
                {apiSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {apiDone ? <Check className="w-3.5 h-3.5 mr-1.5" /> : null}
                {apiDone ? '已保存' : '保存配置'}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
