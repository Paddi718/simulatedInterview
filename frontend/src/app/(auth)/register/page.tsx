'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Mail, Lock, Eye, EyeOff, Loader2, Sparkles, ShieldCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});

  // 验证码阶段
  const [needVerify, setNeedVerify] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [resending, setResending] = useState(false);
  const [resentMsg, setResentMsg] = useState('');

  const register = useAuthStore((s) => s.register);
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendCode = useAuthStore((s) => s.resendCode);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!email.trim()) {
      setError('请输入邮箱');
      return;
    }

    const errors: { password?: string; confirm?: string } = {};
    if (password.length < 6) {
      errors.password = '密码至少 6 位';
    }
    if (password !== confirmPassword) {
      errors.confirm = '两次密码不一致';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const needsVerify = await register(username, password, email);
      if (needsVerify) {
        setNeedVerify(true);
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyEmail(username, verifyCode);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || '验证失败');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      await resendCode(username);
      setResentMsg('验证码已重新发送');
    } catch (err: any) {
      setError(err.message || '重发失败');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Brand Side */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-800 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm mb-8">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">AI 模拟面试</h1>
          <p className="text-xl text-brand-100/80 max-w-md">
            智能语音面试 &middot; AI 即时评分 &middot; 专业报告导出
          </p>
          <div className="mt-12 flex flex-col gap-4 max-w-sm mx-auto">
            <div className="flex items-center gap-3 text-brand-100/70">
              <div className="w-8 h-0.5 bg-brand-400/30 rounded-full shrink-0" />
              <span className="text-sm">真实场景模拟面试体验</span>
            </div>
            <div className="flex items-center gap-3 text-brand-100/70">
              <div className="w-8 h-0.5 bg-brand-400/30 rounded-full shrink-0" />
              <span className="text-sm">AI 驱动的智能评分系统</span>
            </div>
            <div className="flex items-center gap-3 text-brand-100/70">
              <div className="w-8 h-0.5 bg-brand-400/30 rounded-full shrink-0" />
              <span className="text-sm">专业面试报告一键导出</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Form Side */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {needVerify ? '验证邮箱' : '创建账号'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {needVerify ? `验证码已发送到 ${email}` : '注册你的账号'}
            </p>
          </div>

          {needVerify ? (
            /* 验证码阶段 */
            <form onSubmit={handleVerify} className="space-y-5">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm border border-red-100 dark:border-red-800/30">
                  {error}
                </div>
              )}
              {resentMsg && (
                <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-4 py-3 rounded-xl text-sm border border-green-100 dark:border-green-800/30">
                  {resentMsg}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  验证码
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent tracking-[0.5em] text-center text-lg"
                    placeholder="000000"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || verifyCode.length < 6}
                className={cn(
                  'w-full py-2.5 px-4 rounded-xl font-medium text-white transition-all duration-200',
                  'bg-brand-500 hover:bg-brand-600 active:bg-brand-800',
                  'shadow-sm hover:shadow-md',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'flex items-center justify-center gap-2'
                )}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />验证中...</> : '验证并登录'}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="w-full py-2 text-sm text-brand-500 hover:text-brand-600 transition-colors"
              >
                {resending ? '发送中...' : '重新发送验证码'}
              </button>
            </form>
          ) : (
            /* 注册表单 */
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm border border-red-100 dark:border-red-800/30">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  用户名
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                    placeholder="请输入用户名"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  邮箱
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                    placeholder="用于接收验证码"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      'w-full pl-10 pr-10 py-2.5 border rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200',
                      fieldErrors.password
                        ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                        : 'border-gray-200 dark:border-gray-700 focus:ring-brand-500'
                    )}
                    placeholder="至少 6 位密码"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1.5 text-sm text-red-500">{fieldErrors.password}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  确认密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={cn(
                      'w-full pl-10 pr-10 py-2.5 border rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200',
                      fieldErrors.confirm
                        ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                        : 'border-gray-200 dark:border-gray-700 focus:ring-brand-500'
                    )}
                    placeholder="请再次输入密码"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.confirm && (
                  <p className="mt-1.5 text-sm text-red-500">{fieldErrors.confirm}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-2.5 px-4 rounded-xl font-medium text-white transition-all duration-200',
                  'bg-brand-500 hover:bg-brand-600 active:bg-brand-800',
                  'shadow-sm hover:shadow-md',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'flex items-center justify-center gap-2'
                )}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />注册中...</> : '注册'}
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            已有账号？{' '}
            <Link
              href="/login"
              className="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors"
            >
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
