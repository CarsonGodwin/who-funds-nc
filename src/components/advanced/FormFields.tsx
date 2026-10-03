import { useId, type ReactNode } from 'react';

export interface Option {
  value: string;
  label: string;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'date' | 'number';
  numeric?: boolean;
}

export function TextField({ label, value, onChange, placeholder, hint, type = 'text', numeric }: TextFieldProps) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type={type}
        inputMode={numeric ? 'decimal' : undefined}
        min={type === 'number' ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  allLabel: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Row of small preset buttons that fill in other fields. */
export function QuickButtons({ presets }: { presets: { label: string; apply: () => void }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((preset) => (
        <button key={preset.label} type="button" onClick={preset.apply} className="chip px-2.5 py-0.5 text-xs">
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** Collapsible filter section. Must live at module level so it isn't remounted on every render. */
export function Section({
  title,
  open,
  onToggle,
  active = false,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Marks a collapsed section that still has filters set, so they aren't forgotten. */
  active?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          {title}
          {active && !open && <span className="h-2 w-2 rounded-full bg-nc-blue" aria-label="(filters set)" />}
        </span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div id={id} className="space-y-3 px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
