'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api';

// 코치 턴 진행 단계 — GET /diagnoses/{sid}/turn_stage (백엔드 in-memory).
//   한 턴은 3~10초가 걸린다. 점 세 개만 보이면 멈춘 것처럼 보여서, 답을 보낸 뒤 1.2초가 지나도 응답이 없으면
//   0.9초마다 단계 문구("답변을 읽고 있어요" → "질문을 고르고 있어요" → "문장을 다듬고 있어요")를 받아 점 옆에 보여 준다.
//   idle·오류(서버 재시작으로 상태 유실 등)는 null → 호출부는 점만 보여 준다. 대화 내용에는 관여하지 않는다.
export interface TurnStage {
  stage: 'reading' | 'thinking' | 'polishing' | 'idle' | string;
  label: string;
  elapsed_s: number;
}

export async function fetchTurnStage(sessionId: string): Promise<TurnStage | null> {
  try {
    const res = await apiClient.get(`/diagnoses/${sessionId}/turn_stage`);
    return res.data as TurnStage;
  } catch {
    return null;
  }
}

// active(답을 보내고 응답을 기다리는 동안)일 때만 폴링한다. 빠른 턴(1.2초 안)에는 요청을 보내지 않는다.
export function useTurnStage(
  sessionId: string | null,
  active: boolean,
  delayMs = 1200,
  intervalMs = 900,
): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const st = await fetchTurnStage(sessionId);
      if (cancelled) return;
      if (st && st.stage !== 'idle' && st.label) setLabel(st.label);
      timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, delayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setLabel(null);  // 다음 턴이 이전 문구로 시작하지 않게
    };
  }, [sessionId, active, delayMs, intervalMs]);

  return active ? label : null;
}
