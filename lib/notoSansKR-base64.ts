/**
 * Noto Sans KR Regular — base64 인코딩 폰트 데이터
 *
 * 사용자가 직접 채워넣어야 합니다:
 *
 * 1. 폰트 다운로드:
 *    https://fonts.google.com/noto/specimen/Noto+Sans+KR
 *    → "Get font" → "Download all" → zip 압축 해제
 *    → static/NotoSansKR-Regular.ttf 파일 찾기
 *
 * 2. 파일 이동:
 *    cp NotoSansKR-Regular.ttf \
 *      /Users/daniel/python_new/diagnosis-frontend/public/fonts/
 *
 * 3. base64 변환 (터미널):
 *    cd /Users/daniel/python_new/diagnosis-frontend
 *    base64 -i public/fonts/NotoSansKR-Regular.ttf | tr -d '\n' \
 *      > /tmp/font_base64.txt
 *    wc -c /tmp/font_base64.txt   # 수백 KB 이상이면 정상
 *
 * 4. 아래 NOTO_SANS_KR_BASE64 = "" 의 따옴표 안에
 *    /tmp/font_base64.txt 파일 내용 전체를 붙여넣고 저장.
 *
 * base64 가 비어있으면 PDF 에서 한글이 □□□ 으로 표시됩니다.
 */

export const NOTO_SANS_KR_BASE64 = ""; // ← 여기에 base64 문자열 붙여넣기

/** base64 데이터가 유효한 폰트 크기인지 확인. */
export const hasKoreanFont = (): boolean =>
  NOTO_SANS_KR_BASE64.length > 1000;
