import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Last-resort logging; swap for a real reporter (e.g. Sentry) later.
    console.error("Unhandled UI error:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-workroom-background p-6 text-center text-workroom-ink">
        <div className="max-w-md">
          <p className="text-2xl font-bold">잠시 문제가 발생했어요</p>
          <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
            페이지를 새로고침하면 대부분 해결됩니다. 계속 발생하면 운영자에게 알려 주세요.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-[6px] border border-workroom-ink bg-workroom-ink px-6 py-3 font-bold text-white"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }
}
