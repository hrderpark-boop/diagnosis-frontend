"use client";

import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { changeMyPassword } from '@/lib/adminApi';

/**
 * 비밀번호 변경 폼 (super_admin / client_admin 공통).
 *
 * 프론트 검증은 사용자 편의를 위한 즉시 피드백일 뿐이며,
 * 실제 정책 집행은 서버(PATCH /admin/users/me/password)가 담당한다.
 */

const MIN_LENGTH = 8;

export default function PasswordChangeForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── 유효성 검사 ──
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && current.length > 0 && next === current;

  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_LENGTH &&
    next === confirm &&
    !sameAsCurrent &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 제출 직전 재검증 (버튼 비활성화를 우회한 엔터 제출 대비)
    if (next !== confirm) {
      setError('새 비밀번호와 확인 값이 일치하지 않습니다.');
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`새 비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`);
      return;
    }

    setSubmitting(true);
    try {
      await changeMyPassword({
        current_password: current,
        new_password: next,
        confirm_password: confirm,
      });
      // 성공 시 폼 초기화 + 알림
      setCurrent('');
      setNext('');
      setConfirm('');
      setShow(false);
      setSuccess('비밀번호가 성공적으로 변경되었습니다.');
    } catch (err: any) {
      setError(err?.response?.data?.detail || '비밀번호 변경에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 pr-10 text-sm text-white outline-none transition-colors focus:border-blue-500';

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-6">
      <div className="mb-5 flex items-center gap-2">
        <KeyRound size={18} className="text-blue-400" />
        <h3 className="text-lg font-bold text-gray-200">비밀번호 변경</h3>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        {/* 현재 비밀번호 */}
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-400">현재 비밀번호 *</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="발급받은 임시 비밀번호 또는 현재 비밀번호"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* 새 비밀번호 */}
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-400">새 비밀번호 *</label>
          <input
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={`${MIN_LENGTH}자 이상`}
            className={`${inputClass} ${tooShort || sameAsCurrent ? 'border-rose-600' : ''}`}
          />
          {tooShort && (
            <p className="mt-1.5 text-xs text-rose-400">
              {MIN_LENGTH}자 이상 입력해주세요. (현재 {next.length}자)
            </p>
          )}
          {sameAsCurrent && (
            <p className="mt-1.5 text-xs text-rose-400">현재 비밀번호와 다른 값을 사용하세요.</p>
          )}
        </div>

        {/* 새 비밀번호 확인 */}
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-400">새 비밀번호 확인 *</label>
          <input
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="새 비밀번호를 한 번 더 입력"
            className={`${inputClass} ${mismatch ? 'border-rose-600' : ''}`}
          />
          {mismatch && (
            <p className="mt-1.5 text-xs text-rose-400">새 비밀번호와 일치하지 않습니다.</p>
          )}
          {!mismatch && confirm.length > 0 && next.length >= MIN_LENGTH && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-green-400">
              <CheckCircle2 size={12} /> 일치합니다.
            </p>
          )}
        </div>

        {/* 서버 응답 알림 */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-900/50 bg-rose-950/40 p-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-lg border border-green-900/50 bg-green-950/40 p-3">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" />
            <p className="text-sm text-green-300">{success}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
        >
          {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
          비밀번호 변경
        </button>
      </form>
    </div>
  );
}
