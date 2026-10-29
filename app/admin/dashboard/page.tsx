"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import { Download, RefreshCw, ChevronLeft, ChevronRight, Loader2, ShieldCheck, CalendarDays } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  fetchOverview, fetchDailyStats, fetchDailyStatsRange, fetchReports, downloadExcel, fetchMe, Paginated,
  fetchPeriod, savePeriod, fetchOrgStats, fetchOrgUnits, DiagnosisPeriod, OrgStats, OrgStatRow, OrgLevel,
} from '@/lib/adminApi';
import { adminPath } from '@/lib/adminRoutes';
import './dashboard.css';

/**
 * 어드민 대시보드.
 *
 * 기존의 하드코딩 CHART_DATA(최근 7일 Mock)와 프론트 계산식 KPI 는 전면 폐기했다.
 * 모든 수치는 백엔드 집계 API 가 '로그인한 계정의 권한 범위'로 산출해 내려준다.
 *  - super_admin  → 전사 전체 집계
 *  - client_admin → 자사 데이터만 집계
 */

const PAGE_SIZE = 10;

/** 일별 추이 한 칸. 기간 추이 API 는 누적완료까지 준다(최근 N일 대체 경로에는 없음). */
interface DailyPoint { date?: string; name: string; 진단참여: number; 진단완료: number; 누적완료?: number }

const errDetail = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

/** 'YYYY-MM-DD' → 로컬 날짜(시간대 밀림 방지) */
const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dot = (d: Date, withYear: boolean) =>
  `${withYear ? `${d.getFullYear()}.` : ''}${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

/** 머리 설명줄: "진단 기간 2026.11.01 ~ 11.15 · 마감까지 N일" */
function periodLabel(p: DiagnosisPeriod | null): string {
  if (!p?.diagnosis_start || !p?.diagnosis_end) return '진단 기간이 정해지지 않았습니다.';
  const s = parseDay(p.diagnosis_start), e = parseDay(p.diagnosis_end);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const range = `${dot(s, true)} ~ ${dot(e, e.getFullYear() !== s.getFullYear())}`;
  const day = 864e5;
  let tail: string;
  if (today < s) tail = `시작까지 ${Math.round((s.getTime() - today.getTime()) / day)}일`;
  else if (today > e) tail = '진단 기간 종료';
  else {
    const left = Math.round((e.getTime() - today.getTime()) / day);
    tail = left === 0 ? '오늘 마감' : `마감까지 ${left}일`;
  }
  return `진단 기간 ${range} · ${tail}`;
}

/** 점수(1~5) → 네이비 농도. 진할수록 높은 점수 */
function heatStyle(v: number | null): React.CSSProperties {
  if (v === null || v === undefined) return {};
  const t = Math.max(0, Math.min(1, (v - 1) / 4));
  return { background: `rgba(28, 43, 74, ${0.08 + t * 0.87})`, color: t > 0.45 ? '#fff' : '#1C2B4A' };
}

const NO_ORG_NOTE = '조직 코드가 등록되면 본부·실·팀별로 볼 수 있습니다(마스터에게 요청).';

/** 진행 현황 한 행: 대상 · 완료 · 진행 중 · 중단 · 미시작 · 완료율(누적 막대) */
function ProgressRow({ r, kind }: { r: OrgStatRow; kind?: 'total' | 'muted' }) {
  const reg = r.registered || 0;
  const pct = (n: number) => (reg ? (n / reg) * 100 : 0);
  return (
    <tr className={kind === 'total' ? 'fa-dash-row-total' : kind === 'muted' ? 'fa-dash-row-muted' : ''}>
      <td>
        <div className="fa-dash-org">
          {r.code && <span className="fa-code">{r.code}</span>}
          <span>{r.path}</span>
          {r.is_active === false && <span className="fa-chip off">사용 중지</span>}
        </div>
      </td>
      <td className="fa-num">{reg}</td>
      <td className="fa-num">{r.completed}</td>
      <td className="fa-num">{r.in_progress}</td>
      <td className="fa-num">{r.abandoned}</td>
      <td className="fa-num">{r.not_started}</td>
      <td>
        <div className="fa-dash-rate">
          <div className="fa-dash-stack" aria-label={`완료율 ${r.completion_rate}%`}>
            <i className="c" style={{ width: `${pct(r.completed)}%` }} />
            <i className="p" style={{ width: `${pct(r.in_progress)}%` }} />
            <i className="a" style={{ width: `${pct(r.abandoned)}%` }} />
          </div>
          <span className="fa-num">{r.completion_rate}%</span>
        </div>
      </td>
    </tr>
  );
}

/** 역량 평균 한 행: 역량 5개 + 종합 평균 + 리포트 수 */
function AverageRow({ r, comps, kind }: { r: OrgStatRow; comps: OrgStats['competencies']; kind?: 'total' | 'muted' }) {
  const cell = (v: number | null) => (
    <td className="cell">
      <div className={`v${v === null || v === undefined ? ' none' : ''}`} style={heatStyle(v)}>
        {v === null || v === undefined ? '–' : v.toFixed(1)}
      </div>
    </td>
  );
  return (
    <tr className={kind === 'total' ? 'fa-dash-row-total' : kind === 'muted' ? 'fa-dash-row-muted' : ''}>
      <td>
        <div className="fa-dash-org">
          {r.code && <span className="fa-code">{r.code}</span>}
          <span>{r.path}</span>
        </div>
      </td>
      {comps.map((c) => <React.Fragment key={c.key}>{cell(r.averages?.[c.key] ?? null)}</React.Fragment>)}
      {cell(r.total_average)}
      <td className="fa-num" style={{ textAlign: 'center' }}>{r.n_reports}</td>
    </tr>
  );
}

function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="fa-dash-tabs" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** KPI 띠에 쓰는 /admin/stats/overview 응답 일부 */
interface Overview { scope?: string; total_participants?: number; total_reports?: number; average_score?: number; completion_rate?: number }

type ProgressTab = 'all' | 'division' | 'team';
type AverageTab = 'all' | OrgLevel;

export default function AdminDashboard() {
  const router = useRouter();

  const [overview, setOverview] = useState<Overview | null>(null);
  // 머리 제목 위에 소속 회사명을 보여 주기 위한 내 계정 정보. 회사 id 는 진단 기간·조직 통계에 쓴다(마스터는 없음)
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [dailyLoaded, setDailyLoaded] = useState(false);

  // 진단 기간(시작·종료일). null 이면 아직 불러오기 전 또는 정해지지 않음
  const [period, setPeriod] = useState<DiagnosisPeriod | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodError, setPeriodError] = useState('');

  // 조직별 진행 현황 · 역량 평균
  const [hasOrg, setHasOrg] = useState<boolean | null>(null);
  const [progressTab, setProgressTab] = useState<ProgressTab>('all');
  const [averageTab, setAverageTab] = useState<AverageTab>('all');
  const [progress, setProgress] = useState<OrgStats | null>(null);
  const [averages, setAverages] = useState<OrgStats | null>(null);
  const [orgError, setOrgError] = useState('');
  const [reports, setReports] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // KPI 는 필터와 무관하게 1회 로드
  const loadStats = useCallback(async () => {
    setError('');
    try {
      setOverview(await fetchOverview());
    } catch (err: unknown) {
      setError(errDetail(err, '통계를 불러오지 못했습니다.'));
    }
  }, []);

  // 추이: 진단 기간이 있으면 기간 내 일별(누적완료 포함), 없으면 최근 14일
  const loadDaily = useCallback(async (p: DiagnosisPeriod | null) => {
    try {
      if (p?.diagnosis_start && p?.diagnosis_end) {
        setDaily(await fetchDailyStatsRange(p.diagnosis_start, p.diagnosis_end));
      } else {
        setDaily(await fetchDailyStats(14));
      }
    } catch (err: unknown) {
      setError(errDetail(err, '추이를 불러오지 못했습니다.'));
    } finally {
      setDailyLoaded(true);
    }
  }, []);

  // 내 계정 → 회사 → 진단 기간 → 추이. 마스터(회사 없음)는 최근 14일 추이만
  const loadMeAndPeriod = useCallback(async () => {
    try {
      const me = await fetchMe();
      setCompanyName(me.company_name);
      const cid = me.role === 'super_admin' ? null : me.company_id;
      setCompanyId(cid);
      let p: DiagnosisPeriod | null = null;
      if (cid) {
        try { p = await fetchPeriod(cid); } catch { p = null; }
      }
      setPeriod(p);
      await loadDaily(p);
    } catch {
      await loadDaily(null);
    }
  }, [loadDaily]);

  // 조직 유무(조직 코드가 없으면 본부·실·팀 탭 대신 안내만)
  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    fetchOrgUnits(companyId)
      .then((t) => { if (alive) setHasOrg(t.divisions.length > 0); })
      .catch(() => { if (alive) setHasOrg(false); });
    return () => { alive = false; };
  }, [companyId]);

  // 진행 현황: '전체' 탭은 본부 단위 응답의 전체·미분류 행만 쓴다
  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    fetchOrgStats(companyId, progressTab === 'all' ? 'division' : progressTab)
      .then((s) => { if (alive) setProgress(s); })
      .catch((err: unknown) => { if (alive) setOrgError(errDetail(err, '조직별 현황을 불러오지 못했습니다.')); });
    return () => { alive = false; };
  }, [companyId, progressTab]);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    fetchOrgStats(companyId, averageTab === 'all' ? 'division' : averageTab)
      .then((s) => { if (alive) setAverages(s); })
      .catch((err: unknown) => { if (alive) setOrgError(errDetail(err, '조직별 평균을 불러오지 못했습니다.')); });
    return () => { alive = false; };
  }, [companyId, averageTab]);

  const openPeriod = () => {
    setPeriodStart(period?.diagnosis_start || '');
    setPeriodEnd(period?.diagnosis_end || '');
    setPeriodError('');
    setPeriodOpen(true);
  };

  const submitPeriod = async (clear: boolean) => {
    if (!companyId) return;
    if (!clear && (!periodStart || !periodEnd)) {
      setPeriodError('시작일과 종료일을 모두 골라 주세요.');
      return;
    }
    setPeriodSaving(true);
    setPeriodError('');
    try {
      const p = await savePeriod(companyId, clear ? null : periodStart, clear ? null : periodEnd);
      setPeriod(p);
      setPeriodOpen(false);
      setDailyLoaded(false);
      await loadDaily(p);
    } catch (err: unknown) {
      setPeriodError(errDetail(err, '진단 기간을 저장하지 못했습니다.'));
    } finally {
      setPeriodSaving(false);
    }
  };

  // 리포트 목록은 검색·페이지 변화에 반응
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReports({ search, page, page_size: PAGE_SIZE });
      setReports(res);
    } catch (err: unknown) {
      setError(errDetail(err, '리포트 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadMeAndPeriod(); }, [loadMeAndPeriod]);
  useEffect(() => { loadReports(); }, [loadReports]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const scopeNote = overview?.scope === 'all' ? '전체 고객사 기준' : '자사 기준';
  // 완료율은 '대상자 중 진단을 마친 사람' 기준(조직별 현황의 전체 행). 세션 기준 완료율은 시작하지 않은 사람이 빠져 높게 나온다.
  const total = progress?.total;
  const rate = total ? total.completion_rate : overview?.completion_rate;
  const kpis = [
    { label: '누적 진단 대상자', value: total?.registered ?? overview?.total_participants ?? '-', unit: '명', detail: scopeNote },
    {
      label: '진단 완료', value: total?.completed ?? overview?.total_reports ?? '-', unit: '명',
      detail: total ? `진행 중 ${total.in_progress} · 미시작 ${total.not_started}${total.abandoned ? ` · 중단 ${total.abandoned}` : ''}` : scopeNote,
    },
    { label: '평균 리더십 점수', value: overview?.average_score ?? '-', unit: '점', detail: '5점 만점' },
    {
      label: '진단 완료율', value: rate ?? '-', unit: '%',
      detail: typeof rate === 'number'
        ? <div className="fa-bar"><i style={{ width: `${Math.min(100, rate)}%` }} /></div>
        : scopeNote,
    },
  ];

  const totalPages = reports?.total_pages ?? 1;
  const hasPeriod = !!(period?.diagnosis_start && period?.diagnosis_end);
  const comps = averages?.competencies ?? progress?.competencies ?? [];

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={companyName || undefined}
        title="진단 현황"
        desc={companyId ? periodLabel(period) : '참여·완료 현황과 최근 리포트를 한눈에 봅니다.'}
        actions={
          <>
            {companyId && (
              <button type="button" className="fa-btn" onClick={openPeriod}>
                <CalendarDays /> 진단 기간 설정
              </button>
            )}
            <button type="button" className="fa-btn" onClick={() => { loadStats(); loadReports(); setDailyLoaded(false); loadDaily(period); }}>
              <RefreshCw /> 새로고침
            </button>
            <button
              type="button"
              className="fa-btn primary"
              onClick={() => downloadExcel().catch(() => alert('엑셀 다운로드에 실패했습니다.'))}
            >
              <Download /> 엑셀 다운로드
            </button>
          </>
        }
        kpis={kpis}
      />

      {error && <div className="fa-error fa-section">{error}</div>}

      {/* 진단 기간 추이 — 백엔드 /stats/daily 실측값. 기간이 없으면 최근 14일 */}
      <div className="fa-card pad fa-section">
        <div className="fa-cap">
          <div>
            <h3>{hasPeriod ? '진단 기간 추이' : '최근 14일 진단 추이'}</h3>
            <p>{hasPeriod ? '하루 단위 진단 시작 · 완료 인원과 기간 내 누적 완료' : '하루 단위 진단 시작 · 완료 인원'}</p>
          </div>
        </div>
        <div className="h-72 w-full">
          {!dailyLoaded ? (
            <div className="fa-empty">집계 데이터를 불러오는 중입니다…</div>
          ) : daily.length === 0 ? (
            <div className="fa-empty">표시할 데이터가 없습니다.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E9EF" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} minTickGap={16} />
                <YAxis yAxisId="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} allowDecimals={false} />
                {hasPeriod && (
                  <YAxis yAxisId="cum" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} allowDecimals={false} />
                )}
                <RechartsTooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E6E9EF', color: '#0F172A' }} itemStyle={{ color: '#334155' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px', color: '#334155' }} />
                <Bar yAxisId="day" dataKey="진단참여" name="진단 시작" fill="#8FB2FB" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="day" dataKey="진단완료" name="진단 완료" fill="#4F86F7" radius={[3, 3, 0, 0]} maxBarSize={18} />
                {hasPeriod && (
                  <Line yAxisId="cum" type="monotone" dataKey="누적완료" name="누적 완료" stroke="#1C2B4A" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        {companyId && !hasPeriod && (
          <p className="fa-dash-period-note">
            진단 기간을 정하면 기간 내 추이와 누적 완료를 볼 수 있습니다.{' '}
            <button type="button" className="fa-btn sm ghost" onClick={openPeriod}>진단 기간 설정</button>
          </p>
        )}
      </div>

      {companyId && orgError && <div className="fa-error fa-section">{orgError}</div>}

      {/* 조직별 진행 현황 — 전체 / 본부 / 팀 */}
      {companyId && (
        <div className="fa-card pad fa-section">
          <div className="fa-cap">
            <div>
              <h3>조직별 진행 현황</h3>
              <p>상위 조직 숫자는 소속 실·팀 인원을 모두 포함합니다.</p>
            </div>
            {hasOrg && (
              <Tabs<ProgressTab> value={progressTab} onChange={setProgressTab}
                items={[['all', '전체'], ['division', '본부'], ['team', '팀']]} />
            )}
          </div>
          {hasOrg === false && <div className="fa-note" style={{ marginBottom: 16 }}>{NO_ORG_NOTE}</div>}
          {!progress ? (
            <div className="fa-empty">불러오는 중입니다…</div>
          ) : (
            <>
              <div className="fa-tbl">
                <table className="fa-table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th>조직</th><th>대상</th><th>완료</th><th>진행 중</th><th>중단</th><th>미시작</th><th style={{ width: 220 }}>완료율</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ProgressRow r={progress.total} kind="total" />
                    {progressTab !== 'all' && progress.rows.map((r) => <ProgressRow key={r.id || r.path} r={r} />)}
                    {progressTab !== 'all' && hasOrg && progress.rows.length === 0 && (
                      <tr><td colSpan={7} className="fa-empty">이 단계에 등록된 조직이 없습니다.</td></tr>
                    )}
                    {progress.unassigned.registered > 0 && <ProgressRow r={progress.unassigned} kind="muted" />}
                  </tbody>
                </table>
              </div>
              <div className="fa-dash-legend">
                <span><i style={{ background: 'var(--fa-navy)' }} />완료</span>
                <span><i style={{ background: 'var(--fa-light)' }} />진행 중</span>
                <span><i style={{ background: 'var(--fa-gray3)' }} />중단</span>
                <span><i style={{ background: 'var(--fa-mute)' }} />미시작</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* 조직별 역량 평균 — 전체 / 본부 / 실 / 팀 */}
      {companyId && (
        <div className="fa-card pad fa-section">
          <div className="fa-cap">
            <div>
              <h3>조직별 역량 평균</h3>
              <p>진할수록 높은 점수(5점 만점)입니다.</p>
            </div>
            {hasOrg && (
              <Tabs<AverageTab> value={averageTab} onChange={setAverageTab}
                items={[['all', '전체'], ['division', '본부'], ['office', '실'], ['team', '팀']]} />
            )}
          </div>
          {hasOrg === false && <div className="fa-note" style={{ marginBottom: 16 }}>{NO_ORG_NOTE}</div>}
          {!averages ? (
            <div className="fa-empty">불러오는 중입니다…</div>
          ) : (
            <>
              <div className="fa-tbl">
                <table className="fa-table fa-dash-heat" style={{ minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th>조직</th>
                      {comps.map((c) => <th key={c.key} className="c">{c.name}</th>)}
                      <th className="c">종합 평균</th>
                      <th className="c">리포트</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AverageRow r={averages.total} comps={comps} kind="total" />
                    {averageTab !== 'all' && averages.rows.map((r) => <AverageRow key={r.id || r.path} r={r} comps={comps} />)}
                    {averageTab !== 'all' && hasOrg && averages.rows.length === 0 && (
                      <tr><td colSpan={comps.length + 3} className="fa-empty">이 단계에 등록된 조직이 없습니다.</td></tr>
                    )}
                    {averages.unassigned.n_reports > 0 && <AverageRow r={averages.unassigned} comps={comps} kind="muted" />}
                  </tbody>
                </table>
              </div>
              <p className="fa-dash-period-note">평균은 진단을 마친 사람의 최신 리포트 기준이며, 측정되지 않은 역량은 –로 표시합니다.</p>
            </>
          )}
        </div>
      )}

      {/* 최근 리포트 — 실제 서버 검색 연동 */}
      <div className="fa-card pad">
        <div className="fa-cap">
          <div>
            <h3>최근 리포트</h3>
            <p>행의 [상세 · 교정]에서 AI 피드백을 확인하고 고칠 수 있습니다.</p>
          </div>
        </div>
        <div className="fa-filters">
          <input
            type="text"
            className="fa-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름·이메일 검색"
            aria-label="이름·이메일 검색"
          />
        </div>

        <div className="fa-tbl">
          <table className="fa-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ width: 56 }}>No</th>
                <th>참여자</th>
                <th>소속사</th>
                <th>총점</th>
                <th>AI 종합 요약</th>
                <th>진단 일시</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="fa-empty">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              ) : !reports || reports.items.length === 0 ? (
                <tr><td colSpan={7} className="fa-empty">
                  {search ? `'${search}' 검색 결과가 없습니다.` : '아직 완료된 진단 데이터가 없습니다.'}
                </td></tr>
              ) : reports.items.map((r: any, idx: number) => r.report_missing ? (
                /* (2026-10-23 파일럿 전 2) 완료했지만 리포트 행이 없는 세션 — 백엔드가 1페이지 상단에 report_missing 으로 보낸다 */
                <tr key={`missing-${r.session_id}`}>
                  <td className="fa-num fa-muted">{(reports.page - 1) * reports.page_size + idx + 1}</td>
                  <td className="fa-who"><b>{r.user_name}</b></td>
                  <td className="fa-muted">{r.company_name}</td>
                  <td><span className="fa-chip danger">리포트 미생성</span></td>
                  <td className="fa-muted" style={{ fontSize: 13 }}>
                    {r.analysis_status === 'failed' ? `종합 실패 확정 (${r.fail_count ?? '-'}회${r.error_id ? `, 문의 번호 ${r.error_id}` : ''}) · 대상자 현황에서 [재분석]`
                      : r.analysis_status === 'degraded' ? `종합 실패 ${r.fail_count ?? '-'}회 · 리더 재시도 또는 [재분석] 대기`
                      : r.analysis_status === 'reset' ? '관리자 재분석 진행 중 또는 대기'
                      : '분석 중 또는 미시작'}
                  </td>
                  <td className="fa-num fa-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td className="fa-muted">-</td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="fa-num fa-muted">{(reports.page - 1) * reports.page_size + idx + 1}</td>
                  <td className="fa-who"><b>{r.user_name}</b></td>
                  <td className="fa-muted">{r.company_name}</td>
                  <td>
                    <span className={`fa-chip ${r.total_score >= 4.0 ? 'navy' : r.total_score >= 3.0 ? 'tint' : 'line'}`}>
                      {Number(r.total_score).toFixed(1)}점
                    </span>
                  </td>
                  <td className="fa-muted" style={{ fontSize: 13 }}>
                    <div className="line-clamp-2 max-w-md">{r.summary}</div>
                  </td>
                  <td className="fa-num fa-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      {r.is_human_edited && (
                        <span title="관리자 검수 완료" className="fa-chip tint">
                          <ShieldCheck size={12} /> 검수
                        </span>
                      )}
                      <button
                        type="button"
                        className="fa-btn sm"
                        onClick={() => router.push(adminPath(`/reports/${r.id}`))}
                        title="상세 확인 및 AI 피드백 교정"
                      >
                        상세 · 교정
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {reports && reports.total > 0 && (
          <div className="fa-pager">
            <span className="fa-num">
              {(reports.page - 1) * reports.page_size + 1}–
              {Math.min(reports.page * reports.page_size, reports.total)} / {reports.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="fa-btn sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <ChevronLeft /> 이전
              </button>
              <span className="fa-num px-2">{reports.page} / {totalPages}</span>
              <button
                type="button"
                className="fa-btn sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                다음 <ChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>

      {periodOpen && (
        <div className="fa-modal-bg" role="dialog" aria-modal="true" aria-labelledby="fa-period-title"
          onClick={(e) => { if (e.target === e.currentTarget && !periodSaving) setPeriodOpen(false); }}>
          <div className="fa-modal">
            <div className="mh">
              <h3 id="fa-period-title">진단 기간 설정</h3>
              <button type="button" className="fa-btn sm ghost" onClick={() => setPeriodOpen(false)} disabled={periodSaving}>닫기</button>
            </div>
            <div className="mb">
              <p className="fa-muted" style={{ margin: '0 0 18px', fontSize: 14 }}>
                진단 현황의 추이는 이 기간을 기준으로 보여 줍니다. 종료일 당일까지 포함합니다(최대 1년).
              </p>
              <div className="fa-dash-dates">
                <div className="fa-field">
                  <label htmlFor="fa-period-start">시작일</label>
                  <input id="fa-period-start" type="date" className="fa-input" value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)} />
                </div>
                <div className="fa-field">
                  <label htmlFor="fa-period-end">종료일</label>
                  <input id="fa-period-end" type="date" className="fa-input" value={periodEnd} min={periodStart || undefined}
                    onChange={(e) => setPeriodEnd(e.target.value)} />
                </div>
              </div>
              {periodError && <div className="fa-error">{periodError}</div>}
            </div>
            <div className="mf">
              {hasPeriod && (
                <button type="button" className="fa-btn danger" style={{ marginRight: 'auto' }}
                  onClick={() => submitPeriod(true)} disabled={periodSaving}>
                  기간 지우기
                </button>
              )}
              <button type="button" className="fa-btn" onClick={() => setPeriodOpen(false)} disabled={periodSaving}>취소</button>
              <button type="button" className="fa-btn primary" onClick={() => submitPeriod(false)} disabled={periodSaving}>
                {periodSaving ? '저장하는 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
