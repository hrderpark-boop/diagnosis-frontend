"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '@/components/layouts/AdminLayout';
import {
  fetchMe, fetchCompanies, fetchOrgUnits, fetchEducationSummary, fetchEducationCatalog,
  AdminProfile, OrgTree, EducationSummary, EducationCatalog, CatalogCourse,
} from '@/lib/adminApi';
import './education.css';

/**
 * HR 콘솔 · 교육 체계도.
 * 교재 표지형 체계도 포스터처럼, 가로축은 교육과정(트랙 A~D), 세로축은 역량(5개 역량 × 하위역량 26개)이다.
 * 칸마다 전체 과정 카탈로그(/admin/education/catalog)의 과정을 놓고, 진단 결과로 그 과정을 추천받은 인원을 붙인다.
 * 기준 인원 이상이면 사내 차수 개설을 권한다. 숫자는 모두 저장된 리포트에서 계산한 값이다(지어내지 않음).
 * 마스터 콘솔(/master/education)도 같은 화면을 쓰며, 이때는 고객사를 골라 본다.
 */

// 한 반 권장 인원(권장 편성의 반 수 계산)
const CLASS_SIZE = 20;

interface CompanyOption { id: string; name: string; code?: string }

const errText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

// 트랙 열 이름(체계도 2단 머리). 레벨 전환은 카탈로그 값으로 붙인다.
const TRACK_LABEL: Record<string, string> = { A: '기본기', B: '실습', C: '현업 적용', D: '전수·확산' };
// 머리 1단: 개선 과정(A~C)과 강점 확산 과정(D)
const GROWTH_TRACKS = ['A', 'B', 'C'];

const levelText = (from: number | null, to: number | string | null) =>
  typeof to === 'number' ? `Lv.${from}→${to}` : (to ? String(to) : '');

interface Picked { comp: string; sub: string; track: string; c: CatalogCourse }

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


// (2026-10-29) 마스터: 고객사 하나를 골라 그 회사만 본다. 고른 회사는 주소(?company=)와 브라우저에 기억(다른 마스터 화면과 공유)
const MASTER_COMPANY_KEY = 'fm_master_company';
const readMasterCompany = (): string => {
  try {
    const q = new URLSearchParams(window.location.search).get('company');
    if (q !== null) return q;
    return localStorage.getItem(MASTER_COMPANY_KEY) || '';
  } catch { return ''; }
};
const rememberMasterCompany = (id: string) => {
  try {
    localStorage.setItem(MASTER_COMPANY_KEY, id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('company', id); else url.searchParams.delete('company');
    window.history.replaceState(null, '', url.toString());
  } catch { /* 저장 못 해도 화면은 동작 */ }
};

export default function EducationMapPage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [orgUnitId, setOrgUnitId] = useState<string>('');
  const [summary, setSummary] = useState<EducationSummary | null>(null);
  const [catalog, setCatalog] = useState<EducationCatalog | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 마스터라도 고객사로 들어간 상태(acting)면 그 고객사 HR 화면으로 본다(고객사 선택 없음, 범위는 백엔드가 고정)
  const isSuper = profile?.role === 'super_admin' && !profile?.acting;

  // 1) 내 권한 확인 → HR 은 자사, 마스터는 고객사 목록에서 고른다
  useEffect(() => {
    let alive = true;
    fetchMe().then(async (me) => {
      if (!alive) return;
      setProfile(me);
      if (me.role === 'super_admin' && !me.acting) {
        const list = [...(((await fetchCompanies()) as CompanyOption[]) || [])].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        if (!alive) return;
        setCompanies(list);
        const saved = readMasterCompany();
        setCompanyId(list.find((c) => c.id === saved)?.id || list[0]?.id || '');
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
      const scope = { company_id: isSuper ? companyId : undefined, org_unit_id: orgUnitId || undefined };
      const [res, cat] = await Promise.all([fetchEducationSummary(scope), fetchEducationCatalog(scope)]);
      setSummary(res);
      setCatalog(cat);
      setPicked(null);
    } catch (err) {
      setError(errText(err, '교육 데이터를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [profile, isSuper, companyId, orgUnitId]);

  useEffect(() => { load(); }, [load]);

  const tracks = catalog?.tracks || [];
  const chooseCompany = (id: string) => { setCompanyId(id); rememberMasterCompany(id); };
  const growthTracks = tracks.filter((t) => GROWTH_TRACKS.includes(t.track));
  const strengthTracks = tracks.filter((t) => !GROWTH_TRACKS.includes(t.track));
  const orderedTracks = [...growthTracks, ...strengthTracks];
  const trackOf = (t: string) => tracks.find((x) => x.track === t);

  const cohorts = useMemo(() => (summary?.courses || []).filter((c) => c.cohort), [summary]);
  const strengthCourses = useMemo(
    () => (summary?.courses || []).filter((c) => c.strength > 0).sort((a, b) => b.strength - a.strength),
    [summary],
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

  // 체계도 칸의 과정 알약: 차수 개설(네이비) / 추천 대상 있음(연한 바탕) / 추천 없음(흰 바탕)
  const renderPill = (comp: string, sub: string, track: string, c: CatalogCourse) => {
    const kind = c.cohort ? 'hot' : c.total > 0 ? 'has' : 'none';
    const on = picked !== null && picked.comp === comp && picked.sub === sub && picked.track === track;
    return (
      <button
        type="button"
        className={`fa-edu-pill ${kind}${on ? ' on' : ''}`}
        title={`교육목표: ${c.goal}`}
        aria-pressed={on}
        onClick={() => setPicked(on ? null : { comp, sub, track, c })}
      >
        <span className="nm">{c.course}</span>
        {c.total > 0 && (
          <span className="ft">
            <span className="n">{c.total}명</span>
            {c.cohort && <span className="tag">차수 개설</span>}
          </span>
        )}
      </button>
    );
  };

  const divisions = summary?.divisions || [];
  const comps = summary?.competencies || [];

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={isSuper ? `마스터 · ${companyName || '고객사 선택'}` : (profile?.company_name || undefined)}
        title="교육 체계도"
        desc="진단 결과로 추천된 과정을 역량 × 트랙으로 모았습니다. 숫자는 그 과정을 추천받은 인원입니다."
        actions={<>
          {isSuper && (
            <select className="fa-select" style={{ minWidth: 220, fontWeight: 600 }} value={companyId}
              onChange={(e) => chooseCompany(e.target.value)} aria-label="고객사 선택">
              {companies.length === 0 && <option value="">고객사 없음</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
            </select>
          )}
          <button type="button" className="fa-btn primary" onClick={exportPlan} disabled={!summary || summary.courses.length === 0}>
            <Download /> 편성안 CSV 내려받기
          </button>
        </>}
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

      {tree && tree.divisions.length > 0 && (
        <div className="fa-edu-scope">
          {(

            <>
              <span className="lb">조직</span>
              <select className="fa-select" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} aria-label="조직 선택">
                <option value="">전사</option>
                {tree.divisions.map((d) => (
                  <React.Fragment key={d.id}>
                    <option value={d.id}>{d.name} ({d.code})</option>
                    {(d.offices || []).map((o) => (
                      <React.Fragment key={o.id}>
                        <option value={o.id}>{'   '}{o.name} ({o.code})</option>
                        {o.teams.map((t) => <option key={t.id} value={t.id}>{'      '}{t.name} ({t.code})</option>)}
                      </React.Fragment>
                    ))}
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
      ) : !summary || !catalog ? null : (
        <>
          <div className="fa-card pad fa-section">
            <div className="fa-cap">
              <div>
                <h3>리더십 역량 교육체계</h3>
                <p>가로는 교육과정(트랙), 세로는 역량입니다. 숫자는 진단 결과로 그 과정을 추천받은 인원입니다.</p>
              </div>
              <div className="fa-edu-legend">
                <span><i className="lg hot" />차수 개설 권장({catalog.cohort_min}명 이상)</span>
                <span><i className="lg has" />추천 대상 있음</span>
                <span><i className="lg none" />추천 없음</span>
              </div>
            </div>

            {completed === 0 && (
              <div className="fa-note" style={{ marginBottom: 16 }}>
                아직 진단을 마친 사람이 없어 추천 인원은 모두 비어 있습니다. 아래는 전체 교육과정 체계입니다.
              </div>
            )}

            <p className="fa-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>과정을 누르면 교육목표와 학습 방식이 팝업으로 열립니다.</p>

            {/* 고른 과정의 교육목표·학습 방식: 위에 고정하지 않고 누른 자리에서 팝업으로(스크롤을 되돌리지 않게) */}
            {picked && (
              <div className="fa-modal-bg" role="presentation" onClick={() => setPicked(null)}
                onKeyDown={(e) => { if (e.key === 'Escape') setPicked(null); }}>
                <div className="fa-modal fa-edu-detail on" role="dialog" aria-modal="true" aria-label={picked.c.course}
                  onClick={(e) => e.stopPropagation()}>
                  <div className="top">
                    <span className="trk">{picked.track}</span>
                    <div className="tt">
                      <b>{picked.c.course}</b>
                      <span>
                        {picked.comp} · {picked.sub} · {TRACK_LABEL[picked.track] || ''}{' '}
                        {levelText(trackOf(picked.track)?.from_level ?? null, trackOf(picked.track)?.to_level ?? null)}
                      </span>
                    </div>
                    <button type="button" className="fa-btn sm ghost" autoFocus onClick={() => setPicked(null)}>닫기</button>
                  </div>
                  <dl>
                    <div><dt>교육목표</dt><dd>{picked.c.goal}</dd></div>
                    <div>
                      <dt>학습 방식</dt>
                      <dd>{trackOf(picked.track)?.format}{trackOf(picked.track)?.format_desc ? `. ${trackOf(picked.track)?.format_desc}` : ''}</dd>
                    </div>
                    <div>
                      <dt>추천 인원</dt>
                      <dd>{picked.c.total > 0 ? `${picked.c.total}명 (개선 ${picked.c.growth} · 강점 ${picked.c.strength})` : '아직 없음'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            <div className="fa-edu-poster-wrap">
              <div className="fa-edu-poster" style={{ gridTemplateColumns: `52px 150px repeat(${orderedTracks.length}, minmax(168px, 1fr))` }}>
                {/* 머리 1단: 과정 묶음 */}
                <div className="band corner" style={{ gridColumn: 'span 2', gridRow: 'span 2' }}><b>역량</b></div>
                {growthTracks.length > 0 && (
                  <div className="band" style={{ gridColumn: `span ${growthTracks.length}` }}>역량 향상 과정 <small>(개선)</small></div>
                )}
                {strengthTracks.length > 0 && (
                  <div className="band str" style={{ gridColumn: `span ${strengthTracks.length}` }}>강점 확산 과정</div>
                )}
                {/* 머리 2단: 트랙 */}
                {orderedTracks.map((t) => (
                  <div key={t.track} className="sub">
                    <b><span className="trk">{t.track}</span>{TRACK_LABEL[t.track] || t.track} <em>{levelText(t.from_level, t.to_level)}</em></b>
                    <span>{t.format}</span>
                  </div>
                ))}
                {/* 본문: 역량(세로 묶음) × 하위역량 */}
                {catalog.competencies.map((comp, ci) => {
                  const g = summary.growth.find((x) => x.key === comp.key)?.count ?? 0;
                  const st = summary.strength.find((x) => x.key === comp.key)?.count ?? 0;
                  const alt = ci % 2 ? ' alt' : '';
                  return (
                    <React.Fragment key={comp.key}>
                      <div className={`comp${alt}`} style={{ gridRow: `span ${comp.subs.length}` }}>
                        <b>{comp.name}</b>
                        {completed > 0 && <span>개선 {g}<br />강점 {st}</span>}
                      </div>
                      {comp.subs.map((sub, si) => {
                        const last = si === comp.subs.length - 1 ? ' last' : '';
                        return (
                          <React.Fragment key={sub.name}>
                            <div className={`subname${alt}${last}`}>{sub.name}</div>
                            {orderedTracks.map((t) => {
                              const c = sub.courses[t.track];
                              const strCol = GROWTH_TRACKS.includes(t.track) ? '' : ' strcol';
                              return (
                                <div key={t.track} className={`cell${alt}${last}${strCol}`}>
                                  {c ? renderPill(comp.name, sub.name, t.track, c) : null}
                                </div>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {completed === 0 ? null : (
          <>
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
        </>
      )}
    </AdminLayout>
  );
}
