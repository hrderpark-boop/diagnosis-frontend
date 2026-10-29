"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import TranscriptModal from '../../../components/admin/TranscriptModal';
import {
  FileDown, ChevronLeft, ChevronRight, Loader2, MessageSquare, FileText,
  Trash2, RotateCcw, RefreshCw,
} from 'lucide-react';
import {
  fetchParticipants, downloadExcel, bulkDeleteParticipants, restoreSession, reanalyzeSession, Paginated,
  getCookie, ADMIN_ROLE_KEY,
} from '@/lib/adminApi';
import { adminPath } from '@/lib/adminRoutes';

/**
 * 대상자 진단 현황 (구 '참여자 관리').
 *
 * 리포트 목록(list_reports)은 '완료된 리포트'만 담아 진행 중/미시작을 표현할
 * 수 없다. 따라서 완료+진행중+미시작을 모두 가진 이 목록을 진단 현황판으로
 * 고도화한다: 행동 태그 뱃지 + 유형 필터 + 진행률 프로그레스 바 + 대화 원문.
 *
 * [보안] 모든 데이터는 인증된 FastAPI(/admin/participants)를 통해서만 받는다.
 */

const PAGE_SIZE = 20;

// 백엔드 세션 상태 모델(M16): in_progress / paused / aborted_disengaged(참여 이탈
// 중단 — 원장 보존·재개 가능) / aborted(3-Strike — 재개 불가) / completed.
// 'incomplete' 는 V-6 에서 제거된 상태라 라벨도 삭제.
// 상태 칩: 완료=tint, 진행=line, 보관·미시작=off, 강제 종료=danger
const STATUS_CHIP: Record<string, string> = {
  completed: 'tint',
  in_progress: 'line',
  paused: 'line',
  aborted_disengaged: 'line',
  aborted: 'danger',
  abandoned: 'off',
  미시작: 'off',
};
const STATUS_LABEL: Record<string, string> = {
  completed: '완료',
  in_progress: '진행 중',
  paused: '일시중지',
  aborted_disengaged: '이탈 중단(재개 가능)',
  aborted: '강제 종료',
  abandoned: '보관(새로 시작)',
  미시작: '미시작',
};

// 필터 토글 대상 (상태 + 행동 태그)
const STATUS_FILTERS = [
  { key: 'completed', label: '완료' },
  { key: 'in_progress', label: '진행 중' },
  { key: 'paused', label: '일시중지' },
  { key: 'aborted_disengaged', label: '이탈 중단' },
  { key: 'aborted', label: '강제 종료' },
  { key: 'abandoned', label: '보관' },
  { key: '미시작', label: '미시작' },
];
const BEHAVIOR_FILTERS = ['투머치토커', '단답형', '표준형'];

const ParticipantsPage = () => {
  const router = useRouter();
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  // 필터 (클라이언트 사이드: behavior_tag 는 런타임 휴리스틱이라 서버 정렬 불가)
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [behaviorFilter, setBehaviorFilter] = useState<string | null>(null);

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
      await load();
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
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '복원에 실패했습니다.');
    } finally {
      setRestoring(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchParticipants({ search, page, page_size: PAGE_SIZE });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  // 현재 페이지 항목에 클라이언트 필터 적용
  const visibleItems = useMemo(() => {
    let items = data?.items || [];
    if (statusFilter) items = items.filter((p: any) => p.last_status === statusFilter);
    if (behaviorFilter) items = items.filter((p: any) => p.behavior_tag === behaviorFilter);
    return items;
  }, [data, statusFilter, behaviorFilter]);

  // 페이지/검색/필터가 바뀌면 선택을 초기화 (다른 페이지의 stale id 삭제 방지)
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, statusFilter, behaviorFilter]);

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
      await load(); // 상태 동기화: 삭제된 데이터가 즉시 화면에서 사라지도록 refetch
    } catch (err: any) {
      alert(err?.response?.data?.detail || '삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = data?.total_pages ?? 1;
  const anyFilter = statusFilter || behaviorFilter;

  // 마스터 주소(/master)면 전체 고객사, HR(/admin)이면 자사 대상자
  const onMaster = isSuper;

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={onMaster ? '마스터' : '진단'}
        title={onMaster ? '전체 참여자' : '대상자 · 참여'}
        desc={<>
          {data ? `총 ${data.total.toLocaleString()}명` : '불러오는 중…'}
          {anyFilter && data && ` · 현재 페이지 ${visibleItems.length}명 표시`}
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
          <button type="button" onClick={handleExcelDownload} disabled={downloading} className="fa-btn primary">
            {downloading ? <Loader2 className="animate-spin" /> : <FileDown />}
            엑셀 다운로드
          </button>
        </>}
      />

      <div className="fa-card pad">
        {/* 검색 + 필터 토글 (상태 + 행동 유형) */}
        <div className="fa-filters">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름, 이메일, 부서로 검색"
            className="fa-input"
            aria-label="대상자 검색"
          />
        </div>
        <div className="fa-filters" style={{ rowGap: 10, columnGap: 20 }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold fa-muted">진행 상태</span>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(statusFilter === f.key ? null : f.key)}
                className={`fa-btn sm ${statusFilter === f.key ? 'primary' : ''}`}
                aria-pressed={statusFilter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold fa-muted">행동 유형</span>
            {BEHAVIOR_FILTERS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBehaviorFilter(behaviorFilter === b ? null : b)}
                className={`fa-btn sm ${behaviorFilter === b ? 'primary' : ''}`}
                aria-pressed={behaviorFilter === b}
              >
                {b}
              </button>
            ))}
          </div>
          {anyFilter && (
            <button type="button" onClick={() => { setStatusFilter(null); setBehaviorFilter(null); }} className="fa-btn ghost sm">
              필터 초기화
            </button>
          )}
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
                <th>이름</th>
                <th>소속</th>
                <th>진단 상태</th>
                <th style={{ width: 200 }}>진행률</th>
                <th>행동 태그</th>
                <th style={{ textAlign: 'right' }}>보기</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="fa-empty">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              ) : visibleItems.length === 0 ? (
                <tr><td colSpan={7} className="fa-empty">
                  {anyFilter ? '이 필터에 해당하는 대상자가 현재 페이지에 없습니다.'
                    : search ? `'${search}' 검색 결과가 없습니다.`
                    : '등록된 대상자가 없습니다.'}
                </td></tr>
              ) : (
                visibleItems.map((p: any) => {
                  const pct = p.progress_pct ?? 0;
                  const done = p.last_status === 'completed';
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
                      <td className="fa-who">
                        <b>{p.name}</b>
                        <span>{p.email}</span>
                      </td>
                      <td>
                        <div className="fa-muted">{p.company_name}</div>
                        {/* (2026-10-15) 최근 세션에 고정된 LLM provider(null = 환경 기본값/구 세션) */}
                        {p.llm_provider && (
                          <span className="fa-chip" style={{ marginTop: 4, height: 20, fontSize: 11 }}>{p.llm_provider}</span>
                        )}
                      </td>
                      <td>
                        <span className={`fa-chip ${STATUS_CHIP[p.last_status] || 'off'}`}>
                          {STATUS_LABEL[p.last_status] || p.last_status}
                        </span>
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
                      {/* 행동 태그 */}
                      <td>
                        {p.behavior_tag ? (
                          <span className="fa-chip">{p.behavior_tag}</span>
                        ) : (
                          <span className="fa-chip off">–</span>
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
              {anyFilter && <span className="ml-2">(필터는 현재 페이지 내 적용)</span>}
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

      {/* 대화 원문 모달 */}
      <TranscriptModal
        sessionId={transcriptSid || ''}
        open={transcriptSid !== null}
        onClose={() => setTranscriptSid(null)}
      />
    </AdminLayout>
  );
};

export default ParticipantsPage;
