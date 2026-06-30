// app/login/page.tsx
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('password123');
  const [groupCode, setGroupCode] = useState('G-TEST');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('http://127.0.0.1:8000/api/v1/participants/token', { email, password, group_code: groupCode });
      router.push('/start'); // 코치 선택 화면으로 이동
    } catch (err) { alert('로그인 실패'); } 
    finally { setLoading(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-900">로그인</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full px-4 py-3 border rounded-lg" required />
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full px-4 py-3 border rounded-lg" required />
          <input type="text" value={groupCode} onChange={(e)=>setGroupCode(e.target.value)} className="w-full px-4 py-3 border rounded-lg" required />
          <button type="submit" disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">{loading ? '로그인 중...' : '시작하기'}</button>
        </form>
      </div>
    </main>
  );
}