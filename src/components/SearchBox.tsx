import { useId, type SyntheticEvent } from 'react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  label: string;
  placeholder?: string;
}

/** Name search with a submit button; results update on submit rather than on every keystroke. */
export default function SearchBox({ value, onChange, onSubmit, label, placeholder }: SearchBoxProps) {
  const id = useId();
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    onSubmit(value.trim());
  };

  return (
    <form role="search" onSubmit={submit} className="flex gap-2 sm:gap-3">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative flex-1">
        <svg
          className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="input-lg pl-11"
        />
      </div>
      <button type="submit" className="btn-primary px-5">
        Search
      </button>
    </form>
  );
}
