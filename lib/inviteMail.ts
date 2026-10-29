/**
 * 고객사 HR 에게 보내는 '참여 안내 및 관리자 계정 전달' 메일(제목·HTML·텍스트) 만들기.
 *
 * 구성: 인사·진단 안내 → 1. 접속 안내 → 2. HR 관리자 계정(표) → 3. 조직별 참여 코드(본부마다 표)
 *       → 4. 참여 방법 → 5. 첨부 파일 → 맺음·서명.
 * 메일 프로그램(Gmail·Outlook)에 붙여 넣어도 표가 유지되도록 인라인 스타일만 쓴다.
 * 사실이 아닌 내용(소요 시간·비용 등)은 넣지 않는다.
 */
import type { OrgTree } from './adminApi';

export interface InviteMailInput {
  companyName: string;
  participantUrl: string;
  hrLoginUrl: string;
  period: { start: string | null; end: string | null } | null;
  hrAccounts: { name: string | null; email: string; tempPassword?: string | null }[];
  tree: OrgTree | null;
  sender: { name: string | null; email: string } | null;
  hasPersonalCodes: boolean;
}

export interface InviteMail { subject: string; html: string; text: string }

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** YYYY-MM-DD → YYYY.MM.DD(요일) */
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}(${WEEK[dt.getDay()]})`;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 본부마다 표 한 장: 행 = (실, 팀, 참여 코드). 팀이 없는 실·본부는 그 단위 코드를 한 행으로. 사용 중인 단위만 */
export function orgCodeTables(tree: OrgTree | null) {
  if (!tree) return [];
  return tree.divisions.filter((d) => d.is_active).map((d) => {
    const rows: { office: string; team: string; code: string }[] = [];
    const directTeams = d.teams.filter((t) => t.is_active);
    directTeams.forEach((t) => rows.push({ office: '–', team: t.name, code: t.code }));
    d.offices.filter((o) => o.is_active).forEach((o) => {
      const teams = o.teams.filter((t) => t.is_active);
      if (teams.length) teams.forEach((t) => rows.push({ office: o.name, team: t.name, code: t.code }));
      else rows.push({ office: o.name, team: '–', code: o.code });
    });
    if (!rows.length) rows.push({ office: '–', team: '–', code: d.code });
    return { division: d.name, code: d.code, rows };
  });
}

export function buildInviteMail(input: InviteMailInput): InviteMail {
  const { companyName, participantUrl, hrLoginUrl, period, hrAccounts, tree, sender, hasPersonalCodes } = input;
  const subject = `[Find Me] ${companyName} 리더십 역량 진단 참여 안내 및 관리자 계정 전달`;
  const periodText = period?.start && period?.end ? `${fmtDay(period.start)} ~ ${fmtDay(period.end)}` : '추후 안내';
  const tables = orgCodeTables(tree);
  const files = [
    ...(hasPersonalCodes ? [`${companyName}_개인참여코드_${today()}.xlsx`] : []),
    `${companyName}_참여코드_${today()}.xlsx`,
  ];
  const howTo = hasPersonalCodes
    ? '참여자별 개인 참여 코드는 첨부한 엑셀 파일(개인 참여 코드)에 정리해 두었습니다. 개인 코드를 쓰면 이름·이메일이 명단과 일치해야 합니다.'
    : '참여자는 위 표에서 본인 소속 팀의 참여 코드를 입력하면 됩니다. 코드에 따라 회사와 소속이 자동으로 정해집니다.';

  // ── HTML(인라인 스타일) ──
  const S = {
    body: 'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:14px;line-height:1.7;color:#1F2937;',
    h: 'margin:24px 0 8px;font-size:15px;font-weight:700;color:#1C2B4A;',
    table: 'border-collapse:collapse;margin:6px 0 4px;font-size:13.5px;',
    th: 'border:1px solid #D9DEE7;background:#1C2B4A;color:#FFFFFF;padding:7px 12px;text-align:left;font-weight:600;',
    td: 'border:1px solid #D9DEE7;padding:7px 12px;',
    code: 'border:1px solid #D9DEE7;padding:7px 12px;font-weight:700;color:#1C2B4A;background:#EEF3FD;letter-spacing:.03em;',
    cap: 'caption-side:top;text-align:left;font-weight:700;color:#1C2B4A;padding:10px 0 4px;',
    note: 'margin:4px 0;color:#4B5563;font-size:13px;',
  };
  const accountRows = hrAccounts.length
    ? hrAccounts.map((a) => `<tr><td style="${S.td}">${esc(a.name || '담당자')}</td><td style="${S.td}">${esc(a.email)}</td><td style="${S.code}">${esc(a.tempPassword || '별도 전달')}</td></tr>`).join('')
    : `<tr><td style="${S.td}" colspan="3">발급 후 별도로 전달드리겠습니다.</td></tr>`;
  const orgHtml = tables.length
    ? tables.map((t) => `
<table style="${S.table}">
  <caption style="${S.cap}">${esc(t.division)} (본부 코드 ${esc(t.code)})</caption>
  <tr><th style="${S.th}">실</th><th style="${S.th}">팀</th><th style="${S.th}">참여 코드</th></tr>
  ${t.rows.map((r) => `<tr><td style="${S.td}">${esc(r.office)}</td><td style="${S.td}">${esc(r.team)}</td><td style="${S.code}">${esc(r.code)}</td></tr>`).join('')}
</table>`).join('')
    : `<p style="${S.note}">조직 코드는 등록 후 별도로 전달드리겠습니다.</p>`;

  const html = `<div style="${S.body}">
<p>${esc(companyName)} HR 담당자님, 안녕하십니까. 커넥트앤컴퍼니입니다.</p>
<p>${esc(companyName)} 리더십 역량 진단(Find Me) 진행을 위한 안내와 관리자 계정을 전달드립니다.<br>
Find Me는 AI 코치와의 심층 대화를 통해 리더십 역량을 진단하는 서비스이며, 진단 결과는 개인별 리포트와 조직별 분석·교육 추천으로 제공됩니다.<br>
${period?.start && period?.end ? `진단 기간은 <b>${esc(periodText)}</b>입니다.` : '진단 기간은 확정되는 대로 안내드리겠습니다.'}</p>

<p style="${S.h}">1. 접속 안내</p>
<table style="${S.table}">
  <tr><th style="${S.th}">구분</th><th style="${S.th}">주소</th></tr>
  <tr><td style="${S.td}">참여자 접속 주소</td><td style="${S.td}"><a href="${esc(participantUrl)}" style="color:#2E4A85;">${esc(participantUrl)}</a></td></tr>
  <tr><td style="${S.td}">HR 관리자 페이지</td><td style="${S.td}"><a href="${esc(hrLoginUrl)}" style="color:#2E4A85;">${esc(hrLoginUrl)}</a></td></tr>
</table>

<p style="${S.h}">2. HR 관리자 계정</p>
<table style="${S.table}">
  <tr><th style="${S.th}">이름</th><th style="${S.th}">아이디(이메일)</th><th style="${S.th}">임시 비밀번호</th></tr>
  ${accountRows}
</table>
<p style="${S.note}">첫 로그인 후 설정 메뉴에서 비밀번호를 꼭 변경해 주십시오. HR 관리자 페이지에서는 진단 현황, 조직별 결과, 교육 체계도와 개인별 추천 과정을 확인하실 수 있습니다.</p>

<p style="${S.h}">3. 조직별 참여 코드</p>
${orgHtml}

<p style="${S.h}">4. 참여 방법</p>
<p style="margin:4px 0;">참여자는 접속 주소(${esc(participantUrl)})에서 이름·이메일을 입력하고, <b>그룹 코드</b> 칸에 참여 코드를 입력하면 진단을 시작할 수 있습니다.<br>${esc(howTo)}</p>

<p style="${S.h}">5. 첨부 파일</p>
<ul style="margin:4px 0;padding-left:20px;">${files.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>

<p style="margin-top:24px;">추가 문의사항이나 의견이 있으시면 언제든 연락 주십시오.<br>감사합니다.</p>
<p style="margin-top:16px;color:#4B5563;">${esc(sender?.name || '담당자')}<br>커넥트앤컴퍼니${sender?.email ? `<br>${esc(sender.email)}` : ''}</p>
</div>`;

  // ── 텍스트(표는 단순 정렬) ──
  const line = (cells: string[], widths: number[]) =>
    cells.map((c, i) => c + ' '.repeat(Math.max(1, widths[i] - [...c].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)))).join(' ').trimEnd();
  const accLines = hrAccounts.length
    ? hrAccounts.map((a) => `  - ${a.name || '담당자'} / ${a.email} / 임시 비밀번호: ${a.tempPassword || '별도 전달'}`)
    : ['  - 발급 후 별도로 전달드리겠습니다.'];
  const orgLines = tables.length
    ? tables.flatMap((t) => [
      `  [${t.division}] 본부 코드 ${t.code}`,
      `    ${line(['실', '팀', '참여 코드'], [16, 16, 10])}`,
      ...t.rows.map((r) => `    ${line([r.office, r.team, r.code], [16, 16, 10])}`),
      '',
    ])
    : ['  조직 코드는 등록 후 별도로 전달드리겠습니다.', ''];
  const text = [
    `${companyName} HR 담당자님, 안녕하십니까. 커넥트앤컴퍼니입니다.`,
    '',
    `${companyName} 리더십 역량 진단(Find Me) 진행을 위한 안내와 관리자 계정을 전달드립니다.`,
    'Find Me는 AI 코치와의 심층 대화를 통해 리더십 역량을 진단하는 서비스이며, 진단 결과는 개인별 리포트와 조직별 분석·교육 추천으로 제공됩니다.',
    period?.start && period?.end ? `진단 기간: ${periodText}` : '진단 기간은 확정되는 대로 안내드리겠습니다.',
    '',
    '1. 접속 안내',
    `  - 참여자 접속 주소: ${participantUrl}`,
    `  - HR 관리자 페이지: ${hrLoginUrl}`,
    '',
    '2. HR 관리자 계정',
    ...accLines,
    '  ※ 첫 로그인 후 설정 메뉴에서 비밀번호를 꼭 변경해 주십시오.',
    '',
    '3. 조직별 참여 코드',
    ...orgLines,
    '4. 참여 방법',
    `  참여자는 접속 주소에서 이름·이메일을 입력하고, 그룹 코드 칸에 참여 코드를 입력하면 진단을 시작할 수 있습니다.`,
    `  ${howTo}`,
    '',
    '5. 첨부 파일',
    ...files.map((f) => `  - ${f}`),
    '',
    '추가 문의사항이나 의견이 있으시면 언제든 연락 주십시오.',
    '감사합니다.',
    '',
    sender?.name || '담당자',
    '커넥트앤컴퍼니',
    ...(sender?.email ? [sender.email] : []),
  ].join('\n');

  return { subject, html, text };
}
