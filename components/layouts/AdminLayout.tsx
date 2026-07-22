// components/layouts/AdminLayout.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, FileText, Settings, LogOut, Menu,
  Building2, ShieldCheck, Loader2,
} from 'lucide-react';
import { fetchMe, clearAdminSession, AdminProfile } from '@/lib/adminApi';

/**
 * 어드민 공통 레이아웃.
 *
 * 기존의 하드코딩된 관리자 코드("1234" + sessionStorage) 방식은 완전히 폐기했다.
 * 실제 인증은 백엔드 JWT 로 이루어지며, 이 컴포넌트는 /admin/auth/me 응답으로
 * 권한을 확인해 메뉴 구성과 접근 가능 범위를 결정한다.
 */

interface MenuItem {
  name: string;
  icon: React.ElementType;
  href: string;
}

// 고객사 담당자(Client Admin) 메뉴 — 자사 데이터 범위
const CLIENT_MENU: MenuItem[] = [
  { name: '대시보드', icon: LayoutDashboard, href: '/admin/dashboard' },
  { name: '참여자 관리', icon: Users, href: '/admin/participants' },
  { name: '종합 리포트', icon: FileText, href: '/admin/reports' },
  { name: '설정', icon: Settings, href: '/admin/settings' },
];

// 운영자(Super Admin) 메뉴 — 전 고객사 + 시스템 전체
const SUPER_MENU: MenuItem[] = [
  { name: '통합 대시보드', icon: ShieldCheck, href: '/super-admin/dashboard' },
  { name: '고객사 관리', icon: Building2, href: '/super-admin/companies' },
  { name: '전체 참여자', icon: Users, href: '/admin/participants' },
  { name: '전체 리포트', icon: FileText, href: '/admin/reports' },
];

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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

  const handleLogout = () => {
    clearAdminSession();
    router.replace('/admin/login');
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-gray-400">
        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
        관리자 정보를 확인하는 중입니다...
      </div>
    );
  }

  const isSuper = profile?.role === 'super_admin';
  const menuItems = isSuper ? SUPER_MENU : CLIENT_MENU;
  const scopeLabel = isSuper ? '전체 고객사' : (profile?.company_name || '소속 미지정');

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col z-20`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-700 h-16">
          {isSidebarOpen && (
            <h1 className="font-bold text-xl text-blue-500 tracking-wider">
              {isSuper ? 'Super Admin' : 'Diag Admin'}
            </h1>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
            <Menu size={20} />
          </button>
        </div>

        {/* 권한/소속 배지 — 지금 어떤 범위의 데이터를 보고 있는지 항상 명시 */}
        {isSidebarOpen && (
          <div className="px-4 py-3 border-b border-gray-700">
            <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold ${isSuper ? 'bg-violet-600/20 text-violet-300' : 'bg-blue-600/20 text-blue-300'}`}>
              {isSuper ? <ShieldCheck size={12} /> : <Building2 size={12} />}
              {isSuper ? 'SUPER ADMIN' : 'CLIENT ADMIN'}
            </div>
            <p className="mt-2 truncate text-xs text-gray-400">조회 범위: {scopeLabel}</p>
          </div>
        )}

        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`w-full flex items-center p-3 rounded-lg transition-all ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                <item.icon size={20} />
                {isSidebarOpen && <span className="ml-3 font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <button onClick={handleLogout} className="w-full flex items-center p-3 text-red-400 hover:bg-gray-700 rounded-lg">
            <LogOut size={20} />
            {isSidebarOpen && <span className="ml-3">로그아웃</span>}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-900">
        <header className="h-16 bg-gray-800/50 backdrop-blur-md border-b border-gray-700 flex items-center justify-between px-8 z-10">
          <h2 className="text-lg font-bold text-gray-200">
            {isSuper ? '시스템 통합 관리' : `${scopeLabel} 리더십 진단 관리`}
          </h2>
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-200">{profile?.name || profile?.email}</p>
              <p className="text-xs text-gray-500">{profile?.email}</p>
            </div>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white ${isSuper ? 'bg-violet-600' : 'bg-blue-600'}`}>
              {(profile?.name || profile?.email || 'A').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
