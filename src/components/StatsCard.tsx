interface StatsCardProps {
  label: string;
  value: string;
  description?: string;
}

export default function StatsCard({ label, value, description }: StatsCardProps) {
  return (
    <div className="text-center p-6">
      <p className="text-3xl sm:text-4xl font-bold text-nc-blue mb-1">
        {value}
      </p>
      <p className="text-sm font-medium text-slate-900">
        {label}
      </p>
      {description && (
        <p className="text-xs text-slate-500 mt-1">
          {description}
        </p>
      )}
    </div>
  );
}
