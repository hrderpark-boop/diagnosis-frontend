"use client";

import { useEffect, useRef } from 'react';

/**
 * 첫 화면 비주얼 A — "여정의 선".
 *
 * 금빛 가는 선 하나가 왼쪽 → 오른쪽으로 25초 주기로 스스로 그려지며, 지나간
 * 자리에 점 3개(01·02·03)를 남긴다. 점의 x 위치는 바로 아래 '여정 3단계'
 * 그리드의 각 번호(컬럼 왼쪽 가장자리)와 맞추고, 점에서 아래로 얇은 수직선을
 * 내려 번호와 시각적으로 잇는다.
 *
 * - SVG + requestAnimationFrame(용량 0, 저작권 없음). 밝기는 라인 색과 골드 사이.
 * - prefers-reduced-motion 이면 정지 프레임(완성된 선 + 점 3개).
 * - 탭이 숨겨지면 루프를 멈춘다. 컨테이너 폭은 ResizeObserver 로 추적.
 * - md 미만에서는 부모가 숨긴다(hidden md:block).
 */

const PERIOD_MS = 25_000;      // 전체 주기
const DRAW_END = 0.45;         // 0~45%: 선이 그려짐
const HOLD_END = 0.82;         // 45~82%: 완성 상태 유지
const FADE_END = 0.94;         // 82~94%: 서서히 사라짐, 94~100%: 공백 후 재시작
const GOLD = '#B08D5C';
const LINE = '#2C3037';
const H = 220;

// 여정 3단계 그리드: 3열 균등, 2·3열은 padding-left 24px → 번호의 x 위치.
const dotXs = (w: number) => [4, w / 3 + 24, (2 * w) / 3 + 24];

// Catmull-Rom → cubic Bézier 로 부드러운 경로 생성
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export default function JourneyLine({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const path = svg.querySelector<SVGPathElement>('[data-line]')!;
    const glow = svg.querySelector<SVGPathElement>('[data-glow]')!;
    const track = svg.querySelector<SVGPathElement>('[data-track]')!;
    const dots = Array.from(svg.querySelectorAll<SVGGElement>('[data-dot]'));
    const head = svg.querySelector<SVGGElement>('[data-head]')!;

    let width = 0;
    let total = 1;
    let dotAt: number[] = [0.05, 0.4, 0.75]; // 각 점이 놓인 경로 길이 비율
    let raf = 0;

    const layout = () => {
      width = wrap.clientWidth || 800;
      svg.setAttribute('viewBox', `0 0 ${width} ${H}`);
      const [x1, x2, x3] = dotXs(width);
      const pts: [number, number][] = [
        [-12, 150], [x1, 128], [width * 0.19, 62], [x2, 96],
        [width * 0.52, 168], [x3, 118], [width + 12, 66],
      ];
      const d = smoothPath(pts);
      path.setAttribute('d', d);
      glow.setAttribute('d', d);
      track.setAttribute('d', d);
      total = path.getTotalLength();
      // 점 위치 = 경로 위에서 x 가 가장 가까운 지점(길이 비율)
      const xs = [x1, x2, x3];
      dotAt = xs.map((x) => {
        let best = 0, bestD = Infinity;
        for (let l = 0; l <= total; l += 4) {
          const p = path.getPointAtLength(l);
          const dd = Math.abs(p.x - x);
          if (dd < bestD) { bestD = dd; best = l; }
        }
        return best / total;
      });
      dots.forEach((g, i) => {
        const p = path.getPointAtLength(dotAt[i] * total);
        g.setAttribute('transform', `translate(${p.x} ${p.y})`);
        const tick = g.querySelector<SVGLineElement>('line');
        if (tick) tick.setAttribute('y2', String(H - p.y - 2)); // 점 → 띠 바닥(번호 쪽)
      });
      path.style.strokeDasharray = `${total}`;
      glow.style.strokeDasharray = `${total}`;
    };

    const render = (t: number) => {
      // t: 0~1 주기 위치
      let progress: number; let alpha: number;
      if (t < DRAW_END) { progress = t / DRAW_END; alpha = 1; }
      else if (t < HOLD_END) { progress = 1; alpha = 1; }
      else if (t < FADE_END) { progress = 1; alpha = 1 - (t - HOLD_END) / (FADE_END - HOLD_END); }
      else { progress = 0; alpha = 0; }
      const eased = 1 - Math.pow(1 - progress, 2.2); // 초반 빠르고 끝에서 느려짐
      const off = total * (1 - eased);
      path.style.strokeDashoffset = `${off}`;
      glow.style.strokeDashoffset = `${off}`;
      path.style.opacity = `${0.85 * alpha}`;
      glow.style.opacity = `${0.08 * alpha}`;
      dots.forEach((g, i) => {
        const on = eased >= dotAt[i] ? 1 : 0;
        g.style.opacity = `${on * alpha}`;
      });
      // 진행 중인 끝점(머리) — 완성되면 사라짐
      if (progress > 0 && progress < 1) {
        const p = path.getPointAtLength(eased * total);
        head.setAttribute('transform', `translate(${p.x} ${p.y})`);
        head.style.opacity = `${alpha}`;
      } else {
        head.style.opacity = '0';
      }
    };

    layout();
    const ro = new ResizeObserver(() => { layout(); if (reduced) render(0.6); });
    ro.observe(wrap);

    if (reduced) {
      render(0.6); // 완성된 정지 프레임
      return () => ro.disconnect();
    }

    const start = performance.now();
    const loop = (now: number) => {
      render(((now - start) % PERIOD_MS) / PERIOD_MS);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className={`relative w-full ${className}`} aria-hidden="true">
      <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-visible" fill="none" preserveAspectRatio="none">
        {/* 지나갈 길(아주 희미한 라인) */}
        <path data-track d="" stroke={LINE} strokeWidth="1" opacity="0.7" />
        {/* 글로우 + 금빛 선 */}
        <path data-glow d="" stroke="#F0DCB8" strokeWidth="3" strokeLinecap="round" />
        <path data-line d="" stroke={GOLD} strokeWidth="1.2" strokeLinecap="round" />
        {/* 점 3개: 아래 여정 3단계 번호와 x 정렬, 수직 가이드로 연결 */}
        {[0, 1, 2].map((i) => (
          <g key={i} data-dot style={{ opacity: 0 }}>
            <line x1="0" y1="8" x2="0" y2="60" stroke={LINE} strokeWidth="1" />
            <circle r="2.2" fill={GOLD} />
            <circle r="7" stroke={GOLD} strokeWidth="0.8" opacity="0.35" />
          </g>
        ))}
        <g data-head style={{ opacity: 0 }}>
          <circle r="2.6" fill="#FFFFFF" />
          <circle r="9" stroke={GOLD} strokeWidth="0.8" opacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
