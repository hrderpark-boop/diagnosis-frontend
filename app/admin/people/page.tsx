"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '@/components/layouts/AdminLayout';
import {
  fetchMe, fetchCompanies, fetchOrgUnits, fetchEducationSummary, fetchEducationPeople,
  AdminProfile, OrgTree, EducationPerson, Paginated,
} from '@/lib/adminApi';
import { adminPath } from '@/lib/adminRoutes';
import '../education/education.css';

/**
 * HR 콘솔 · 개인별 추천 과정.
 * 한 사람당 강화 역량 · 개선 필요 역량 · 추천 과정을 한 줄로 본다. 값은 백엔드(/admin/education/people)가
 * 저장된 리포트에서 꺼낸 그대로다. 마스터 콘솔(/master/people)도 같은 화면을 쓰며 고객사를 골라 본다.
 */

const PAGE_SIZE = 20;

interface CompanyOption { id: string; name: string }
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

export default function PeopleRecommendationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [courseOptions, setCourseOptions] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [course, setCourse] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<EducationPerson> | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const isSuper = profile?.role === 'super_admin';

  // 내 권한 → HR 은 자사, 마스터는 고객사 목록
  useEffect(() => {
    let alive = true;
    fetchMe().then(async (me) => {
      if (!alive) return;
      setProfile(me);
      if (me.role === 'super_admin') {
        const list = ((await fetchCompanies()) as CompanyOption[]) || [];
        if (!alive) return;
        setCompanies(list);
        setCompanyId(list[0]?.id || '');
      } else {
        setCompanyId(me.company_id || '');
      }
    }).catch((err) => { if (alive) setError(errText(err, '관리자 정보를 불러오지 못했습니다.')); });
    return () => { alive = false; };
  }, []);

  // 고객사가 바뀌면 조직 트리·과정 목록(필터용)을 다시
  useEffect(() => {
    if (!companyId || !profile) return;
    let alive = true;
    setOrgUnitId('');
    setCourse('');
    fetchOrgUnits(companyId).then((t) => { if (alive) setTree(t); }).catch(() => { if (alive) setTree(null); });
    fetchEducationSummary({ company_id: profile.role === 'super_admin' ? companyId : undefined })
      .then((s) => { if (alive) setCourseOptions([...new Set(s.courses.map((c) => c.course))].sort((a, b) => a.localeCompare(b, 'ko'))); })
      .catch(() => { if (alive) setCourseOptions([]); });
    return () => { alive = false; };
  }, [companyId, profile]);

  // 검색어 입력은 350ms 뒤에 반영
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(() => ({
    company_id: isSuper ? companyId : undefined,
    org_unit_id: orgUnitId || undefined,
    search: search || undefined,
    status: status || undefined,
    course: course || undefined,
  }), [isSuper, companyId, orgUnitId, search, status, course]);

  const load = useCallback(async () => {
    if (!profile) return;
    if (isSuper && !companyId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      setData(await fetchEducationPeople({ ...params, page, page_size: PAGE_SIZE }));
    } catch (err) {
      setError(errText(err, '명단을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [profile, isSuper, companyId, params, page]);

  useEffect(() => { load(); }, [load]);

  const companyName = isSuper ? companies.find((c) => c.id === companyId)?.name : profile?.company_name;

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
        eyebrow={isSuper ? '마스터' : (profile?.company_name || undefined)}
        title="개인별 추천 과정"
        desc={data ? `한 사람당 강화 역량 · 개선 필요 역량 · 추천 과정을 한 줄로 봅니다. 총 ${data.total}명` : '한 사람당 강화 역량 · 개선 필요 역량 · 추천 과정을 한 줄로 봅니다.'}
        actions={
          <button type="button" className="fa-btn primary" onClick={exportCsv} disabled={exporting || !data || data.total === 0}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />} 명단 CSV
          </button>
        }
      />

      {error && <div className="fa-error" style={{ marginBottom: 20 }}>{error}</div>}

      <div className="fa-card pad">
        <div className="fa-filters">
          {isSuper && (
            <select className="fa-select" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }} aria-label="고객사 선택">
              {companies.length === 0 && <option value="">고객사 없음</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <input className="fa-input" placeholder="이름·이메일 검색" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)} aria-label="이름·이메일 검색" />
          {tree && tree.divisions.length > 0 && (
            <select className="fa-select" value={orgUnitId} onChange={(e) => { setOrgUnitId(e.target.value); setPage(1); }} aria-label="조직 선택">
              <option value="">모든 조직</option>
              {tree.divisions.map((d) => (
                <React.Fragment key={d.id}>
                  <option value={d.id}>{d.name} ({d.code})</option>
                  {d.teams.map((t) => <option key={t.id} value={t.id}>{'   '}{t.name} ({t.code})</option>)}
                </React.Fragment>
              ))}
            </select>
          )}
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
