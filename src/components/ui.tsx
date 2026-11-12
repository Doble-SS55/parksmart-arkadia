import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RISK_LABEL, type SaturationRisk } from '../core/queueing/queueing';
import { ORIGIN_LABEL, PARAMETER_SOURCE_LABEL, type ParameterSource, type RecordOrigin } from '../core/types';
import { IconCheck, IconClose, IconInfo, IconStop, IconWarn } from './Icons';

/* ───────── Insignias ───────── */

export function OriginBadge({ origin, short = false }: { origin: RecordOrigin; short?: boolean }) {
  const label = short ? { observado: 'Observado', simulado: 'Simulado', manual: 'Manual' }[origin] : ORIGIN_LABEL[origin];
  return <span className={`badge badge-${origin}`}>{label}</span>;
}

export function SourceBadge({ source }: { source: ParameterSource }) {
  const cls = source === 'confirmado' ? 'badge-confirmado' : source === 'aproximado' ? 'badge-manual' : 'badge-hipotetico';
  return <span className={`badge ${cls}`}>{PARAMETER_SOURCE_LABEL[source]}</span>;
}

export function RiskTag({ risk, prefix }: { risk: SaturationRisk; prefix?: string }) {
  const Icon = risk === 'bajo' ? IconCheck : risk === 'critico' ? IconStop : IconWarn;
  return (
    <span className={`risk risk-${risk}`}>
      <Icon className="risk-icon" />
      {prefix ? `${prefix} ` : ''}
      {RISK_LABEL[risk]}
    </span>
  );
}

/* ───────── Avisos ───────── */

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; title?: string; children: ReactNode }) {
  const Icon = tone === 'bad' ? IconStop : tone === 'warn' ? IconWarn : tone === 'good' ? IconCheck : IconInfo;
  return (
    <div className={`callout${tone === 'info' ? '' : ` callout-${tone}`}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon />
      <div>
        {title && <p><b>{title}</b></p>}
        {typeof children === 'string' ? <p>{children}</p> : children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ───────── Controles ───────── */

export function Field({
  label, hint, error, children, htmlFor,
}: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function NumberInput({
  label, value, onChange, min, max, step = 'any', hint, suffix, id: idProp, error,
}: {
  label: string; value: number | ''; onChange: (v: number | '') => void; min?: number; max?: number;
  step?: number | 'any'; hint?: ReactNode; suffix?: string; id?: string; error?: string | null;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field label={suffix ? `${label} (${suffix})` : label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        className="input num"
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </Field>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value, onChange, min, max, label,
}: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Restar ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Sumar ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

export function Select<T extends string | number>({
  label, value, options, onChange, hint,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        className="select"
        value={String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function Metric({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value num">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {note && <span className="metric-note">{note}</span>}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

/* ───────── Diálogos ───────── */

export function Modal({
  open, title, onClose, children, actions,
}: { open: boolean; title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose} aria-label={title}>
      {open && (
        <>
          <div className="modal-body">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <h3>{title}</h3>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}><IconClose /></button>
            </div>
            {children}
          </div>
          {actions && <div className="modal-actions">{actions}</div>}
        </>
      )}
    </dialog>
  );
}

interface ConfirmState {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

const FeedbackContext = createContext<{
  confirm: (o: Omit<ConfirmState, 'resolve'>) => Promise<boolean>;
  toast: (text: string, tone?: 'ok' | 'error') => void;
} | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const confirm = useCallback(
    (o: Omit<ConfirmState, 'resolve'>) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );
  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      <Modal
        open={!!state}
        title={state?.title ?? ''}
        onClose={() => close(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => close(false)}>Cancelar</button>
            <button type="button" className={`btn ${state?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
              {state?.confirmLabel}
            </button>
          </>
        }
      >
        <div>{state?.message}</div>
      </Modal>
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.tone === 'error' ? ' toast-error' : ''}`}>{t.text}</div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}
