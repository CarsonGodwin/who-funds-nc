import type { ReactNode } from 'react';

export interface Option {
  value: string;
  label: string;
}

const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
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
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        inputMode={numeric ? 'decimal' : undefined}
        min={type === 'number' ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  allLabel: string;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} bg-white`}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

/** Row of small preset buttons. */
export function QuickButtons({ presets }: { presets: { label: string; apply: () => void }[] }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={preset.apply}
          className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** Collapsible filter section. Must live at module level so it isn't remounted on every render. */
export function Section({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-3 text-left font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          {title}
        </span>
        <svg
          className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">{children}</div>}
    </div>
  );
}
