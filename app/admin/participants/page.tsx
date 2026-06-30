"use client";

import React from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Search, MoreHorizontal, Mail, FileDown } from 'lucide-react';

const ParticipantsPage = () => {
  // ✅ 인증 로직 삭제됨 (AdminLayout이 담당)

  // Mock Data
  const users = Array.from({ length: 10 }).map((_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    email: `user${i}@company.com`,
    dept: i % 2 === 0 ? '영업팀' : '개발팀',
    position: i % 3 === 0 ? '팀장' : '사원',
    status: i % 2 === 0 ? 'Completed' : 'In Progress',
    score_avg: i % 2 === 0 ? 82 : '-',
    last_login: '2024-01-14 10:00'
  }));

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">참여자 관리 (Participant Management)</h2>
        <div className="flex space-x-2">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center text-sm"><Mail size={16} className="mr-2"/> 미완료자 독려 메일</button>
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center text-sm"><FileDown size={16} className="mr-2"/> 전체 엑셀 다운로드</button>
        </div>
      </div>

      {/* 검색 및 필터 영역 */}
      <div className="bg-gray-800 p-4 rounded-lg mb-6 flex flex-wrap gap-4 items-center border border-gray-700">
        <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={18}/>
            <input type="text" placeholder="이름, 이메일, 부서 검색" className="w-full bg-gray-900 border border-gray-600 rounded pl-10 pr-4 py-2 text-white focus:border-blue-500 outline-none"/>
        </div>
        <select className="bg-gray-900 border border-gray-600 text-gray-300 rounded px-3 py-2"><option>전체 부서</option><option>영업팀</option><option>개발팀</option></select>
        <select className="bg-gray-900 border border-gray-600 text-gray-300 rounded px-3 py-2"><option>전체 상태</option><option>진단 완료</option><option>진행 중</option></select>
      </div>

      {/* 데이터 테이블 */}
      <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                    <th className="p-4 border-b border-gray-700"><input type="checkbox"/></th>
                    <th className="p-4 border-b border-gray-700">이름/직급</th>
                    <th className="p-4 border-b border-gray-700">부서</th>
                    <th className="p-4 border-b border-gray-700">이메일</th>
                    <th className="p-4 border-b border-gray-700">상태</th>
                    <th className="p-4 border-b border-gray-700">진단 점수</th>
                    <th className="p-4 border-b border-gray-700">최근 접속</th>
                    <th className="p-4 border-b border-gray-700 text-center">관리</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
                {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-700/50 text-sm text-gray-300">
                        <td className="p-4"><input type="checkbox"/></td>
                        <td className="p-4 font-bold text-white">{u.name} <span className="text-gray-500 text-xs ml-1">{u.position}</span></td>
                        <td className="p-4">{u.dept}</td>
                        <td className="p-4 text-gray-400 font-mono text-xs">{u.email}</td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded-full text-xs ${u.status === 'Completed' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>{u.status}</span>
                        </td>
                        <td className="p-4 font-bold">{u.score_avg}점</td>
                        <td className="p-4 text-gray-500 text-xs">{u.last_login}</td>
                        <td className="p-4 text-center">
                            <button className="text-gray-400 hover:text-white"><MoreHorizontal size={18}/></button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

export default ParticipantsPage;