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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    api.get<any>('/api/auth/me').then((u) => {
      setUser(u);
      if (u.tts_preference) {
        setVoice(u.tts_preference.voice || 'zhitian');
        setSpeed(u.tts_preference.speed || 1.0);
      }
    }).catch(() => {
      localStorage.removeItem('access_token');
      router.push('/login');
    });
  }, []);

  const handleSave = async () => {
    // 同时保存到 localStorage（离线兜底）和后端（跨设备同步）
    localStorage.setItem('tts_voice', voice);
    localStorage.setItem('tts_speed', String(speed));
    try {
      await api.put('/api/auth/me', { tts_preference: { voice, speed } });
    } catch (err) {
      // 后端保存失败不影响本地使用，仅静默失败
      console.warn('Failed to sync TTS preference to server:', err);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">设置</h1>
        <Link href="/dashboard" className="text-blue-600 hover:underline">← 返回</Link>
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
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {saved ? '已保存 ✓' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
