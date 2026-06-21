'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: 'female', style: '活泼' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', gender: 'female', style: '温柔' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', gender: 'male', style: '专业' },
  { id: 'zh-CN-YunjianNeural', name: '云健', gender: 'male', style: '运动' },
  { id: 'zh-CN-YunxiNeural', name: '云希', gender: 'male', style: '叙述' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [voice, setVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [speed, setSpeed] = useState(1.0);
  const [autoRead, setAutoRead] = useState(false);
  const [saved, setSaved] = useState(false);
  // API 配置
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiModel, setApiModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savedApi, setSavedApi] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.push('/login'); return; }
    setVoice(localStorage.getItem('tts_voice') || 'zh-CN-XiaoxiaoNeural');
    setSpeed(parseFloat(localStorage.getItem('tts_speed') || '1.0'));
    setAutoRead(localStorage.getItem('tts_auto_read') === 'true');
    api.get<any>('/api/auth/me').then((u) => {
      setUser(u);
      if (u.tts_preference) {
        setVoice(u.tts_preference.voice || voice);
        setSpeed(u.tts_preference.speed || speed);
        setAutoRead(u.tts_preference.auto_read ?? autoRead);
      }
      if (u.llm_config) {
        setApiKey(u.llm_config.api_key || '');
        setApiBase(u.llm_config.api_base || '');
        setApiModel(u.llm_config.model || '');
      }
    }).catch(() => { localStorage.removeItem('access_token'); router.push('/login'); });
  }, []);

  const handleSave = async () => {
    localStorage.setItem('tts_voice', voice);
    localStorage.setItem('tts_speed', String(speed));
    localStorage.setItem('tts_auto_read', String(autoRead));
    try {
      await api.put('/api/auth/me', { tts_preference: { voice, speed, auto_read: autoRead } });
    } catch (err) { console.warn('Failed to sync TTS settings:', err); }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveApi = async () => {
    const config = { api_key: apiKey, api_base: apiBase, model: apiModel };
    try {
      await api.put('/api/auth/me', { llm_config: config });
    } catch (err) { console.warn('Failed to sync API settings:', err); }
    setSavedApi(true);
    setTimeout(() => setSavedApi(false), 2000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await api.post('/api/auth/test-llm', { api_key: apiKey, api_base: apiBase, model: apiModel });
      alert('连接成功！API 配置有效。');
    } catch (err: any) {
      alert('连接失败：' + (err.message || '未知错误'));
    }
    setTesting(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">设置</h1>
        <Link href="/dashboard" className="text-brand-500 hover:underline">← 返回</Link>
      </div>

      {user && (
        <div className="space-y-6">
          {/* Profile */}
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">个人信息</h2>
            <p><span className="text-gray-500">用户名：</span>{user.username}</p>
          </div>

          {/* Voice Settings */}
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">语音偏好</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">AI 面试官音色</label>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.gender === 'female' ? '女' : '男'} · {v.style})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">语速：{speed}x</label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))} className="w-full" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">自动朗读题目</label>
                  <p className="text-xs text-gray-400">进入每题时 AI 面试官自动朗读题目</p>
                </div>
                <button onClick={() => setAutoRead(!autoRead)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${autoRead ? 'bg-brand-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoRead ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <button onClick={handleSave} className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600">
                {saved ? '已保存 ✓' : '保存设置'}
              </button>
            </div>
          </div>

          {/* API Configuration */}
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-1">API 配置</h2>
            <p className="text-xs text-gray-400 mb-4">自定义 LLM API，不填则使用系统默认配置</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 pr-10 border rounded-lg font-mono text-sm" />
                  <button onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">API Base URL</label>
                <input type="text" value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <input type="text" value={apiModel}
                  onChange={(e) => setApiModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm" />
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveApi} className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-sm">
                  {savedApi ? '已保存 ✓' : '保存 API 配置'}
                </button>
                <button onClick={handleTestConnection} disabled={testing}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50">
                  {testing ? '测试中…' : '测试连接'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
