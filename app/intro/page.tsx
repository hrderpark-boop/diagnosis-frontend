"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ParticipantHeader, { ParticipantMobileStep } from '@/components/participant/ParticipantHeader';
import ParticipantFooter from '@/components/participant/ParticipantFooter';
import './intro.css';

// Find Me 라이트 리디자인 · 02 진단 소개.
// 참여 확인(홈) 뒤, 코치 선택 전에 진단이 어떻게 진행되는지 보여 준다. 표시 전용 화면(API 호출 없음).
// 카드 번호는 헤더 스테퍼 번호(03~06)와 같게 맞춘다.
const STEPS = [
  { no: '03', title: '코치 선택', desc: '대화 스타일이 맞는 AI 코치를 한 명 고릅니다.', timeLabel: '소요 시간', time: '약 1분' },
  { no: '04', title: '자가진단', desc: '5개 대역량에 대한 현재 인식을 기록합니다.', timeLabel: '소요 시간', time: '약 5분' },
  { no: '05', title: '코치 대화', desc: '실제 행동 사례를 바탕으로 역량을 진단합니다.', timeLabel: '역량당 30분', time: '총 150분' },
  { no: '06', title: '리포트', desc: '하위역량 26개 분석과 추천 과정을 받습니다.', timeLabel: '발급', time: '즉시' },
];

const COACHES = [
  { img: '/images/female1.png', ko: '엘라', en: 'Ella' },
  { img: '/images/female2.png', ko: '제시카', en: 'Jessica' },
  { img: '/images/female3.png', ko: '올리비아', en: 'Olivia' },
  { img: '/images/male1.png', ko: '다니엘', en: 'Daniel' },
  { img: '/images/male2.png', ko: '마이클', en: 'Michael' },
  { img: '/images/male3.png', ko: '루카스', en: 'Lucas' },
];

/**
 * 진단 순서 카드: 화면에 들어오면 선이 왼쪽부터 그어지고, 선이 지나가는 순서대로
 * 번호 원이 네이비로 채워지며 카드가 떠오른다. 스크립트가 없으면 처음부터 다 보인다(.armed 일 때만 숨김).
 */
function JourneySteps() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('armed');
    // 숨김 상태(.armed)를 한 번 그린 뒤에 .in 을 붙여야 전환이 보인다(처음부터 화면 안에 있을 때 대비)
    let raf = 0;
    const show = () => { raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => el.classList.add('in')); }); };
    if (!('IntersectionObserver' in window)) { show(); return () => cancelAnimationFrame(raf); }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { show(); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} className="fm-intro-steps">
      <span className="fm-intro-track" aria-hidden="true"><i /></span>
      {STEPS.map((s, i) => (
        <div key={s.no} className="fm-intro-step" style={{ ['--i' as string]: i }}>
          {/* 번호 원은 선 위에 고정, 카드만 떠오른다 */}
          <span className="fm-intro-node" aria-hidden="true">{s.no}</span>
          <article className="fm-card fm-intro-stepcard">
            <h3><span className="fm-sr-only">{s.no}단계 </span>{s.title}</h3>
            <p>{s.desc}</p>
            <div className="time">{s.timeLabel} <strong>{s.time}</strong></div>
          </article>
        </div>
      ))}
    </div>
  );
}

export default function IntroPage() {
  const router = useRouter();
  const [participantName, setParticipantName] = useState('');

  // 참여 확인을 거치지 않고 들어오면 홈으로. 이름은 헤더 표시용으로만 읽는다.
  useEffect(() => {
    if (!localStorage.getItem('participant_id')) {
      router.replace('/');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소 값을 마운트 시 한 번 읽어 표시만 함
    setParticipantName(localStorage.getItem('participant_name') || '');
  }, [router]);

  return (
    <div className="fm-app">
      <ParticipantHeader
        step={2}
        right={
          <>
            {participantName && <span className="user">{participantName} 님</span>}
            {participantName && <span className="sep" />}
            <Link href="/">나가기</Link>
          </>
        }
      />

      <main>
        {/* 진단 순서 */}
        <section className="fm-intro-journey fm-enter">
          <div className="fm-wrap">
            <ParticipantMobileStep step={2} className="fm-intro-mstep" />
            <div className="fm-sec-head">
              <div className="fm-eyebrow">How it works</div>
              <h1>{participantName ? `${participantName} 님, ` : ''}진단은 이렇게 진행됩니다</h1>
              <p>코치를 고르고 자가진단으로 시작해, AI 코치와의 대화를 거쳐 26개 하위역량 리포트로 마무리됩니다.</p>
            </div>
            <JourneySteps />
          </div>
        </section>

        {/* 6명의 AI 코치 + 다음 단계 */}
        <section className="fm-intro-coaches">
          <div className="fm-wrap">
            <h2>6명의 AI 코치가 같은 기준으로 진단합니다</h2>
            <p>코치는 대화 스타일만 다를 뿐, 5개 대역량과 26개 하위역량이라는 동일한 기준으로 역량을 평가합니다.</p>
            <div className="fm-intro-coach-row">
              {COACHES.map((c) => (
                <div key={c.en} className="fm-intro-coach">
                  <div className="fm-ph">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.img} alt={`AI 코치 ${c.ko}`} />
                  </div>
                  <div className="nm">{c.ko}</div>
                  <div className="en">{c.en}</div>
                </div>
              ))}
            </div>
            <div className="fm-intro-cta">
              <Link href="/start" className="fm-btn">
                코치 선택하러 가기
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <ParticipantFooter />
    </div>
  );
}
