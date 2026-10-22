"use client";

/**
 * 리포트 마지막 섹션 "다음 단계".
 *  1) 강화 역량 · 개선 필요 역량: 어떤 역량이 왜 도출되었는지(점수 순위, 하위역량, 진단 근거, 대화 인용).
 *  2) 추천 교육과정: 위 두 역량과 연결해 과정별 추천 사유를 구체적으로.
 * 값은 모두 백엔드 리포트(radar_chart · details · course_recommendation) 그대로 쓰고,
 * 근거가 비어 있으면 비어 있다고 말한다(문장을 지어내지 않음).
 */

type Comp = { key: string; name: string };
type Detail = {
  score?: number | null;
  sub_scores?: Record<string, number> | null;
  strength_point?: string | null;
  growth_point?: string | null;
  gap_analysis?: unknown;
  situational_pattern?: string | null;
  reasoning_process?: Record<string, string> | null;
  evidence_list?: string[] | null;
};
type Course = {
  type?: string; is_strength?: boolean; track?: string; track_format?: string; category?: string;
  course?: string; subtitle?: string; sub_competency?: string; level?: number; score?: number;
  reason_overview?: string; reason_bullets?: string[]; bei_citation?: string; vod_url?: string;
};
export type CourseRecommendation = { intro?: string; growth?: Course[]; strength?: Course | null };

const text = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['summary', 'text', 'gap', 'description']) if (typeof o[k] === 'string') return (o[k] as string).trim();
  }
  return '';
};
const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);
const reasoningOf = (d: Detail | undefined, part: 'action' | 'result' | 'situation') => {
  const rp = d?.reasoning_process;
  if (!rp || typeof rp !== 'object') return '';
  const k = Object.keys(rp).find((x) => x.toLowerCase().includes(part));
  return k ? text(rp[k]) : '';
};

type Ranked = { comp: Comp; score: number; subAvg: number; subs: Array<[string, number]>; detail?: Detail };

function rank(competencies: Comp[], radar: Record<string, number | null> | undefined, details: Record<string, Detail> | undefined): Ranked[] {
  return competencies
    .map((c): Ranked | null => {
      const raw = radar?.[c.name] ?? radar?.[c.key];
      const detail = details?.[c.key] ?? details?.[c.name];
      const subs = Object.entries(detail?.sub_scores ?? {}).filter((e): e is [string, number] => typeof e[1] === 'number');
      const subAvg = subs.length ? subs.reduce((a, [, v]) => a + v, 0) / subs.length : 0;
      return typeof raw === 'number' ? { comp: c, score: raw, subAvg, subs, detail } : null;
    })
    .filter((x): x is Ranked => x !== null)
    // 대역량 점수 → 같으면 하위역량 평균으로 순위
    .sort((a, b) => (b.score - a.score) || (b.subAvg - a.subAvg));
}

function CompetencyCard({ kind, r, all, maxScore }: { kind: 'strength' | 'growth'; r: Ranked; all: Ranked[]; maxScore: number }) {
  const isStrength = kind === 'strength';
  const tie = all.filter((x) => x.score === r.score).length > 1;
  const subsSorted = [...r.subs].sort((a, b) => (isStrength ? b[1] - a[1] : a[1] - b[1])).slice(0, 2);
  const why = isStrength
    ? text(r.detail?.strength_point) || text(r.detail?.situational_pattern) || reasoningOf(r.detail, 'action')
    : text(r.detail?.growth_point) || text(r.detail?.gap_analysis) || reasoningOf(r.detail, 'result');
  const quote = (r.detail?.evidence_list ?? []).find((q) => typeof q === 'string' && q.trim());

  return (
    <div className={`fm-card fm-next-comp ${kind}`}>
      <div className="head">
        <span className="tag">{isStrength ? '강화 역량' : '개선 필요 역량'}</span>
        <span className="fm-caption">{isStrength ? '지금의 강점을 더 키울 역량' : '다음 성장을 위해 먼저 보완할 역량'}</span>
      </div>
      <div className="nm">
        <b>{r.comp.name}</b>
        <span className="sc fm-report-fig">{r.score.toFixed(1)}<small>/ {maxScore.toFixed(1)}</small></span>
      </div>

      <dl className="why">
        <div>
          <dt>도출 기준</dt>
          <dd>
            5개 대역량 중 점수가 가장 {isStrength ? '높게' : '낮게'} 나타났습니다
            {tie && ` (점수가 같은 역량 중 하위역량 평균 ${r.subAvg.toFixed(1)}로 ${isStrength ? '가장 높음' : '가장 낮음'})`}.
          </dd>
        </div>
        {subsSorted.length > 0 && (
          <div>
            <dt>{isStrength ? '두드러진 하위역량' : '우선 보완할 하위역량'}</dt>
            <dd className="subs">
              {subsSorted.map(([n, v]) => <span key={n} className="fm-chip">{n} <b>{v.toFixed(1)}</b></span>)}
            </dd>
          </div>
        )}
        <div>
          <dt>진단 근거</dt>
          <dd>{why ? clip(why) : '이번 대화에서는 이 역량을 뒷받침하는 구체 근거가 충분히 확인되지 않았습니다.'}</dd>
        </div>
        {quote && (
          <div>
            <dt>대화 속 한 마디</dt>
            <dd className="quote">&ldquo;{clip(quote, 160)}&rdquo;</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export default function ReportNextStep({
  competencies, radar, details, maxScore, courseRec, courseIsDemo,
}: {
  competencies: Comp[];
  radar: Record<string, number | null> | undefined;
  details: Record<string, Detail> | undefined;
  maxScore: number;
  courseRec: CourseRecommendation | null;
  courseIsDemo: boolean;
}) {
  const ranked = rank(competencies, radar, details);
  const strength = ranked.length >= 2 ? ranked[0] : null;
  const growth = ranked.length >= 2 ? ranked[ranked.length - 1] : null;
  const courses: Course[] = courseRec ? [...(courseRec.growth ?? []), ...(courseRec.strength ? [courseRec.strength] : [])] : [];

  // 과정이 위 두 역량 중 어디와 이어지는지
  const linkOf = (c: Course): { label: string; cls: string } => {
    const isStr = c.is_strength || c.type === '강점 활용';
    const cat = (c.category ?? '').replace(/\s/g, '');
    if (isStr) return { label: strength && strength.comp.name.replace(/\s/g, '') === cat ? `강화 역량 · ${c.category} 연계` : `강점 활용 · ${c.category}`, cls: 'str' };
    if (growth && growth.comp.name.replace(/\s/g, '') === cat) return { label: `개선 필요 역량 · ${c.category} 연계`, cls: 'grw' };
    return { label: `보완 과정 · ${c.category}`, cls: 'grw2' };
  };

  return (
    <div className="fm-next">
      {/* 강화 · 개선 필요 역량 */}
      <div className="pdf-unit">
        {strength && growth ? (
          <div className="fm-next-comps">
            <CompetencyCard kind="strength" r={strength} all={ranked} maxScore={maxScore} />
            <CompetencyCard kind="growth" r={growth} all={ranked} maxScore={maxScore} />
          </div>
        ) : (
          <div className="fm-card fm-caption">측정된 역량이 2개 미만이라 강화·개선 필요 역량을 가르지 않았습니다.</div>
        )}
      </div>

      {/* 추천 교육과정: PDF 에서 페이지를 채우도록 머리와 과정을 각각 한 단위로 */}
      <div className="fm-next-courses">
        <div className="pdf-unit fm-card fm-next-courses-head" data-pdf-keep-next={courses.length > 0 ? '1' : undefined}>
        <div className="cap-head">
          <div>
            <div className="fm-eyebrow">Recommended Courses</div>
            <h3>
              다음 교육으로 이어 가기
              {courseIsDemo && <span className="fm-chip tint ml-3 align-middle">예시 데이터</span>}
            </h3>
          </div>
        </div>
        {courses.length > 0 ? (
          <>
            {courseRec?.intro && <p className="intro">{courseRec.intro}</p>}
          </>
        ) : (
          <p className="empty">
            추천 교육은 대화에서 근거가 확인된 하위역량이 3개 이상일 때 제공됩니다. 이번 진단에서는 근거가 부족해 과정 추천을 생략했습니다.
            {growth && ` 위의 개선 필요 역량(${growth.comp.name})을 다음 진단·코칭의 우선 주제로 삼기를 권합니다.`}
          </p>
        )}
        </div>
        {courses.length > 0 && (
            <ol className="list">
              {courses.map((c, i) => {
                const link = linkOf(c);
                return (
                  <li key={i} className="pdf-unit fm-card fm-next-course">
                    <div className="no fm-num">{String(i + 1).padStart(2, '0')}</div>
                    <div className="body">
                      <div className="top">
                        <span className={`link ${link.cls}`}>{link.label}</span>
                        {(c.track || c.track_format) && <span className="fm-caption">{[c.track && `${c.track}트랙`, c.track_format].filter(Boolean).join(' · ')}</span>}
                      </div>
                      <h4>
                        {c.vod_url ? <a href={c.vod_url} target="_blank" rel="noopener noreferrer">{c.course}</a> : c.course}
                      </h4>
                      {c.subtitle && <p className="goal">수료 후 기대 행동: {c.subtitle}</p>}
                      <div className="diag fm-caption">
                        진단 결과 {c.category} · {c.sub_competency}
                        {typeof c.level === 'number' && ` Lv.${c.level}`}
                        {typeof c.score === 'number' && ` (${c.score.toFixed(1)}점)`}
                      </div>
                      <div className="reason">
                        <div className="k">추천 사유</div>
                        {c.reason_overview && <p className="ov">{c.reason_overview}</p>}
                        {Array.isArray(c.reason_bullets) && c.reason_bullets.length > 0 && (
                          <ul>{c.reason_bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                        )}
                        {c.bei_citation && <p className="cite">진단 대화 근거 &ldquo;{c.bei_citation}&rdquo;</p>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
        )}
      </div>
    </div>
  );
}
