"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function LoginPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    groupCode: ""
  });
  
  const [isLoading, setIsLoading] = useState(false);

  // 백엔드 API 주소 (.env.local 의 NEXT_PUBLIC_API_URL 로 override 가능, 없으면 로컬 기본값)
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.groupCode) {
      alert("모든 정보를 입력해주세요.");
      return;
    }
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/participants/token`, {
        email: formData.email,
        password: "password",
        group_code: formData.groupCode,
        name: formData.name
      });
      router.push('/start');
    } catch (error) {
      alert("접속에 실패했습니다. 입력 정보를 확인해주세요.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center bg-[#0a0a0c] overflow-hidden px-4">
      
      <style jsx global>{`
        @keyframes text-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-text-flow {
          background-size: 200% auto;
          animation: text-flow 3s linear infinite;
        }
      `}</style>

      {/* 배경 장식 */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none" />

      {/* 메인 카드 */}
      <div className="relative z-10 w-full max-w-[480px] bg-white/5 backdrop-blur-2xl border border-white/10 p-12 rounded-3xl shadow-2xl">
        
        <div className="text-center mb-12">
          <h2 className="text-blue-500 font-semibold tracking-[0.2em] text-xs uppercase mb-4 animate-pulse">
            AI Leadership Coaching
          </h2>
          
          <h1 className="text-6xl font-bold text-white tracking-tight mb-4">
            Find 
            <span className="ml-3 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 animate-text-flow drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              ME
            </span>
          </h1>
          
          <p className="text-white text-md font-light mt-4 leading-relaxed tracking-wide">
            데이터를 기반 리더십 역량 진단으로<br/>
            당신의 진정한 잠재력을 발견하세요!
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-blue-400 ml-1 uppercase tracking-wider">Group Code</label>
            <input 
              type="text" 
              name="groupCode"
              value={formData.groupCode}
              onChange={handleChange}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-5 py-4 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition-all"
              placeholder="전달받은 그룹 코드를 입력하세요"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-blue-400 ml-1 uppercase tracking-wider">Name</label>
            <input 
              type="text" 
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-5 py-4 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition-all"
              placeholder="성함을 입력하세요"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-blue-400 ml-1 uppercase tracking-wider">Work Email</label>
            <input 
              type="email" 
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-5 py-4 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition-all"
              placeholder="사용 중인 이메일 주소를 입력하세요"
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full mt-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg shadow-lg hover:shadow-blue-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "접속 중..." : "진단 시작하기"}
          </button>
        </form>

        <p className="mt-8 text-center text-[10px] text-gray-600 uppercase tracking-widest">
          Connect & Company
        </p>
      </div>
    </main>
  );
}