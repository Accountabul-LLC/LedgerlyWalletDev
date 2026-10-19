import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { RiskFinding, RiskLevel } from '@ledgerly/core/shared';
import { useWallet } from '../context';
import { AlertIcon, CheckIcon, CloseIcon, CopyIcon, InfoIcon, ShieldIcon } from './icons';

/**
 * Sends people to the official XRPL documentation through the host's external
 * link handler, the same path the explorer links use, so the popup build never
 * navigates itself away.
 */
export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  const { openExternal } = useWallet();
  return (
    <button type="button" className="link-button doc-link" onClick={() => openExternal(href)}>
      {children}
    </button>
  );
}

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  block,
  loading,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = ['button', `button--${variant}`, block ? 'button--block' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      {children(id)}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/**
 * Attributes that stop a browser, password manager, or mobile keyboard from
 * saving, suggesting, or learning a value. Applied to every field that carries
 * a recovery phrase, a family seed, or a password, so containment does not
 * depend on each call site remembering the full list.
 */
const SECRET_INPUT_ATTRIBUTES = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  autoSave: 'off',
  spellCheck: false,
  'data-secret': 'true',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
} as const;

/** True for anything holding key material, whether marked or typed as a password. */
function isSecretInput(secret: boolean | undefined, type: string | undefined): boolean {
  return secret === true || type === 'password';
}

export function TextField({
  label,
  hint,
  error,
  secret,
  ...rest
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Marks the field as key material, hardening it against autofill and caches. */
  secret?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const hardened = isSecretInput(secret, rest.type)
    ? {
        ...SECRET_INPUT_ATTRIBUTES,
        ...(rest.autoComplete ? { autoComplete: rest.autoComplete } : {}),
      }
    : {};
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => <input id={id} aria-invalid={error ? true : undefined} {...rest} {...hardened} />}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  secret,
  ...rest
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  secret?: boolean;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const hardened = secret ? SECRET_INPUT_ATTRIBUTES : {};
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => <textarea id={id} aria-invalid={error ? true : undefined} {...rest} {...hardened} />}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  children,
  ...rest
}: { label: string; hint?: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card card--plain">
      {title || action ? (
        <div className="card-heading">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h3>{title}</h3> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const CALLOUT_ICONS = {
  info: InfoIcon,
  caution: AlertIcon,
  danger: AlertIcon,
  positive: ShieldIcon,
} as const;

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: RiskLevel | 'positive';
  title?: string;
  children: ReactNode;
}) {
  const IconComponent = CALLOUT_ICONS[tone];
  return (
    <div className={`callout callout--${tone}`}>
      <IconComponent />
      <div>
        {title ? <strong style={{ whiteSpace: 'pre-wrap' }}>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

/** Renders every finding the engine produced, most severe first. */
export function RiskFindings({ findings }: { findings: readonly RiskFinding[] }) {
  if (findings.length === 0) return null;
  const order: Record<RiskLevel, number> = { danger: 0, caution: 1, info: 2 };
  const sorted = [...findings].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <div>
      {sorted.map((finding) => (
        <Callout
          key={`${finding.level}-${finding.title}`}
          tone={finding.level}
          title={finding.title}
        >
          {finding.detail}
        </Callout>
      ))}
    </div>
  );
}

export function Dialog({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus on opening only. Form edits can replace onClose on every render;
    // refocusing then would take the caret out of the field being edited.
    // Preserve a child's autoFocus when it has already claimed focus.
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h3>{title}</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Copies to the clipboard and clears it afterwards. An address left on the
 * clipboard is a target for clipboard-hijacking malware, which swaps it for the
 * attacker's own before the user pastes.
 */
/**
 * The single place in the app that writes to the clipboard. Everything that
 * copies goes through here, so there is one line to audit rather than many.
 */
export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // A denied clipboard permission is not worth an error to the reader.
  }
}

export function CopyButton({
  value,
  getValue,
  label = 'Copy',
  clearAfterMs = 60_000,
}: {
  value?: string;
  /**
   * Read the text at click time. Secrets use this so the value is never held
   * as a prop, where a retained React fiber could keep a copy of it alive.
   */
  getValue?: () => string;
  label?: string;
  clearAfterMs?: number;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), 1800);
    const clear = setTimeout(() => {
      if (getValue) {
        // The secret is gone from memory by now, so there is nothing left to
        // compare against: blank the clipboard rather than leave it holding it.
        void navigator.clipboard.writeText('').catch(() => undefined);
        return;
      }
      navigator.clipboard.readText().then(
        (current) => {
          if (current === value) void navigator.clipboard.writeText('');
        },
        () => undefined,
      );
    }, clearAfterMs);
    return () => {
      clearTimeout(reset);
      clearTimeout(clear);
    };
  }, [copied, value, getValue, clearAfterMs]);

  return (
    <button
      className="icon-button"
      aria-label={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard
          .writeText(getValue ? getValue() : (value ?? ''))
          .then(() => setCopied(true));
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function DetailList({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return (
    <div className="detail-list">
      {items.map((item) => (
        <div key={item.label}>
          <span className="label">{item.label}</span>
          <span className="value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
