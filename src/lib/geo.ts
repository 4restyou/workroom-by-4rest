// 위치 확인 공용 헬퍼 (출근 체크인용 — 좌표는 확인에만 쓰고 저장하지 않음).
//
// iOS 사파리 주의점: 첫 호출 시 권한 팝업이 떠 있는 동안에도 timeout이
// 흐른다. 짧은 timeout(예: 8초)이면 사용자가 '허용'을 누르기 전에 요청이
// 시간초과로 죽어서 "허용했는데 안 되는" 증상이 된다. 그래서 첫 시도는
// 넉넉히 기다리고, 실패하면 저정밀로 한 번 더 시도한다.

export type GeoResult = {
  pos: { lat: number; lng: number } | null;
  denied: boolean;
};

function tryPosition(options: PositionOptions): Promise<{ pos: GeoResult["pos"]; code: number | null }> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ pos: { lat: position.coords.latitude, lng: position.coords.longitude }, code: null }),
      (error) => resolve({ pos: null, code: error.code }),
      options,
    );
  });
}

export async function getPosition(): Promise<GeoResult> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return { pos: null, denied: false };
  }

  // 1차: 고정밀, 권한 팝업 대기까지 포함해 30초
  const first = await tryPosition({ enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 });
  if (first.pos) return { pos: first.pos, denied: false };
  if (first.code === 1) return { pos: null, denied: true }; // PERMISSION_DENIED

  // 2차: 실내 등 GPS가 늦는 환경 — 저정밀(와이파이/기지국)로 재시도
  const second = await tryPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  if (second.pos) return { pos: second.pos, denied: false };
  return { pos: null, denied: second.code === 1 };
}
