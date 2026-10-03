import { useState, type SyntheticEvent } from 'react';

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  initialValue?: string;
  size?: 'default' | 'large';
}

export default function SearchBar({
  placeholder = "Search donors, committees, or organizations...",
  onSearch,
  initialValue = '',
  size = 'large'
}: SearchBarProps) {
  const [query, setQuery] = useState(initialValue);

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(query);
    } else {
      // Default: navigate to contributors search
      window.location.href = `/search/contributors?q=${encodeURIComponent(query)}`;
    }
  };

  const sizeClasses = size === 'large'
    ? 'py-4 px-6 text-lg'
    : 'py-3 px-4 text-base';

  return (
    <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${sizeClasses} pr-14 bg-white text-slate-900 rounded-xl border-0 shadow-lg focus:ring-2 focus:ring-white/50 focus:outline-none placeholder:text-slate-400`}
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-nc-blue text-white rounded-lg hover:bg-blue-900 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
