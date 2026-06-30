// components/layouts/AdminLayout.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, FileText, Settings, LogOut, Menu, Lock } from 'lucide-react';

const ADMIN_SECRET_CODE = "1234";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const pathname = usePathname();

  // 1. 페이지 로드 시 기존 인증 상태 확인
  useEffect(() => {
    const authStatus = sessionStorage.getItem('admin_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // 2. 로그인 처리
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode === ADMIN_SECRET_CODE) {
      sessionStorage.setItem('admin_auth', 'true');
      setIsAuthenticated(true);
    } else {
      alert("관리자 코드가 올바르지 않습니다.");
      setInputCode("");
    }
  };

  // 3. 로그아웃 처리
  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    setIsAuthenticated(false);
    window.location.href = '/admin/dashboard'; // 초기화면으로 이동
  };

  const menuItems = [
    { name: '대시보드', icon: LayoutDashboard, href: '/admin/dashboard' },
    { name: '참여자 관리', icon: Users, href: '/admin/participants' },
    { name: '종합 리포트', icon: FileText, href: '/admin/reports' },
    { name: '설정', icon: Settings, href: '/admin/settings' },
  ];

  // 🔒 인증되지 않았을 때 보여줄 공통 잠금 화면
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-950 text-white">
        <div className="bg-gray-900 p-10 rounded-2xl shadow-2xl w-full max-w-md border border-gray-800 text-center">
          <Lock className="w-12 h-12 text-blue-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2">관리자 인증</h2>
          <p className="text-gray-500 mb-8 text-sm">시스템 접근을 위해 코드를 입력하세요.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password" 
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Admin Code"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-center tracking-widest outline-none focus:border-blue-500 text-white"
              autoFocus
            />
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-bold transition-colors">접속하기</button>
          </form>
        </div>
      </div>
    );
  }

  // ✅ 인증 성공 시 보여줄 메인 레이아웃
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col z-20`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-700 h-16">
          {isSidebarOpen && <h1 className="font-bold text-xl text-blue-500 tracking-wider">Diag Admin</h1>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.name} href={item.href} className={`w-full flex items-center p-3 rounded-lg transition-all ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
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
            <h2 className="text-lg font-bold text-gray-200">System Dashboard</h2>
            <div className="flex items-center space-x-4">
                <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">A</div>
            </div>
        </header>

        <main className="flex-1 overflow-auto p-8">
            {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;