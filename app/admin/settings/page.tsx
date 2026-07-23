"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import PasswordChangeForm from '../../../components/admin/PasswordChangeForm';
import { Building2, Loader2, Mail, ShieldCheck, User } from 'lucide-react';
import { fetchMe, AdminProfile } from '@/lib/adminApi';

const SettingsPage = () => {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((me) => { if (alive) setProfile(me); })
      .catch(() => { /* 401 은 adminApi 인터셉터가 로그인으로 보낸다 */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const isSuper = profile?.role === 'super_admin';

  return (
    <AdminLayout>
      <h2 className="mb-6 text-2xl font-bold text-white">환경 설정</h2>

      {/* 내 계정 정보 */}
      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-6">
        <h3 className="mb-5 text-lg font-bold text-gray-200">내 계정</h3>
        {loading ? (
          <div className="flex items-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 계정 정보를 불러오는 중입니다...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-500">
                <User size={12} /> 이름
              </div>
              <div className="text-sm font-semibold text-white">{profile?.name || '-'}</div>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-500">
                <Mail size={12} /> 이메일 (아이디)
              </div>
              <div className="text-sm font-semibold text-white">{profile?.email || '-'}</div>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-500">
                {isSuper ? <ShieldCheck size={12} /> : <Building2 size={12} />} 권한 / 소속
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${isSuper ? 'bg-violet-600/20 text-violet-300' : 'bg-blue-600/20 text-blue-300'}`}>
                  {isSuper ? 'SUPER ADMIN' : 'CLIENT ADMIN'}
                </span>
                <span className="text-sm text-gray-300">
                  {isSuper ? '전체 고객사' : (profile?.company_name || '소속 미지정')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 비밀번호 변경 */}
      <PasswordChangeForm />
    </AdminLayout>
  );
};

export default SettingsPage;
