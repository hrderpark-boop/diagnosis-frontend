import type { ReactNode } from 'react';
import Wordmark from './Wordmark';

/** 참가자 진단 5단계. 헤더 스테퍼와 모바일 단계 pill 이 같은 목록을 쓴다. */
export const PARTICIPANT_STEPS = ['참여 확인', '코치 선택', '자가진단', '코치 대화', '리포트'] as const;
export type ParticipantStep = 1 | 2 | 3 | 4 | 5;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 참가자 화면 공통 헤더: 워드마크 + 5단계 스테퍼 + 오른쪽 영역.
 * - step: 현재 단계(1~5). 앞 단계는 done, 현재는 네이비 pill.
 * - right: 오른쪽 영역(이름·나가기 등). 없으면 "도입 문의" 링크.
 * - 767px 이하에서는 스테퍼가 숨겨지므로 본문 상단에 <ParticipantMobileStep /> 을 둔다.
 */
export default function ParticipantHeader({
  step,
  right,
  wordmarkHref,
  className = '',
}: {
  step: ParticipantStep;
  right?: ReactNode;
  wordmarkHref?: string;
  className?: string;
}) {
  return (
    <header className={`fm-header print:hidden ${className}`}>
      <div className="fm-wrap">
        <Wordmark href={wordmarkHref} />
        <nav className="fm-stepper" aria-label="진단 단계">
          {PARTICIPANT_STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? 'done' : n === step ? 'current' : '';
            return (
              <span key={label} className={`step ${state}`} aria-current={n === step ? 'step' : undefined}>
                <span className="n">{pad(n)}</span>
                <span className="t">{label}</span>
              </span>
            );
          })}
        </nav>
        <div className="fm-right">
          {right ?? (
            <a href="https://www.connectn.co.kr" target="_blank" rel="noreferrer">
              도입 문의
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

/** 모바일(767px 이하) 전용 현재 단계 표시. 데스크톱에서는 CSS 로 숨겨진다. */
export function ParticipantMobileStep({ step, className = '' }: { step: ParticipantStep; className?: string }) {
  return (
    <div className={`fm-mstep ${className}`}>
      <span className="pill">
        <b>
          {pad(step)} {PARTICIPANT_STEPS[step - 1]}
        </b>
        5단계 중 {step}번째
      </span>
    </div>
  );
}
