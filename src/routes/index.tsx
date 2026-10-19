import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { isVerifiedSession } from '@/lib/email-confirmed';
import { WalletDirectory } from '@/ledgerly/ui/components/WalletDirectory';
import { SiteHeader } from '@/ledgerly/ui/components/SiteHeader';
import { SiteFooter } from '@/ledgerly/ui/components/SiteFooter';
import { ActivityCounters } from '@/ledgerly/ui/components/ActivityCounters';
import { TokenTicker } from '@/ledgerly/ui/components/TokenTicker';
import { changeCounts } from '@/lib/daily-report-changes';
import {
  AUDIT_TOTALS,
  LATEST_REPORT,
  describeReport,
  formatReportDateShort,
} from '@/lib/security-audit';

import { getDailyReports } from '@/lib/security-reports.functions';

import '@ledgerly/ui/styles.css';

export const Route = createFileRoute('/')({
  loader: () => getDailyReports(),
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://ledgerlywallet.com/' }],
    meta: [
      { property: 'og:url', content: 'https://ledgerlywallet.com/' },
      { title: 'Ledgerly — Non-custodial XRP Ledger Wallet' },
      {
        name: 'description',
        content:
          'Create an XRP Ledger wallet in your browser in seconds. Keys are generated and encrypted on your device and never reach our servers. A free profile keeps your wallet names and payees with you.',
      },
      { property: 'og:title', content: 'Ledgerly — Non-custodial XRP Ledger Wallet' },
      {
        property: 'og:description',
        content:
          'Create a wallet in seconds. Keys stay encrypted on your device. Send and receive XRP and issued tokens.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Landing,
});

function Landing() {
  const reports = Route.useLoaderData();
  const latest = reports[0] ?? LATEST_REPORT;
  const status = latest ? describeReport(latest) : null;
  const counts = latest ? changeCounts(latest.changes) : null;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(isVerifiedSession(data.session));
    });
    // Supabase fires this once as soon as it subscribes, which can land before
    // hydration finishes, so the same guard applies here.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(isVerifiedSession(session));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="shell">
      <SiteHeader />
      <TokenTicker />

      <main className="landing">
        <section className="landing-hero">
          <span className="card-eyebrow">XRP Ledger wallet</span>
          <h1>Your Keys, Your Crypto</h1>
          <p className="landing-lede">
            Ledgerly is a self-custodial wallet interface for the XRP Ledger. Keys are generated on
            your device and encrypted in this browser with your wallet password. Your recovery
            phrase, private keys and wallet password are never sent to our servers.
          </p>
          <ActivityCounters />
          <p className="inline-note">
            XRP Ledger transactions and addresses are public. A profile stores public wallet
            addresses, names and saved payees; it does not store the secrets needed to spend.
          </p>

          {signedIn ? (
            <div className="card-actions" style={{ marginTop: 16 }}>
              <Link to="/wallet" className="button button--accent">
                Open my wallet
              </Link>
              <Link to="/balances" className="button button--secondary">
                Watch only balances
              </Link>
            </div>
          ) : null}
        </section>

        <section className="landing-paths" aria-label="Ways to use Ledgerly">
          <article className="card card--feature">
            <span className="card-eyebrow">Self custody</span>
            <h2 className="card-title">Just give me a wallet</h2>
            <p className="card-note">
              Sign in with a free profile, pick a wallet password, write down your recovery phrase
              and you are done. Your phrase, keys and password stay in this browser and never reach
              us, so the wallet itself is fully self custodial.
            </p>

            <div className="card-actions">
              <Link to="/wallet" className="button button--accent">
                Create a wallet
              </Link>
            </div>
          </article>

          <article className="card card--feature">
            <span className="card-eyebrow">With a profile</span>
            <h2 className="card-title">Keep your wallets organised</h2>
            <p className="card-note">
              A free profile remembers your wallet names, your saved payees and the addresses you
              use across devices, so a new browser is not a blank slate. It never holds your
              recovery phrase, your keys or your unlock password. Verified organisation wallets are
              coming to profiles next.
            </p>
            <div className="card-actions">
              <Link to="/auth" className="button button--accent">
                {signedIn ? 'Open your profile' : 'Create a profile'}
              </Link>
            </div>
          </article>
        </section>

        <section className="landing-features" aria-label="What Ledgerly does">
          <article className="card">
            <h3 className="card-title">Balances and tokens</h3>
            <p className="card-note">
              See spendable XRP, reserves and every issued token your account holds, with trust
              lines you can add or remove in a couple of taps.
            </p>
          </article>
          <article className="card">
            <h3 className="card-title">Send and receive</h3>
            <p className="card-note">
              Review every detail before you sign, save the people you pay often, and share your
              address as a QR code.
            </p>
          </article>
          <article className="card">
            <h3 className="card-title">Multiple wallets</h3>
            <p className="card-note">
              Run several wallets side by side and switch between them, or see everything at once in
              the combined view.
            </p>
          </article>
          <article className="card">
            <h3 className="card-title">Practice safely</h3>
            <p className="card-note">
              Switch to Testnet, grab free test XRP from the faucet and try a payment before you
              move anything real.
            </p>
          </article>
        </section>

        <section className="card card--plain" aria-label="XRP Ledger wallets">
          <span className="card-eyebrow">XRPL wallets</span>
          <h2 className="card-title">Other wallets on the XRP Ledger</h2>
          <p className="card-note">
            Good company matters. These are well known XRPL wallets you can download today. Signing
            in to Ledgerly with them is coming soon.
          </p>
          <WalletDirectory />
          <div className="card-actions">
            <Link to="/wallets" className="button button--secondary">
              See the full wallet list
            </Link>
          </div>
        </section>

        <section className="card card--feature landing-audit" aria-label="Security center">
          <span className="card-eyebrow">Security center</span>
          {status?.headline ? <h2 className="card-title">{status.headline}</h2> : null}
          {status?.summary ? <p className="card-note">{status.summary}</p> : null}
          <p className="card-note">
            We check the code that protects your keys every day and publish what we find, in plain
            language. The last full audit ran {AUDIT_TOTALS.checks} checks across encryption, key
            isolation, recovery phrase handling, browser hardening and our backend boundary.
          </p>
          <dl className="landing-stats daily-report-stats" aria-label="Security status">
            <div className="landing-stat stat-cube">
              <strong className="landing-stat-value">
                {latest ? formatReportDateShort(latest.date) : '—'}
              </strong>
              <dt>Last checked</dt>
            </div>
            <div className="landing-stat stat-cube">
              <strong className="landing-stat-value">{latest?.filesWatched ?? '—'}</strong>
              <dt>Files watched</dt>
            </div>
            <div className="landing-stat stat-cube">
              <strong className="landing-stat-value">{counts ? counts.modified : '—'}</strong>
              <dt>Changes since last report</dt>
            </div>
            <div className="landing-stat stat-cube">
              <strong className="landing-stat-value">{counts ? counts.newlyWatched : '—'}</strong>
              <dt>Newly watched</dt>
            </div>
            <div className="landing-stat stat-cube">
              <strong className="landing-stat-value">{AUDIT_TOTALS.open}</strong>
              <dt>Open findings</dt>
            </div>
          </dl>
          <div className="card-actions">
            <Link to="/security-center" className="button button--accent">
              Check our security
            </Link>
            <Link to="/security" className="button button--secondary">
              How your keys are protected
            </Link>
          </div>
        </section>

        <section className="card card--plain landing-security">
          <h2 className="card-title">How your keys are protected</h2>
          <p className="card-note">
            New keys and recovery phrases are generated on your device. The vault is encrypted
            locally using AES-256-GCM and a key derived from your wallet password with Argon2id
            before it is stored in this browser. Signing runs in a dedicated browser worker; only
            signed transactions are broadcast. Recovery phrases, private keys and wallet passwords
            never reach our servers, so we cannot recover them for you. A compromised device or
            malicious page code can still put your wallet at risk. Keep your recovery phrase offline
            and use a strong, unique wallet password.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
