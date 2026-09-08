"use client";

import { useEffect, useRef } from 'react';

/**
 * 첫 화면 비주얼 — "한 점에서 시작해 물결이 되는 리본" (design/reference-wave.png 기준).
 *
 * 띠 왼쪽 아래 한 점에서 선 36개가 나와 처음 13% 구간 안에서 다발로 모이고, 그 뒤로는
 * 참고 이미지처럼 촘촘한 평행선 다발이 하나의 리본으로 함께 흐른다. 두 번 꼬이고
 * (교차점에서 6~10px 로 좁아졌다 벌어진 곳에서 50~70px), 완만히 우상향하며 오른쪽 끝까지.
 *   선 i:  y_i(u) = base(u) + t_i · A(u) · gather(u) + 미세 숨결
 *   - base(u): 우상향 + 완만한 물결
 *   - A(u): 부호가 바뀌는 반폭 — 0 을 지날 때 선들이 서로 교차(꼬임). 최소 |A| 3~5px
 *   - t_i ∈ [-1, 1] 균등: 서로 평행에 가깝게 붙어 흐르는 다발
 * 글로우: 출발점 1 + 교차점 2 + 오른쪽 끝 1. 선 끝 글로우 없음.
 * 색: 출발점 근처 #D4B37A → #B08D5C, 선 불투명도 15~25%.
 *
 * 움직임: 첫 로드 때만 출발점에서 오른쪽으로 2초 그려지는 도입 1회. 그 뒤 완성 상태에서
 * 위상이 20~30초 주기로 느리게 드리프트(교차 위치·다발 폭이 숨 쉬듯). reduced-motion 이면
 * 정지 프레임, 탭 숨김 정지, md 미만은 부모가 숨김. 띠 안에서만 그린다.
 * 검증용: window.__FM_VISUAL_T 가 숫자면 그 시각의 프레임을 정지 상태로.
 */

const N = 36;
const INTRO = 2.0;                        // s
const BRIGHT = [212, 179, 122] as const;  // #D4B37A
const GOLD = [176, 141, 92] as const;     // #B08D5C
const CROSS = [0.40, 0.68];               // 교차점(정규화 x)
const GATHER_END = 0.13;                  // 이 지점까지 한 점 → 다발

const rnd = (a: number, b = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Line = { t: number; alpha: number; phi: number; omega: number; amp: number };
const LINES: Line[] = Array.from({ length: N }, (_, i) => ({
  t: (i / (N - 1)) * 2 - 1,
  alpha: 0.15 + 0.10 * rnd(i, 1),
  phi: rnd(i, 2) * Math.PI * 2,
  omega: (Math.PI * 2) / (20 + 10 * rnd(i, 3)),   // 20~30초
  amp: 1.2 + 1.3 * rnd(i, 4),                     // 개별 숨결 진폭(px)
}));

export default function GoldWave({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fixedT = (window as unknown as { __FM_VISUAL_T?: number }).__FM_VISUAL_T;
    let W = 0, H = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth || 800;
      H = wrap.clientHeight || 260;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // 중심선: 좌하 → 우상, 완만한 물결(참고 이미지의 내려갔다 올라갔다 하는 결)
    const baseY = (u: number, tSec: number) =>
      H * (0.80 - 0.42 * u)
      + H * 0.07 * Math.sin(Math.PI * 2 * (u * 1.15 - 0.08) + 0.15 * Math.sin(tSec * 0.05));

    // 반폭 A(u): 교차점에서 부호가 바뀜. 벌어진 곳 25~35px(다발 폭 50~70), 교차점 3~5px(6~10)
    const halfWidth = (u: number, tSec: number) => {
      // 교차점을 아주 느리게 좌우로 숨 쉬게(±0.012)
      const c0 = CROSS[0] + 0.012 * Math.sin(tSec * 0.07);
      const c1 = CROSS[1] + 0.012 * Math.sin(tSec * 0.09 + 1.7);
      // 구간별 사인 로브: [gather_end, c0], [c0, c1], [c1, 1.0+]
      let a: number;
      if (u < c0) a = Math.sin(Math.PI * (u - GATHER_END) / (c0 - GATHER_END)) * 32;
      else if (u < c1) a = -Math.sin(Math.PI * (u - c0) / (c1 - c0)) * 34;
      else a = Math.sin(Math.PI * (u - c1) / ((1.06 - c1) * 2)) * 30; // 끝은 열린 채 도달
      const sign = a >= 0 ? 1 : -1;
      return sign * Math.max(4, Math.abs(a));
    };

    const draw = (tSec: number) => {
      ctx.clearRect(0, 0, W, H);
      const progress = reduced || typeof fixedT === 'number' ? 1 : smooth(0, INTRO, tSec);
      const uMax = Math.min(1, progress * 1.02);
      const ox = W * 0.085;
      const steps = Math.max(120, Math.round(W / 4));
      ctx.lineWidth = 0.8;
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';

      for (const ln of LINES) {
        const g = ctx.createLinearGradient(ox, 0, W, 0);
        g.addColorStop(0, `rgba(${BRIGHT[0]},${BRIGHT[1]},${BRIGHT[2]},${ln.alpha})`);
        g.addColorStop(0.25, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${ln.alpha})`);
        g.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${ln.alpha * 0.9})`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          if (u > uMax) break;
          const x = ox + u * (W - ox + 6);
          const gather = smooth(0, GATHER_END, u);
          const breath = ln.amp * Math.sin(Math.PI * 2 * u * 1.4 + ln.phi + tSec * ln.omega) * gather;
          const y = baseY(u, tSec) + ln.t * halfWidth(u, tSec) * gather + breath;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 글로우: 출발점 + 교차점 2 + 오른쪽 끝
      const glow = (u: number, r: number, strength: number, warm = false) => {
        const x = ox + u * (W - ox + 6);
        const y = baseY(u, tSec);
        const halo = r * 3.4;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, halo);
        gr.addColorStop(0, `rgba(${warm ? '245,228,196' : '240,220,184'},${strength})`);
        gr.addColorStop(0.3, `rgba(${BRIGHT[0]},${BRIGHT[1]},${BRIGHT[2]},${strength * 0.5})`);
        gr.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0)`);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, halo, 0, Math.PI * 2); ctx.fill();
      };
      glow(0, 14, 0.85 * Math.min(1, progress * 3), true);                 // 출발점(불꽃의 글로우 유지)
      if (uMax > CROSS[0]) glow(CROSS[0] + 0.012 * Math.sin(tSec * 0.07), 5, 0.6);
      if (uMax > CROSS[1]) glow(CROSS[1] + 0.012 * Math.sin(tSec * 0.09 + 1.7), 5, 0.6);
      if (uMax >= 1) glow(0.965, 4.5, 0.55);
      ctx.globalCompositeOperation = 'source-over';
    };

    resize();
    let lastT = 5;
    const ro = new ResizeObserver(() => { resize(); draw(lastT); });
    ro.observe(wrap);

    if (typeof fixedT === 'number') { lastT = fixedT; draw(fixedT); return () => ro.disconnect(); }
    if (reduced) { draw(5); return () => ro.disconnect(); }

    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      lastT = (now - t0) / 1000;
      draw(lastT);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
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
    <div ref={wrapRef} className={`relative w-full overflow-hidden ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
    </div>
  );
}
