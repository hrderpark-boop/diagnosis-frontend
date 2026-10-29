// components/layouts/AdminLayout.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { fetchMe, clearAdminSession, AdminProfile, fetchAlerts, AdminAlerts } from '@/lib/adminApi';
import { baseForRole, MASTER_BASE } from '@/lib/adminRoutes';

/**
 * 관리자 콘솔 공통 레이아웃(라이트 리디자인).
 *
 * 두 콘솔은 주소부터 분리한다: 고객사 HR → /admin/*, 마스터 → /master/*.
 * 권한은 /admin/auth/me 응답으로 확인하고, 메뉴·조회 범위 표시는 그에 따른다.
 * 실제 권한 집행은 백엔드가 매 요청마다 JWT 로 한다.
 */

interface MenuItem { name: string; href: string }
interface MenuGroup { group: string; items: MenuItem[] }

// 고객사 HR 메뉴 — 자사 데이터 범위
const HR_MENU: MenuGroup[] = [
  { group: '진단', items: [
    { name: '진단 현황', href: '/admin/dashboard' },
    { name: '대상자 · 참여', href: '/admin/participants' },
    { name: '종합 리포트', href: '/admin/reports' },
  ] },
  { group: '관리', items: [
    { name: '설정', href: '/admin/settings' },
  ] },
];

// 마스터 메뉴 — 전 고객사 + 시스템
const MASTER_MENU: MenuGroup[] = [
  { group: '운영', items: [
    { name: '대시보드', href: '/master/dashboard' },
    { name: '고객사 관리', href: '/master/companies' },
  ] },
  { group: '데이터', items: [
    { name: '전체 참여자', href: '/master/participants' },
    { name: '전체 리포트', href: '/master/reports' },
  ] },
  { group: '계정', items: [
    { name: '설정', href: '/master/settings' },
  ] },
];

/** 페이지 머리: 네이비 면 + 큰 제목. kpis 를 주면 같은 면에 숫자 띠가 이어진다. */
export function AdminPageHead({
  eyebrow, title, desc, actions, kpis,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  actions?: React.ReactNode;
  kpis?: Array<{ label: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode; detail?: React.ReactNode }>;
}) {
  return (
    <>
      <div className={`fa-head${kpis?.length ? ' has-kpis' : ''}`}>
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {desc && <p>{desc}</p>}
        </div>
        {actions && <div className="fa-actions">{actions}</div>}
      </div>
      {kpis?.length ? (
        <div className="fa-kpis">
          {kpis.map((k, i) => (
            <div key={i} className="fa-kpi">
              <div className="k">{k.label}</div>
              <div className="v">{k.value}{k.unit && <small>{k.unit}</small>}</div>
              {k.detail && <div className="d">{k.detail}</div>}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // 미들웨어가 토큰 유무는 이미 걸렀지만, 토큰이 위조/만료됐을 수 있으므로
    // 서버에 실제 유효성을 물어본다. 실패 시 adminApi 인터셉터가 로그인으로 보낸다.
    let alive = true;
    fetchMe()
      .then((me) => { if (alive) setProfile(me); })
      .catch(() => { /* 401 처리는 adminApi 인터셉터가 담당 */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // 운영 알림(크레딧 소진·5xx 등)은 마스터에게만. 60초마다 갱신.
  const isMasterPath = pathname?.startsWith(MASTER_BASE);
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null);
  useEffect(() => {
    if (!isMasterPath) return;
    let alive = true;
    const load = () => fetchAlerts().then(a => { if (alive) setAlerts(a); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [isMasterPath]);

  const handleLogout = () => {
    const login = `${baseForRole(profile?.role)}/login`;
    clearAdminSession();
    router.replace(login);
  };

  if (loading) {
    return (
      <div className="fa-root fa-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        관리자 정보를 확인하는 중입니다…
      </div>
    );
  }

  const isSuper = profile?.role === 'super_admin';
  const menu = isSuper ? MASTER_MENU : HR_MENU;
  const scopeLabel = isSuper ? '마스터 · 전체 고객사' : (profile?.company_name || '소속 미지정');

  return (
    <div className="fa-root fa-app">
      <aside className="fa-nav">
        <Link href={`${baseForRole(profile?.role)}/dashboard`} className="fa-wm" style={{ padding: 0 }}>
          <span className="f">Find</span><span className="m">Me</span>
        </Link>
        <div className="org">{scopeLabel}</div>
        {menu.map((g) => (
          <React.Fragment key={g.group}>
            <div className="grp">{g.group}</div>
            {g.items.map((item) => {
              const on = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
                  {item.name}
                </Link>
              );
            })}
          </React.Fragment>
        ))}
        <div className="me">
          <b>{profile?.name || '관리자'}</b>
          <span>{profile?.email}</span>
          <div><button type="button" onClick={handleLogout}>로그아웃</button></div>
        </div>
      </aside>

      <main className="fa-main">
        {alerts?.gemini_credit_depleted && (
          <div className="fa-alert">
            <b>Gemini 선불 크레딧 소진(402)</b>코치 대화 턴이 전부 실패하고 있습니다. AI Studio에서 충전해야 합니다.
            {alerts.credit_depleted_at && <span> · 감지 {alerts.credit_depleted_at} UTC</span>}
          </div>
        )}
        {alerts?.errors_5xx_alert && (
          <div className="fa-alert">
            <b>서버 오류(5xx) 최근 1시간 {alerts.errors_5xx_last_hour}건</b>참가자 대화가 실패하고 있을 수 있습니다.
            {alerts.recent_5xx && alerts.recent_5xx.length > 0 && (
              <span>
                {' · '}최근: {alerts.recent_5xx[alerts.recent_5xx.length - 1].path} {alerts.recent_5xx[alerts.recent_5xx.length - 1].status}
                {alerts.recent_5xx[alerts.recent_5xx.length - 1].error_id ? ` (error_id ${alerts.recent_5xx[alerts.recent_5xx.length - 1].error_id})` : ''}
              </span>
            )}
          </div>
        )}
        {/* Claude API 키 미설정 — 키가 '없을 때만'(false). undefined(구 백엔드)는 표시하지 않는다. */}
        {alerts?.anthropic_key_configured === false && (
          <div className="fa-alert warn">
            <b>Claude API 키 미설정</b>서버에 ANTHROPIC_API_KEY 가 없습니다. provider 가 claude 인 고객사의 세션 시작이 실패합니다.
            {alerts.llm_provider_default && <span> · 서버 기본 provider: {alerts.llm_provider_default}</span>}
          </div>
        )}
        {alerts?.synthetic_check?.ok === false && (
          <div className="fa-alert">
            <b>쓰기 경로 합성 점검 실패</b>새 메시지를 저장하지 못하는 상태입니다.
            <span> · {alerts.synthetic_check.last_run_at} UTC · {alerts.synthetic_check.error}</span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
