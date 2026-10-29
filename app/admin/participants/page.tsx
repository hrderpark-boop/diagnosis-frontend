"use client";

import React, { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import TranscriptModal from '../../../components/admin/TranscriptModal';
import './participants.css';
import {
  FileDown, ChevronLeft, ChevronRight, Loader2, MessageSquare, FileText,
  Trash2, RotateCcw, RefreshCw, Upload,
} from 'lucide-react';
import RosterImport from '../../../components/admin/RosterImport';
import ScopeFilter, { useScope } from '../../../components/admin/ScopeFilter';
import {
  fetchParticipants, downloadExcel, bulkDeleteParticipants, restoreSession, reanalyzeSession, Paginated,
  getCookie, ADMIN_ROLE_KEY, ParticipantStatusFilter, ProgressStatus,
  downloadOrgCodesExcel, downloadRosterExcel,
} from '@/lib/adminApi';
import { adminPath } from '@/lib/adminRoutes';

/**
 * 대상자 진단 현황 (구 '참여자 관리').
 *
 * 리포트 목록(list_reports)은 '완료된 리포트'만 담아 진행 중/미시작을 표현할
 * 수 없다. 따라서 완료+진행중+미시작을 모두 가진 이 목록을 진단 현황판으로
 * 고도화한다: 진행 상태 칩(서버 필터) + 범위 선택 줄([고객사] › 본부 › 실 › 팀) + 진행률 프로그레스 바 + 대화 원문.
 * 범위 선택은 공용 ScopeFilter(마스터는 고객사부터, HR 은 자사 본부부터)를 쓴다.
 * (2026-10-29) 행동 유형(behavior_tag) 필터·열은 뺐다(HR 요청). 상태는 백엔드 progress_status 4가지.
 *
 * [보안] 모든 데이터는 인증된 FastAPI(/admin/participants)를 통해서만 받는다.
 */

const PAGE_SIZE = 20;

// 진행 상태(백엔드 progress_status): 완료 · 진행 중 · 중단 · 미시작
//   칩: 완료=tint, 진행 중=line, 중단=기본, 미시작=off
const PROGRESS_CHIP: Record<ProgressStatus, string> = {
  completed: 'tint',
  in_progress: 'line',
  abandoned: '',
  not_started: 'off',
};
const PROGRESS_LABEL: Record<ProgressStatus, string> = {
  completed: '완료',
  in_progress: '진행 중',
  abandoned: '중단',
  not_started: '미시작',
};
// 세부 세션 상태(보조 표시용): 일시중지·이탈·강제 종료는 진행 중/중단 칩 옆에 작게
const SESSION_DETAIL: Record<string, string> = {
  paused: '일시중지',
  aborted_disengaged: '이탈 중단(재개 가능)',
  aborted: '강제 종료',
};

// 상태 필터 칩(서버 필터). null = 전체
const STATUS_TABS: { key: ParticipantStatusFilter | null; label: string }[] = [
  { key: null, label: '전체' },
  { key: 'completed', label: '완료' },
  { key: 'in_progress', label: '진행 중' },
  { key: 'abandoned', label: '중단' },
  { key: 'not_started', label: '미시작' },
  { key: 'incomplete', label: '미완료 전체' },
];

type SortKey = 'recent' | 'org' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: '최근 참여순' },
  { key: 'org', label: '조직순' },
  { key: 'name', label: '이름순' },
];

const ParticipantsPage = () => {
  const router = useRouter();
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  // 서버 필터: 진행 상태 · 범위([고객사] › 본부 › 실 › 팀) · 정렬
  const [statusFilter, setStatusFilter] = useState<ParticipantStatusFilter | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  // 범위 선택(공용). 마스터는 '전체 고객사'도 고를 수 있다
  const scope = useScope({ allowAllCompanies: true });
  const orgTree = scope.tree;
  // 상태별 인원(같은 검색·조직 조건으로 page_size=1 조회의 total). null = 아직 모름
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);

  // 대화 원문 모달
  const [transcriptSid, setTranscriptSid] = useState<string | null>(null);

  // 일괄 삭제: 선택 상태 + 확인 모달 + 진행 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 4(b) 보관 세션 복원: 확인 모달 대상 + 진행 상태
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; name: string; coach_name: string; message_count: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  // (2026-10-23 파일럿 전 2) 관리자 재분석 — super_admin 에게만 버튼. 실패 마커 초기화 + analyze(수 분).
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => { setIsSuper(getCookie(ADMIN_ROLE_KEY) === 'super_admin'); }, []);

  // 마스터 주소(/master)면 전 고객사 화면. /admin 은 HR 이거나, 고객사로 들어간 마스터(그 고객사 화면)
  const onMaster = scope.isMaster;
  const masterCompanyId = scope.companyId;
  // 지금 보고 있는 고객사(HR 자사 · 마스터가 들어간 고객사 · 마스터가 고른 고객사). 명단 업로드·개인 코드 엑셀의 대상
  const company = useMemo(
    () => (scope.companyId ? { id: scope.companyId, name: scope.companyName } : null),
    [scope.companyId, scope.companyName],
  );

  // 마스터는 정렬 선택 대신: 고객사를 고르면 조직순, 전체 고객사면 최근 참여순
  const effectiveSort: SortKey = onMaster ? (masterCompanyId ? 'org' : 'recent') : sort;
  const masterScope = onMaster && masterCompanyId ? masterCompanyId : undefined;
  // 고객사·조직 정보를 받기 전에는 조회하지 않는다(전체 → 고른 회사로 두 번 그리는 깜빡임 방지)
  const ready = !scope.loading;

  // (2026-10-29) 참여자 명단 업로드 모달 · 개인 코드 엑셀
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterDownloading, setRosterDownloading] = useState(false);

  // 선택한 가장 깊은 단계가 조직 필터
  const orgUnitId = scope.orgUnitId || undefined;
  // 범위가 바뀌면 첫 페이지부터
  useEffect(() => { setPage(1); }, [masterScope, orgUnitId]);
  const [reanalyzingSid, setReanalyzingSid] = useState<string | null>(null);
  const handleReanalyze = async (p: any) => {
    if (!p.last_session_id || reanalyzingSid) return;
    const why = p.report_missing
      ? `리포트 미생성(${p.last_analysis_status || '마커 없음'}${p.last_analysis_fail_count ? `, 실패 ${p.last_analysis_fail_count}회` : ''})`
      : '기존 리포트를 새 분석으로 교체(관리자 교정본은 보호됨)';
    if (!confirm(`${p.name} 님의 최근 세션을 재분석합니다.\n${why}\n\n실패 횟수를 0 으로 되돌리고 분석을 다시 돌립니다. 수 분 걸릴 수 있습니다.`)) return;
    setReanalyzingSid(p.last_session_id);
    try {
      const r = await reanalyzeSession(p.last_session_id);
      const a = r.analysis || {};
      alert(a.skipped === 'human_edited'
        ? '관리자 교정본이 있어 재분석하지 않았습니다. 기존 리포트를 유지합니다.'
        : `재분석이 끝났습니다. (리포트 ${a.report_id || '-'})`);
      await Promise.all([load(), loadCounts()]);
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      alert(`재분석 실패: ${typeof d === 'string' ? d : d?.message || e?.message || '알 수 없는 오류'}` +
        (d?.analysis_status ? ` [${d.analysis_status}, ${d.fail_count ?? '-'}회]` : ''));
    } finally {
      setReanalyzingSid(null);
    }
  };
  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const r = await restoreSession(restoreTarget.id);
      alert(`복원했습니다. ${restoreTarget.name} 님은 ${r.coach_name} 코치와의 세션을 이어갑니다.` +
        (r.abandoned_others ? ` (진행 중이던 세션 ${r.abandoned_others}건은 보관)` : ''));
      setRestoreTarget(null);
      await Promise.all([load(), loadCounts()]);
    } catch (err: any) {
      alert(err?.response?.data?.detail || '복원에 실패했습니다.');
    } finally {
      setRestoring(false);
    }
  };

  // 늦게 도착한 이전 조건의 응답이 새 결과를 덮지 않도록 요청 번호로 거른다(고객사를 빠르게 바꿀 때)
  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    if (!ready) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError('');
    try {
      const res = await fetchParticipants({
        search, page, page_size: PAGE_SIZE, sort: effectiveSort,
        status: statusFilter || undefined, org_unit_id: orgUnitId, company_id: masterScope,
      });
      if (seq !== reqSeq.current) return;
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [ready, search, page, effectiveSort, statusFilter, orgUnitId, masterScope]);

  useEffect(() => { load(); }, [load]);

  // 상태별 인원: 같은 검색·조직 조건으로 상태마다 1건만 조회해 total 을 읽는다(지어낸 숫자 없음)
  const countSeq = useRef(0);
  const loadCounts = useCallback(async () => {
    if (!ready) return;
    const seq = ++countSeq.current;
    try {
      const keys = STATUS_TABS.map((t) => t.key);
      const totals = await Promise.all(keys.map((k) =>
        fetchParticipants({ search, page: 1, page_size: 1, status: k || undefined, org_unit_id: orgUnitId, company_id: masterScope })
          .then((r) => r.total)));
      const out: Record<string, number> = {};
      keys.forEach((k, i) => { out[k || 'all'] = totals[i]; });
      if (seq !== countSeq.current) return;
      setStatusCounts(out);
    } catch {
      setStatusCounts(null);
    }
  }, [ready, search, orgUnitId, masterScope]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // (2026-10-29) 참여 코드 엑셀(HR 자사). 조직 코드가 있을 때만 버튼이 보인다
  const [codesDownloading, setCodesDownloading] = useState(false);
  const handleCodesDownload = async () => {
    if (!orgTree) return;
    setCodesDownloading(true);
    try {
      await downloadOrgCodesExcel(orgTree.company.id);
    } catch (e: unknown) {
      // blob 응답이라 오류 본문도 blob → 글자로 풀어 서버 안내문을 보여 준다
      let msg = '';
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (data instanceof Blob) {
        try { msg = (JSON.parse(await data.text()) as { detail?: string }).detail || ''; } catch { /* 무시 */ }
      }
      alert(msg || '참여 코드 엑셀을 내려받지 못했습니다.');
    } finally {
      setCodesDownloading(false);
    }
  };

  const handleRosterDownload = async () => {
    if (!company) return;
    setRosterDownloading(true);
    try {
      await downloadRosterExcel(company.id);
    } catch (e: unknown) {
      let msg = '';
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (data instanceof Blob) {
        try { msg = (JSON.parse(await data.text()) as { detail?: string }).detail || ''; } catch { /* 무시 */ }
      }
      alert(msg || '개인 코드 엑셀을 내려받지 못했습니다.');
    } finally {
      setRosterDownloading(false);
    }
  };

  const handleExcelDownload = async () => {
    setDownloading(true);
    try {
      await downloadExcel();
    } catch {
      alert('엑셀 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  // 필터는 모두 서버에서 적용된다(상태·조직·정렬). 화면은 받은 페이지를 그대로 보여 준다.
  const visibleItems = useMemo(() => data?.items || [], [data]);

  // 페이지/검색/필터가 바뀌면 선택을 초기화 (다른 페이지의 stale id 삭제 방지)
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, statusFilter, orgUnitId, effectiveSort, masterScope]);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visibleIds = useMemo(() => visibleItems.map((p: any) => p.id), [visibleItems]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id: string) => selectedIds.has(id));

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id: string) => next.delete(id));
      } else {
        visibleIds.forEach((id: string) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const res = await bulkDeleteParticipants(Array.from(selectedIds));
      const parts: string[] = [
        `대상자 ${res.deleted_participants}명 삭제 완료`,
        `(대화 ${res.deleted_messages} · 세션 ${res.deleted_sessions} · 리포트 ${res.deleted_reports})`,
      ];
      if (res.skipped_protected > 0) parts.push(`\n코치 등록 ${res.skipped_protected}명은 보호되어 제외됨`);
      if (res.skipped_out_of_scope > 0) parts.push(`\n권한 밖 ${res.skipped_out_of_scope}명 제외됨`);
      alert(parts.join(' '));
      setSelectedIds(new Set());
      setConfirmOpen(false);
      await Promise.all([load(), loadCounts()]); // 상태 동기화: 삭제된 데이터가 즉시 화면에서 사라지도록 refetch
    } catch (err: any) {
      alert(err?.response?.data?.detail || '삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = data?.total_pages ?? 1;
  const anyFilter = !!(statusFilter || orgUnitId);
  const resetFilters = () => { setStatusFilter(null); scope.setDivision(''); setPage(1); };

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={onMaster ? '마스터' : '진단'}
        title={onMaster ? '전체 참여자' : '대상자 · 참여'}
        desc={<>
          {scope.label ? `${scope.label} · ` : ''}
          {statusCounts ? `총 ${statusCounts.all.toLocaleString()}명` : data ? `총 ${data.total.toLocaleString()}명` : '불러오는 중…'}
          {anyFilter && data && ` · 조건에 맞는 ${data.total.toLocaleString()}명`}
        </>}
        actions={<>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={selectedIds.size === 0 || deleting}
            className="fa-btn"
          >
            <Trash2 />
            선택 삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          {company && (
            <>
              <button type="button" onClick={() => setRosterOpen(true)} className="fa-btn"
                title="엑셀 명단을 올리면 조직과 개인 참여 코드가 자동으로 만들어집니다">
                <Upload />
                명단 업로드
              </button>
              <button type="button" onClick={handleRosterDownload} disabled={rosterDownloading || (statusCounts?.all ?? 1) === 0}
                className="fa-btn" title="참여자별 개인 참여 코드 엑셀(고객사 전달용)">
                {rosterDownloading ? <Loader2 className="animate-spin" /> : <FileDown />}
                개인 코드 엑셀
              </button>
            </>
          )}
          {company && orgTree && orgTree.divisions.length > 0 && (
            <button type="button" onClick={handleCodesDownload} disabled={codesDownloading} className="fa-btn"
              title="본부·실·팀별 참여 코드(배포용) 엑셀">
              {codesDownloading ? <Loader2 className="animate-spin" /> : <FileDown />}
              참여 코드 엑셀
            </button>
          )}
          <button type="button" onClick={handleExcelDownload} disabled={downloading} className="fa-btn primary">
            {downloading ? <Loader2 className="animate-spin" /> : <FileDown />}
            엑셀 다운로드
          </button>
        </>}
      />

      {/* 범위 선택 줄: [고객사] › 본부 › 실 › 팀. 검색·정렬은 줄 오른쪽 끝 */}
      <ScopeFilter
        scope={scope}
        extra={<>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름, 이메일로 검색"
            className="fa-input"
            aria-label="대상자 검색"
            style={{ height: 42, minWidth: 220 }}
          />
          {!onMaster && (
            <select
              className="fa-select"
              aria-label="정렬"
              value={sort}
              onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }}
              style={{ height: 42, width: 'auto' }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          )}
          {anyFilter && (
            <button type="button" onClick={resetFilters} className="fa-btn ghost sm" style={{ height: 42 }}>필터 초기화</button>
          )}
        </>}
      />

      <div className="fa-card pad">
        {/* 진행 상태 칩(서버 필터). 숫자는 같은 검색·조직 조건의 실제 인원 */}
        <div className="fa-pt-status" role="tablist" aria-label="진행 상태">
          {STATUS_TABS.map((t) => {
            const on = statusFilter === t.key;
            const n = statusCounts ? statusCounts[t.key || 'all'] : null;
            return (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => { setStatusFilter(t.key); setPage(1); }}
                className={`fa-pt-stat${on ? ' on' : ''}${t.key === 'incomplete' ? ' wide' : ''}`}
              >
                <span className="k">{t.label}</span>
                <span className="v fa-num">{n === null ? '–' : n.toLocaleString()}</span>
              </button>
            );
          })}
        </div>

        {error && <div className="fa-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="fa-tbl">
          <table className="fa-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    disabled={visibleIds.length === 0}
                    className="h-4 w-4 cursor-pointer"
                    style={{ accentColor: 'var(--fa-navy)' }}
                  />
                </th>
                {onMaster && !masterCompanyId && <th>회사</th>}
                <th>이름</th>
                <th>본부</th>
                <th>실</th>
                <th>팀</th>
                <th>개인 코드</th>
                <th>진단 상태</th>
                <th style={{ width: 180 }}>진행률</th>
                <th style={{ textAlign: 'right' }}>보기</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={onMaster && !masterCompanyId ? 10 : 9} className="fa-empty">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              ) : visibleItems.length === 0 ? (
                <tr><td colSpan={onMaster && !masterCompanyId ? 10 : 9} className="fa-empty">
                  {anyFilter ? '이 조건에 해당하는 대상자가 없습니다.'
                    : search ? `'${search}' 검색 결과가 없습니다.`
                    : '등록된 대상자가 없습니다.'}
                </td></tr>
              ) : (
                visibleItems.map((p: any) => {
                  const pct = p.progress_pct ?? 0;
                  const done = p.last_status === 'completed';
                  const ps: ProgressStatus = p.progress_status || (done ? 'completed' : p.last_status === '미시작' ? 'not_started' : 'in_progress');
                  const detail = SESSION_DETAIL[p.last_status];
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <tr key={p.id} style={isSelected ? { background: 'var(--fa-tint)' } : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${p.name} 선택`}
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                          className="h-4 w-4 cursor-pointer"
                          style={{ accentColor: 'var(--fa-navy)' }}
                        />
                      </td>
                      {/* 마스터 · 전체 고객사: 회사 열(고객사는 위 선택 줄에서 고른다) */}
                      {onMaster && !masterCompanyId && (
                        <td>
                          {p.company_id ? <b style={{ color: 'var(--fa-navy)', fontWeight: 600 }}>{p.company_name}</b>
                            : <span className="fa-muted">미지정</span>}
                        </td>
                      )}
                      <td className="fa-who">
                        <b>{p.name}</b>
                        <span>{p.email}</span>
                      </td>
                      {/* 소속: 본부 / 실 / 팀(+참여 코드) */}
                      <td>
                        {p.division_name || <span className="fa-muted">–</span>}
                      </td>
                      <td>{p.office_name || <span className="fa-muted">–</span>}</td>
                      <td>
                        {p.team_name || (p.org_code ? null : <span className="fa-muted">–</span>)}
                        {p.org_code && <div className="fa-code fa-pt-code">{p.org_code}</div>}
                        {!p.org_code && <div className="fa-pt-code fa-muted">미분류</div>}
                      </td>
                      <td>{p.access_code ? <span className="fa-code">{p.access_code}</span> : <span className="fa-muted">–</span>}</td>
                      <td>
                        <span className={`fa-chip ${PROGRESS_CHIP[ps]}`}>{PROGRESS_LABEL[ps]}</span>
                        {detail && <span className="fa-pt-detail">{detail}</span>}
                        {/* (2026-10-15) 최근 세션에 고정된 LLM provider(null = 환경 기본값/구 세션) — 마스터에게만 */}
                        {onMaster && p.llm_provider && (
                          <span className="fa-chip" style={{ marginLeft: 6, height: 20, fontSize: 11 }}>{p.llm_provider}</span>
                        )}
                        {/* (2026-10-23) 완료했지만 리포트 행이 없는 세션 — 종합 실패(degraded/failed) 또는 분석 중 */}
                        {p.report_missing && (
                          <span
                            title={`분석 상태: ${p.last_analysis_status || '마커 없음'}${p.last_analysis_fail_count ? ` · 실패 ${p.last_analysis_fail_count}회` : ''}`}
                            className="fa-chip danger"
                            style={{ marginLeft: 6 }}
                          >
                            리포트 미생성{p.last_analysis_status === 'failed' ? ' (실패 확정)' : ''}
                          </span>
                        )}
                        {/* 4(b) 보관(abandoned) 세션 — 참가자가 "잘못 눌렀다" 고 하면 여기서 [복원] */}
                        {Array.isArray(p.abandoned_sessions) && p.abandoned_sessions.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {p.abandoned_sessions.map((s: any) => (
                              <li key={s.id} className="flex items-center gap-2 text-[12px] fa-muted">
                                <span className="fa-chip off" style={{ height: 20 }}>보관</span>
                                <span>{s.coach_name?.split('(')[0]?.trim() || '-'} · {s.message_count}턴{s.llm_provider ? ` · ${s.llm_provider}` : ''} · {s.updated_at ? new Date(s.updated_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}</span>
                                <button
                                  type="button"
                                  onClick={() => setRestoreTarget({ id: s.id, name: p.name, coach_name: s.coach_name, message_count: s.message_count })}
                                  title="이 세션을 in_progress 로 복원 (현재 진행 중 세션은 보관)"
                                  className="fa-btn sm"
                                  style={{ height: 24, padding: '0 8px', fontSize: 11.5 }}
                                >
                                  <RotateCcw size={11} /> 복원
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {/* 진행률 막대 */}
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="fa-bar flex-1">
                            <i style={{ width: `${pct}%`, background: done || pct >= 100 ? 'var(--fa-navy)' : 'var(--fa-bright)' }} />
                          </div>
                          <span className="fa-num w-10 shrink-0 text-right text-xs fa-muted">{pct}%</span>
                        </div>
                        {p.current_topic && !done && (
                          <span className="mt-1 block text-[12px] fa-muted">진행: {p.current_topic}</span>
                        )}
                      </td>
                      {/* 보기: 대화 원문 / 리포트 / 재분석(마스터) */}
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {p.last_session_id && (
                            <button type="button" onClick={() => setTranscriptSid(p.last_session_id)} title="전체 대화 기록 보기" className="fa-btn sm">
                              <MessageSquare size={13} /> 대화
                            </button>
                          )}
                          {p.report_id && (
                            <button
                              type="button"
                              onClick={() => router.push(adminPath(`/reports/${p.report_id}`))}
                              title="리포트 상세"
                              className="fa-btn sm primary"
                            >
                              <FileText size={13} /> 리포트
                            </button>
                          )}
                          {/* (2026-10-23 파일럿 전 2) super_admin · 완료 세션: 실패 마커 초기화 + 재분석 */}
                          {isSuper && done && p.last_session_id && (
                            <button
                              type="button"
                              onClick={() => handleReanalyze(p)}
                              disabled={!!reanalyzingSid}
                              title={p.report_missing ? '실패 마커를 초기화하고 리포트 분석을 다시 돌립니다' : '리포트를 새 분석으로 교체합니다(교정본은 보호)'}
                              className={`fa-btn sm ${p.report_missing ? 'danger' : ''}`}
                            >
                              {reanalyzingSid === p.last_session_id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <RefreshCw size={13} />}
                              {reanalyzingSid === p.last_session_id ? '분석 중…' : '재분석'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 (필터는 현재 페이지 기준이라 서버 페이지는 그대로) */}
        {data && data.total > 0 && (
          <div className="fa-pager">
            <p style={{ margin: 0 }}>
              {(data.page - 1) * data.page_size + 1}–
              {Math.min(data.page * data.page_size, data.total)} / {data.total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="fa-btn sm">
                <ChevronLeft size={16} /> 이전
              </button>
              <span className="fa-num px-2">{data.page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="fa-btn sm">
                다음 <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 일괄 삭제 확인 모달 */}
      {confirmOpen && (
        <div className="fa-modal-bg" role="dialog" aria-modal="true" aria-label="진단 데이터 영구 삭제">
          <div className="fa-modal">
            <div className="mh"><h3>진단 데이터 영구 삭제</h3></div>
            <div className="mb">
              <p className="text-sm leading-relaxed" style={{ margin: 0, color: 'var(--fa-body)' }}>
                선택한 <b style={{ color: 'var(--fa-danger)' }}>{selectedIds.size}건</b>의 진단 데이터를 영구 삭제하시겠습니까?
                <br />
                관련된 대화 기록 및 리포트가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={deleting} className="fa-btn">취소</button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={deleting}
                className="fa-btn primary"
                style={{ background: 'var(--fa-danger)', borderColor: 'var(--fa-danger)' }}
              >
                {deleting && <Loader2 className="animate-spin" />}
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4(b) 복원 확인 모달 */}
      {restoreTarget && (
        <div className="fa-modal-bg" role="dialog" aria-modal="true" aria-label="보관 세션 복원">
          <div className="fa-modal">
            <div className="mh"><h3>보관 세션 복원</h3></div>
            <div className="mb">
              <p className="text-sm leading-relaxed break-keep" style={{ margin: 0, color: 'var(--fa-body)' }}>
                <b style={{ color: 'var(--fa-ink)' }}>{restoreTarget.name}</b> 님의{' '}
                <b style={{ color: 'var(--fa-navy)' }}>{restoreTarget.coach_name?.split('(')[0]?.trim()}</b> 코치 세션
                ({restoreTarget.message_count}턴)을 복원합니다.
                <br />
                현재 진행 중인 세션은 보관되고, 선택한 세션이 이어집니다. 대화·원장은 그대로이며 상태만 바뀝니다.
              </p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setRestoreTarget(null)} disabled={restoring} className="fa-btn">취소</button>
              <button type="button" onClick={handleRestore} disabled={restoring} className="fa-btn primary">
                {restoring && <Loader2 className="animate-spin" />}
                복원
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 참여자 명단 업로드(조직·개인 코드 자동) */}
      {company && rosterOpen && (
        <RosterImport
          open={rosterOpen}
          companyId={company.id}
          companyName={company.name}
          onClose={() => setRosterOpen(false)}
          onDone={() => { setRosterOpen(false); load(); loadCounts(); scope.reloadTree(); }}
        />
      )}

      {/* 대화 원문 모달 */}
      <TranscriptModal
        sessionId={transcriptSid || ''}
        open={transcriptSid !== null}
        onClose={() => setTranscriptSid(null)}
      />
    </AdminLayout>
  );
};

// useScope 가 주소(?company=)를 읽으므로 Suspense 안에서 그린다
export default function ParticipantsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ParticipantsPage />
    </Suspense>
  );
}
