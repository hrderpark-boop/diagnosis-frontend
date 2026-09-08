"use client";

import { useEffect, useRef } from 'react';

/**
 * 첫 화면 비주얼 — "축하의 불꽃" ('금빛 리본' 대체).
 *
 * 한 점(띠의 왼쪽 아래)에서 출발한 선 40~60개가 불꽃놀이처럼 우상향 부채꼴로
 * 갈라지며 퍼진다. 선은 곧게 나가다 끝으로 갈수록 위로 살짝 열리는 곡선, 길이는
 * 띠 폭의 30~90%(띠 안에 머무르도록 클램프), 굵기 1.5px → 0.3px 테이퍼, 끝에
 * 작은 글로우 점. 색은 출발점 근처 밝은 골드(#D4B37A) → 끝은 옅은 골드(#B08D5C).
 *
 * 주기 12초: 0~2.5초 터짐(ease-out, 선마다 0~0.4초 지연) → 2.5~9초 유지(끝 점만
 * ±10% 미세 깜빡임) → 9~11초 끝에서부터 옅어짐 → 11~12초 빈 상태. 매 주기 각도·
 * 길이에 난수를 새로 준다. 느리고 우아하게.
 *
 * - canvas + rAF, 용량 0. reduced-motion 이면 완성 상태 정지 프레임(t=5s).
 * - 탭 숨김 시 정지. md 미만은 부모가 숨김. 띠 안에서만 그린다(패널과 겹치지 않음).
 * - 검증용: window.__FM_VISUAL_T 가 숫자면 그 시각의 프레임만 정지 상태로 그린다.
 */

const PERIOD = 12;      // s
const GROW_END = 2.5;   // s
const HOLD_END = 9;     // s
const FADE_END = 11;    // s
const BRIGHT = [212, 179, 122] as const; // #D4B37A
const GOLD = [176, 141, 92] as const;    // #B08D5C

// 결정론적 의사난수 — (주기 인덱스, 선 인덱스, 슬롯) 별로 고정
const rnd = (a: number, b: number, c = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
// 대략 정규분포(Box-Muller 대신 합산 근사)
const gauss = (a: number, b: number) =>
  (rnd(a, b, 1) + rnd(a, b, 2) + rnd(a, b, 3) + rnd(a, b, 4) - 2) / 1.1;

type Spark = {
  theta: number;   // 시작 각도(rad, 수평 기준, 위가 +)
  curve: number;   // 끝으로 갈수록 위로 열리는 양(rad)
  lenFrac: number; // 띠 폭 대비 길이
  delay: number;   // 0~0.4s
  alpha: number;   // 0.20~0.35
  bright: boolean; // 긴 선 몇 개는 끝 점을 더 밝게
  flick: number;   // 깜빡임 위상
  edgeFrac: number; // 띠 경계에 닿을 선은 경계까지 거리의 이 비율(0.5~0.9)에서 멈춤
};

const DEG = Math.PI / 180;

function makeSparks(cycle: number, count: number): Spark[] {
  const out: Spark[] = [];
  for (let i = 0; i < count; i++) {
    // 각도: -10°~75°, 중앙(30~45°)에 밀도 집중 — 70% 정규(μ=37.5°, σ=13°) + 30% 균등
    let deg = rnd(cycle, i, 5) < 0.7
      ? 37.5 + gauss(cycle, i) * 13
      : -10 + rnd(cycle, i, 6) * 85;
    deg = Math.max(-10, Math.min(75, deg));
    const lenFrac = 0.30 + Math.pow(rnd(cycle, i, 7), 1.3) * 0.60;   // 짧은 선이 조금 더 많게
    out.push({
      theta: deg * DEG,
      curve: (4 + rnd(cycle, i, 8) * 6) * DEG,
      lenFrac,
      delay: rnd(cycle, i, 9) * 0.4,
      alpha: 0.20 + rnd(cycle, i, 10) * 0.15,
      bright: lenFrac > 0.72 && rnd(cycle, i, 11) < 0.5,
      flick: rnd(cycle, i, 12) * Math.PI * 2,
      edgeFrac: 0.5 + rnd(cycle, i, 15) * 0.4,
    });
  }
  return out;
}

const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

export default function Fireworks({ className = '' }: { className?: string }) {
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
    let cycle = -1;
    let sparks: Spark[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth || 800;
      H = wrap.clientHeight || 220;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // 곡선을 따라 행진하며 띠 경계(여백 6px)까지의 실제 거리를 잰다.
    const boundaryLen = (s: Spark, ox: number, oy: number, want: number) => {
      const step = 4;
      let x = ox, y = oy, L = 0;
      while (L < want) {
        const u = L / want;
        const ang = s.theta + s.curve * u * u;
        x += Math.cos(ang) * step;
        y -= Math.sin(ang) * step;
        if (x > W - 6 || y < 6 || y > H - 6) return L;
        L += step;
      }
      return want;
    };

    // 선 하나의 궤적 점들. 띠 경계에 닿을 선은 경계까지 거리의 edgeFrac(0.5~0.9)에서
    // 멈춰, 끝점들이 경계에 일렬로 늘어서지 않고 띠 안에 흩어지게 한다.
    const trail = (s: Spark, ox: number, oy: number) => {
      const want = s.lenFrac * W;
      const lb = boundaryLen(s, ox, oy, want);
      const L = lb < want ? lb * s.edgeFrac : want;
      const n = Math.max(12, Math.round(L / 6));
      const pts: [number, number][] = [];
      let x = ox, y = oy;
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const ang = s.theta + s.curve * u * u;      // 끝으로 갈수록 위로 살짝 열림
        if (k > 0) {
          const step = L / n;
          x += Math.cos(ang) * step;
          y -= Math.sin(ang) * step;
        }
        pts.push([x, y]);
      }
      return pts;
    };

    const draw = (t: number) => {
      const c = Math.floor(t / PERIOD);
      const tt = t - c * PERIOD;
      if (c !== cycle) {
        cycle = c;
        sparks = makeSparks(c, 40 + Math.round(rnd(c, 0, 13) * 20)); // 40~60개
      }
      ctx.clearRect(0, 0, W, H);
      if (tt >= FADE_END) return;                    // 11~12초 빈 상태

      const ox = W * (0.08 + 0.04 * rnd(cycle, 1, 14));   // x 8~12%
      const oy = H * (0.85 + 0.05 * rnd(cycle, 2, 14));   // y 85~90%
      const fade = tt > HOLD_END ? (tt - HOLD_END) / (FADE_END - HOLD_END) : 0; // 0→1

      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';

      for (const s of sparks) {
        const grow = easeOut((tt - s.delay) / (GROW_END - 0.4));
        if (grow <= 0) continue;
        const pts = trail(s, ox, oy);
        const last = Math.max(1, Math.round((pts.length - 1) * grow));
        // 세그먼트별 굵기·색·투명도 (테이퍼 + 밝은 골드 → 옅은 골드 + 끝에서부터 페이드)
        for (let k = 1; k <= last; k++) {
          const u = k / (pts.length - 1);
          const width = 1.5 - 1.2 * u;
          const mix = Math.min(1, u * 1.6);            // 0: BRIGHT, 1: GOLD
          const r = BRIGHT[0] + (GOLD[0] - BRIGHT[0]) * mix;
          const g = BRIGHT[1] + (GOLD[1] - BRIGHT[1]) * mix;
          const b = BRIGHT[2] + (GOLD[2] - BRIGHT[2]) * mix;
          let a = s.alpha * (1 - 0.55 * u);            // 끝은 옅게
          if (fade > 0) a *= Math.max(0, (1 - fade) * 1.4 - u * fade * 0.8);
          if (a <= 0.002) continue;
          ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(pts[k - 1][0], pts[k - 1][1]);
          ctx.lineTo(pts[k][0], pts[k][1]);
          ctx.stroke();
        }
        // 끝 글로우 점 (자라는 동안은 머리, 완성 후 미세 깜빡임)
        const tip = pts[last];
        const flick = tt >= GROW_END && tt < HOLD_END ? 1 + 0.1 * Math.sin(tt * 1.7 + s.flick) : 1;
        const tipA = (s.bright ? 0.9 : 0.55) * flick * (fade > 0 ? Math.max(0, 1 - fade * 1.6) : 1);
        if (tipA > 0.01) {
          const rr = s.bright ? 3 : 2.2;
          const gr = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], rr * 3);
          gr.addColorStop(0, `rgba(240,220,184,${tipA})`);
          gr.addColorStop(0.35, `rgba(${BRIGHT[0]},${BRIGHT[1]},${BRIGHT[2]},${tipA * 0.45})`);
          gr.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0)`);
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(tip[0], tip[1], rr * 3, 0, Math.PI * 2); ctx.fill();
        }
      }

      // 출발점 글로우 (반지름 12~16px, 블러)
      const og = 0.85 * (1 - fade) * Math.min(1, tt / 0.6);
      if (og > 0.01) {
        const R = 15;
        const gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * 2.2);
        gr.addColorStop(0, `rgba(245,228,196,${og})`);
        gr.addColorStop(0.25, `rgba(${BRIGHT[0]},${BRIGHT[1]},${BRIGHT[2]},${og * 0.55})`);
        gr.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0)`);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(ox, oy, R * 2.2, 0, Math.PI * 2); ctx.fill();
      }
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
