"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '@/components/layouts/AdminLayout';
import ScopeFilter, { useScope } from '@/components/admin/ScopeFilter';
import {
  fetchEducationSummary, fetchEducationCatalog, fetchCurriculum, downloadCurriculumExcel,
  EducationSummary, EducationCatalog, CatalogCourse,
  Curriculum, CurriculumCompetency, CurriculumRow, CurriculumItem, CurriculumTier,
} from '@/lib/adminApi';
import './education.css';

/**
 * HR 콘솔 · 교육 체계도.
 * 교재 표지형 체계도 포스터처럼, 가로축은 교육과정(트랙 A~D), 세로축은 역량(5개 역량 × 하위역량 26개)이다.
 * 칸마다 전체 과정 카탈로그(/admin/education/catalog)의 과정을 놓고, 진단 결과로 그 과정을 추천받은 인원을 붙인다.
 * 기준 인원 이상이면 사내 차수 개설을 권한다. 숫자는 모두 저장된 리포트에서 계산한 값이다(지어내지 않음).
 * 마스터 콘솔(/master/education)도 같은 화면을 쓰며, 이때는 맨 위 선택 줄에서 고객사 › 본부 › 실 › 팀을 골라 본다.
 *
 * 화면은 두 가지로 본다.
 *  - 맞춤 체계도(기본): 고른 범위(회사·본부·실·팀)의 진단 결과로 교육과정 Pool 에서 필수·선택·강점 확산 과정을
 *    골라 짠 체계도(/admin/education/curriculum, 구성 규칙은 백엔드 services/curriculum.py).
 *  - 전체 과정 Pool: 104개 과정 전체와 과정별 추천 인원.
 */

// 한 반 권장 인원(권장 편성의 반 수 계산)
const CLASS_SIZE = 20;

const errText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

// 파일 내려받기(blob 응답) 실패: 본문이 Blob 이라 JSON 으로 풀어 서버 안내문을 꺼낸다
const blobErrText = async (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const j = JSON.parse(await data.text()) as { detail?: unknown };
      if (typeof j.detail === 'string') return j.detail;
    } catch { /* JSON 이 아니면 기본 문구 */ }
  }
  return errText(err, fallback);
};

// 트랙 열 이름(체계도 2단 머리). 레벨 전환은 카탈로그 값으로 붙인다.
const TRACK_LABEL: Record<string, string> = { A: '기본기', B: '실습', C: '현업 적용', D: '전수·확산' };
// 머리 1단: 개선 과정(A~C)과 강점 확산 과정(D)
const GROWTH_TRACKS = ['A', 'B', 'C'];

const levelText = (from: number | null, to: number | string | null) =>
  typeof to === 'number' ? `Lv.${from}→${to}` : (to ? String(to) : '');

interface Picked { comp: string; sub: string; track: string; c: CatalogCourse }
interface PickedItem { comp: CurriculumCompetency; row: CurriculumRow; item: CurriculumItem }

type View = 'tailored' | 'pool';

// 맞춤 체계도 구분 이름(필수·선택·강점 확산)
const TIER_LABEL: Record<CurriculumTier, string> = { required: '필수', elective: '선택', strength: '강점' };
const TIER_LONG: Record<CurriculumTier, string> = { required: '필수 과정', elective: '선택 과정', strength: '강점 확산 과정' };
// 레벨 분포 막대 색: Lv.1(가장 진한 네이비) → Lv.4(밝은 파랑)
const LEVEL_COLORS = ['#1C2B4A', '#2E4A85', '#4F86F7', '#8FB2FB'];

/** 하위역량의 레벨 분포 막대(Lv.1~4) */
function LevelBar({ dist, measured }: { dist: Record<string, number>; measured: number }) {
  return (
    <div className="fa-edu-lvbar" title={['1', '2', '3', '4'].map((k) => `Lv.${k} ${dist[k] || 0}명`).join(' · ')}>
      <div className="bar">
        {['1', '2', '3', '4'].map((k, i) => {
          const n = dist[k] || 0;
          return n > 0 ? <i key={k} style={{ width: `${(n / Math.max(1, measured)) * 100}%`, background: LEVEL_COLORS[i] }} /> : null;
        })}
      </div>
      <span>측정 {measured}명</span>
    </div>
  );
}

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


function EducationMap() {
  // 조회 범위: 마스터는 고객사 › 본부 › 실 › 팀, HR(대리 포함)은 자기 회사의 본부 › 실 › 팀
  const scope = useScope({ allowAllCompanies: false });
  const { companyId, orgUnitId } = scope;
  const [summary, setSummary] = useState<EducationSummary | null>(null);
  const [catalog, setCatalog] = useState<EducationCatalog | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 보기: 맞춤 체계도(기본) / 전체 과정 Pool
  const [view, setView] = useState<View>('tailored');
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [curLoading, setCurLoading] = useState(true);
  const [curError, setCurError] = useState('');
  const [pickedItem, setPickedItem] = useState<PickedItem | null>(null);

  // 요약·카탈로그: 고른 범위(회사·조직)로
  const load = useCallback(async () => {
    if (!companyId) { setLoading(scope.loading); return; }
    setLoading(true);
    setError('');
    try {
      const q = { company_id: companyId, org_unit_id: orgUnitId || undefined };
      const [res, cat] = await Promise.all([fetchEducationSummary(q), fetchEducationCatalog(q)]);
      setSummary(res);
      setCatalog(cat);
      setPicked(null);
    } catch (err) {
      setError(errText(err, '교육 데이터를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [companyId, orgUnitId, scope.loading]);

  useEffect(() => { load(); }, [load]);

  // 맞춤 체계도: 같은 범위로 다시 구성(조직을 고르면 백엔드가 회사 전체를 비교 기준으로 쓴다)
  const loadCurriculum = useCallback(async () => {
    if (!companyId) { setCurLoading(scope.loading); return; }
    setCurLoading(true);
    setCurError('');
    try {
      const res = await fetchCurriculum({ company_id: companyId, org_unit_id: orgUnitId || undefined });
      setCurriculum(res);
      setPickedItem(null);
    } catch (err) {
      setCurError(errText(err, '맞춤 체계도를 불러오지 못했습니다.'));
    } finally {
      setCurLoading(false);
    }
  }, [companyId, orgUnitId, scope.loading]);

  useEffect(() => { loadCurriculum(); }, [loadCurriculum]);

  const tracks = catalog?.tracks || [];
  const growthTracks = tracks.filter((t) => GROWTH_TRACKS.includes(t.track));
  const strengthTracks = tracks.filter((t) => !GROWTH_TRACKS.includes(t.track));
  const orderedTracks = [...growthTracks, ...strengthTracks];
  const trackOf = (t: string) => tracks.find((x) => x.track === t);

  const cohorts = useMemo(() => (summary?.courses || []).filter((c) => c.cohort), [summary]);
  const strengthCourses = useMemo(
    () => (summary?.courses || []).filter((c) => c.strength > 0).sort((a, b) => b.strength - a.strength),
    [summary],
  );

  const companyName = scope.companyName;

  const completed = summary?.completed ?? 0;
  const participants = summary?.participants ?? 0;
  const pct = (n: number) => (completed > 0 ? Math.round((n / completed) * 100) : 0);

  // 맞춤 체계도 CSV: 역량, 하위역량, 구분, 트랙, 과정, 교육목표, 대상 인원, 근거
  const exportCurriculum = () => {
    if (!curriculum || curriculum.status !== 'ok') return;
    const rows: (string | number)[][] = [['역량', '하위역량', '구분', '트랙', '과정', '교육목표', '대상 인원', '근거']];
    curriculum.competencies.forEach((c) => c.rows.forEach((r) => r.items.forEach((it) => {
      rows.push([c.name, r.sub, TIER_LABEL[it.tier], it.track, it.course, it.goal, it.people, it.reason]);
    })));
    const d = new Date().toISOString().slice(0, 10);
    downloadCsv(`맞춤_교육체계도_${(scope.label || companyName || '').replace(/ › /g, '_')}_${d}.csv`, rows);
  };

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
        eyebrow={scope.isMaster ? `마스터 · ${scope.label || '고객사 선택'}` : (scope.label || undefined)}
        title="교육 체계도"
        desc={view === 'tailored'
          ? '고른 회사·조직의 진단 결과로 교육과정 Pool에서 과정을 골라 체계도를 구성합니다.'
          : '진단 결과로 추천된 과정을 역량 × 트랙으로 모았습니다. 숫자는 그 과정을 추천받은 인원입니다.'}
        actions={view === 'tailored' ? (
          <button type="button" className="fa-btn primary" onClick={exportCurriculum}
            disabled={!curriculum || curriculum.status !== 'ok'}>
            <Download /> 구성 근거 CSV
          </button>
        ) : (
          <button type="button" className="fa-btn primary" onClick={exportPlan} disabled={!summary || summary.courses.length === 0}>
            <Download /> 편성안 CSV 내려받기
          </button>
        )}
        kpis={summary ? [
          { label: '대상자', value: participants, unit: '명', detail: scope.label || '' },
          {
            label: '진단 완료', value: completed, unit: '명',
            detail: <div className="fa-bar"><i style={{ width: `${participants ? Math.round((completed / participants) * 100) : 0}%` }} /></div>,
          },
          { label: '추천 과정', value: summary.courses.length, unit: '개', detail: '추천받은 사람이 1명 이상인 과정' },
          { label: '차수 개설 권장', value: cohorts.length, unit: '개', detail: `추천 ${summary.cohort_min}명 이상` },
        ] : undefined}
      />

      {/* 조회 범위: [고객사] › [본부] › [실] › [팀] */}
      <ScopeFilter scope={scope} />

      {/* 보기 전환: 맞춤 체계도 / 전체 과정 Pool */}
      <div className="fa-edu-switch" role="tablist" aria-label="체계도 보기">
        <button type="button" role="tab" aria-selected={view === 'tailored'} className={view === 'tailored' ? 'on' : ''}
          onClick={() => setView('tailored')}>맞춤 체계도</button>
        <button type="button" role="tab" aria-selected={view === 'pool'} className={view === 'pool' ? 'on' : ''}
          onClick={() => setView('pool')}>전체 과정 Pool</button>
      </div>

      {view === 'tailored' && (
        curError ? <div className="fa-error" style={{ marginBottom: 20 }}>{curError}</div>
        : curLoading || !curriculum ? (
          <div className="fa-empty"><Loader2 className="inline h-5 w-5 animate-spin" /> 맞춤 체계도를 구성하는 중입니다…</div>
        ) : curriculum.status !== 'ok' ? (
          <div className="fa-card pad fa-section">
            <div className="fa-empty">
              진단을 마친 사람이 {curriculum.n_reports}명이라 맞춤 체계도를 만들 수 없습니다(최소 {curriculum.min_reports}명).<br />
              진단이 더 진행되면 자동으로 구성됩니다.
              <div style={{ marginTop: 16 }}>
                <button type="button" className="fa-btn" onClick={() => setView('pool')}>전체 과정 Pool 보기</button>
              </div>
            </div>
          </div>
        ) : (
          <TailoredMap
            curriculum={curriculum}
            companyId={companyId}
            orgUnitId={orgUnitId}
            isMaster={scope.isMaster}
            label={scope.label || companyName}
            compared={!!orgUnitId}
            onPick={setPickedItem}
            picked={pickedItem}
          />
        )
      )}

      {/* 맞춤 체계도 과정 팝업 */}
      {view === 'tailored' && pickedItem && (
        <div className="fa-modal-bg" role="presentation" onClick={() => setPickedItem(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setPickedItem(null); }}>
          <div className="fa-modal fa-edu-detail on" role="dialog" aria-modal="true" aria-label={pickedItem.item.course}
            onClick={(e) => e.stopPropagation()}>
            <div className="top">
              <span className="trk">{pickedItem.item.track}</span>
              <div className="tt">
                <b>{pickedItem.item.course}</b>
                <span>
                  <span className={`fa-edu-tier ${pickedItem.item.tier}`}>{TIER_LONG[pickedItem.item.tier]}</span>
                  {' '}{pickedItem.comp.name} · {pickedItem.row.sub} · {TRACK_LABEL[pickedItem.item.track] || pickedItem.item.track}
                </span>
              </div>
              <button type="button" className="fa-btn sm ghost" autoFocus onClick={() => setPickedItem(null)}>닫기</button>
            </div>
            <dl>
              <div><dt>교육목표</dt><dd>{pickedItem.item.goal}</dd></div>
              <div><dt>학습 방식</dt><dd>{pickedItem.item.format || '–'}</dd></div>
              <div><dt>구성 근거</dt><dd>{pickedItem.item.reason} · 대상 {pickedItem.item.people}명</dd></div>
              <div>
                <dt>수준 분포</dt>
                <dd>
                  <LevelBar dist={pickedItem.row.dist} measured={pickedItem.row.measured} />
                  <span className="fa-muted" style={{ fontSize: 13 }}>
                    {['1', '2', '3', '4'].map((k) => `Lv.${k} ${pickedItem.row.dist[k] || 0}명`).join(' · ')}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {error && <div className="fa-error" style={{ marginBottom: 20 }}>{error}</div>}

      {loading ? (
        <div className="fa-empty"><Loader2 className="inline h-5 w-5 animate-spin" /> 불러오는 중입니다…</div>
      ) : !summary || !catalog ? null : (
        <>
          {view === 'pool' && (
          <div className="fa-card pad fa-section">
            <div className="fa-cap">
              <div>
                <h3>전체 과정 Pool</h3>
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
          )}

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

/** 맞춤 체계도 포스터: 세로 역량(집중 먼저) × 하위역량, 가로 트랙 A~C(역량 향상) · D(강점 확산) */
function TailoredMap({ curriculum, companyId, orgUnitId, isMaster, label, compared, onPick, picked }: {
  curriculum: Curriculum;
  companyId: string | null;
  orgUnitId: string | null;
  isMaster: boolean;
  label: string;
  compared: boolean;
  onPick: (p: PickedItem) => void;
  picked: PickedItem | null;
}) {
  const [showRules, setShowRules] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxError, setXlsxError] = useState('');
  // 체계도 엑셀: 서버가 화면 포스터와 같은 서식의 xlsx 를 만든다(2시트에 구성 근거). HR·대리는 회사가 정해져 있어 company_id 생략
  const downloadXlsx = async () => {
    setXlsxBusy(true);
    setXlsxError('');
    try {
      await downloadCurriculumExcel({
        company_id: isMaster && companyId ? companyId : undefined,
        org_unit_id: orgUnitId || undefined,
      });
    } catch (err) {
      setXlsxError(await blobErrText(err, '체계도 엑셀을 만들지 못했습니다.'));
    } finally {
      setXlsxBusy(false);
    }
  };
  const tracks = curriculum.tracks;
  const growth = tracks.filter((t) => GROWTH_TRACKS.includes(t.track));
  const strength = tracks.filter((t) => !GROWTH_TRACKS.includes(t.track));
  const ordered = [...growth, ...strength];
  const counts = curriculum.counts || { required: 0, elective: 0, strength: 0 };
  const r = curriculum.rules;
  const pct = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;

  return (
    <div className="fa-card pad fa-section">
      <div className="fa-cap">
        <div>
          <h3>{label} 맞춤 리더십 교육체계</h3>
          {curriculum.summary && <p>{curriculum.summary}</p>}
        </div>
        <div className="fa-edu-cur-actions">
          <button type="button" className="fa-btn primary" onClick={downloadXlsx} disabled={xlsxBusy}>
            {xlsxBusy ? <Loader2 className="animate-spin" /> : <Download />} 체계도 엑셀 다운로드
          </button>
          <div className="fa-edu-legend">
            <span><i className="lg req" />필수</span>
            <span><i className="lg ele" />선택</span>
            <span><i className="lg str" />강점 확산</span>
          </div>
        </div>
      </div>
      {xlsxError && <div className="fa-error" style={{ marginBottom: 12 }}>{xlsxError}</div>}

      <div className="fa-edu-cur-meta">
        <span className="fa-chip navy">필수 {counts.required}</span>
        <span className="fa-chip tint">선택 {counts.elective}</span>
        <span className="fa-chip fa-edu-chip-str">강점 확산 {counts.strength}</span>
        <span className="fa-muted">
          진단 완료 {curriculum.n_reports}명 기준 · 과정은 교육과정 Pool에서 진단 결과에 따라 자동 구성{compared ? ' · 회사 전체와 비교' : ''}
        </span>
        <button type="button" className="fa-btn sm ghost" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}>
          구성 규칙 {showRules ? '접기' : '보기'}
        </button>
      </div>
      {showRules && (
        <div className="fa-note fa-edu-rules">
          <b>이렇게 구성합니다</b>
          <ul>
            <li>역량별 평균이 낮은 {r.focus_top ?? 2}개를 집중 역량으로 봅니다(평균 {r.focus_max_avg ?? 3}점 미만일 때, 조직을 고르면 회사 전체보다 낮을 때).</li>
            <li>필수: 집중 역량에서 Lv.1~3인 사람이 {pct(r.required_ratio)} 이상인 하위역량</li>
            <li>선택: Lv.1~3인 사람이 {pct(r.elective_ratio)} 이상인 하위역량</li>
            <li>강점 확산(D): Lv.4인 사람이 {r.strength_min_n ?? 2}명 이상이고 {pct(r.strength_ratio)} 이상인 하위역량</li>
            <li>트랙: 개선 대상 중 가장 많은 수준에 맞춥니다(Lv.1 A · Lv.2 B · Lv.3 C).</li>
            <li>진단을 마친 사람이 {curriculum.min_reports}명 미만이면 체계도를 만들지 않습니다.</li>
          </ul>
        </div>
      )}

      <p className="fa-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>과정을 누르면 교육목표와 구성 근거가 팝업으로 열립니다.</p>

      <div className="fa-edu-poster-wrap">
        <div className="fa-edu-poster fa-edu-cur" style={{ gridTemplateColumns: `132px 200px repeat(${ordered.length}, minmax(150px, 1fr))` }}>
          <div className="band corner" style={{ gridColumn: 'span 2', gridRow: 'span 2' }}><b>역량</b></div>
          {growth.length > 0 && (
            <div className="band" style={{ gridColumn: `span ${growth.length}` }}>역량 향상 과정</div>
          )}
          {strength.length > 0 && (
            <div className="band str" style={{ gridColumn: `span ${strength.length}` }}>강점 확산 과정</div>
          )}
          {ordered.map((t) => (
            <div key={t.track} className="sub">
              <b><span className="trk">{t.track}</span>{TRACK_LABEL[t.track] || t.track} <em>{levelText(t.from_level, t.to_level)}</em></b>
              {t.format && <span>{t.format}</span>}
            </div>
          ))}

          {curriculum.competencies.map((comp, ci) => {
            const alt = ci % 2 ? ' alt' : '';
            const focus = comp.priority === 'focus';
            const span = Math.max(1, comp.rows.length);
            return (
              <React.Fragment key={comp.key}>
                <div className={`ccomp${focus ? ' focus' : ''}`} style={{ gridRow: `span ${span}` }}>
                  {focus && <span className="badge">집중 역량</span>}
                  <b>{comp.name}</b>
                  <span>평균 {comp.avg !== null ? comp.avg.toFixed(1) : '–'}</span>
                  {comp.baseline_avg !== null && <span>회사 {comp.baseline_avg.toFixed(1)}</span>}
                </div>
                {comp.rows.length === 0 ? (
                  <>
                    <div className={`subname${alt} last`}>구성된 과정 없음</div>
                    <div className={`cell${alt} last empty`} style={{ gridColumn: `span ${ordered.length}` }}>
                      기준을 넘는 개선·강점 하위역량이 없어 현재 수준을 유지합니다.
                    </div>
                  </>
                ) : comp.rows.map((row, ri) => {
                  const last = ri === comp.rows.length - 1 ? ' last' : '';
                  return (
                    <React.Fragment key={row.sub}>
                      <div className={`subname${alt}${last} with-bar`}>
                        <b>{row.sub}</b>
                        <LevelBar dist={row.dist} measured={row.measured} />
                      </div>
                      {ordered.map((t) => {
                        const items = row.items.filter((it) => it.track === t.track);
                        const strCol = GROWTH_TRACKS.includes(t.track) ? '' : ' strcol';
                        return (
                          <div key={t.track} className={`cell${alt}${last}${strCol}`}>
                            {items.map((it) => {
                              const on = picked !== null && picked.comp.key === comp.key && picked.row.sub === row.sub && picked.item.track === it.track;
                              return (
                                <button key={`${it.tier}-${it.track}`} type="button"
                                  className={`fa-edu-pill cur ${it.tier}${on ? ' on' : ''}`}
                                  title={`교육목표: ${it.goal}`} aria-pressed={on}
                                  onClick={() => onPick({ comp, row, item: it })}>
                                  <span className="ft"><span className="tag">{TIER_LABEL[it.tier]}</span><span className="n">{it.people}명</span></span>
                                  <span className="nm">{it.course}</span>
                                </button>
                              );
                            })}
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
  );
}

// useScope 가 주소(?company=)를 읽으므로 Suspense 로 감싼다
export default function EducationMapPage() {
  return (
    <Suspense fallback={null}>
      <EducationMap />
    </Suspense>
  );
}
