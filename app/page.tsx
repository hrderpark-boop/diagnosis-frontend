"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import ParticipantHeader, { ParticipantMobileStep } from '@/components/participant/ParticipantHeader';
import ParticipantFooter from '@/components/participant/ParticipantFooter';
import './home.css';

// Find Me 라이트 리디자인 · 01 참여 확인(홈). 샘플: design/light-sample/b/home.html
// 로직(그룹코드/이름/이메일 → /participants/token → /start)은 기존 그대로, 표현만 교체.
const STEPS = [
  { no: '03', title: '자가진단', desc: '5개 대역량에 대한 현재 인식을 기록합니다.', timeLabel: '소요 시간', time: '약 5분' },
  { no: '04', title: '코치 대화', desc: '실제 행동 사례를 바탕으로 역량을 진단합니다.', timeLabel: '역량당 30분', time: '총 150분' },
  { no: '05', title: '리포트', desc: '하위역량 26개 분석과 추천 과정을 받습니다.', timeLabel: '발급', time: '즉시' },
];

const COACHES = [
  { img: '/images/female1.png', ko: '엘라', en: 'Ella' },
  { img: '/images/female2.png', ko: '제시카', en: 'Jessica' },
  { img: '/images/female3.png', ko: '올리비아', en: 'Olivia' },
  { img: '/images/male1.png', ko: '다니엘', en: 'Daniel' },
  { img: '/images/male2.png', ko: '마이클', en: 'Michael' },
  { img: '/images/male3.png', ko: '루카스', en: 'Lucas' },
];

// 네이비 면의 실선 리본: 두 3차 베지어 곡선 A, B 사이를 보간한 가는 선 81개(샘플 스크립트와 같은 계산)
const STRAND_A = [[60, -40], [180, 260], [520, 60], [640, 420]];
const STRAND_B = [[300, -40], [80, 120], [640, 380], [560, 980]];
function buildStrands() {
  const out: { d: string; opacity: string }[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const p = STRAND_A.map((a, q) => [a[0] + (STRAND_B[q][0] - a[0]) * t, a[1] + (STRAND_B[q][1] - a[1]) * t].join(','));
    out.push({ d: `M ${p[0]} C ${p[1]} ${p[2]} ${p[3]}`, opacity: (0.18 + 0.5 * Math.sin(Math.PI * t)).toFixed(2) });
  }
  return out;
}

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

  // 네이비 면 리본 경로(한 번만 계산)
  const strands = useMemo(buildStrands, []);

  // 워드마크 애니메이션은 폰트가 준비된 뒤 한 번에 시작(.go)
  const [wmGo, setWmGo] = useState(false);
  useEffect(() => {
    let alive = true;
    const ready = typeof document !== 'undefined' && document.fonts?.ready ? document.fonts.ready : Promise.resolve();
    ready.then(() => { if (alive) setWmGo(true); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="fm-app">
      <ParticipantHeader step={1} />

      <main>
        <section className="fm-home-hero">
          {/* 오른쪽 40% 딥 네이비 면 + 흰 실선 리본 */}
          <div className="fm-home-glow" aria-hidden="true">
            <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
              <defs>
                <radialGradient id="fm-home-top-light" gradientUnits="userSpaceOnUse" cx="560" cy="-40" r="520">
                  <stop offset="0" style={{ stopColor: 'var(--fm-blue-bright)' }} stopOpacity=".55" />
                  <stop offset=".5" style={{ stopColor: 'var(--fm-blue-mid)' }} stopOpacity=".15" />
                  <stop offset="1" style={{ stopColor: 'var(--fm-blue-mid)' }} stopOpacity="0" />
                </radialGradient>
                <linearGradient id="fm-home-strand" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--fm-paper)' }} stopOpacity=".9" />
                  <stop offset="1" style={{ stopColor: 'var(--fm-blue-bright)' }} />
                </linearGradient>
              </defs>
              <rect width="600" height="900" fill="url(#fm-home-top-light)" />
              <g className="v-lines" fill="none" stroke="url(#fm-home-strand)" strokeWidth=".8">
                {strands.map((s, i) => (
                  <path key={i} d={s.d} opacity={s.opacity} />
                ))}
              </g>
            </svg>
          </div>

          <div className="fm-wrap fm-home-grid">
            <div className="fm-home-copy">
              <ParticipantMobileStep step={1} />
              <div className={`fm-home-wm${wmGo ? ' go' : ''}`} aria-label="Find Me">
                <span className="find" aria-hidden="true">
                  {['F', 'i', 'n', 'd'].map((ch, i) => (
                    <i key={i} style={{ '--i': i } as React.CSSProperties}>{ch}</i>
                  ))}
                </span>
                <span className="me" aria-hidden="true">
                  <span className="me-in"><b className="fm-me-wave">Me</b></span>
                </span>
              </div>
              <h1>내 안의 진짜 리더를 찾는 여정</h1>
              <p className="lead">
                데이터 기반 리더십 역량 진단으로 당신의 진정한 잠재력을 발견하세요.<br className="fm-home-br-d" /> 자가진단과 AI 코치 대화, 그리고 리포트까지 한 흐름으로 이어집니다.
              </p>
              <div className="meta">
                <span><b>5</b>대역량</span>
                <span><b>26</b>하위역량</span>
                <span><b>150</b>분 코치 대화</span>
              </div>
            </div>

            {/* 로그인 카드: 흰 면과 네이비 면 경계에 걸침. 폼 로직·name 속성은 기존 그대로 */}
            <form onSubmit={handleLogin} className="fm-card elev fm-home-login">
              <h2>진단 참여자 확인</h2>
              <p className="sub">소속 조직에서 받은 그룹 코드가 필요합니다</p>
              <div className="fields">
                <div className="fm-field">
                  <label htmlFor="fm-home-code">그룹 코드<span className="en">Group Code</span></label>
                  <input
                    id="fm-home-code"
                    type="text"
                    name="groupCode"
                    value={formData.groupCode}
                    onChange={handleChange}
                    placeholder="전달받은 그룹 코드"
                    autoComplete="off"
                  />
                </div>
                <div className="fm-field">
                  <label htmlFor="fm-home-name">성함<span className="en">Name</span></label>
                  <input
                    id="fm-home-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="성함"
                    autoComplete="name"
                  />
                </div>
                <div className="fm-field">
                  <label htmlFor="fm-home-email">업무 이메일<span className="en">Work Email</span></label>
                  <input
                    id="fm-home-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="fm-btn block">
                {isLoading ? "접속 중..." : "참여 확인하고 시작하기"}
                {!isLoading && (
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <p className="fm-caption note">대화 원문은 공개되지 않으며, 결과 리포트는 본인과 소속 HR 담당자가 열람합니다</p>
            </form>
          </div>

          {/* 표지 하단: 좌 카피라이트 / 우 URL */}
          <div className="fm-home-foot">
            <span>ⓒ CONNECT &amp; COMPANY Co., Ltd.</span>
            <a href="https://www.connectn.co.kr" target="_blank" rel="noreferrer">www.connectn.co.kr</a>
          </div>
        </section>

        {/* 여정 3단계 */}
        <section className="fm-home-journey">
          <div className="fm-wrap">
            <div className="fm-sec-head">
              <div className="fm-eyebrow">How it works</div>
              <h2>세 단계, 한 흐름</h2>
              <p>자가진단으로 시작해 AI 코치와의 대화를 거쳐, 26개 하위역량 리포트로 마무리됩니다.</p>
            </div>
            <div className="fm-home-steps">
              {STEPS.map((s) => (
                <article key={s.no} className="fm-card fm-home-stepcard">
                  <div className="fm-num">{s.no}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <div className="time">{s.timeLabel} <strong>{s.time}</strong></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 신뢰 띠: 6명의 AI 코치 */}
        <section className="fm-home-coaches">
          <div className="fm-wrap">
            <h2>6명의 AI 코치가 같은 기준으로 진단합니다</h2>
            <p>코치는 대화 스타일만 다를 뿐, 5개 대역량과 26개 하위역량이라는 동일한 기준으로 역량을 평가합니다.</p>
            <div className="fm-home-coach-row">
              {COACHES.map((c) => (
                <div key={c.en} className="fm-home-coach">
                  <div className="fm-ph">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.img} alt={`AI 코치 ${c.ko}`} />
                  </div>
                  <div className="nm">{c.ko}</div>
                  <div className="en">{c.en}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <ParticipantFooter />
    </div>
  );
}
