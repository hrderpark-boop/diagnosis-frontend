import apiClient from "./api";

// ===== Types =====

export interface FrameworkIndicator {
  key: string;
  name: string;
  levels: Record<string, string>;
  examples: Record<string, string>;
}

export interface FrameworkCompetency {
  key: string;
  name: string;
  order: number;
  description: string;
  classification_keywords: string[];
  indicators: FrameworkIndicator[];
}

export interface FrameworkScoring {
  levels: number[];
  max_score: number;
  methodology: string;
}

export interface FrameworkData {
  framework_id: string;
  name: string;
  version: string;
  scoring: FrameworkScoring;
  competencies: FrameworkCompetency[];
}

export interface FrameworkTopic {
  key: string;
  name: string;
  order: number;
}

export interface FrameworkTopics {
  framework_id: string;
  topics: FrameworkTopic[];
  total_count: number;
}

// ===== Module-level cache =====

let _frameworkCache: FrameworkData | null = null;
let _frameworkPromise: Promise<FrameworkData> | null = null;

let _topicsCache: FrameworkTopics | null = null;
let _topicsPromise: Promise<FrameworkTopics> | null = null;

// ===== Fetchers (with in-flight deduplication) =====

export async function fetchFramework(): Promise<FrameworkData> {
  if (_frameworkCache) return _frameworkCache;
  if (_frameworkPromise) return _frameworkPromise;

  _frameworkPromise = apiClient
    .get<FrameworkData>("/framework")
    .then((res) => {
      _frameworkCache = res.data;
      _frameworkPromise = null;
      return res.data;
    })
    .catch((err) => {
      _frameworkPromise = null;
      throw err;
    });

  return _frameworkPromise;
}

export async function fetchTopics(): Promise<FrameworkTopics> {
  if (_topicsCache) return _topicsCache;
  if (_topicsPromise) return _topicsPromise;

  _topicsPromise = apiClient
    .get<FrameworkTopics>("/framework/topics")
    .then((res) => {
      _topicsCache = res.data;
      _topicsPromise = null;
      return res.data;
    })
    .catch((err) => {
      _topicsPromise = null;
      throw err;
    });

  return _topicsPromise;
}

// ===== Derived helpers =====

/** 역량 한국어 이름 리스트 (순서 보장). chat 메달 UI용. */
export async function getTopicNames(): Promise<string[]> {
  const topics = await fetchTopics();
  return [...topics.topics].sort((a, b) => a.order - b.order).map((t) => t.name);
}

/** key → 한국어명 맵. report의 competencyLabels 대체. */
export async function getKeyToNameMap(): Promise<Record<string, string>> {
  const framework = await fetchFramework();
  return Object.fromEntries(framework.competencies.map((c) => [c.key, c.name]));
}

/** key → 지표 이름 배열 맵. report의 SUB_COMPETENCIES 대체. */
export async function getSubCompetenciesMap(): Promise<Record<string, string[]>> {
  const framework = await fetchFramework();
  return Object.fromEntries(
    framework.competencies.map((c) => [c.key, c.indicators.map((i) => i.name)])
  );
}
