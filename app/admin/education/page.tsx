"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '@/components/layouts/AdminLayout';
import {
  fetchMe, fetchCompanies, fetchOrgUnits, fetchEducationSummary,
  AdminProfile, OrgTree, EducationSummary, EducationCourseRow,
} from '@/lib/adminApi';
import './education.css';

/**
 * HR 콘솔 · 교육 체계도.
 * 진단 결과로 추천된 과정을 역량 × 트랙으로 모아 추천 인원을 세고, 기준 인원 이상이면 사내 차수 개설을 권한다.
 * 숫자는 모두 백엔드(/admin/education/summary)가 저장된 리포트에서 계산한 값이다(지어내지 않음).
 * 마스터 콘솔(/master/education)도 같은 화면을 쓰며, 이때는 고객사를 골라 본다.
 */

// 한 반 권장 인원(권장 편성의 반 수 계산)
const CLASS_SIZE = 20;

interface CompanyOption { id: string; name: string }

const errText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

const trackSort = (a: string, b: string) => a.localeCompare(b, 'ko');

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

// 히트맵 칸 색: 점수가 높을수록 진한 네이비
const heatStyle = (v: number | null): React.CSSProperties => {
  if (v === null || v === undefined) return { background: 'var(--fa-mute)', color: 'var(--fa-gray3)' };
  const t = Math.max(0, Math.min(1, (v - 1.5) / 2.5));
  return { background: `rgba(28,43,74,${(0.06 + t * 0.94).toFixed(2)})`, color: t > 0.45 ? '#fff' : 'var(--fa-navy)' };
};

export default function EducationMapPage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [orgUnitId, setOrgUnitId] = useState<string>('');
  const [summary, setSummary] = useState<EducationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSuper = profile?.role === 'super_admin';

  // 1) 내 권한 확인 → HR 은 자사, 마스터는 고객사 목록에서 고른다
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

  // 2) 고객사가 정해지면 조직 트리(필터용)
  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    setOrgUnitId('');
    fetchOrgUnits(companyId).then((t) => { if (alive) setTree(t); }).catch(() => { if (alive) setTree(null); });
    return () => { alive = false; };
  }, [companyId]);

  // 3) 요약
  const load = useCallback(async () => {
    if (!profile) return;
    if (isSuper && !companyId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetchEducationSummary({
        company_id: isSuper ? companyId : undefined,
        org_unit_id: orgUnitId || undefined,
      });
      setSummary(res);
    } catch (err) {
      setError(errText(err, '교육 데이터를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [profile, isSuper, companyId, orgUnitId]);

  useEffect(() => { load(); }, [load]);

  const tracks = useMemo(() => {
    const set = new Map<string, string | null>();
    (summary?.courses || []).forEach((c) => {
      if (!set.has(c.track)) set.set(c.track, c.track_format);
      else if (!set.get(c.track) && c.track_format) set.set(c.track, c.track_format);
    });
    return [...set.entries()].sort((a, b) => trackSort(a[0], b[0]));
  }, [summary]);

  const cell = (category: string, track: string) =>
    (summary?.courses || []).filter((c) => c.category === category && c.track === track);

  const cohorts = useMemo(() => (summary?.courses || []).filter((c) => c.cohort), [summary]);
  const strengthCourses = useMemo(
    () => (summary?.courses || []).filter((c) => c.strength > 0).sort((a, b) => b.strength - a.strength),
    [summary],
  );
  const knownCategories = useMemo(() => new Set((summary?.competencies || []).map((c) => c.name)), [summary]);
  // 역량 이름과 맞지 않는 과정(카테고리 누락 등)도 버리지 않고 따로 보여 준다
  const otherCourses = useMemo(
    () => (summary?.courses || []).filter((c) => !knownCategories.has(c.category)),
    [summary, knownCategories],
  );

  const companyName = isSuper
    ? companies.find((c) => c.id === companyId)?.name
    : profile?.company_name;

  const completed = summary?.completed ?? 0;
  const participants = summary?.participants ?? 0;
  const pct = (n: number) => (completed > 0 ? Math.round((n / completed) * 100) : 0);

  const exportPlan = () => {
    if (!summary) return;
    const rows: (string | number)[][] = [['과정', '역량', '트랙', '추천 인원', '권장 반 수']];
    summary.courses.forEach((c) => {
      rows.push([c.course, c.category, c.track, c.total, c.cohort ? `${Math.ceil(c.total / CLASS_SIZE)}개 반` : '개별 수강']);
    });
    const d = new Date().toISOString().slice(0, 10);
    downloadCsv(`교육_편성안_${companyName || ''}_${d}.csv`, rows);
  };

  const renderCourse = (c: EducationCourseRow) => (
    <div key={`${c.category}-${c.track}-${c.course}`} className={`fa-edu-course${c.cohort ? ' hot' : ''}`}>
      <b>{c.vod_url ? <a href={c.vod_url} target="_blank" rel="noopener noreferrer">{c.course}</a> : c.course}</b>
      <div className="ft">
        <span className="n">{c.total}<small>명</small></span>
        {c.cohort ? <span className="fa-chip">차수 개설</span> : c.strength > 0 && c.growth === 0 ? <span className="fa-chip tint">강점</span> : null}
      </div>
      {c.growth > 0 && c.strength > 0 && <div className="sub">개선 {c.growth} · 강점 {c.strength}</div>}
    </div>
  );

  const divisions = summary?.divisions || [];
  const comps = summary?.competencies || [];

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={isSuper ? '마스터' : (profile?.company_name || undefined)}
        title="교육 체계도"
        desc="진단 결과로 추천된 과정을 역량 × 트랙으로 모았습니다. 숫자는 그 과정을 추천받은 인원입니다."
        actions={
          <button type="button" className="fa-btn primary" onClick={exportPlan} disabled={!summary || summary.courses.length === 0}>
            <Download /> 편성안 CSV 내려받기
          </button>
        }
        kpis={summary ? [
          { label: '대상자', value: participants, unit: '명', detail: orgUnitId ? '선택한 조직' : (companyName || '') },
          {
            label: '진단 완료', value: completed, unit: '명',
            detail: <div className="fa-bar"><i style={{ width: `${participants ? Math.round((completed / participants) * 100) : 0}%` }} /></div>,
          },
          { label: '추천 과정', value: summary.courses.length, unit: '개', detail: '추천받은 사람이 1명 이상인 과정' },
          { label: '차수 개설 권장', value: cohorts.length, unit: '개', detail: `추천 ${summary.cohort_min}명 이상` },
        ] : undefined}
      />

      {(isSuper || (tree && tree.divisions.length > 0)) && (
        <div className="fa-edu-scope">
          {isSuper && (
            <>
              <span className="lb">고객사</span>
              <select className="fa-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="고객사 선택">
                {companies.length === 0 && <option value="">고객사 없음</option>}
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
          {tree && tree.divisions.length > 0 && (
            <>
              <span className="lb">조직</span>
              <select className="fa-select" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} aria-label="조직 선택">
                <option value="">전사</option>
                {tree.divisions.map((d) => (
                  <React.Fragment key={d.id}>
                    <option value={d.id}>{d.name} ({d.code})</option>
                    {d.teams.map((t) => <option key={t.id} value={t.id}>{'   '}{t.name} ({t.code})</option>)}
                  </React.Fragment>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {error && <div className="fa-error" style={{ marginBottom: 20 }}>{error}</div>}

      {loading ? (
        <div className="fa-empty"><Loader2 className="inline h-5 w-5 animate-spin" /> 불러오는 중입니다…</div>
      ) : !summary ? null : completed === 0 ? (
        <div className="fa-card pad">
          <div className="fa-empty">
            아직 진단을 마친 사람이 없습니다.<br />
            진단을 마친 사람이 생기면 추천 과정이 역량과 트랙별로 모입니다.
          </div>
        </div>
      ) : (
        <>
          <div className="fa-card pad fa-section">
            <div className="fa-cap">
              <div>
                <h3>역량 × 교육 트랙</h3>
                <p>네이비 칸은 추천 인원이 {summary.cohort_min}명 이상이라 사내 차수 개설을 권하는 과정입니다.</p>
              </div>
            </div>
            {summary.courses.length === 0 ? (
              <div className="fa-empty">
                진단을 마친 {completed}명 중 추천 과정이 생성된 사람이 없습니다.<br />
                추천 교육은 대화에서 근거가 확인된 하위역량이 3개 이상일 때 생성됩니다.
              </div>
            ) : (
              <div className="fa-edu-map" style={{ gridTemplateColumns: `130px repeat(${tracks.length}, minmax(180px, 1fr))` }}>
                <div className="hd blank" />
                {tracks.map(([t, f]) => (
                  <div key={t} className="hd"><b>{t}트랙</b>{f && <span>{f}</span>}</div>
                ))}
                {comps.map((comp) => {
                  const g = summary.growth.find((x) => x.key === comp.key)?.count ?? 0;
                  const s = summary.strength.find((x) => x.key === comp.key)?.count ?? 0;
                  return (
                    <React.Fragment key={comp.key}>
                      <div className="rh"><b>{comp.name}</b><span>개선 {g}명 · 강점 {s}명</span></div>
                      {tracks.map(([t]) => {
                        const list = cell(comp.name, t);
                        return (
                          <div key={t} className="cell">
                            {list.length ? list.map(renderCourse) : <div className="fa-edu-none">추천 없음</div>}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {otherCourses.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p className="fa-muted" style={{ fontSize: 13, marginBottom: 10 }}>역량 분류가 없는 과정</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                  {otherCourses.map(renderCourse)}
                </div>
              </div>
            )}
          </div>

          <div className="fa-grid2 even">
            <div className="fa-card pad">
              <div className="fa-cap"><div><h3>강화 역량 분포</h3><p>진단 완료 {completed}명 중 가장 높게 나온 역량</p></div></div>
              <div className="fa-edu-dist">
                {summary.strength.map((r) => (
                  <div key={r.key} className="row">
                    <div className="top"><b>{r.name}</b><span>{r.count}명 · {pct(r.count)}%</span></div>
                    <div className="fa-bar blue"><i style={{ width: `${pct(r.count)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="fa-card pad">
              <div className="fa-cap"><div><h3>개선 필요 역량 분포</h3><p>교육 우선순위의 근거가 됩니다</p></div></div>
              <div className="fa-edu-dist">
                {summary.growth.map((r) => (
                  <div key={r.key} className="row">
                    <div className="top"><b>{r.name}</b><span>{r.count}명 · {pct(r.count)}%</span></div>
                    <div className="fa-bar"><i style={{ width: `${pct(r.count)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {summary.courses.length > 0 && (
            <div className="fa-grid2 even">
              <div className="fa-card pad">
                <div className="fa-cap">
                  <div><h3>권장 편성</h3><p>한 반 {CLASS_SIZE}명 기준. {summary.cohort_min}명 미만은 개별 수강을 권합니다.</p></div>
                </div>
                <div className="fa-tbl">
                  <table className="fa-table">
                    <thead><tr><th>과정</th><th>대상</th><th>권장</th></tr></thead>
                    <tbody>
                      {summary.courses.map((c) => (
                        <tr key={`${c.category}-${c.track}-${c.course}`}>
                          <td className="fa-who"><b>{c.course}</b><span>{c.category} · {c.track}트랙{c.track_format ? ` ${c.track_format}` : ''}</span></td>
                          <td className="fa-num">{c.total}명</td>
                          <td>{c.cohort
                            ? <span className="fa-chip navy">{Math.ceil(c.total / CLASS_SIZE)}개 반</span>
                            : <span className="fa-chip">개별 수강</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="fa-card pad">
                <div className="fa-cap"><div><h3>강점 활용 과정</h3><p>강화 역량을 더 키우도록 추천된 과정</p></div></div>
                {strengthCourses.length === 0 ? (
                  <div className="fa-empty">강점 활용 과정을 추천받은 사람이 아직 없습니다.</div>
                ) : (
                  <div className="fa-edu-dist">
                    {strengthCourses.map((c) => (
                      <div key={`${c.category}-${c.track}-${c.course}`} className="row">
                        <div className="top"><b>{c.course}</b><span>{c.category} · {c.strength}명</span></div>
                        <div className="fa-bar blue"><i style={{ width: `${pct(c.strength)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {divisions.length > 0 && (
            <div className="fa-card pad fa-section">
              <div className="fa-cap"><div><h3>본부 × 역량 평균</h3><p>진할수록 높은 점수입니다. 측정되지 않은 칸은 회색입니다.</p></div></div>
              <div className="fa-edu-heat">
                <div className="row" style={{ gridTemplateColumns: `140px repeat(${comps.length}, minmax(70px, 1fr))` }}>
                  <span />
                  {comps.map((c) => <span key={c.key} className="hd">{c.name}</span>)}
                </div>
                {divisions.map((d) => (
                  <div key={d.id || 'none'} className="row" style={{ gridTemplateColumns: `140px repeat(${comps.length}, minmax(70px, 1fr))` }}>
                    <span className="nm">{d.name}<small>{d.code ? `${d.code} · ` : ''}{d.n}명</small></span>
                    {comps.map((c) => {
                      const v = d.averages[c.key];
                      return <span key={c.key} className="cell" style={heatStyle(v)}>{v === null || v === undefined ? '–' : v.toFixed(1)}</span>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
