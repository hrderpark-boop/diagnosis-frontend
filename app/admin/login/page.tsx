"use client";

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, KeyRound, AlertCircle } from 'lucide-react';
import { adminLogin } from '@/lib/adminApi';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await adminLogin(email.trim(), password);
      // 권한에 따라 착지 지점이 다르다. next 파라미터가 있으면 우선 존중하되,
      // 권한 밖 경로면 미들웨어가 다시 걸러낸다.
      const next = searchParams.get('next');
      const home = data.role === 'super_admin' ? '/super-admin/dashboard' : '/admin/dashboard';
      router.replace(next && next !== '/admin/login' ? next : home);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '로그인에 실패했습니다. 네트워크 상태를 확인해주세요.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-10 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 border border-blue-600/30">
            <Lock className="h-7 w-7 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">관리자 로그인</h1>
          <p className="mt-2 text-sm text-slate-400">
            리더십 진단 시스템 관리자 계정으로 접속하세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="관리자 이메일"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-white outline-none transition-colors focus:border-blue-500"
            />
          </div>

          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-3 pl-10 pr-4 text-white outline-none transition-colors focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-900/50 bg-rose-950/40 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-sm text-rose-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {loading ? '인증 중...' : '로그인'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          계정 발급은 시스템 운영자에게 문의하세요.
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginForm />
    </Suspense>
  );
}
