"use client";

import React, { useState } from 'react';
import { Check, Copy, Download, Loader2, X } from 'lucide-react';
import { downloadOrgCodesExcel, downloadRosterExcel } from '@/lib/adminApi';
import type { InviteMail } from '@/lib/inviteMail';

/**
 * 참여 안내 메일 미리보기·복사 창.
 * '메일 본문 복사'는 HTML 과 텍스트를 함께 클립보드에 넣어, 메일 프로그램에 붙여 넣으면 표가 그대로 유지된다.
 * 첨부할 엑셀도 여기서 바로 내려받는다.
 */
export default function InviteMailModal({
  open, onClose, mail, companyId, hasPersonalCodes, hasOrgCodes,
}: {
  open: boolean;
  onClose: () => void;
  mail: InviteMail | null;
  companyId: string;
  hasPersonalCodes: boolean;
  hasOrgCodes: boolean;
}) {
  const [copied, setCopied] = useState<'' | 'subject' | 'body'>('');
  const [busy, setBusy] = useState<'' | 'roster' | 'org'>('');
  const [error, setError] = useState('');

  if (!open || !mail) return null;

  const flash = (k: 'subject' | 'body') => {
    setCopied(k);
    setTimeout(() => setCopied(''), 1600);
  };

  const copySubject = async () => {
    await navigator.clipboard.writeText(mail.subject);
    flash('subject');
  };

  // HTML 복사가 안 되는 브라우저는 텍스트로 대신 복사
  const copyBody = async () => {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([mail.html], { type: 'text/html' }),
          'text/plain': new Blob([mail.text], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(mail.text);
      }
    } catch {
      await navigator.clipboard.writeText(mail.text);
    }
    flash('body');
  };

  const download = async (kind: 'roster' | 'org') => {
    setError('');
    setBusy(kind);
    try {
      if (kind === 'roster') await downloadRosterExcel(companyId);
      else await downloadOrgCodesExcel(companyId);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : '엑셀을 내려받지 못했습니다.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="fa-modal-bg" role="presentation" onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="fa-modal wide" role="dialog" aria-modal="true" aria-label="참여 안내 메일" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h3>참여 안내 메일</h3>
          <button type="button" className="fa-btn sm ghost" onClick={onClose} aria-label="닫기"><X /></button>
        </div>
        <div className="mb">
          <div className="fa-field" style={{ marginBottom: 14 }}>
            <label>제목</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="fa-input" readOnly value={mail.subject} />
              <button type="button" className="fa-btn" onClick={copySubject}>
                {copied === 'subject' ? <Check /> : <Copy />} 제목 복사
              </button>
            </div>
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--fa-body)' }}>본문 미리보기</label>
          {/* 이 화면에서 만든 HTML(사용자 입력은 이스케이프됨)만 보여 준다 */}
          <div style={{ border: '1px solid var(--fa-line)', borderRadius: 10, padding: '18px 22px', maxHeight: '52vh', overflow: 'auto', background: '#fff' }}
            dangerouslySetInnerHTML={{ __html: mail.html }} />
          <p className="fa-muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            메일에 붙여 넣으면 표가 그대로 유지됩니다(Gmail·Outlook). 아래 엑셀 파일을 내려받아 첨부해 주세요.
          </p>
          {error && <div className="fa-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="mf" style={{ flexWrap: 'wrap' }}>
          {hasPersonalCodes && (
            <button type="button" className="fa-btn" disabled={busy !== ''} onClick={() => download('roster')}>
              {busy === 'roster' ? <Loader2 className="animate-spin" /> : <Download />} 개인 코드 엑셀 내려받기
            </button>
          )}
          <button type="button" className="fa-btn" disabled={busy !== '' || !hasOrgCodes} onClick={() => download('org')}>
            {busy === 'org' ? <Loader2 className="animate-spin" /> : <Download />} 조직 코드 엑셀 내려받기
          </button>
          <button type="button" className="fa-btn primary" onClick={copyBody}>
            {copied === 'body' ? <Check /> : <Copy />} {copied === 'body' ? '복사했습니다' : '메일 본문 복사'}
          </button>
        </div>
      </div>
    </div>
  );
}
