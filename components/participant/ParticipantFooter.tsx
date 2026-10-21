/** 참가자 화면 공통 푸터. 인쇄 시 숨김. */
export default function ParticipantFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`fm-footer print:hidden ${className}`}>
      <div className="fm-wrap">
        <span>ⓒ CONNECT &amp; COMPANY Co., Ltd.</span>
        <nav className="links">
          <a href="https://www.connectn.co.kr" target="_blank" rel="noreferrer">
            www.connectn.co.kr
          </a>
          <a href="https://www.connectn.co.kr" target="_blank" rel="noreferrer">
            도입 문의
          </a>
        </nav>
      </div>
    </footer>
  );
}
