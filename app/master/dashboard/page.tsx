"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import {
  fetchCompaniesOverview, fetchDailyStats, fetchOrgStats, startActing,
  CompanyOverviewRow, OrgLevel, OrgStatRow, OrgStats,
} from '@/lib/adminApi';
import './master-dash.css';

/**
 * 마스터(운영사) 대시보드(/master/dashboard).
 *
 * 우리 회사가 여러 고객사의 진단을 한 화면에서 관리·유지보수한다.
 *  - 고객사별 진행 현황(대상·완료·진행 중·중단·미시작·완료율·최근 활동)과 유지보수 신호(리포트 미생성·준비 미비)
 *  - 고객사 행을 펼치면 그 고객사의 본부·실·팀별 현황
 *  - 'HR 화면 들어가기'로 그 고객사 HR 화면을 그대로 열어 보고 고친다(마스터 대리)
 * 숫자는 모두 백엔드 집계 그대로(가짜 값 없음). 접근은 미들웨어·백엔드(require_super_admin)가 막는다.
 */

interface DailyRow { name: string; 진단참여: number; 진단완료: number }

const errText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

const LEVELS: Array<{ key: OrgLevel; label: string }> = [
  { key: 'division', label: '본부' },
  { key: 'office', label: '실' },
  { key: 'team', label: '팀' },
];

const toDate = (s: string) => new Date(`${s}T00:00:00`);
const dot = (s: string) => s.slice(0, 10).replaceAll('-', '.');

/** 진단 기간 표시 + 남은 일수 */
function periodText(r: CompanyOverviewRow): { main: string; sub: string } | null {
  if (!r.diagnosis_start || !r.diagnosis_end) return null;
  const s = toDate(r.diagnosis_start), e = toDate(r.diagnosis_end);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = 864e5;
  const sameYear = s.getFullYear() === e.getFullYear();
  const main = `${dot(r.diagnosis_start)} ~ ${sameYear ? dot(r.diagnosis_end).slice(5) : dot(r.diagnosis_end)}`;
  let sub: string;
  if (today < s) sub = `시작까지 ${Math.round((s.getTime() - today.getTime()) / day)}일`;
  else if (today > e) sub = '진단 기간 종료';
  else {
    const left = Math.round((e.getTime() - today.getTime()) / day);
    sub = left === 0 ? '오늘 마감' : `마감까지 ${left}일`;
  }
  return { main, sub };
}

/** 최근 활동: 오늘 · N일 전 */
function relative(iso: string | null): string {
  if (!iso) return '활동 없음';
  const t = new Date(iso.includes('T') || iso.includes(' ') ? iso.replace(' ', 'T') : `${iso}T00:00:00`);
  if (Number.isNaN(t.getTime())) return '-';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d0 = new Date(t); d0.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d0.getTime()) / 864e5);
  return days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
}

/** 완료·진행 중·중단 누적 막대 + 완료율 */
function ProgressBar({ r }: { r: { registered: number; completed: number; in_progress: number; abandoned: number; completion_rate: number } }) {
  const pct = (n: number) => (r.registered ? (n / r.registered) * 100 : 0);
  return (
    <div className="fa-md-rate" aria-label={`완료율 ${r.completion_rate}%`}>
      <div className="fa-md-stack">
        <i className="c" style={{ width: `${pct(r.completed)}%` }} />
        <i className="p" style={{ width: `${pct(r.in_progress)}%` }} />
        <i className="a" style={{ width: `${pct(r.abandoned)}%` }} />
      </div>
      <span className="fa-num">{r.completion_rate}%</span>
    </div>
  );
}

/** 고객사 한 곳의 본부·실·팀별 현황(행을 펼쳤을 때) */
function OrgDrill({ company }: { company: CompanyOverviewRow }) {
  const [level, setLevel] = useState<OrgLevel>('division');
  const [result, setResult] = useState<{ key: string; data: OrgStats | null; error: string } | null>(null);
  const key = `${company.id}:${level}`;

  useEffect(() => {
    if (company.org_unit_count === 0) return;
    let alive = true;
    fetchOrgStats(company.id, level)
      .then((d) => { if (alive) setResult({ key, data: d, error: '' }); })
      .catch((err: unknown) => { if (alive) setResult({ key, data: null, error: errText(err, '조직별 현황을 불러오지 못했습니다.') }); });
    return () => { alive = false; };
  }, [company.id, company.org_unit_count, level, key]);

  if (company.org_unit_count === 0) {
    return <div className="fa-note">참여 코드(본부·실·팀)가 아직 없습니다. 고객사 관리에서 명단을 올리거나 조직 코드를 등록하면 조직별로 볼 수 있습니다.</div>;
  }
  const loading = !result || result.key !== key;
  const data = !loading ? result?.data : null;
  const rows: OrgStatRow[] = data ? [data.total, ...data.rows, ...(data.unassigned.registered > 0 ? [data.unassigned] : [])] : [];

  return (
    <>
      <div className="head">
        <b>{company.name} 조직별 현황</b>
        <div className="fa-md-tabs" role="tablist">
          {LEVELS.map((l) => (
            <button key={l.key} type="button" role="tab" aria-selected={level === l.key}
              className={level === l.key ? 'on' : ''} onClick={() => setLevel(l.key)}>{l.label}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="fa-muted flex items-center gap-2" style={{ fontSize: 13 }}><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…</div>
      ) : result?.error ? (
        <div className="fa-error">{result.error}</div>
      ) : data && data.rows.length === 0 ? (
        <div className="fa-note">이 고객사에는 {LEVELS.find((l) => l.key === level)?.label} 단계 조직이 없습니다.</div>
      ) : (
        <div className="fa-tbl">
          <table className="fa-md-sub">
            <thead>
              <tr><th>조직</th><th>대상</th><th>완료</th><th>진행 중</th><th>중단</th><th>미시작</th><th>완료율</th><th>종합 평균</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? `${r.level}-${i}`} className={i === 0 ? 'total' : ''}>
                  <td>
                    {r.code && <span className="fa-code" style={{ marginRight: 8 }}>{r.code}</span>}
                    {r.path}
                    {r.is_active === false && <span className="fa-chip off" style={{ marginLeft: 6 }}>사용 중지</span>}
                  </td>
                  <td className="fa-num">{r.registered}</td>
                  <td className="fa-num">{r.completed}</td>
                  <td className="fa-num">{r.in_progress}</td>
                  <td className="fa-num">{r.abandoned}</td>
                  <td className="fa-num">{r.not_started}</td>
                  <td><ProgressBar r={r} /></td>
                  <td className="fa-num">{r.total_average ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function MasterDashboard() {
  const router = useRouter();
  const [rows, setRows] = useState<CompanyOverviewRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [ov, dl] = await Promise.all([fetchCompaniesOverview(), fetchDailyStats(14)]);
      setRows(ov);
      setDaily(dl as DailyRow[]);
    } catch (err: unknown) {
      setError(errText(err, '고객사 현황을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCompaniesOverview(), fetchDailyStats(14)])
      .then(([ov, dl]) => { if (alive) { setRows(ov); setDaily(dl as DailyRow[]); } })
      .catch((err: unknown) => { if (alive) setError(errText(err, '고객사 현황을 불러오지 못했습니다.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // 고객사 HR 화면으로 들어가기(그 고객사 범위로 보고 고친다)
  const enterHr = (r: CompanyOverviewRow) => {
    startActing(r.id, r.name);
    router.push('/admin/dashboard');
  };

  const totalReg = rows.reduce((a, r) => a + r.registered, 0);
  const totalDone = rows.reduce((a, r) => a + r.completed, 0);
  const totalRate = totalReg ? Math.round((totalDone / totalReg) * 100) : 0;
  const missing = rows.reduce((a, r) => a + r.report_missing, 0);
  const notReady = rows.filter((r) => r.is_active && (r.hr_accounts === 0 || r.org_unit_count === 0)).length;

  const kpis = [
    { label: '고객사', value: rows.length, unit: '곳', detail: `운영 중 ${rows.filter((r) => r.is_active).length}곳` },
    { label: '전체 대상자', value: totalReg.toLocaleString(), unit: '명', detail: `완료 ${totalDone.toLocaleString()}명` },
    {
      label: '전체 완료율', value: totalRate, unit: '%',
      detail: <div className="fa-bar"><i style={{ width: `${Math.min(100, totalRate)}%` }} /></div>,
    },
    {
      label: '유지보수 필요', value: missing + notReady, unit: '건',
      detail: `리포트 미생성 ${missing}명 · 준비 미비 고객사 ${notReady}곳`,
    },
  ];

  const tooltipStyle = { backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E6E9EF', color: '#0F172A' };

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow="마스터"
        title="대시보드"
        desc="고객사별로 진단이 잘 진행되는지 보고, 문제가 있으면 HR 화면에 들어가 바로 고칩니다."
        actions={<button type="button" className="fa-btn" onClick={() => { setLoading(true); load(); }}><RefreshCw /> 새로고침</button>}
        kpis={loading ? undefined : kpis}
      />

      {error && <div className="fa-error fa-section">{error}</div>}

      <div className="fa-card pad fa-section">
        <div className="fa-cap">
          <div>
            <h3>고객사별 진행 현황</h3>
            <p>행의 &lsquo;본부·실·팀 보기&rsquo;로 조직별 현황을, &lsquo;HR 화면 들어가기&rsquo;로 그 고객사 화면을 엽니다.</p>
          </div>
        </div>
        {loading ? (
          <div className="fa-empty flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> 고객사 현황을 모으는 중입니다…</div>
        ) : rows.length === 0 ? (
          <div className="fa-empty">등록된 고객사가 없습니다. 고객사 관리에서 먼저 등록해 주세요.</div>
        ) : (
          <div className="fa-tbl">
            <table className="fa-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>고객사</th><th>진단 기간</th><th>대상</th><th>진행</th><th>최근 활동</th><th>점검</th><th style={{ textAlign: 'right' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = periodText(r);
                  const isOpen = open === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr>
                        <td className="fa-md-co">
                          <b>{r.name}</b>
                          <span className="sub">
                            <span className="fa-code">{r.code}</span>
                            {r.org_prefix && <span className="fa-chip tint">접두어 {r.org_prefix}</span>}
                            {!r.is_active && <span className="fa-chip off">비활성</span>}
                          </span>
                        </td>
                        <td className="fa-md-period">
                          {p ? <>{p.main}<small>{p.sub}</small></> : <span className="fa-chip line">기간 미정</span>}
                        </td>
                        <td className="fa-md-reg">
                          <b>{r.registered}</b>
                          <small>명단 {r.roster}명</small>
                        </td>
                        <td>
                          <ProgressBar r={r} />
                          <div className="fa-md-rate-sub">완료 {r.completed} · 진행 {r.in_progress} · 중단 {r.abandoned} · 미시작 {r.not_started}</div>
                        </td>
                        <td className="fa-muted" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{relative(r.last_activity)}</td>
                        <td>
                          <div className="fa-md-badges">
                            {r.report_missing > 0 && <span className="fa-chip danger">리포트 미생성 {r.report_missing}</span>}
                            {r.hr_accounts === 0 && <span className="fa-chip line">HR 계정 없음</span>}
                            {r.org_unit_count === 0 && <span className="fa-chip line">코드 없음</span>}
                            {!p && <span className="fa-chip line">기간 미정</span>}
                            {r.report_missing === 0 && r.hr_accounts > 0 && r.org_unit_count > 0 && p && <span className="fa-chip tint">정상</span>}
                          </div>
                        </td>
                        <td>
                          <div className="fa-md-acts">
                            <button type="button" className="fa-btn sm" aria-expanded={isOpen}
                              onClick={() => setOpen(isOpen ? null : r.id)}>
                              {isOpen ? '접기' : '본부·실·팀 보기'}
                            </button>
                            <button type="button" className="fa-btn sm primary" onClick={() => enterHr(r)}>HR 화면 들어가기</button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="fa-md-drill">
                          <td colSpan={7}><OrgDrill company={r} /></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="fa-md-legend">
          <span><i style={{ background: 'var(--fa-navy)' }} />완료</span>
          <span><i style={{ background: 'var(--fa-light)' }} />진행 중</span>
          <span><i style={{ background: 'var(--fa-gray3)' }} />중단</span>
          <span><i style={{ background: 'var(--fa-mute)' }} />미시작</span>
          <span>리포트 미생성 = 대화를 마쳤는데 리포트가 없는 사람(재분석 필요)</span>
        </div>
      </div>

      {/* 최근 14일 전체 추이 */}
      <div className="fa-card pad fa-section">
        <div className="fa-cap"><div><h3>최근 14일 진단 추이</h3><p>전 고객사 합계 · 진단 시작과 완료</p></div></div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E9EF" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} allowDecimals={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px', color: '#334155' }} />
              <Line type="monotone" dataKey="진단참여" stroke="#8FB2FB" strokeWidth={3} dot={{ r: 3, fill: '#FFFFFF', strokeWidth: 2 }} name="진단 시작" />
              <Line type="monotone" dataKey="진단완료" stroke="#1C2B4A" strokeWidth={3} dot={{ r: 3, fill: '#FFFFFF', strokeWidth: 2 }} name="진단 완료" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AdminLayout>
  );
}
