import Link from 'next/link';

/**
 * 워드마크 "Find Me" (Outfit: Find 300 검정 / Me 600, Me 안의 색은 남색 ↔ 연한 파랑 8초 왕복).
 * 스타일은 app/fm-light.css 의 .fm-wm / .fm-me-wave.
 * Me 요소(.fm-me-wave)에는 transform·filter·opacity 애니메이션을 걸지 말 것.
 */
export default function Wordmark({ href, className = '' }: { href?: string; className?: string }) {
  const inner = (
    <>
      <span className="find">Find</span>
      <span className="me fm-me-wave">Me</span>
    </>
  );
  if (href) {
    return (
      <Link className={`fm-wm ${className}`} href={href} aria-label="Find Me">
        {inner}
      </Link>
    );
  }
  return (
    <span className={`fm-wm ${className}`} aria-label="Find Me">
      {inner}
    </span>
  );
}
