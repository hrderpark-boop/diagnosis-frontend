"use client";

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminLogin, clearAdminSession, AdminRole } from '@/lib/adminApi';
import { baseForRole } from '@/lib/adminRoutes';

/**
 * 관리자 로그인 화면(고객사 HR /admin/login · 마스터 /master/login 공용 틀).
 * 흰 바탕 + 모서리 곡면(교재 표지 구성) + 큰 워드마크. 두 콘솔은 주소와 허용 권한만 다르다.
 * 다른 콘솔 권한으로 로그인하면 세션을 지우고 알맞은 주소를 안내한다(실제 권한 집행은 백엔드).
 */

type Variant = 'hr' | 'master';

const COPY: Record<Variant, { title: string; desc: string; lead: string; foot: string; role: AdminRole }> = {
  hr: {
    title: '관리자 콘솔',
    desc: '진단 운영부터 결과에 따른 교육까지.',
    lead: '발급받은 HR 관리자 계정으로 접속하세요.',
    foot: '계정 발급·비밀번호 재설정은 커넥트앤컴퍼니에 문의하세요.',
    role: 'client_admin',
  },
  master: {
    title: '마스터 콘솔',
    desc: '고객사·조직 코드·관리자 키를 관리합니다.',
    lead: '운영사 마스터 계정으로 접속하세요.',
    foot: '이 주소는 운영사 전용입니다. 고객사에 공유하지 마세요.',
    role: 'super_admin',
  },
};

function Waves() {
  return (
    <svg className="waves" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="faWvNavy" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#1C2B4A" />
          <stop offset=".6" stopColor="#2E4A85" />
          <stop offset="1" stopColor="#4F86F7" stopOpacity=".75" />
        </linearGradient>
        <linearGradient id="faWvNavy2" x1="1" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#4F86F7" stopOpacity=".7" />
          <stop offset=".45" stopColor="#2E4A85" />
          <stop offset="1" stopColor="#1C2B4A" />
        </linearGradient>
        <linearGradient id="faWvGray" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E4E8EF" />
          <stop offset="1" stopColor="#F6F7FA" />
        </linearGradient>
        <linearGradient id="faWvGray2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#CDD4E0" stopOpacity=".75" />
          <stop offset="1" stopColor="#E7EBF2" stopOpacity=".5" />
        </linearGradient>
      </defs>
      <path d="M0 0 H380 C262 44 168 150 142 318 C118 474 70 560 0 616 Z" fill="url(#faWvNavy)" />
      <path d="M300 900 C520 880 660 830 760 700 C880 544 990 476 1180 466 C1300 460 1390 478 1440 500 V900 Z" fill="url(#faWvGray)" />
      <path d="M620 900 C820 860 940 770 1040 660 C1150 540 1290 470 1440 450 V900 Z" fill="url(#faWvGray2)" />
      <path d="M620 900 C820 860 940 770 1040 660 C1150 540 1290 470 1440 450" fill="none" stroke="#fff" strokeWidth="6" />
      <path d="M980 900 C1110 846 1210 740 1276 620 C1330 520 1384 452 1440 410 V900 Z" fill="url(#faWvNavy2)" />
    </svg>
  );
}

function LoginForm({ variant }: { variant: Variant }) {
  const copy = COPY[variant];
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
      if (data.role !== copy.role) {
        // 다른 콘솔 계정: 세션을 남기지 않고 알맞은 주소를 안내
        clearAdminSession();
        setError(variant === 'hr'
          ? '마스터 계정입니다. 마스터 콘솔(/master/login)에서 로그인해 주세요.'
          : '고객사 HR 계정입니다. HR 관리자 콘솔(/admin/login)에서 로그인해 주세요.');
        setLoading(false);
        return;
      }
      const base = baseForRole(data.role);
      const next = searchParams.get('next');
      router.replace(next && next.startsWith(base) && next !== `${base}/login` ? next : `${base}/dashboard`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || '로그인에 실패했습니다. 네트워크 상태를 확인해 주세요.');
      setLoading(false);
    }
  };

  return (
    <form className="box" onSubmit={handleSubmit}>
      <h1>{variant === 'hr' ? '관리자 로그인' : '마스터 로그인'}</h1>
      <p className="lead">{copy.lead}</p>
      <div className="fa-field">
        <label htmlFor="fa-email">이메일</label>
        <input id="fa-email" className="fa-input" type="email" required autoFocus autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
      </div>
      <div className="fa-field">
        <label htmlFor="fa-pw">비밀번호</label>
        <input id="fa-pw" className="fa-input" type="password" required autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <div className="fa-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
      <button type="submit" className="fa-btn primary block" disabled={loading}>
        {loading ? '확인하는 중…' : '로그인'}
      </button>
      <p className="foot">{copy.foot}</p>
    </form>
  );
}

export default function AdminLoginShell({ variant }: { variant: Variant }) {
  const copy = COPY[variant];
  return (
    <div className="fa-root fa-login">
      <Waves />
      <div className="fa-login-in">
        <div className="title">
          <div className="fa-wm"><span className="f">Find</span><span className="m fm-me-wave">Me</span></div>
          <h2>{copy.title}</h2>
          <p>{copy.desc}</p>
        </div>
        <Suspense fallback={<div className="box" />}>
          <LoginForm variant={variant} />
        </Suspense>
      </div>
      <div className="fa-login-copy">© Connect &amp; Company</div>
    </div>
  );
}
