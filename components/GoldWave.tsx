"use client";

import { useEffect, useRef } from 'react';

/**
 * 첫 화면 비주얼 — "한 점에서 시작해 대각선으로 올라가 구가 되는 리본".
 *
 * 띠 왼쪽 아래 한 점(x 6%, y 85%)에서 선 46개가 나와 다발로 모이고, 두 번 꼬이며(교차 28%/58%)
 * 우상향 대각선으로 올라가 오른쪽 위(x 89%, y 22%)의 와이어프레임 구로 흘러 들어간다.
 * 리본의 각 선은 구 왼쪽 가장자리에서 자기 위선(latitude)이 되어 앞면을 따라 이어지다 사라진다.
 *   선 i:  y_i(u) = base(u) + f_i(u) · A(u) · gather(u) + 숨결
 *   - base(u): 좌하 → 우상 직선 + 완만한 물결(끝으로 갈수록 잦아듦)
 *   - A(u): 부호가 바뀌는 반폭. 벌어진 곳 60~72px(폭 120~144), 교차점 3~5px, 끝은 구의 반폭
 *   - f_i(u): t_i(균등) 에서 sin(t_i·φmax)/sin(φmax)(위선 간격) 로 끝에서 이행
 * 구: 지름 132px, 위선 9 + 경선 10, y축 75초 1회전, 앞면 30% 뒷면 10%, 중심 글로우 22px.
 * 글로우: 출발점 + 교차점 2 + 구 중심.
 *
 * 움직임: 첫 로드 때만 2초 그려지는 도입 → 구 도달 시 0.6초 반짝임 → 이후 구 교차점 5곳이
 * 3~5초 간격으로 미세하게 반짝. 위상 드리프트(교차 위치·다발 폭 숨결)는 이전의 절반.
 * reduced-motion 이면 정지 프레임, 탭 숨김 정지, md 미만은 부모가 숨김. 띠(300px) 안에서만 그린다.
 * 검증용: window.__FM_VISUAL_T 가 숫자이거나 URL 에 ?fmT=초 가 있으면 그 시각의 프레임을 정지 상태로.
 */

const N = 46;
const INTRO = 2.0;                        // s — 리본이 구까지 그려지는 시간
const FLASH = 0.6;                        // s — 구 도달 반짝임
const BRIGHT = [212, 179, 122] as const;  // #D4B37A
const GOLD = [176, 141, 92] as const;     // #B08D5C
const CROSS = [0.28, 0.58];               // 교차점(정규화 x)
const GATHER_END = 0.10;                  // 이 지점까지 한 점 → 다발(숨결·개별 편차가 켜지는 구간)
const START = { x: 0.06, y: 0.85 };       // 출발점(띠 비율)
const END = { x: 0.89, y: 0.22 };         // 구 중심(띠 비율)
const R_MAX = 66;                         // 구 반지름 기준(px) — 지름 132. 좁은 띠에서는 폭의 16% 까지 축소
const TILT = 0.30;                        // 구 x축 기울기(rad) — 위선이 타원으로 보이게
const PHI_MAX = Math.PI / 3;              // 리본이 닿는 최대 위도(±60°)
const ROT_PERIOD = 75;                    // s — y축 1회전
const N_PAR = 9, N_MER = 10;
const FRONT_A = 0.30, BACK_A = 0.10;

const rnd = (a: number, b = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Line = { t: number; phi: number; alpha: number; ph: number; omega: number; amp: number };
const LINES: Line[] = Array.from({ length: N }, (_, i) => {
  const t = (i / (N - 1)) * 2 - 1;
  return {
    t,
    phi: -t * PHI_MAX,                              // t>0(아래) → 남위
    alpha: 0.15 + 0.10 * rnd(i, 1),
    ph: rnd(i, 2) * Math.PI * 2,
    omega: (Math.PI * 2) / (20 + 10 * rnd(i, 3)),   // 20~30초
    amp: 0.6 + 0.65 * rnd(i, 4),                    // 숨결 진폭(px) — 이전의 절반
  };
});

// 구 교차점 미세 반짝임: (경선 j, 위선 k, 주기 3~5초, 위상)
const TWINKLES = [0, 1, 2, 3, 4].map(i => ({
  mer: Math.floor(rnd(i, 7) * N_MER),
  par: 1 + Math.floor(rnd(i, 8) * (N_PAR - 2)),
  period: 3 + 2 * rnd(i, 9),
  ph: rnd(i, 10) * 5,
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
    const qT = Number(new URLSearchParams(window.location.search).get('fmT'));
    const fixedT = (window as unknown as { __FM_VISUAL_T?: number }).__FM_VISUAL_T
      ?? (Number.isFinite(qT) && qT > 0 ? qT : undefined);
    let W = 0, H = 0;
    let R = R_MAX;            // 실제 구 반지름(resize 에서 결정)
    let K = 1;                // 리본 폭 배율(좁은 띠에서 축소)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth || 800;
      H = wrap.clientHeight || 300;
      R = Math.max(48, Math.min(R_MAX, W * 0.16));
      K = Math.max(0.55, Math.min(1, W / 800));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // ---- 구 투영: (위도 φ, 경도 λ) → 화면 좌표 + 깊이(z'>0 앞면) ----
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    const proj = (phi: number, lam: number, cx: number, cy: number) => {
      const x = Math.cos(phi) * Math.sin(lam);
      const y = Math.sin(phi);
      const z = Math.cos(phi) * Math.cos(lam);
      const y2 = y * cosT - z * sinT;
      const z2 = y * sinT + z * cosT;
      return { x: cx + R * x, y: cy - R * y2, z: z2 };
    };
    // 위선 φ 의 왼쪽 가장자리(λ = -90°): 리본 선이 닿는 점
    const leftEdge = (phi: number, cx: number, cy: number) => proj(phi, -Math.PI / 2, cx, cy);

    // 중심선: 좌하 → 우상 대각선 + 완만한 물결(끝에서 잦아듦). x 는 선마다 다른 끝점으로 호출자가 보간.
    const baseY = (u: number, tSec: number, yEnd: number) => {
      const y0 = H * START.y;
      const wave = H * 0.06 * Math.sin(Math.PI * 2 * (u * 1.15 - 0.08) + 0.075 * Math.sin(tSec * 0.05));
      return lerp(y0, yEnd, u) + wave * (1 - smooth(0.78, 1, u));
    };

    // 반폭 A(u): 교차점에서 부호가 바뀜. 벌어진 곳 60~72px, 교차점 3~5px, 끝은 구 반폭
    const endHalf = () => R * Math.sin(PHI_MAX) * cosT;   // 리본이 구에 닿을 때의 반폭
    const crossAt = (i: number, tSec: number) =>
      CROSS[i] + 0.006 * Math.sin(tSec * (i === 0 ? 0.07 : 0.09) + (i === 0 ? 0 : 1.7)); // 숨결 절반
    const halfWidth = (u: number, tSec: number) => {
      const c0 = crossAt(0, tSec), c1 = crossAt(1, tSec);
      let a: number;
      // 첫 로브는 출발점(u=0)부터 열려 한 점 → 다발이 매듭 없이 벌어진다
      if (u < c0) a = Math.sin(Math.PI * u / c0) * 62 * K;
      else if (u < c1) a = -Math.sin(Math.PI * (u - c0) / (c1 - c0)) * 72 * K;
      else {
        // 마지막 로브: 벌어졌다가(≈66) 구의 반폭으로 정착
        const s = (u - c1) / (1 - c1);
        const bulge = 66 * K * Math.sin(Math.PI / 2 * Math.min(s, 0.7) / 0.7);
        a = lerp(bulge, endHalf(), smooth(0.7, 1, s));
      }
      const sign = a >= 0 ? 1 : -1;
      return sign * Math.max(4, Math.abs(a));
    };

    const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    const draw = (tSec: number) => {
      ctx.clearRect(0, 0, W, H);
      // reduced-motion: 완성 상태 정지. 검증용 고정 시각(fixedT)은 그 시각의 프레임을 그대로 그린다.
      const progress = reduced ? 1 : smooth(0, INTRO, tSec);
      const uMax = Math.min(1, progress * 1.02);
      const ox = W * START.x;
      const cx = Math.min(W * END.x, W - R - 6), cy = H * END.y;
      const theta = reduced ? 0.9 : (Math.PI * 2 * tSec) / ROT_PERIOD;
      const steps = Math.max(120, Math.round(W / 4));
      ctx.lineWidth = 0.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';

      // ---- 리본 ----
      for (const ln of LINES) {
        const edge = leftEdge(ln.phi, cx, cy);
        const g = ctx.createLinearGradient(ox, 0, cx, 0);
        g.addColorStop(0, rgba(BRIGHT, ln.alpha));
        g.addColorStop(0.25, rgba(GOLD, ln.alpha));
        g.addColorStop(1, rgba(GOLD, ln.alpha * 0.9));
        ctx.strokeStyle = g;
        ctx.beginPath();
        // 균등 t → 위선 간격(sin) 로 끝에서 이행
        const fEnd = Math.sin(ln.t * PHI_MAX) / Math.sin(PHI_MAX);
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          if (u > uMax) break;
          const x = lerp(ox, edge.x, u);
          const gather = smooth(0, GATHER_END, u);
          const settle = smooth(0.7, 1, u);
          const f = lerp(ln.t, fEnd, settle);
          const breath = ln.amp * Math.sin(Math.PI * 2 * u * 1.4 + ln.ph + tSec * ln.omega) * gather * (1 - settle);
          const y = baseY(u, tSec, cy) + f * halfWidth(u, tSec) * gather + breath;   // u=1 에서 edge.y 에 닿음
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 구 왼쪽에서 자기 위선을 따라 앞면으로 흘러 들어가며 사라짐(λ -90° → 0°)
        if (uMax >= 1) {
          const K = 18;
          for (let k = 0; k < K; k++) {
            const l0 = -Math.PI / 2 + (k / K) * (Math.PI / 2);
            const l1 = -Math.PI / 2 + ((k + 1) / K) * (Math.PI / 2);
            const p0 = proj(ln.phi, l0, cx, cy), p1 = proj(ln.phi, l1, cx, cy);
            const fade = 1 - (k + 0.5) / K;
            ctx.strokeStyle = rgba(GOLD, ln.alpha * 0.9 * fade * fade);
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
          }
        }
      }

      // ---- 와이어프레임 구 (리본이 도착하며 떠오름) ----
      const sphereIn = reduced ? 1 : smooth(0.62, 1, progress);
      if (sphereIn > 0) {
        const SEG = 72;
        const strokeArc = (pts: { x: number; y: number; z: number }[], mul = 1) => {
          // 깊이에 따라 앞면 30% ↔ 뒷면 10%, 6단계로 묶어 그림
          const buckets: number[][] = Array.from({ length: 6 }, () => []);
          for (let i = 0; i < pts.length - 1; i++) {
            const z = (pts[i].z + pts[i + 1].z) / 2;
            const b = Math.min(5, Math.max(0, Math.floor((z + 1) / 2 * 6)));
            buckets[b].push(i);
          }
          buckets.forEach((idx, b) => {
            if (!idx.length) return;
            const a = lerp(BACK_A, FRONT_A, (b + 0.5) / 6) * sphereIn * mul;
            ctx.strokeStyle = rgba(GOLD, a);
            ctx.beginPath();
            for (const i of idx) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); }
            ctx.stroke();
          });
        };
        ctx.lineWidth = 0.7;
        // 위선(회전 불변 — 리본 선이 여기에 닿는다)
        for (let k = 0; k < N_PAR; k++) {
          const phi = -PHI_MAX * 1.25 + (k / (N_PAR - 1)) * PHI_MAX * 2.5;   // ±75°
          const pts = [];
          for (let s = 0; s <= SEG; s++) pts.push(proj(phi, (s / SEG) * Math.PI * 2, cx, cy));
          strokeArc(pts);
        }
        // 경선(y축 회전)
        for (let j = 0; j < N_MER; j++) {
          const lam = theta + (j / N_MER) * Math.PI;
          const pts = [];
          for (let s = 0; s <= SEG; s++) {
            const a = -Math.PI / 2 + (s / SEG) * Math.PI * 2;   // 남극 → 북극 → 남극
            const back = a > Math.PI / 2;
            const phi = back ? Math.PI - a : a;
            pts.push(proj(phi, back ? lam + Math.PI : lam, cx, cy));
          }
          strokeArc(pts);
        }
        // 실루엣 원(아주 옅게)
        ctx.strokeStyle = rgba(GOLD, 0.12 * sphereIn);
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 0.8;

        // 교차점 미세 반짝임(도입·반짝임 이후, 앞면에 있을 때만)
        if (!reduced && tSec > INTRO + FLASH) {
          for (const tw of TWINKLES) {
            const ph = ((tSec + tw.ph) % tw.period) / tw.period;   // 0~1
            const pulse = ph < 0.16 ? Math.sin(Math.PI * ph / 0.16) : 0;
            if (pulse <= 0) continue;
            const phi = -PHI_MAX * 1.25 + (tw.par / (N_PAR - 1)) * PHI_MAX * 2.5;
            const p = proj(phi, theta + (tw.mer / N_MER) * Math.PI, cx, cy);
            if (p.z < 0.15) continue;
            const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7);
            gr.addColorStop(0, rgba([245, 228, 196], 0.55 * pulse));
            gr.addColorStop(1, rgba(GOLD, 0));
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      // ---- 글로우: 출발점 + 교차점 2 + 구 중심 ----
      const glow = (x: number, y: number, halo: number, strength: number, warm = false) => {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, halo);
        gr.addColorStop(0, `rgba(${warm ? '245,228,196' : '240,220,184'},${strength})`);
        gr.addColorStop(0.3, rgba(BRIGHT, strength * 0.5));
        gr.addColorStop(1, rgba(GOLD, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, halo, 0, Math.PI * 2); ctx.fill();
      };
      const onBase = (u: number) => ({ x: lerp(ox, cx - R * 0.5, u), y: baseY(u, tSec, cy) });
      glow(ox, H * START.y, 48, 0.85 * Math.min(1, progress * 3), true);
      for (let i = 0; i < 2; i++) {
        const c = crossAt(i, tSec);
        if (uMax > c) { const p = onBase(c); glow(p.x, p.y, 17, 0.6); }
      }
      if (sphereIn > 0) {
        // 구 중심 22px + 도달 반짝임(0.6초)
        const flash = !reduced && tSec > INTRO && tSec < INTRO + FLASH ? Math.sin(Math.PI * (tSec - INTRO) / FLASH) : 0;
        glow(cx, cy, 22 + 30 * flash, (0.55 + 0.45 * flash) * sphereIn, true);
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
