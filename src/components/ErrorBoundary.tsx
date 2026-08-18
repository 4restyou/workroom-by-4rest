import { Component, type ReactNode } from "react";
import { isStaleModuleError, reloadOnceForUpdate } from "../lib/appUpdate";

type Props = { children: ReactNode };
type State = { hasError: boolean; detail: string; stale: boolean };

function describe(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  return String(error ?? "알 수 없는 오류");
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, detail: "", stale: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, detail: describe(error), stale: isStaleModuleError(error) };
  }

  componentDidCatch(error: unknown) {
    // Last-resort logging; swap for a real reporter (e.g. Sentry) later.
    console.error("Unhandled UI error:", error);
    // 배포 직후 낡은 화면이라 깨진 경우에는 스스로 새 버전을 받아 온다.
    if (isStaleModuleError(error)) reloadOnceForUpdate();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { detail, stale } = this.state;

    return (
      <div className="grid min-h-screen place-items-center bg-workroom-background p-6 text-center text-workroom-ink">
        <div className="max-w-md">
          <p className="text-2xl font-bold">{stale ? "새 버전이 준비됐어요" : "잠시 문제가 발생했어요"}</p>
          <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
            {stale
              ? "화면을 새로 불러오면 바로 이어서 사용하실 수 있어요."
              : "페이지를 새로고침하면 대부분 해결됩니다. 계속 발생하면 운영자에게 알려 주세요."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-[6px] border border-workroom-ink bg-workroom-ink px-6 py-3 font-bold text-white"
            >
              새로고침
            </button>
            <a
              href="/"
              className="rounded-[6px] border border-workroom-ink bg-workroom-surface px-6 py-3 font-bold text-workroom-ink"
            >
              홈으로
            </a>
          </div>
          {/* 무슨 오류인지 알아야 고칠 수 있다. 접어 두되 볼 수는 있게 남긴다. */}
          {detail && !stale ? (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-xs font-bold text-workroom-muted">자세한 내용</summary>
              <p className="mt-2 break-words rounded-[6px] border border-workroom-line bg-workroom-surface p-3 text-xs font-medium leading-5 text-workroom-muted">
                {detail}
              </p>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
}
