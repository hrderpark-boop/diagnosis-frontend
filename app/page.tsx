"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import HeroVideo from '@/components/HeroVideo';

// FindME 리뉴얼 1A / SIGN IN — 좌: 브랜드·여정 3단계, 우: 참여자 확인 패널.
// 로직(그룹코드/이름/이메일 → /participants/token → /start)은 기존 그대로.
const STEPS = [
  { no: '01', title: '자가진단', desc: '5개 대역량에 대한 현재 인식을 기록합니다', time: '약 5분' },
  { no: '02', title: 'AI 코치와 대화를 통한 진단', desc: '실제 행동 사례를 바탕으로 역량을 진단합니다', time: '역량 별 30분 내외 / 총 약 150분' },
  { no: '03', title: '진단 리포트', desc: '하위역량 26개 분석과 추천 과정을 받습니다', time: '즉시 발급' },
];

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
      const res = await axios.post(`${API_BASE_URL}/participants/token`, {
        email: formData.email,
        password: "password",
        group_code: formData.groupCode,
        name: formData.name
      });

      // 로그인 성공 → 실제 사용자 ID/토큰을 저장 (이후 진단 시작 등에서 사용)
      const { access_token, participant_id, name } = res.data;
      localStorage.setItem('accessToken', access_token);   // lib/api 인터셉터가 사용
      localStorage.setItem('participant_id', participant_id);
      localStorage.setItem('participant_name', name ?? formData.name);

      router.push('/start');
    } catch (error) {
      alert("접속에 실패했습니다. 입력 정보를 확인해주세요.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="fm-stage fm-rise min-h-screen flex flex-col text-white">
      {/* 상단 바 */}
      <header className="h-16 shrink-0 px-6 md:px-12 border-b border-fm-line flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="fm-eyebrow text-[11px] text-white">Connect &amp; Company</span>
          <span className="hidden sm:block w-px h-5 bg-fm-line" />
          <span className="hidden sm:block text-xs text-fm-muted">리더십 역량 진단</span>
        </div>
        <a href="https://www.connectn.co.kr" target="_blank" rel="noreferrer" className="text-[13px] text-white hover:text-fm-gold transition-colors">
          도입 문의
        </a>
      </header>

      {/* 본문: 좌 브랜드 / 우 로그인 패널 */}
      {/* 2열 기준점 md(768): 맥 디스플레이 배율 탓에 1440 모니터도 CSS 폭이 1024 아래로 자주 떨어짐 */}
      {/* 본문 (1440 기준, 왼쪽부터): [텍스트 520] [로그인 패널 480] [영상 — 나머지 전부, 세로 full]
          · 좌 그룹 = 상단 [텍스트][패널] + 하단 여정 3단계(두 폭의 합산, 같은 왼쪽 패딩)
          · 영상 열 = 헤더 아래부터 푸터 위까지(3단계 옆까지). 오른쪽·상하 뷰포트 끝까지
          · 영상 최소 폭 320: 좌 그룹 폭 = pl 64 + 520 + 32 + 480 = 1096 → 뷰포트 1416 이상에서만 영상, 그 아래는 숨김
          · 1280 미만: [텍스트][패널] 2열(영상 없음) / 768 미만: 세로 스택(텍스트 → 패널 → 3단계) */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <section className="flex-1 min-[1416px]:flex-none min-w-0 flex flex-col">
          <div className="flex flex-col md:flex-row">
          <div className="box-content w-auto md:w-[520px] min-w-0 shrink px-6 md:pl-10 md:pr-8 lg:pl-20 xl:pl-16 pt-12 md:pt-[72px] pb-10 md:pb-12 flex flex-col break-keep">
          <div className="fm-eyebrow text-xs text-fm-gold">AI Leadership Coaching</div>

          <div className="mt-7 w-max flex flex-col">
            {/* 워드마크: Find 200→300, Me 는 Instrument Serif 가 400 단일 굵기라
                0.6px 골드 스트로크로 한 단계 두껍게(금빛 흐름 유지) */}
            <div className="flex items-baseline gap-[.16em] text-[64px] md:text-[92px] leading-[.96] text-white">
              <span className="font-light tracking-[-.02em]">Find</span>
              <span className="fm-wave font-serif italic tracking-[-.01em] px-[.06em] [-webkit-text-stroke:0.6px_#B08D5C]">Me</span>
            </div>
            <div className="mt-[18px] flex items-center gap-2.5">
              <div className="flex-1 h-px bg-fm-line" />
              <div className="fm-eyebrow text-[10px] tracking-[.28em] text-fm-dim">Connect &amp; Company</div>
            </div>
          </div>

          <h1 className="mt-8 text-2xl md:text-[28px] font-bold leading-[1.45] text-white">내 안의 진짜 리더를 찾는 여정</h1>
          <p className="mt-[18px] max-w-[520px] text-[15px] md:text-base font-light leading-[1.85] text-fm-text [text-wrap:pretty]">
            데이터 기반 리더십 역량 진단으로 당신의 진정한 잠재력을 발견하세요. <span className="whitespace-nowrap">자가진단</span>과 AI 코치 대화, 그리고 리포트까지 한 흐름으로 이어집니다.
          </p>

          </div>

          {/* 로그인 패널: 텍스트 블록 바로 옆(가운데). 이동만 — 내부 폼·로직·스타일 무변경. 왼쪽 구분선 + 텍스트 열 pr 32 */}
        <aside className="w-full md:w-[340px] lg:w-[420px] xl:w-[480px] shrink-0 border-t md:border-t-0 md:border-l border-fm-line bg-fm-panel px-6 md:px-8 lg:px-12 xl:px-14 pt-12 md:pt-[72px] pb-10 md:pb-12 flex flex-col">
          <div className="fm-eyebrow text-[11px] text-fm-muted">Sign in</div>
          <div className="mt-3 text-xl font-bold text-white">진단 참여자 확인</div>

          <form onSubmit={handleLogin} className="mt-10 md:mt-12 flex flex-col">
            <div className="flex flex-col gap-9">
              <label className="flex flex-col gap-3">
                <span className={`fm-eyebrow text-[11px] ${formData.groupCode ? 'text-fm-gold' : 'text-fm-muted'}`}>Group Code</span>
                <input
                  type="text"
                  name="groupCode"
                  value={formData.groupCode}
                  onChange={handleChange}
                  className="fm-field"
                  placeholder="전달받은 그룹 코드"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-3">
                <span className={`fm-eyebrow text-[11px] ${formData.name ? 'text-fm-gold' : 'text-fm-muted'}`}>Name</span>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="fm-field"
                  placeholder="성함"
                  autoComplete="name"
                />
              </label>
              <label className="flex flex-col gap-3">
                <span className={`fm-eyebrow text-[11px] ${formData.email ? 'text-fm-gold' : 'text-fm-muted'}`}>Work Email</span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="fm-field"
                  placeholder="name@company.com"
                  autoComplete="email"
                />
              </label>
            </div>

            <div className="mt-12 flex flex-col gap-4">
              <button
                type="submit"
                disabled={isLoading}
                className="h-[52px] rounded bg-white text-black text-[15px] font-bold hover:bg-fm-gold hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "접속 중..." : "진단 시작하기"}
              </button>
              <p className="text-xs leading-[1.7] text-fm-muted">소속 조직에서 받은 그룹 코드가 필요합니다</p>
            </div>
          </form>

          <div className="mt-10 md:mt-auto pt-8 border-t border-fm-line flex items-baseline justify-between gap-4">
            <span className="text-xs text-fm-muted">응답은 조직에 개별 공개되지 않습니다</span>
            <a href="https://www.connectn.co.kr" target="_blank" rel="noreferrer" className="text-xs text-white underline underline-offset-4 hover:text-fm-gold">문의</a>
          </div>
        </aside>
          </div>

          {/* 여정 3단계: 텍스트 + 패널 아래, 두 폭의 합산으로 한 줄 3열. 정렬선은 텍스트 블록과 같은 왼쪽 패딩 */}
          <div className="px-6 md:pl-10 md:pr-8 lg:pl-20 xl:pl-16 pb-10 md:pb-12 break-keep">
          <div className="border-t border-fm-line grid grid-cols-1 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.no}
                className={[
                  'pt-7 pb-6 sm:pb-0',
                  i === 0 ? 'sm:pr-6' : i === 1 ? 'sm:px-6' : 'sm:pl-6',
                  'border-fm-line',
                  i < 2 ? 'border-b sm:border-b-0 sm:border-r' : '',
                ].join(' ')}
              >
                <div className="fm-eyebrow text-[11px] text-fm-gold">{s.no}</div>
                <div className="mt-3 text-[15px] font-bold text-white">{s.title}</div>
                <div className="mt-2 text-xs font-light leading-[1.7] text-fm-muted">{s.desc}</div>
                <div className="mt-3 text-[11px] text-fm-muted">{s.time}</div>
              </div>
            ))}
          </div>
          </div>
        </section>

        {/* 영상 열: 나머지 전부(flex-1), 헤더 아래 ~ 푸터 위 세로 full. 1416 미만 숨김·미로드 */}
        <HeroVideo className="hidden min-[1416px]:block flex-1 min-w-0" />
      </div>

      {/* 하단 바 */}
      <footer className="shrink-0 px-6 md:px-12 py-6 border-t border-fm-line flex items-center justify-between text-[11px] text-fm-muted">
        <span>ⓒ CONNECT &amp; COMPANY Co., Ltd.</span>
        <a href="https://www.connectn.co.kr" target="_blank" rel="noreferrer" className="font-display tracking-[.06em] hover:text-white">www.connectn.co.kr</a>
      </footer>
    </main>
  );
}
