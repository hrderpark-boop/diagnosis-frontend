'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api';

// 리포트 분석(analyze) 진행 상태 — GET /reports/{sid}/progress (백엔드 in-memory).
//   분석은 LLM 수십 콜이라 수 분이 걸린다. 스피너만 보이면 멈춘 것처럼 보여서,
//   2초마다 단계 라벨("5개 영역 분석 중 2/5 · 교차검증 1/3" 등)을 받아 보여준다.
//   404 = 아직 시작 전이거나 서버 재시작(상태 유실) → null, 호출부는 기존 흐름대로.
export interface AnalysisProgress {
  stage: 'queued' | 'analyze' | 'summary' | 'recommend' | 'saving' | 'done' | 'failed' | string;
  done: number;
  total: number;
  label: string;
  started_at: string;
  elapsed_s: number;
  outer_done?: number;
  outer_total?: number;
  error?: string | null;
  percent?: number;
  chapters?: ChapterProgress[];
  summary_status?: StepStatus;
}

export type StepStatus = 'done' | 'running' | 'pending' | 'failed';

export interface ChapterProgress {
  key: string;
  name: string;
  status: StepStatus;
}

// A-4: 완료 시 분석이 얼마나 걸릴지 — 챕터 사전분석 캐시 상태 기반(GET /estimate).
export interface AnalysisEstimate {
  cached_chapters: number;
  remaining_chapters: number;
  inflight_chapters: number;
  eta_seconds: number;
  eta_label: string;
  chapters: { key: string; name: string; cached: boolean; inflight: boolean }[];
}

export async function fetchAnalysisEstimate(sessionId: string): Promise<AnalysisEstimate | null> {
  try {
    const res = await apiClient.get(`/reports/${sessionId}/estimate`);
    return res.data as AnalysisEstimate;
  } catch {
    return null;
  }
}

export const isProgressRunning = (p: AnalysisProgress | null): boolean =>
  !!p && p.stage !== 'done' && p.stage !== 'failed';

export async function fetchAnalysisProgress(sessionId: string): Promise<AnalysisProgress | null> {
  try {
    const res = await apiClient.get(`/reports/${sessionId}/progress`);
    return res.data as AnalysisProgress;
  } catch {
    return null;
  }
}

export function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${s % 60}초` : `${s}초`;
}

// active 인 동안 intervalMs 마다 진행 상태를 폴링한다(끝나면 멈춤).
export function useAnalysisProgress(
  sessionId: string | null,
  active: boolean,
  intervalMs = 2000,
): AnalysisProgress | null {
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);

  useEffect(() => {
    if (!active || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const p = await fetchAnalysisProgress(sessionId);
      if (cancelled) return;
      if (p) setProgress(p);
      timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setProgress(null);  // 다음 분석이 이전 라벨로 시작하지 않게
    };
  }, [sessionId, active, intervalMs]);

  return active ? progress : null;
}
