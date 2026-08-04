"use client";

import React, { useEffect, useState } from 'react';
import { X, Loader2, MessageSquare, User } from 'lucide-react';
import { fetchTranscript, SessionTranscript, TranscriptMessage } from '@/lib/adminApi';

/**
 * 대화 원문(Transcript) 팝업 뷰어.
 *
 * 전체 화면 크기의 모달에서 세션의 턴-바이-턴 대화를 메신저 UI로 렌더링한다.
 *  - 대상자(role=user)  : 우측 파란 말풍선
 *  - AI 코치(role=model): 좌측 회색 말풍선
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* 전체 화면급 모달 */}
      <div className="relative flex h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-700 bg-gray-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-400" />
            <div>
              <h3 className="text-base font-bold text-white">
                {data?.user_name || '대상자'} 님의 전체 대화 기록
              </h3>
              {data && (
                <p className="text-xs text-gray-400">
                  총 {messages.length}개 메시지
                  {data.current_topic && ` · 현재: ${data.current_topic}`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* 대화 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto bg-gray-950 px-4 py-6 md:px-8">
          {loading ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Loader2 className="mr-3 h-5 w-5 animate-spin" /> 대화 기록을 불러오는 중입니다...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-lg border border-rose-900/50 bg-rose-950/40 p-6 text-sm text-rose-300">
                {error}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              표시할 대화 기록이 없습니다.
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m, i) => {
                const isUser = m.role === 'user';
                const text = cleanContent(m.content);
                return (
                  <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[80%] items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* 아바타 — 대상자·코치 모두 사람(User) 아이콘.
                          배경색으로 구분: 대상자=파랑, 코치=차분한 짙은 남색(slate) */}
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-blue-600' : 'bg-slate-600'}`}>
                        {isUser ? <User size={15} className="text-white" /> : <User size={15} className="text-slate-200" />}
                      </div>
                      {/* 말풍선 */}
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'rounded-br-sm bg-blue-600 text-white'
                            : 'rounded-bl-sm bg-gray-800 text-gray-100'
                        }`}
                      >
                        <span className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${isUser ? 'text-blue-200' : 'text-gray-500'}`}>
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
        <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-6 py-3 text-center text-xs text-gray-500">
          대상자 응답은 우측(파랑), AI 코치는 좌측(회색) · ESC 키 또는 바깥 클릭으로 닫기
        </div>
      </div>
    </div>
  );
}
