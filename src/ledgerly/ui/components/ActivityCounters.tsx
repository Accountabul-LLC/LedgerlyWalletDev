import { useEffect, useState } from 'react';
import { fetchPlatformStats, subscribePlatformStats, type PlatformStats } from '../metrics';
type LoadState = {
  status: 'loading' | 'ready' | 'unavailable';
  stats: PlatformStats | null;
};

export function ActivityCounters() {
  const [state, setState] = useState<LoadState>({ status: 'loading', stats: null });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let pending = false;
    let queued = false;
    const controller = new AbortController();
    setState({ status: 'loading', stats: null });
    const load = async () => {
      if (!active) return;
      if (pending) {
        queued = true;
        return;
      }
      pending = true;
      try {
        const stats = await fetchPlatformStats(controller.signal);
        if (active) setState({ status: 'ready', stats });
      } catch {
        if (active) setState({ status: 'unavailable', stats: null });
      } finally {
        pending = false;
        if (queued && active) {
          queued = false;
          void load();
        }
      }
    };
    void load();
    const unsubscribe = subscribePlatformStats(() => void load());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      active = false;
      controller.abort();
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [retry]);

  const current = state;
  const stats = current.stats;
  const value = (amount: number | null | undefined, xrp = false) => {
    const text =
      current.status === 'loading'
        ? 'Loading…'
        : amount == null
          ? 'Unavailable'
          : amount.toLocaleString(undefined, { maximumFractionDigits: xrp ? 6 : 0 });
    return (
      <dd className={`landing-stat-value${amount == null ? ' activity-stat-message' : ''}`}>
        {text}
      </dd>
    );
  };

  return (
    <section className="activity-counters" aria-label="Ledgerly activity">
      <p className="inline-note">Activity totals from Ledgerly’s production database.</p>
      <dl className="landing-stats daily-report-stats" aria-label="Ledgerly activity totals">
        <div className="landing-stat stat-cube">
          <dt>Wallets created</dt>
          {value(stats?.walletsCreated)}
        </div>
        <div className="landing-stat stat-cube">
          <dt>Wallets activated</dt>
          {value(stats?.walletsActivated)}
        </div>
        <div className="landing-stat stat-cube">
          <dt>Transactions signed</dt>
          {value(stats?.transactionsSigned)}
        </div>
        <div className="landing-stat stat-cube">
          <dt>Value sent (XRP)</dt>
          {value(stats?.valueSentXrp, true)}
        </div>
      </dl>
      {current.status === 'ready' ? null : (
        <p className="inline-note" role="status">
          {current.status === 'unavailable'
            ? 'Activity data is unavailable. No totals are being displayed.'
            : 'Loading recorded activity…'}
        </p>
      )}
      {current.status === 'unavailable' ? (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setRetry((count) => count + 1)}
        >
          Retry activity data
        </button>
      ) : null}
    </section>
  );
}
