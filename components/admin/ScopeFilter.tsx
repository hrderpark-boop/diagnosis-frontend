"use client";

/**
 * 조회 범위 선택 줄: [고객사] › [본부] › [실] › [팀]
 *
 * 마스터 화면(/master/*)은 고객사부터 고르고, 고른 회사의 본부 → 실 → 팀을 순서대로 고른다.
 * HR 화면(/admin/*, 마스터 대리 포함)은 자기 회사로 고정이라 고객사 칸 없이 본부부터 보인다.
 * 조직 코드·전체 참여자·전체 리포트·교육 체계도·개인별 추천 과정이 모두 이 부품 하나를 쓴다.
 *
 * 사용:
 *   const scope = useScope({ allowAllCompanies: true });
 *   <ScopeFilter scope={scope} />
 *   fetchSomething({ company_id: scope.companyId ?? undefined, org_unit_id: scope.orgUnitId ?? undefined })
 *
 * 고객사 선택은 주소(?company=)와 브라우저(fm_master_company)에 기억해 화면을 옮겨도 유지된다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { fetchCompanies, fetchMe, fetchOrgUnits, OrgTree } from '@/lib/adminApi';
import { MASTER_BASE } from '@/lib/adminRoutes';

const LS_KEY = 'fm_master_company';
const ALL = '__all__';

export interface CompanyOption { id: string; name: string; code: string }

export interface ScopeState {
  /** 마스터 화면이면 true(고객사 칸이 보임) */
  isMaster: boolean;
  /** 고른 고객사 id. 마스터가 '전체 고객사'를 고르면 null */
  companyId: string | null;
  companyName: string;
  companies: CompanyOption[];
  /** 고른 회사의 조직 트리(없으면 null) */
  tree: OrgTree | null;
  divisionId: string;
  officeId: string;
  teamId: string;
  /** 가장 깊이 고른 조직 단위(없으면 null = 회사 전체) */
  orgUnitId: string | null;
  /** 지금 범위를 사람이 읽는 말로(예: 하이케어 데모 › 영업본부 › 마케팅실) */
  label: string;
  /** 회사·조직 정보를 아직 불러오는 중 */
  loading: boolean;
  allowAllCompanies: boolean;
  setCompany: (id: string | null) => void;
  setDivision: (id: string) => void;
  setOffice: (id: string) => void;
  setTeam: (id: string) => void;
  /** 조직 구조가 바뀐 뒤(명단 업로드 등) 다시 불러오기 */
  reloadTree: () => void;
}

const readLS = (): string | null => {
  try { return window.localStorage.getItem(LS_KEY); } catch { return null; }
};
const writeLS = (v: string) => {
  try { window.localStorage.setItem(LS_KEY, v); } catch { /* 저장 못 해도 화면은 동작 */ }
};

export function useScope(opts: { allowAllCompanies?: boolean } = {}): ScopeState {
  const allowAllCompanies = !!opts.allowAllCompanies;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMaster = !!pathname?.startsWith(MASTER_BASE);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [hrCompany, setHrCompany] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  const [loaded, setLoaded] = useState(false);
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [treeFor, setTreeFor] = useState<string | null>(null);
  const [treeTick, setTreeTick] = useState(0);
  const [divisionId, setDivisionId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [teamId, setTeamId] = useState('');

  // 마스터: 고객사 목록 / HR(대리 포함): 자기 회사
  useEffect(() => {
    let alive = true;
    if (isMaster) {
      fetchCompanies()
        .then((rows: Array<{ id: string; name: string; code: string }>) => {
          if (!alive) return;
          const list = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
          setCompanies(list.map((r) => ({ id: r.id, name: r.name, code: r.code })));
        })
        .catch(() => { /* 401 은 인터셉터가 처리 */ })
        .finally(() => { if (alive) setLoaded(true); });
    } else {
      fetchMe()
        .then((me) => { if (alive) setHrCompany({ id: me.company_id, name: me.company_name || '' }); })
        .catch(() => {})
        .finally(() => { if (alive) setLoaded(true); });
    }
    return () => { alive = false; };
  }, [isMaster]);

  // 마스터의 현재 고객사: 주소 → 브라우저 기억 → (전체 허용이면 전체, 아니면 첫 회사)
  const urlCompany = searchParams?.get('company') || '';
  const companyId: string | null = useMemo(() => {
    if (!isMaster) return hrCompany.id;
    if (!companies.length) return null;
    const has = (id: string) => companies.some((c) => c.id === id);
    if (urlCompany === ALL && allowAllCompanies) return null;
    if (urlCompany && has(urlCompany)) return urlCompany;
    const remembered = typeof window !== 'undefined' ? readLS() : null;
    if (remembered && has(remembered)) return remembered;
    return allowAllCompanies ? null : companies[0].id;
  }, [isMaster, hrCompany.id, companies, urlCompany, allowAllCompanies]);

  const companyName = isMaster
    ? (companies.find((c) => c.id === companyId)?.name || (companyId ? '' : '전체 고객사'))
    : hrCompany.name;

  // 고른 회사의 조직 트리
  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    fetchOrgUnits(companyId)
      .then((t) => { if (alive) { setTree(t); setTreeFor(companyId); } })
      .catch(() => { if (alive) { setTree(null); setTreeFor(companyId); } });
    return () => { alive = false; };
  }, [companyId, treeTick]);
  const currentTree = companyId && treeFor === companyId ? tree : null;

  const setCompany = useCallback((id: string | null) => {
    setDivisionId(''); setOfficeId(''); setTeamId('');
    if (!isMaster) return;
    const next = id || (allowAllCompanies ? ALL : '');
    if (id) writeLS(id);
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (next) params.set('company', next); else params.delete('company');
    router.replace(`${pathname}?${params.toString()}`);
  }, [isMaster, allowAllCompanies, searchParams, router, pathname]);

  // 첫 진입에도 고른 회사를 기억해 두면 다른 화면으로 옮겨도 같은 회사가 이어진다
  useEffect(() => {
    if (isMaster && companyId) writeLS(companyId);
  }, [isMaster, companyId]);

  const setDivision = useCallback((id: string) => { setDivisionId(id); setOfficeId(''); setTeamId(''); }, []);
  const setOffice = useCallback((id: string) => { setOfficeId(id); setTeamId(''); }, []);
  const setTeam = useCallback((id: string) => { setTeamId(id); }, []);
  const reloadTree = useCallback(() => setTreeTick((n) => n + 1), []);

  // 회사가 바뀌면 조직 선택을 비운다(주소로 회사가 바뀐 경우 포함)
  const [prevCompany, setPrevCompany] = useState<string | null>(companyId);
  if (prevCompany !== companyId) {
    setPrevCompany(companyId);
    setDivisionId(''); setOfficeId(''); setTeamId('');
  }

  const division = currentTree?.divisions.find((d) => d.id === divisionId);
  const office = division?.offices.find((o) => o.id === officeId);
  const team = (office ? office.teams : division?.teams)?.find((t) => t.id === teamId);
  const orgUnitId = teamId || officeId || divisionId || null;
  const label = [companyName, division?.name, office?.name, team?.name].filter(Boolean).join(' › ');

  return {
    isMaster, companyId, companyName, companies, tree: currentTree,
    divisionId, officeId, teamId, orgUnitId, label,
    loading: !loaded || (!!companyId && treeFor !== companyId),
    allowAllCompanies,
    setCompany, setDivision, setOffice, setTeam, reloadTree,
  };
}

/** 선택 줄 UI. extra 는 줄 오른쪽 끝(검색창·버튼 등)에 붙는다 */
export function ScopeFilter({ scope, extra, hideOrg }: { scope: ScopeState; extra?: React.ReactNode; hideOrg?: boolean }) {
  const { isMaster, companies, companyId, tree, divisionId, officeId, teamId } = scope;
  const division = tree?.divisions.find((d) => d.id === divisionId);
  const offices = division?.offices ?? [];
  const office = offices.find((o) => o.id === officeId);
  // 팀 목록: 실을 골랐으면 그 실의 팀, 아니면 본부 직속 팀(실이 없을 때) 또는 본부 아래 모든 팀
  const teams = office ? office.teams
    : division ? (offices.length ? [...division.teams, ...offices.flatMap((o) => o.teams)] : division.teams)
    : [];
  const hasOrg = !!tree && tree.divisions.length > 0;

  return (
    <div className="fa-scope" role="group" aria-label="조회 범위">
      {isMaster && (
        <label className="fa-scope-item">
          <span>고객사</span>
          <select className="fa-select" value={companyId ?? (scope.allowAllCompanies ? '__all__' : '')}
            onChange={(e) => scope.setCompany(e.target.value === '__all__' ? null : e.target.value)}
            disabled={!companies.length}>
            {scope.allowAllCompanies && <option value="__all__">전체 고객사</option>}
            {!companies.length && <option value="">고객사 없음</option>}
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </label>
      )}

      {!hideOrg && (
        <>
          {isMaster && <ChevronRight className="fa-scope-sep" aria-hidden="true" />}
          <label className="fa-scope-item">
            <span>본부</span>
            <select className="fa-select" value={divisionId} onChange={(e) => scope.setDivision(e.target.value)}
              disabled={!companyId || !hasOrg}>
              <option value="">{!companyId ? '고객사를 먼저 고르세요' : hasOrg ? '전체 본부' : '조직 코드 없음'}</option>
              {tree?.divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.code}){d.is_active ? '' : ' · 사용 중지'}</option>
              ))}
            </select>
          </label>
          <ChevronRight className="fa-scope-sep" aria-hidden="true" />
          <label className="fa-scope-item">
            <span>실</span>
            <select className="fa-select" value={officeId} onChange={(e) => scope.setOffice(e.target.value)}
              disabled={!division || offices.length === 0}>
              <option value="">{!division ? '본부를 먼저 고르세요' : offices.length ? '전체 실' : '실 없음'}</option>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
            </select>
          </label>
          <ChevronRight className="fa-scope-sep" aria-hidden="true" />
          <label className="fa-scope-item">
            <span>팀</span>
            <select className="fa-select" value={teamId} onChange={(e) => scope.setTeam(e.target.value)}
              disabled={!division || teams.length === 0}>
              <option value="">{!division ? '본부를 먼저 고르세요' : teams.length ? '전체 팀' : '팀 없음'}</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
            </select>
          </label>
        </>
      )}
      {extra && <div className="fa-scope-extra">{extra}</div>}
    </div>
  );
}

export default ScopeFilter;
