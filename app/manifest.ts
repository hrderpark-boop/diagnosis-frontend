import type { MetadataRoute } from 'next';

// 바로가기·홈 화면 아이콘(크롬 '바로가기 만들기', 휴대폰 '홈 화면에 추가')
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Find Me · AI 리더십 코칭',
    short_name: 'Find Me',
    description: '내 안의 진짜 리더를 찾는 여정',
    start_url: '/',
    display: 'browser',
    background_color: '#ffffff',
    theme_color: '#1C2B4A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
