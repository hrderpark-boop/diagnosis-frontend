"use client";

import { useEffect, useRef } from 'react';

/**
 * 첫 화면 비주얼 — "금빛 리본" (비주얼 A '여정의 선' 대체).
 *
 * 얇은 선 30개가 하나의 다발로 시작해 꼬이며 펼쳐지고, 다시 모였다 펼쳐지는
 * 리본. 전체 흐름은 왼쪽 아래 → 오른쪽 위로 완만히 상승한다.
 *   선 i:  y(u) = base(u) + a_i · env(u) · sin(k_i·2π·u + φ_i(t))
 *   - base(u): 좌하→우상 완만한 곡선
 *   - env(u):  다발이 모이는 지점(u≈0, 0.4, 0.8)에서 0에 가깝고 그 사이에서 펼쳐짐
 *   - a_i, k_i: 선마다 조금씩 다른 진폭·파수,  φ_i(t): 선마다 다른 속도로 느리게 드리프트
 * 선 하나의 불투명도는 12~18%로 낮고, 겹침(additive)으로 밝기가 난다. 왼쪽은 옅고
 * 오른쪽으로 갈수록 진해진다(상승감). 모이는 지점 3곳에 부드러운 골드 글로우 점.
 *
 * - canvas + requestAnimationFrame(용량 0). 완성 상태에서 천천히 흐르는 움직임만.
 * - prefers-reduced-motion 이면 정지 프레임, 탭 숨김 시 루프 정지, md 미만은 부모가 숨김.
 */

const N = 30;                       // 선 개수 (24~36)
const GOLD = [176, 141, 92] as const; // #B08D5C
const GATHER_U = [0.0, 0.4, 0.8];   // 다발이 모이는 지점(정규화 x)

// 결정론적 의사난수(선마다 고정 파라미터) — 새로고침마다 같은 형태
const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

type Line = { a: number; k: number; phi0: number; omega: number; alpha: number };

const makeLines = (): Line[] =>
  Array.from({ length: N }, (_, i) => {
    const t = (i / (N - 1)) * 2 - 1;                               // -1 … 1 (다발 안 위치)
    const a = t * (0.72 + 0.28 * rand(i + 1)) + (rand(i + 11) - 0.5) * 0.12;
    const k = 1.15 + 0.35 * rand(i + 21);                          // 파수 (약 1.2~1.5 주기)
    const phi0 = rand(i + 31) * Math.PI * 2;
    const period = 20 + 10 * rand(i + 41);                         // 20~30초, 선마다 다르게
    const omega = (Math.PI * 2) / period;
    const alpha = 0.12 + 0.06 * rand(i + 51);                      // 12~18%
    return { a, k, phi0, omega, alpha };
  });

// 좌하 → 우상 완만한 상승 + 아주 약한 굴곡
const baseY = (u: number, h: number) => h * (0.74 - 0.46 * u + 0.05 * Math.sin(u * Math.PI));
// 모임/펼침 포락선: u=0, 0.4, 0.8 에서 최소(≈0.06), 0.2/0.6/1.0 에서 최대(1)
const env = (u: number) => 0.06 + 0.94 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * 2.5 * u));

export default function GoldRibbon({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lines = makeLines();
    let W = 0, H = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth || 800;
      H = wrap.clientHeight || 220;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (tSec: number) => {
      ctx.clearRect(0, 0, W, H);
      const amp = H * 0.40;                        // 최대 펼침 반폭
      const steps = Math.max(80, Math.round(W / 6));
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';     // 겹치는 곳이 자연히 밝아짐

      for (const ln of lines) {
        // 왼쪽 옅게 → 오른쪽 진하게 (상승감)
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${ln.alpha * 0.45})`);
        g.addColorStop(0.55, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${ln.alpha * 0.85})`);
        g.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${ln.alpha * 1.15})`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        const phi = ln.phi0 + tSec * ln.omega;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const x = -8 + u * (W + 16);
          const y = baseY(u, H) + ln.a * env(u) * amp * Math.sin(ln.k * Math.PI * 2 * u + phi);
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 모이는 지점의 글로우 점 — 위치가 느리게 이동
      for (let gi = 0; gi < GATHER_U.length; gi++) {
        const u0 = GATHER_U[gi];
        const u = Math.min(0.98, Math.max(0.02, u0 + 0.025 * Math.sin(tSec * 0.11 + gi * 2.1)));
        const x = -8 + u * (W + 16);
        const y = baseY(u, H);
        const r = 5 + gi * 0.5;                    // 4~6px 코어
        const halo = r * 3.2;
        const core = ctx.createRadialGradient(x, y, 0, x, y, halo);
        const strength = 0.55 + 0.35 * u;          // 오른쪽일수록 조금 더 밝게
        core.addColorStop(0, `rgba(240,220,184,${strength})`);
        core.addColorStop(0.3, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${strength * 0.5})`);
        core.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0)`);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(x, y, halo, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    resize();
    const ro = new ResizeObserver(() => { resize(); draw(reduced ? 7 : lastT); });
    ro.observe(wrap);

    let lastT = 7;
    if (reduced) {
      draw(7);
      return () => ro.disconnect();
    }

    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      lastT = 7 + (now - t0) / 1000;
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
    <div ref={wrapRef} className={`relative w-full ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
    </div>
  );
}
