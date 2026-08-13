// 홈 화면에 추가한 앱(PWA)으로 실행 중인지.
//
// iOS에서는 이 상태에서 다른 도메인으로 나가면(구글 로그인 등) 최소 브라우저 바가
// 붙고, 돌아와도 자동으로 사라지지 않는다. 그 경험을 피할 수 있는 화면에서는
// 우리 도메인 안에서 끝나는 방법(이메일 로그인)을 먼저 보여 준다.

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari는 표준 display-mode 대신 navigator.standalone을 쓴다.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

/** 구글 로그인이 앱 밖 브라우저를 띄우는 환경인지(= 미리 알려 줘야 하는 환경). */
export function oauthLeavesApp(): boolean {
  return isStandalone() && isIos();
}
