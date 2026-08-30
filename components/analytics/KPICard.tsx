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
    <div className="group relative rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5 transition-all hover:border-[#2A3F66] hover:shadow-lg hover:shadow-black/30">
      {/* Top row: icon + trend */}
      <div className="flex items-start justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
        >
          {icon}
        </div>
        {change !== null && (
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isPositive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            <span>{isPositive ? '▲' : '▼'}</span>
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mt-4">
        <p className="text-[28px] font-black leading-none tracking-tight text-white">
          {value}
          {unit && <span className="ml-1 text-base font-semibold text-slate-400">{unit}</span>}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-slate-400">{title}</p>
      </div>

      {/* Previous period label */}
      {(trendLabel ?? change !== null) && (
        <p className="mt-3 text-[10px] font-medium text-slate-600">
          {trendLabel ?? (change !== null ? `${isPositive ? '+' : ''}${change}% vs previous period` : '')}
        </p>
      )}

      {/* Hover arrow */}
      {href && (
        <div className="absolute bottom-4 right-4 opacity-0 transition-opacity group-hover:opacity-100">
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
