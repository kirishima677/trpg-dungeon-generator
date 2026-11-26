import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';

type Props = { name: string; children: ReactNode };

class WindowLoadBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) return (
      <div className="window-load-message" role="alert">
        <p>{this.props.name}を表示できませんでした。通信状態を確認して、再読み込みしてください。</p>
        <button onClick={() => window.location.reload()}>再読み込み</button>
      </div>
    );
    return this.props.children;
  }
}

export function WindowLoader({ name, children }: Props) {
  return (
    <WindowLoadBoundary name={name}>
      <Suspense fallback={<p className="window-load-message" role="status">{name}を準備しています…</p>}>
        {children}
      </Suspense>
    </WindowLoadBoundary>
  );
}
