"use client";

import React, { useState } from 'react';
import { Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react';
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

  // 오류 상태 입력칸: 테두리만 경고색
  const errBorder = { borderColor: 'var(--fa-danger)' };
  const errText = { marginTop: 6, fontSize: 12.5, color: 'var(--fa-danger)' };

  return (
    <div className="fa-card pad">
      <div className="fa-cap">
        <div>
          <h3>비밀번호 변경</h3>
          <p>{MIN_LENGTH}자 이상, 현재 비밀번호와 다른 값으로 바꿉니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 440 }}>
        {/* 현재 비밀번호 */}
        <div className="fa-field">
          <label htmlFor="pw-current">현재 비밀번호</label>
          <div className="relative">
            <input
              id="pw-current"
              type={show ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="발급받은 임시 비밀번호 또는 현재 비밀번호"
              className="fa-input"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'}
              className="fa-btn ghost sm"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: '0 8px', color: 'var(--fa-gray)' }}
            >
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>

        {/* 새 비밀번호 */}
        <div className="fa-field">
          <label htmlFor="pw-next">새 비밀번호</label>
          <input
            id="pw-next"
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={`${MIN_LENGTH}자 이상`}
            className="fa-input"
            style={tooShort || sameAsCurrent ? errBorder : undefined}
          />
          {tooShort && (
            <p style={errText}>{MIN_LENGTH}자 이상 입력해 주세요. (현재 {next.length}자)</p>
          )}
          {sameAsCurrent && (
            <p style={errText}>현재 비밀번호와 다른 값을 사용하세요.</p>
          )}
        </div>

        {/* 새 비밀번호 확인 */}
        <div className="fa-field">
          <label htmlFor="pw-confirm">새 비밀번호 확인</label>
          <input
            id="pw-confirm"
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="새 비밀번호를 한 번 더 입력"
            className="fa-input"
            style={mismatch ? errBorder : undefined}
          />
          {mismatch && <p style={errText}>새 비밀번호와 일치하지 않습니다.</p>}
          {!mismatch && confirm.length > 0 && next.length >= MIN_LENGTH && (
            <p className="flex items-center gap-1" style={{ marginTop: 6, fontSize: 12.5, color: 'var(--fa-mid)' }}>
              <CheckCircle2 size={12} /> 일치합니다.
            </p>
          )}
        </div>

        {/* 서버 응답 알림 */}
        {error && <div className="fa-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="fa-note" role="status" style={{ marginBottom: 16 }}>{success}</div>}

        <button type="submit" disabled={!canSubmit} className="fa-btn primary">
          {submitting && <Loader2 className="animate-spin" />}
          비밀번호 변경
        </button>
      </form>
    </div>
  );
}
