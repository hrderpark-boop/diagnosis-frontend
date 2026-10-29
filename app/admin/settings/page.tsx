"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import PasswordChangeForm from '../../../components/admin/PasswordChangeForm';
import { Loader2 } from 'lucide-react';
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
      <AdminPageHead
        eyebrow={isSuper ? '마스터' : (profile?.company_name || undefined)}
        title="설정"
        desc="내 계정 정보를 확인하고 비밀번호를 바꿉니다."
      />

      {/* 내 계정 정보 */}
      <div className="fa-card pad fa-section">
        <div className="fa-cap"><div><h3>내 계정</h3></div></div>
        {loading ? (
          <div className="flex items-center gap-2 fa-muted" style={{ fontSize: 14 }}>
            <Loader2 className="h-4 w-4 animate-spin" /> 계정 정보를 불러오는 중입니다…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="fa-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>이름</div>
              <div style={{ fontWeight: 600 }}>{profile?.name || '-'}</div>
            </div>
            <div>
              <div className="fa-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>이메일 (아이디)</div>
              <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{profile?.email || '-'}</div>
            </div>
            <div>
              <div className="fa-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>권한 · 소속</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`fa-chip ${isSuper ? 'navy' : 'tint'}`}>
                  {isSuper ? '마스터' : '고객사 HR'}
                </span>
                <span style={{ fontWeight: 600 }}>
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
