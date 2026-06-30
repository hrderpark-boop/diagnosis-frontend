"use client";

import React from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';

const SettingsPage = () => {
  return (
    <AdminLayout>
      <h2 className="text-2xl font-bold text-white mb-6">환경 설정 (Settings)</h2>
      
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-6">
        <h3 className="text-lg font-bold text-gray-200 mb-4">관리자 계정 설정</h3>
        <div className="flex flex-col space-y-4 max-w-md">
            <div>
                <label className="block text-gray-400 mb-1 text-sm">관리자 비밀번호 변경</label>
                <input type="password" placeholder="새 비밀번호 입력" className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"/>
            </div>
            <button className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 w-32">저장</button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SettingsPage;