// React.lazy 에 배포 복구를 덧입힌다.
//
// 지연 로딩 화면은 눌러야 파일을 받는다. 그 사이에 새 버전이 배포되면 예전
// 이름의 파일이 사라져 import가 실패하고, 손님은 이유를 알 수 없는 오류 화면을
// 본다. 그럴 때는 오류를 띄우는 대신 한 번 새로고침해 새 버전을 받는다.

import { lazy, type ComponentType } from "react";
import { clearReloadGuard, isStaleModuleError, reloadOnceForUpdate } from "./appUpdate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const loaded = await load();
      // 정상적으로 떴으니 다음 배포에서도 복구할 수 있게 표시를 지운다.
      clearReloadGuard();
      return loaded;
    } catch (error) {
      if (isStaleModuleError(error) && reloadOnceForUpdate()) {
        // 새로고침이 시작됐다. 오류 화면 대신 로딩 상태로 두고 기다린다.
        await new Promise<never>(() => {});
      }
      throw error;
    }
  });
}
