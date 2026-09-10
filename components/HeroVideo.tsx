"use client";

import { useEffect, useRef, useState } from 'react';

/**
 * 첫 화면 히어로 영상 — 왼쪽 열에서 텍스트 블록 오른쪽 끝부터 로그인 패널 직전까지, 열 전체 높이.
 *
 * 파일: public/hero.webm + public/hero.mp4 (각 3MB 이하, scripts/encode-hero.sh 로 생성),
 *       public/hero-poster.jpg (첫 프레임). 원본은 design/ 에 보관.
 * 규칙:
 *  - 부모가 고정 폭(min(300px, 열 폭 − 텍스트 열))을 준다(flex-1 아님). 그 폭이 MIN_W(200px) 미만이면 영상을 숨기고 로드하지 않음
 *    (1280 에서는 120px 뿐이라 숨김). xl 미만은 부모가 숨김(display:none).
 *  - prefers-reduced-motion → poster 만. 영상 로드 실패(파일 없음 포함) → poster 유지.
 *  - poster 도 없으면 배경(스테이지 그라디언트)만 남는다 — 자리는 유지.
 *  - object-fit: cover, 왼쪽 가장자리 배경색 페이드, 어두운 오버레이 25%.
 */

const MIN_W = 200;

export default function HeroVideo({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);       // 폭 ≥ MIN_W (측정 전엔 false → 로드하지 않음)
  const [reduced, setReduced] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => setReduced(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    const ro = new ResizeObserver(() => setWide(wrap.clientWidth >= MIN_W));
    ro.observe(wrap);
    return () => { ro.disconnect(); mq.removeEventListener('change', onMq); };
  }, []);

  const showVideo = wide && !reduced && !videoFailed;
  const showPoster = wide && !posterFailed;

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden ${wide ? '' : 'invisible'} ${className}`}
      aria-hidden="true"
    >
      {/* poster: 영상 아래에 항상 깔아 두어 로드 전·실패·reduced-motion 모두 같은 프레임 */}
      {showPoster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/hero-poster.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setPosterFailed(true)}
        />
      )}
      {showVideo && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={posterFailed ? undefined : '/hero-poster.jpg'}
          onError={() => setVideoFailed(true)}
        >
          <source src="/hero.webm" type="video/webm" />
          {/* 마지막 source 의 error 가 "재생 가능한 소스 없음" — video.onerror 는 이때 안 뜬다 */}
          <source src="/hero.mp4" type="video/mp4" onError={() => setVideoFailed(true)} />
        </video>
      )}
      {/* 어두운 오버레이 25% — 텍스트와 경쟁하지 않게 */}
      <div className="absolute inset-0 bg-black/25" />
      {/* 왼쪽 가장자리 배경색 페이드 — 텍스트 블록과 경계가 딱 끊기지 않게 */}
      <div className="absolute inset-y-0 left-0 w-44 bg-gradient-to-r from-[#1F2328] via-[#1F2328]/60 to-transparent" />
    </div>
  );
}
