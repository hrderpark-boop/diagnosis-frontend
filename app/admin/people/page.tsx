"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '@/components/layouts/AdminLayout';
import ScopeFilter, { useScope } from '@/components/admin/ScopeFilter';
import {
  fetchEducationSummary, fetchEducationPeople, fetchEducationCatalog,
  EducationPerson, Paginated, EducationCatalog,
} from '@/lib/adminApi';
import { adminPath } from '@/lib/adminRoutes';
import '../education/education.css';

/**
 * HR 콘솔 · 개인별 추천 과정.
 * 위: 과정 안내서(트랙별 학습 방식 + 역량별 과정 목록·교육목표·추천 인원, /admin/education/catalog).
 * 아래: 한 사람당 강화 역량 · 개선 필요 역량 · 추천 과정을 한 줄로 본다(/admin/education/people).
 * 값은 저장된 리포트·과정 카탈로그 그대로다. 마스터 콘솔(/master/people)도 같은 화면을 쓰며,
 * 맨 위 선택 줄에서 고객사 › 본부 › 실 › 팀을 골라 본다(HR 은 자기 회사의 본부 › 실 › 팀).
 */

const PAGE_SIZE = 20;

// 트랙 이름(교육 체계도와 같은 말)
const TRACK_LABEL: Record<string, string> = { A: '기본기', B: '실습', C: '현업 적용', D: '전수·확산' };
const levelText = (from: number | null, to: number | string | null) =>
  typeof to === 'number' ? `Lv.${from}→${to}` : (to ? String(to) : '');

type StatusFilter = '' | 'completed' | 'not_completed';

const errText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

// 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙인 CSV 를 내려받는다
const downloadCsv = (name: string, rows: (string | number)[][]) => {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};


function PeopleRecommendation() {
  const router = useRouter();
  // 조회 범위: 마스터는 고객사 › 본부 › 실 › 팀, HR(대리 포함)은 자기 회사의 본부 › 실 › 팀
  const scope = useScope({ allowAllCompanies: false });
  const { companyId } = scope;
  const orgUnitId = scope.orgUnitId || '';
  const [courseOptions, setCourseOptions] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [course, setCourse] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<EducationPerson> | null>(null);
  // 과정 안내서
  const [catalog, setCatalog] = useState<EducationCatalog | null>(null);
  const [openComp, setOpenComp] = useState<string | null>(null);
  const [onlyRec, setOnlyRec] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // 범위가 바뀌면 첫 페이지로, 회사가 바뀌면 과정 필터도 비운다
  const scopeKey = `${companyId || ''}|${orgUnitId}`;
  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
  const [prevCompany, setPrevCompany] = useState(companyId);
  if (prevScopeKey !== scopeKey) { setPrevScopeKey(scopeKey); setPage(1); }
  if (prevCompany !== companyId) { setPrevCompany(companyId); setCourse(''); }

  // 고객사가 바뀌면 과정 목록(필터용)을 다시
  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    fetchEducationSummary({ company_id: companyId })
      .then((s) => { if (alive) setCourseOptions([...new Set(s.courses.map((c) => c.course))].sort((a, b) => a.localeCompare(b, 'ko'))); })
      .catch(() => { if (alive) setCourseOptions([]); });
    return () => { alive = false; };
  }, [companyId]);

  // 검색어 입력은 350ms 뒤에 반영
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(() => ({
    company_id: companyId || undefined,
    org_unit_id: orgUnitId || undefined,
    search: search || undefined,
    status: status || undefined,
    course: course || undefined,
  }), [companyId, orgUnitId, search, status, course]);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(scope.loading); return; }
    setLoading(true);
    setError('');
    try {
      setData(await fetchEducationPeople({ ...params, page, page_size: PAGE_SIZE }));
    } catch (err) {
      setError(errText(err, '명단을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [companyId, params, page, scope.loading]);

  useEffect(() => { load(); }, [load]);

  // 과정 안내서: 고객사·조직 범위가 바뀌면 다시. 진단 완료자가 있으면 '추천 대상이 있는 과정만'을 기본으로
  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    fetchEducationCatalog({ company_id: companyId, org_unit_id: orgUnitId || undefined })
      .then((c) => {
        if (!alive) return;
        setCatalog(c);
        const anyRec = c.competencies.some((comp) => comp.subs.some((sub) => Object.values(sub.courses).some((x) => x.total > 0)));
        setOnlyRec(c.completed > 0 && anyRec);
        setOpenComp((prev) => prev ?? c.competencies[0]?.key ?? null);
      })
      .catch(() => { if (alive) setCatalog(null); });
    return () => { alive = false; };
  }, [companyId, orgUnitId]);

  // 역량별 과정 행(하위역량 × 트랙). '추천 대상이 있는 과정만'이면 추천 인원 0 은 뺀다
  const guideRows = useMemo(() => {
    if (!catalog) return [];
    return catalog.competencies.map((comp) => {
      const rows = comp.subs.flatMap((sub) => Object.entries(sub.courses)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([track, c]) => ({ sub: sub.name, track, c })))
        .filter((r) => !onlyRec || r.c.total > 0);
      const recCount = comp.subs.reduce((n, sub) => n + Object.values(sub.courses).filter((x) => x.total > 0).length, 0);
      return { key: comp.key, name: comp.name, rows, recCount, all: comp.subs.length * 4 };
    });
  }, [catalog, onlyRec]);
  const trackOf = (t: string) => catalog?.tracks.find((x) => x.track === t);

  const companyName = scope.companyName;

  // 현재 필터 그대로 전체 페이지를 모아 CSV 로
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: EducationPerson[] = [];
      let p = 1;
      let totalPages = 1;
      do {
        const res = await fetchEducationPeople({ ...params, page: p, page_size: 200 });
        all.push(...res.items);
        totalPages = res.total_pages;
        p += 1;
      } while (p <= totalPages);
      const rows: (string | number)[][] = [['이름', '이메일', '본부', '팀 코드', '팀', '상태', '종합', '강화 역량', '개선 필요 역량', '추천 과정']];
      all.forEach((r) => rows.push([
        r.name, r.email, r.division_name || '', r.org_code || '', r.org_name || '',
        r.completed ? '완료' : '미완료',
        r.total_score === null || r.total_score === undefined ? '' : r.total_score.toFixed(1),
        r.strength || '', r.growth || '',
        r.courses.map((c) => `${c.track ? `[${c.track}] ` : ''}${c.course}${c.kind === 'strength' ? '(강점)' : ''}`).join(' / '),
      ]));
      downloadCsv(`개인별_추천과정_${companyName || ''}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch (err) {
      setError(errText(err, '명단을 내려받지 못했습니다.'));
    } finally {
      setExporting(false);
    }
  };

  const items = data?.items || [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={scope.isMaster ? `마스터 · ${scope.label || '고객사 선택'}` : (scope.label || undefined)}
        title="개인별 추천 과정"
        desc={data ? `과정 안내서와 개인별 추천 명단입니다. 대상 ${data.total}명` : '과정 안내서와 개인별 추천 명단입니다.'}
        actions={<>
          <button type="button" className="fa-btn primary" onClick={exportCsv} disabled={exporting || !data || data.total === 0}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />} 명단 CSV
          </button>
        </>}
      />

      {/* 조회 범위: [고객사] › [본부] › [실] › [팀] */}
      <ScopeFilter scope={scope} />

      {error && <div className="fa-error" style={{ marginBottom: 20 }}>{error}</div>}

      {/* 과정 안내서: 트랙별 학습 방식 → 역량별 과정 목록 */}
      {catalog && (
        <div className="fa-card pad fa-section">
          <div className="fa-cap">
            <div>
              <h3>과정 안내서</h3>
              <p>진단 레벨에 맞춰 A~D 트랙으로 이어지는 과정과 교육목표입니다. 추천 인원은 이 범위에서 그 과정을 추천받은 사람 수입니다.</p>
            </div>
            <label className="fa-edu-toggle">
              <input type="checkbox" checked={onlyRec} onChange={(e) => setOnlyRec(e.target.checked)} />
              추천 대상이 있는 과정만
            </label>
          </div>

          <div className="fa-edu-tracks">
            {catalog.tracks.map((t) => (
              <div key={t.track} className={`fa-edu-track${t.track === 'D' ? ' str' : ''}`}>
                <div className="hd">
                  <span className="trk">{t.track}</span>
                  <b>{TRACK_LABEL[t.track] || t.track}</b>
                  <span className="lv">{levelText(t.from_level, t.to_level)}</span>
                </div>
                <div className="fmt">{t.format}</div>
                <p>{t.format_desc}</p>
              </div>
            ))}
          </div>

          <div className="fa-edu-acc">
            {guideRows.map((g) => {
              const open = openComp === g.key;
              return (
                <div key={g.key} className={`fa-edu-acc-item${open ? ' open' : ''}`}>
                  <button type="button" className="fa-edu-acc-btn" aria-expanded={open} onClick={() => setOpenComp(open ? null : g.key)}>
                    <b>{g.name}</b>
                    <span>과정 {g.all}개 · 추천 대상 있는 과정 {g.recCount}개</span>
                    <ChevronDown />
                  </button>
                  {open && (
                    <div className="fa-edu-acc-body">
                      {g.rows.length === 0 ? (
                        <div className="fa-empty" style={{ padding: '20px 0' }}>이 역량에는 추천 대상이 있는 과정이 아직 없습니다.</div>
                      ) : (
                        <div className="fa-tbl">
                          <table className="fa-table" style={{ minWidth: 920 }}>
                            <thead>
                              <tr><th>하위역량</th><th>트랙</th><th>과정명</th><th>교육목표</th><th>학습 방식</th><th>추천 인원</th></tr>
                            </thead>
                            <tbody>
                              {g.rows.map((r) => (
                                <tr key={`${r.sub}-${r.track}`}>
                                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.sub}</td>
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    <span className="fa-chip tint">{r.track} · {TRACK_LABEL[r.track] || r.track}</span>
                                  </td>
                                  <td style={{ fontWeight: 600, minWidth: 180 }}>
                                    {r.c.vod_url ? <a href={r.c.vod_url} target="_blank" rel="noopener noreferrer">{r.c.course}</a> : r.c.course}
                                  </td>
                                  <td className="goal" style={{ minWidth: 240 }}>{r.c.goal}</td>
                                  <td className="fmt" style={{ minWidth: 160 }}>{trackOf(r.track)?.format}</td>
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    {r.c.total > 0 ? (
                                      <>
                                        <span className="fa-num" style={{ fontSize: 15, fontWeight: 600 }}>{r.c.total}명</span>
                                        {r.c.cohort && <span className="fa-chip navy" style={{ marginLeft: 6 }}>차수 개설</span>}
                                      </>
                                    ) : <span className="fa-muted">–</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="fa-edu-guide-note">주요 내용(차시 구성)은 과정 카탈로그에 아직 없어 트랙별 학습 방식으로 안내합니다.</p>
        </div>
      )}

      <div className="fa-card pad">
        <div className="fa-cap">
          <div><h3>개인별 추천 과정</h3><p>한 사람당 강화 역량 · 개선 필요 역량 · 추천 과정을 한 줄로 봅니다.</p></div>
        </div>
        <div className="fa-filters">
          <input className="fa-input" placeholder="이름·이메일 검색" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)} aria-label="이름·이메일 검색" />
          <select className="fa-select" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }} aria-label="상태 선택">
            <option value="">모든 상태</option>
            <option value="completed">완료</option>
            <option value="not_completed">미완료</option>
          </select>
          {courseOptions.length > 0 && (
            <select className="fa-select" value={course} onChange={(e) => { setCourse(e.target.value); setPage(1); }} aria-label="추천 과정 선택">
              <option value="">추천 과정 전체</option>
              {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <div className="fa-edu-legend" style={{ marginLeft: 'auto' }}>
            <span><i style={{ background: 'var(--fa-navy)' }} />개선 과정</span>
            <span><i style={{ background: 'var(--fa-bright)' }} />강점 활용 과정</span>
          </div>
        </div>

        {loading ? (
          <div className="fa-empty"><Loader2 className="inline h-5 w-5 animate-spin" /> 불러오는 중입니다…</div>
        ) : items.length === 0 ? (
          <div className="fa-empty">
            {search || orgUnitId || status || course ? '조건에 맞는 사람이 없습니다.' : '아직 등록된 대상자가 없습니다.'}
          </div>
        ) : (
          <div className="fa-tbl">
            <table className="fa-table" style={{ minWidth: 1040 }}>
              <thead>
                <tr>
                  <th>이름</th><th>소속</th><th>상태</th><th>종합</th>
                  <th>강화 역량</th><th>개선 필요 역량</th><th>추천 과정</th><th />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="fa-who"><b>{r.name}</b><span>{r.email}</span></td>
                    <td>
                      {r.org_code
                        ? <><span className="fa-code">{r.org_code}</span> <span className="fa-muted" style={{ fontSize: 13 }}>{r.org_name}</span></>
                        : <span className="fa-chip off">미분류</span>}
                    </td>
                    <td>{r.completed ? <span className="fa-chip tint">완료</span> : <span className="fa-chip off">미완료</span>}</td>
                    <td className="fa-num" style={{ fontSize: 16 }}>
                      {r.total_score === null || r.total_score === undefined ? <span className="fa-muted">–</span> : r.total_score.toFixed(1)}
                    </td>
                    <td>{r.strength ? <span className="fa-chip tint">{r.strength}</span> : <span className="fa-muted">–</span>}</td>
                    <td>{r.growth ? <span className="fa-chip line">{r.growth}</span> : <span className="fa-muted">–</span>}</td>
                    <td>
                      {r.courses.length > 0 ? (
                        <div className="fa-edu-recs">
                          {r.courses.map((c, i) => (
                            <span key={i} className={`fa-edu-rec${c.kind === 'strength' ? ' str' : ''}`} title={c.category || undefined}>
                              {c.track && <i>{c.track}</i>}{c.course}
                            </span>
                          ))}
                        </div>
                      ) : r.completed ? (
                        <span className="fa-muted" style={{ fontSize: 13 }}>추천 과정 없음(근거 부족)</span>
                      ) : (
                        <span className="fa-muted" style={{ fontSize: 13 }}>진단 후 생성</span>
                      )}
                    </td>
                    <td>
                      {r.report_id && (
                        <button type="button" className="fa-btn sm" onClick={() => router.push(adminPath(`/reports/${r.report_id}`))}>
                          리포트
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="fa-pager">
            <span>{data.total}명 중 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)}</span>
            <div className="fa-actions">
              <button type="button" className="fa-btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> 이전
              </button>
              <span className="fa-num">{page} / {totalPages}</span>
              <button type="button" className="fa-btn sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                다음 <ChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// useScope 가 주소(?company=)를 읽으므로 Suspense 로 감싼다
export default function PeopleRecommendationPage() {
  return (
    <Suspense fallback={null}>
      <PeopleRecommendation />
    </Suspense>
  );
}
