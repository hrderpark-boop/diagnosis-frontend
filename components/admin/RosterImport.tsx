"use client";

import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import Modal from './Modal';
import { importRoster, downloadRosterExcel, downloadRosterTemplate, RosterResult } from '@/lib/adminApi';

/**
 * 참여자 명단 업로드(마스터 · 고객사 HR 공용).
 *
 *  1) 파일 고르기 → 곧바로 미리보기(dry_run, 저장 안 함)
 *  2) 미리보기: 신규·갱신 인원, 새로 만들 조직, 행별 오류. 오류가 하나라도 있으면 확정 불가(서버도 저장하지 않음)
 *  3) 확정 → 조직 구조 자동 세팅 + 개인 참여 코드 발급 → 개인 코드 엑셀 내려받기
 */

type Step = 'pick' | 'preview' | 'done';

/** axios 오류에서 서버 안내문(detail)을 꺼낸다. blob 응답이면 글자로 풀어 읽는다 */
const errDetail = async (e: unknown, fallback: string): Promise<string> => {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try { return (JSON.parse(await data.text()) as { detail?: string }).detail || fallback; } catch { return fallback; }
  }
  const d = (data as { detail?: unknown } | undefined)?.detail;
  return typeof d === 'string' ? d : fallback;
};

const LEVEL_KO: Record<string, string> = { division: '본부', office: '실', team: '팀' };

export default function RosterImport({
  open, companyId, companyName, onClose, onDone,
}: {
  open: boolean;
  companyId: string;
  companyName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<RosterResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('pick');
    setFile(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    if (busy) return;
    const finished = step === 'done';
    reset();
    if (finished) onDone();
    else onClose();
  };

  // 파일을 고르면 곧바로 미리보기
  const pick = async (f: File | null) => {
    setError('');
    setResult(null);
    setFile(f);
    if (!f) return;
    setBusy(true);
    try {
      const r = await importRoster(companyId, f, true);
      setResult(r);
      setStep('preview');
    } catch (e: unknown) {
      setError(await errDetail(e, '명단을 읽지 못했습니다.'));
      setStep('pick');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const r = await importRoster(companyId, file, false);
      setResult(r);
      if (r.saved) setStep('done');
      else setStep('preview');   // 그 사이 다른 오류가 생긴 경우: 미리보기에 오류를 다시 보여 준다
    } catch (e: unknown) {
      setError(await errDetail(e, '명단을 저장하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const download = async (fn: () => Promise<void>, fallback: string) => {
    setError('');
    try { await fn(); } catch (e: unknown) { setError(await errDetail(e, fallback)); }
  };

  const hasErrors = !!result?.errors.length;

  return (
    <Modal
      open={open}
      title="참여자 명단 업로드"
      description={companyName}
      onClose={close}
      closable={!busy}
      widthClass="max-w-3xl"
    >
      {/* ── 1. 파일 고르기 ── */}
      {step === 'pick' && (
        <div>
          <div className="fa-note" style={{ marginBottom: 16, lineHeight: 1.7 }}>
            엑셀 머리글은 <b>이름, 이메일</b>이 꼭 있어야 하고 <b>본부, 실, 팀, 사번</b>은 선택입니다.
            본부·실·팀 이름으로 조직이 자동으로 만들어지고, 참여자마다 개인 참여 코드가 생깁니다.
            다시 올리면 같은 이메일은 소속·이름이 갱신됩니다.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="fa-btn sm" onClick={() => download(downloadRosterTemplate, '양식을 내려받지 못했습니다.')}>
              <FileSpreadsheet size={14} /> 양식 내려받기
            </button>
            <label className="fa-btn primary sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {busy ? '명단을 읽는 중…' : '엑셀 파일 업로드'}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={(e) => pick(e.target.files?.[0] || null)}
              />
            </label>
            {file && <span className="fa-muted" style={{ fontSize: 13 }}>{file.name}</span>}
          </div>
        </div>
      )}

      {/* ── 2. 미리보기 ── */}
      {step === 'preview' && result && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <span className="fa-chip">전체 {result.rows}행</span>
            <span className="fa-chip tint">신규 {result.new}명</span>
            <span className="fa-chip tint">갱신 {result.updated}명</span>
            <span className="fa-chip line">새로 만들 조직 {result.org_units_created.length}개</span>
            {file && <span className="fa-muted" style={{ fontSize: 12.5 }}>{file.name}</span>}
          </div>

          {result.org_units_created.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {result.org_units_created.map((u) => (
                <span key={u.code} className="fa-chip" title={LEVEL_KO[u.level] || u.level}>
                  <span className="fa-code">{u.code}</span> {u.name}
                </span>
              ))}
            </div>
          )}

          {hasErrors ? (
            <>
              <div className="fa-error" style={{ marginBottom: 12 }}>
                오류가 {result.errors.length}건 있어 아무것도 저장하지 않았습니다. 오류를 고친 파일을 다시 올려 주세요.
              </div>
              <div className="fa-tbl" style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table className="fa-table" style={{ minWidth: 0 }}>
                  <thead><tr><th style={{ width: 70 }}>행</th><th>사유</th></tr></thead>
                  <tbody>
                    {result.errors.map((er, i) => (
                      <tr key={`${er.row}-${i}`}><td className="fa-num">{er.row}</td><td>{er.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="fa-tbl" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="fa-table" style={{ minWidth: 0 }}>
                <thead><tr><th>행</th><th>이름</th><th>이메일</th><th>소속</th><th>구분</th></tr></thead>
                <tbody>
                  {result.preview.slice(0, 50).map((p) => (
                    <tr key={p.row}>
                      <td className="fa-num">{p.row}</td>
                      <td>{p.name}</td>
                      <td className="fa-muted" style={{ fontSize: 13 }}>{p.email}</td>
                      <td style={{ fontSize: 13 }}>
                        {p.org_path}{p.org_code && <span className="fa-code" style={{ marginLeft: 6 }}>{p.org_code}</span>}
                      </td>
                      <td><span className={`fa-chip ${p.action === '신규' ? 'tint' : 'line'}`}>{p.action}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.preview.length > 50 && (
                <p className="fa-muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>앞의 50명만 보여 줍니다(전체 {result.rows}행).</p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" className="fa-btn sm" onClick={reset} disabled={busy}>다른 파일 올리기</button>
            <button type="button" className="fa-btn primary" onClick={confirm} disabled={busy || hasErrors}
              title={hasErrors ? '오류를 고친 파일을 다시 올려 주세요' : undefined}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {busy ? '등록하는 중…' : `등록 확정 (${result.new + result.updated}명)`}
            </button>
          </div>
        </div>
      )}

      {/* ── 3. 완료 ── */}
      {step === 'done' && result && (
        <div>
          <div className="fa-note" style={{ marginBottom: 16 }}>
            <b>{result.new + result.updated}명 등록</b>
            {' '}(신규 {result.new} · 갱신 {result.updated}) · 개인 참여 코드가 만들어졌습니다.
            {result.org_units_created.length > 0 && ` 조직 ${result.org_units_created.length}개가 새로 세팅되었습니다.`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="fa-btn primary"
              onClick={() => download(() => downloadRosterExcel(companyId), '개인 코드 엑셀을 내려받지 못했습니다.')}>
              <Download size={14} /> 개인 코드 엑셀 내려받기
            </button>
            <button type="button" className="fa-btn" onClick={close}>닫기</button>
          </div>
        </div>
      )}

      {error && <div className="fa-error" style={{ marginTop: 14 }} role="alert">{error}</div>}
    </Modal>
  );
}
