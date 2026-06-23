'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Search, Key, Globe, CheckCircle2, XCircle, Loader2, FlaskConical } from 'lucide-react';

const PROVIDER_INFO: Record<string, { name: string; desc: string; url: string }> = {
  serper: { name: 'Serper', desc: 'Google 搜索结果，中文最优', url: 'https://serper.dev' },
  tavily: { name: 'Tavily', desc: 'AI 优化摘要，每月 1,000 次', url: 'https://app.tavily.com' },
  searxng: { name: 'SearXNG', desc: '自部署元搜索引擎', url: '' },
  builtin: { name: '内置 Bing', desc: '自动兜底，无需配置', url: '' },
};

function AdminSettingsContent() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // 表单状态
  const [serperKey, setSerperKey] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [providers, setProviders] = useState('serper,tavily,builtin');
  const [searxngUrl, setSearxngUrl] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const data = await api.get<Record<string, string>>('/api/admin/config');
      setConfig(data);
      // DB 有完整值则用 DB，否则回退到脱敏值
      setSerperKey(data.search_serper_api_key || '');
      setTavilyKey(data.search_tavily_api_key || '');
      setProviders(data.search_providers || 'serper,tavily,builtin');
      setSearxngUrl(data.search_searxng_url || '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/api/admin/config', {
        search_serper_api_key: serperKey,
        search_tavily_api_key: tavilyKey,
        search_providers: providers,
        search_searxng_url: searxngUrl,
      });
      toast({ title: '配置已保存', variant: 'success' });
      loadConfig();
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await api.post<{ result: string }>('/api/admin/config/test-search');
      setTestResult(data.result);
    } catch (err: any) {
      setTestResult('测试失败: ' + (err.message || '未知错误'));
    } finally {
      setTesting(false);
    }
  };

  const providerOrder = providers.split(',').map(s => s.trim()).filter(Boolean);
  const hasBuiltin = providerOrder.includes('builtin');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          系统配置
        </h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          搜索服务与管理配置
        </p>
      </div>

      {/* Search Config */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-gray-400" />
            <CardTitle className="text-base">搜索服务配置</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Priority Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              优先级顺序（逗号分隔，从前到后调用）
            </label>
            <Input value={providers} onChange={(e) => setProviders(e.target.value)}
              placeholder="serper,tavily,builtin" className="font-mono text-sm" />
            <div className="flex flex-wrap gap-2 mt-2">
              {providerOrder.map((p) => {
                const info = PROVIDER_INFO[p];
                const isBuiltin = p === 'builtin';
                return (
                  <span key={p} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    isBuiltin
                      ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      : 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400'
                  }`}>
                    {info?.name || p}
                    {isBuiltin ? '（自动兜底）' : ''}
                  </span>
                );
              })}
            </div>
          </div>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Serper */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Key className="h-4 w-4" />
              Serper API Key
              {serperKey ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}
            </label>
            <Input value={serperKey} onChange={(e) => setSerperKey(e.target.value)}
              type="password" placeholder="未配置（将跳过 Serper）" className="font-mono text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              免费注册 <a href="https://serper.dev" target="_blank" className="text-brand-500 hover:underline">serper.dev</a>，Google 搜索结果，中文最优。无需信用卡，邮箱注册即可。
            </p>
          </div>

          {/* Tavily */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Key className="h-4 w-4" />
              Tavily API Key
              {tavilyKey ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}
            </label>
            <Input value={tavilyKey} onChange={(e) => setTavilyKey(e.target.value)}
              type="password" placeholder="未配置（将跳过 Tavily）" className="font-mono text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              免费注册 <a href="https://app.tavily.com" target="_blank" className="text-brand-500 hover:underline">app.tavily.com</a>，AI 优化搜索，每月 1,000 次。无需信用卡。
            </p>
          </div>

          {/* SearXNG */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Globe className="h-4 w-4" />
              SearXNG URL（可选）
              {searxngUrl ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}
            </label>
            <Input value={searxngUrl} onChange={(e) => setSearxngUrl(e.target.value)}
              placeholder="未配置（将跳过 SearXNG）" className="font-mono text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              自部署，免费无限。Docker: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">docker run -d -p 8080:8080 searxng/searxng</code>
            </p>
          </div>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Builtin status */}
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-gray-600 dark:text-gray-400">内置 Bing 搜索：</span>
            <span className="font-medium text-green-600 dark:text-green-400">始终可用（最终兜底）</span>
          </div>
        </CardContent>
      </Card>

      {/* Test & Save */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="secondary" onClick={handleTest} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FlaskConical className="h-4 w-4 mr-2" />}
          测试搜索
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </Button>
      </div>

      {/* Test Result */}
      {testResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">搜索结果（测试省份: 广东省）</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
              {testResult}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <ToastProvider>
      <AdminSettingsContent />
    </ToastProvider>
  );
}
