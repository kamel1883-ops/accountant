import React from 'react';
import { useI18n } from '../i18n';

type Props = { children: React.ReactNode; resetKey?: string };
type State = { err: string | null; gen: number };

function Fallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="bg-white border border-[#E7E5DE] rounded-xl p-6 max-w-lg">
      <p className="font-bold mb-2">{t('sup.pageFail')}</p>
      <p className="text-sm text-[#6C6A82] mb-4">{t('sup.pageHint')}</p>
      <button type="button" className="bg-navy text-white rounded-lg px-4 py-2 text-sm" onClick={onRetry}>{t('sup.refresh')}</button>
    </div>
  );
}

/** يعزل كل قسم في بوابة الشركة. إن تعثّر العرض يُعاد فتح القسم مرة بصمت، ثم يُطلب إعادة فتحه دون إسقاط بقية النظام. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null, gen: 0 };
  private retries = 0;

  static getDerivedStateFromError(e: Error) {
    return { err: e?.message || 'Error' };
  }

  componentDidCatch(e: Error) {
    console.error(e);
    if (this.retries < 1) {
      this.retries += 1;
      window.setTimeout(() => {
        this.setState((s) => ({ err: null, gen: s.gen + 1 }));
      }, 0);
    }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey) {
      this.retries = 0;
      if (this.state.err) this.setState((s) => ({ err: null, gen: s.gen + 1 }));
    }
  }

  private reopen = () => {
    this.retries = 0;
    this.setState((s) => ({ err: null, gen: s.gen + 1 }));
  };

  render() {
    if (this.state.err && this.retries >= 1) return <Fallback onRetry={this.reopen} />;
    if (this.state.err) return null;
    return <React.Fragment key={this.state.gen}>{this.props.children}</React.Fragment>;
  }
}
