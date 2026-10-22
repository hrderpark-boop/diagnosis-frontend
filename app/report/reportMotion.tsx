"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * 리포트 등장 효과(화면 전용).
 *  - 점수 숫자가 1.0~5.0 을 몇 바퀴 돌다가 점점 느려지며 실제 점수에 멈춘다.
 *  - 같은 값으로 레이더 그래프가 함께 움직이고, 숫자가 멈춘 뒤 막대가 채워진다.
 * 인쇄·PDF 는 '마무리된 상태'로 나가야 하므로, 인쇄 직전(beforeprint)과
 * PDF 저장 직전(finishReportMotion)에는 모든 효과를 즉시 끝낸 값으로 맞춘다.
 * 움직임 줄이기 설정이면 처음부터 최종 값.
 */

export const REPORT_FINISH_EVENT = 'fm-report-finish';

/** 인쇄·PDF 저장 직전에 호출: 진행 중인 모든 효과를 즉시 최종 상태로 */
export function finishReportMotion() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REPORT_FINISH_EVENT));
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

type RollOptions = {
  /** 시작 지연(ms) */
  delay?: number;
  /** 한 값이 도는 시간(ms) */
  duration?: number;
  /** 값마다 시작을 늦추는 간격(ms) */
  stagger?: number;
  /** 도는 범위 */
  min?: number;
  max?: number;
  /** 멈추기 전에 범위를 몇 바퀴 도는지 */
  loops?: number;
};

/**
 * 여러 점수를 동시에 굴린다. 반환: 현재 표시 값(null 은 미측정 그대로)과 값별 완료 여부.
 * targets 내용이 바뀌면 다시 굴린다.
 */
export function useRollingScores(targets: Array<number | null>, opts: RollOptions = {}) {
  const { delay = 200, duration = 1600, stagger = 140, min = 1, max = 5, loops = 2 } = opts;
  const key = JSON.stringify(targets);
  const span = max - min;
  const [state, setState] = useState<{ key: string; values: Array<number | null>; done: boolean[] }>(() => ({ key: '', values: [], done: [] }));
  const finished = useRef(false);

  useEffect(() => {
    const tg: Array<number | null> = JSON.parse(key);
    const finalState = { key, values: tg, done: tg.map(() => true) };
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    finished.current = false;
    if (reduce || tg.length === 0) {
      finished.current = true;
      const r0 = requestAnimationFrame(() => setState(finalState));
      return () => cancelAnimationFrame(r0);
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (finished.current) return;
      let allDone = true;
      const values = tg.map((target, i) => {
        if (target === null) return null;
        const start = t0 + delay + i * stagger;
        const p = (now - start) / duration;
        if (p <= 0) { allDone = false; return min; }
        if (p >= 1) return target;
        allDone = false;
        // 범위를 loops 바퀴 + (목표까지) 이동하는 거리를 감속 곡선으로 진행
        const total = loops * span + (target - min);
        const pos = easeOutCubic(p) * total;
        return min + (pos % span);
      });
      const done = tg.map((target, i) => target === null || now >= t0 + delay + i * stagger + duration);
      setState({ key, values, done });
      if (allDone) { finished.current = true; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const finish = () => { finished.current = true; cancelAnimationFrame(raf); setState(finalState); };
    window.addEventListener(REPORT_FINISH_EVENT, finish);
    window.addEventListener('beforeprint', finish);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(REPORT_FINISH_EVENT, finish);
      window.removeEventListener('beforeprint', finish);
    };
  }, [key, delay, duration, stagger, min, max, loops, span]);

  // 아직 이번 값으로 시작하지 않았으면(첫 그림) 시작 상태: 숫자는 최솟값, 막대는 비움
  if (state.key !== key) {
    const tg: Array<number | null> = JSON.parse(key);
    return { values: tg.map((t) => (t === null ? null : min)), done: tg.map((t) => t === null) };
  }
  return state;
}

// ----------------------------------------------------------------------
// 조직 비교(전체 · 본부 · 팀)
// ----------------------------------------------------------------------

export type CompareLevel = {
  key: 'all' | 'division' | 'team';
  label: string;
  /** 비교 인원 수 */
  n: number;
  available: boolean;
  /** 대역량 이름(또는 키) → 평균. 없는 축은 null */
  averages: Record<string, number | null> | null;
  /** 아직 데이터가 없을 때 보여 줄 안내 */
  note?: string;
};

/**
 * 비교 단계 목록을 만든다.
 *  - 백엔드가 org_comparison.levels(전체·본부·팀)를 주면 그대로 쓴다.
 *  - 지금 백엔드는 group_comparison(같은 그룹 코드 평균) 하나뿐이라 이를 '전체'로 쓰고,
 *    본부·팀은 정보가 등록되기 전까지 안내만 표시한다(가짜 숫자 금지).
 *  - demo=true 이면 미리보기용 예시 데이터(화면에 '예시 데이터'로 표시).
 */
type ReportLike = {
  org_comparison?: { levels?: CompareLevel[] } | null;
  group_comparison?: { available?: boolean; n?: number; averages?: Record<string, number | null> | null; label?: string } | null;
} | null | undefined;

export function buildCompareLevels(report: ReportLike, competencyNames: string[], demo: boolean): { levels: CompareLevel[]; demo: boolean } {
  if (demo) {
    const base = [3.2, 3.0, 3.1, 3.3, 3.0];
    const mk = (shift: number[]) => Object.fromEntries(competencyNames.map((n, i) => [n, Math.round(((base[i % base.length]) + shift[i % shift.length]) * 10) / 10]));
    return {
      demo: true,
      levels: [
        { key: 'all', label: '전체', n: 128, available: true, averages: mk([0, 0, 0, 0, 0]) },
        { key: 'division', label: '본부', n: 34, available: true, averages: mk([0.2, -0.1, 0.1, 0.3, -0.2]) },
        { key: 'team', label: '팀', n: 9, available: true, averages: mk([0.4, 0.1, -0.2, 0.2, 0.1]) },
      ],
    };
  }
  const org = report?.org_comparison?.levels;
  if (Array.isArray(org) && org.length) return { demo: false, levels: org };

  const gc = report?.group_comparison;
  const all: CompareLevel = {
    key: 'all', label: '전체', n: gc?.n ?? 0,
    available: !!gc?.available && !!gc?.averages,
    averages: gc?.available ? gc?.averages ?? null : null,
    note: gc?.label || '비교 대상이 모이면 전체 평균과 비교해 드립니다',
  };
  return {
    demo: false,
    levels: [
      all,
      { key: 'division', label: '본부', n: 0, available: false, averages: null, note: '본부 정보가 등록되면 비교가 표시됩니다' },
      { key: 'team', label: '팀', n: 0, available: false, averages: null, note: '팀 정보가 등록되면 비교가 표시됩니다' },
    ],
  };
}

const LEVEL_COLOR: Record<CompareLevel['key'], string> = {
  team: 'var(--fm-blue-bright)',
  division: 'var(--fm-blue-mid)',
  all: 'var(--fm-gray-300)',
};

/** 막대: 화면에 들어온 뒤 0 에서 값까지 채워진다(인쇄·PDF 는 최종 폭) */
function FillBar({ pct, color, go }: { pct: number; color: string; go: boolean }) {
  return (
    <span className="fm-cmp-bar"><i style={{ width: go ? `${pct}%` : '0%', background: color }} /></span>
  );
}

/**
 * 조직 비교 카드. 역량마다 나 · 팀 · 본부 · 전체 막대를 나란히 보여 주고,
 * 전체 평균과의 차이를 숫자로 붙인다.
 */
export function OrgCompare({
  competencies, myScores, maxScore, levels, demo,
}: {
  competencies: Array<{ key: string; name: string }>;
  myScores: Record<string, number | null>;
  maxScore: number;
  levels: CompareLevel[];
  demo: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const show = () => setGo(true);
    if (reduce || !('IntersectionObserver' in window)) { show(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { show(); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    window.addEventListener(REPORT_FINISH_EVENT, show);
    window.addEventListener('beforeprint', show);
    return () => { io.disconnect(); window.removeEventListener(REPORT_FINISH_EVENT, show); window.removeEventListener('beforeprint', show); };
  }, []);

  const order: CompareLevel['key'][] = ['team', 'division', 'all'];
  const byKey = useMemo(() => Object.fromEntries(levels.map((l) => [l.key, l])) as Record<string, CompareLevel>, [levels]);
  const shown = order.map((k) => byKey[k]).filter((l): l is CompareLevel => !!l);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / (maxScore || 5)) * 100));
  const val = (src: Record<string, number | null> | null | undefined, c: { key: string; name: string }) => {
    const v = src?.[c.name] ?? src?.[c.key];
    return typeof v === 'number' ? v : null;
  };
  const all = byKey['all'];

  return (
    <div ref={ref} className="fm-card fm-cmp print:break-inside-avoid">
      <div className="cap-head">
        <div>
          <div className="fm-eyebrow">Benchmark</div>
          <h3>조직 내 위치 비교</h3>
        </div>
        {demo && <span className="fm-chip tint">예시 데이터</span>}
      </div>

      <div className="fm-cmp-legend">
        <span><i style={{ background: 'var(--fm-accent)' }} />나</span>
        {shown.map((l) => (
          <span key={l.key} className={l.available ? '' : 'off'}>
            <i style={{ background: LEVEL_COLOR[l.key] }} />{l.label} 평균{l.available && l.n ? ` (${l.n}명)` : ''}
          </span>
        ))}
      </div>

      <div className="fm-cmp-rows">
        {competencies.map((c) => {
          const me = val(myScores, c);
          const allAvg = all?.available ? val(all.averages, c) : null;
          const diff = me !== null && allAvg !== null ? Math.round((me - allAvg) * 10) / 10 : null;
          return (
            <div key={c.key} className="fm-cmp-row">
              <div className="nm">
                <b>{c.name}</b>
                {diff !== null && (
                  <span className={`diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>
                    전체 대비 {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="bars">
                <div className="b me">
                  <span className="lb">나</span>
                  <FillBar pct={me === null ? 0 : pct(me)} color="var(--fm-accent)" go={go} />
                  <span className="v">{me === null ? '—' : me.toFixed(1)}</span>
                </div>
                {shown.map((l) => {
                  const v = l.available ? val(l.averages, c) : null;
                  return (
                    <div key={l.key} className={`b ${v === null ? 'off' : ''}`}>
                      <span className="lb">{l.label}</span>
                      <FillBar pct={v === null ? 0 : pct(v)} color={LEVEL_COLOR[l.key]} go={go} />
                      <span className="v">{v === null ? '—' : v.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {shown.some((l) => !l.available) && (
        <ul className="fm-cmp-notes">
          {shown.filter((l) => !l.available).map((l) => <li key={l.key}>{l.label}: {l.note}</li>)}
        </ul>
      )}
    </div>
  );
}
