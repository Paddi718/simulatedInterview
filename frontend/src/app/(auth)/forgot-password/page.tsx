'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Mail,
  Loader2,
  ArrowLeft,
  Check,
  Lock,
  Eye,
  EyeOff,
  Timer,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Steps constants                                                    */
/* ------------------------------------------------------------------ */
const STEPS = [
  { label: '邮箱', mobileLabel: '1' },
  { label: '验证', mobileLabel: '2' },
  { label: '完成', mobileLabel: '3' },
] as const;

type StepIndex = 0 | 1 | 2;

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function ForgotPasswordPage() {
  /* -- state -------------------------------------------------------- */
  const [step, setStep] = useState<StepIndex>(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [animateKey, setAnimateKey] = useState(0); // re-mount children for animation

  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  /* -- resend countdown -------------------------------------------- */
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  /* -- code auto-focus after step change --------------------------- */
  useEffect(() => {
    if (step === 1) {
      // Small delay to let the DOM mount
      const id = setTimeout(() => codeRefs.current[0]?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [step]);

  /* -- helpers ----------------------------------------------------- */
  const triggerAnimate = () => setAnimateKey((k) => k + 1);

  const resetAll = () => {
    setStep(0);
    setCode(['', '', '', '', '', '']);
    setNewPassword('');
    setError('');
    setSuccessMsg('');
    setResendTimer(0);
  };

  /* -- handlers ---------------------------------------------------- */

  /** Step 1 -- send verification code */
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '发送失败');
      setStep(1);
      setResendTimer(60);
      triggerAnimate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Resend code (step 2) */
  const handleResend = async () => {
    if (resendTimer > 0) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '发送失败');
      setResendTimer(60);
      setSuccessMsg('验证码已重新发送');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  /** Code box change */
  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...code];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    const nextIdx = Math.min(pasted.length, 5);
    codeRefs.current[nextIdx]?.focus();
  };

  const isCodeComplete = code.every((d) => d !== '');

  /** Step 2 -- verify code & reset password */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (!isCodeComplete) {
      setError('请输入完整的 6 位验证码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: email.trim(),
          code: code.join(''),
          new_password: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '重置失败');
      setStep(2);
      triggerAnimate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-950">
      {/* ---- Side panel (desktop only) ---- */}
      <div className="hidden md:flex md:w-[440px] bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-800 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm mb-8">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">找回密码</h1>
          <p className="text-lg text-brand-100/80 max-w-xs mx-auto leading-relaxed">
            三步即可安全重置密码<br />
            验证身份 &rarr; 设置新密码 &rarr; 完成
          </p>
        </div>
      </div>

      {/* ---- Form side ---- */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-sm">

          {/* Back link */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回登录
          </Link>

          {/* ---- Step indicator ---- */}
          <StepIndicator current={step} />

          {/* ---- Step content ---- */}
          <div key={animateKey} className="animate-fade-in">
            {step === 0 && (
              <StepEmail
                email={email}
                onEmailChange={setEmail}
                error={error}
                loading={loading}
                onSubmit={handleSendCode}
              />
            )}

            {step === 1 && (
              <StepVerify
                email={email}
                code={code}
                codeRefs={codeRefs}
                onCodeChange={handleCodeChange}
                onCodeKeyDown={handleCodeKeyDown}
                onCodePaste={handleCodePaste}
                newPassword={newPassword}
                onNewPasswordChange={setNewPassword}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword((v) => !v)}
                error={error}
                successMsg={successMsg}
                loading={loading}
                resendTimer={resendTimer}
                isCodeComplete={isCodeComplete}
                onResend={handleResend}
                onBack={() => {
                  setStep(0);
                  setError('');
                  triggerAnimate();
                }}
                onSubmit={handleReset}
              />
            )}

            {step === 2 && <StepSuccess />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

/** Three-dot step indicator with connecting lines */
function StepIndicator({ current }: { current: StepIndex }) {
  return (
    <div className="flex items-center justify-center mb-10">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center">
          {/* Circle + label */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300',
                i < current &&
                  'bg-brand-500 text-white shadow-sm shadow-brand-200 dark:shadow-brand-900',
                i === current &&
                  'bg-brand-500 text-white ring-4 ring-brand-100 dark:ring-brand-900/40 shadow-sm shadow-brand-200 dark:shadow-brand-900',
                i > current &&
                  'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-2 border-gray-200 dark:border-gray-700',
              )}
            >
              {i < current ? <Check className="w-4 h-4" /> : s.mobileLabel}
            </div>
            <span
              className={cn(
                'text-xs font-medium hidden sm:block',
                i <= current
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-gray-400 dark:text-gray-500',
              )}
            >
              {s.label}
            </span>
          </div>
          {/* Connector line (not after last) */}
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                'w-14 sm:w-20 h-0.5 mx-2 mb-5 sm:mb-0 rounded-full transition-colors duration-300',
                i < current ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---- Step 1: Email ------------------------------------------------ */
function StepEmail({
  email,
  onEmailChange,
  error,
  loading,
  onSubmit,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  error: string;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        忘记密码
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
        输入注册时使用的邮箱或用户名
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
        {error && <ErrorBanner message={error} />}

        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="输入邮箱或用户名"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
            autoComplete="email"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className={cn(
            'w-full py-2.5 px-4 rounded-xl font-medium text-white transition-all duration-200',
            'bg-brand-500 hover:bg-brand-600 active:bg-brand-800',
            'shadow-sm hover:shadow-md',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2',
          )}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              发送中...
            </>
          ) : (
            '发送验证码'
          )}
        </button>
      </form>
    </>
  );
}

/* ---- Step 2: Code + New password ---------------------------------- */
function StepVerify({
  email,
  code,
  codeRefs,
  onCodeChange,
  onCodeKeyDown,
  onCodePaste,
  newPassword,
  onNewPasswordChange,
  showPassword,
  onTogglePassword,
  error,
  successMsg,
  loading,
  resendTimer,
  isCodeComplete,
  onResend,
  onBack,
  onSubmit,
}: {
  email: string;
  code: string[];
  codeRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onCodeChange: (index: number, value: string) => void;
  onCodeKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onCodePaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  newPassword: string;
  onNewPasswordChange: (v: string) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
  error: string;
  successMsg: string;
  loading: boolean;
  resendTimer: number;
  isCodeComplete: boolean;
  onResend: () => void;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        重置密码
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-2 text-sm break-all">
        验证码已发送到 <span className="font-medium text-gray-600 dark:text-gray-300">{email}</span>
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
        {error && <ErrorBanner message={error} />}
        {successMsg && <SuccessBanner message={successMsg} />}

        {/* ---- 6-digit code boxes ---- */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            验证码
          </label>
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  codeRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                onChange={(e) => onCodeChange(i, e.target.value)}
                onKeyDown={(e) => onCodeKeyDown(i, e)}
                onPaste={i === 0 ? onCodePaste : undefined}
                aria-label={`验证码第 ${i + 1} 位`}
                className={cn(
                  'w-11 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border transition-all duration-150',
                  'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
                  digit
                    ? 'border-brand-400 dark:border-brand-500 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700',
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-center text-gray-400 dark:text-gray-500">
            请输入 6 位验证码
          </p>
        </div>

        {/* ---- New password ---- */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            新密码
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => onNewPasswordChange(e.target.value)}
              placeholder="至少 6 位"
              className="w-full pl-10 pr-10 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ---- Submit ---- */}
        <button
          type="submit"
          disabled={loading || !isCodeComplete || newPassword.length < 6}
          className={cn(
            'w-full py-2.5 px-4 rounded-xl font-medium text-white transition-all duration-200',
            'bg-brand-500 hover:bg-brand-600 active:bg-brand-800',
            'shadow-sm hover:shadow-md',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-2',
          )}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              重置中...
            </>
          ) : (
            '重置密码'
          )}
        </button>

        {/* ---- Resend + Back ---- */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-brand-500 transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            修改邮箱
          </button>

          <button
            type="button"
            onClick={onResend}
            disabled={resendTimer > 0}
            className={cn(
              'text-sm transition-colors inline-flex items-center gap-1',
              resendTimer > 0
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-brand-500 hover:text-brand-600 dark:text-brand-400',
            )}
          >
            <Timer className="w-3.5 h-3.5" />
            {resendTimer > 0 ? `${resendTimer}s` : '重新发送'}
          </button>
        </div>
      </form>
    </>
  );
}

/* ---- Step 3: Success ---------------------------------------------- */
function StepSuccess() {
  return (
    <div className="text-center py-4 animate-slide-up">
      {/* Animated checkmark */}
      <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center animate-fade-in">
          <Check className="w-6 h-6 text-white" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        密码已重置
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">
        请使用新密码登录你的账号
      </p>

      <Link
        href="/login"
        className={cn(
          'block w-full py-2.5 px-4 rounded-xl font-medium text-white text-center transition-all duration-200',
          'bg-brand-500 hover:bg-brand-600 active:bg-brand-800',
          'shadow-sm hover:shadow-md',
        )}
      >
        去登录
      </Link>
    </div>
  );
}

/* ---- Shared banners ----------------------------------------------- */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm border border-red-100 dark:border-red-800/30 animate-fade-in">
      {message}
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-4 py-2.5 rounded-xl text-sm border border-green-100 dark:border-green-800/30 animate-fade-in">
      {message}
    </div>
  );
}
