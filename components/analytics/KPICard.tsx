import Link from 'next/link';

type Props = {
  title: string;
  value: string;
  unit?: string;
  prevValue?: number;
  currentNumeric?: number;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  icon: React.ReactNode;
  accentColor?: string;
  href?: string;
};

function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function KPICard({
  title,
  value,
  unit,
  prevValue,
  currentNumeric,
  icon,
  accentColor = '#7C3AED',
  href,
  trendLabel,
}: Props) {
  const change =
    currentNumeric !== undefined && prevValue !== undefined
      ? pctChange(currentNumeric, prevValue)
      : null;

  const isPositive = change !== null ? change >= 0 : null;

  const content = (
    <div className="group relative rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-4 transition-all hover:border-[#2A3F66] hover:shadow-lg hover:shadow-black/30">
      {/* Top row: icon + title */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
        >
          {icon}
        </div>
        <p className="text-[11px] font-semibold leading-tight text-slate-400">{title}</p>
      </div>

      {/* Value */}
      <p className="mt-2.5 text-[26px] font-black leading-none tracking-tight text-white">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-slate-400">{unit}</span>}
      </p>

      {/* Trend + comparison */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {change !== null && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isPositive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            <span>{isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(change)}%</span>
          </div>
        )}
        {trendLabel && (
          <p className="text-[10px] font-medium text-slate-600 truncate">{trendLabel}</p>
        )}
      </div>

      {/* Hover arrow */}
      {href && (
        <div className="absolute bottom-3 right-3 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[10px] font-bold text-slate-500">View &rarr;</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}
