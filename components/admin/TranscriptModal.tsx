"use client";

import React, { useEffect, useState } from 'react';
import { X, Loader2, MessageSquare, User } from 'lucide-react';
import { fetchTranscript, SessionTranscript, TranscriptMessage } from '@/lib/adminApi';

/**
 * 대화 원문(Transcript) 팝업 뷰어.
 *
 * 전체 화면 크기의 모달에서 세션의 턴-바이-턴 대화를 메신저 UI로 렌더링한다.
 *  - 대상자(role=user)  : 우측 연한 네이비(tint) 말풍선
 *  - AI 코치(role=model): 좌측 연회색(mute) 말풍선
 * 시스템 마커([CHAPTER_COMPLETE] 등)는 표시 전에 제거한다.
 */

// 백엔드가 원문을 보존해 보내므로, 표시 직전 시스템 마커를 정리한다.
const MARKER_RE = /\[[A-Z][A-Z0-9_]*\]/g;
const cleanContent = (s: string) => (s || '').replace(MARKER_RE, '').trim();

interface TranscriptModalProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export default function TranscriptModal({ sessionId, open, onClose }: TranscriptModalProps) {
  const [data, setData] = useState<SessionTranscript | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !sessionId) return;
    let alive = true;
    setLoading(true);
    setError('');
    setData(null);
    fetchTranscript(sessionId)
      .then((d) => { if (alive) setData(d); })
      .catch((err: any) => {
        if (alive) setError(err?.response?.data?.detail || '대화 기록을 불러오지 못했습니다.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, sessionId]);

  // ESC 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // 유의미한 메시지만(빈 마커 전용 메시지 제외)
  const messages = (data?.messages || []).filter(
    (m: TranscriptMessage) => cleanContent(m.content).length > 0
  );

  return (
    <div
      className="fa-modal-bg"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 전체 화면급 모달 */}
      <div className="fa-modal wide flex flex-col" style={{ height: '92dvh', maxHeight: '92dvh', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div className="mh shrink-0">
          <div className="flex items-center gap-3">
            <MessageSquare size={18} style={{ color: 'var(--fa-navy)' }} />
            <div>
              <h3>{data?.user_name || '대상자'} 님의 전체 대화 기록</h3>
              {data && (
                <p className="fa-muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                  총 {messages.length}개 메시지
                  {data.current_topic && ` · 현재: ${data.current_topic}`}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="fa-btn ghost sm">
            <X size={18} />
          </button>
        </div>

        {/* 대화 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8" style={{ background: 'var(--fa-soft)' }}>
          {loading ? (
            <div className="flex h-full items-center justify-center gap-3 fa-muted">
              <Loader2 className="h-5 w-5 animate-spin" /> 대화 기록을 불러오는 중입니다…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="fa-error">{error}</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="fa-empty">표시할 대화 기록이 없습니다.</div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m, i) => {
                const isUser = m.role === 'user';
                const text = cleanContent(m.content);
                return (
                  <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[80%] items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* 아바타 — 대상자=네이비, 코치=회색 테두리 */}
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={isUser
                          ? { background: 'var(--fa-navy)', color: '#fff' }
                          : { background: '#fff', color: 'var(--fa-gray)', boxShadow: 'inset 0 0 0 1px var(--fa-line)' }}
                      >
                        <User size={15} />
                      </div>
                      {/* 말풍선 */}
                      <div
                        className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                        style={isUser
                          ? { background: 'var(--fa-tint)', color: 'var(--fa-ink)', borderBottomRightRadius: 4 }
                          : { background: '#fff', color: 'var(--fa-body)', boxShadow: 'inset 0 0 0 1px var(--fa-line)', borderBottomLeftRadius: 4 }}
                      >
                        <span className="mb-1 block text-[11px] font-bold" style={{ color: isUser ? 'var(--fa-mid)' : 'var(--fa-gray)' }}>
                          {isUser ? '대상자' : 'AI 코치'}
                        </span>
                        {text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="shrink-0 px-6 py-3 text-center text-xs fa-muted" style={{ borderTop: '1px solid var(--fa-line)' }}>
          대상자 응답은 오른쪽, AI 코치는 왼쪽 · ESC 키 또는 바깥 클릭으로 닫기
        </div>
      </div>
    </div>
  );
}
