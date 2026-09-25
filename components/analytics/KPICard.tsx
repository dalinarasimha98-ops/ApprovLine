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
    <div className="group relative rounded-2xl border border-al-border bg-al-surface p-4 transition-all hover:border-al-border-strong hover:shadow-lg hover:shadow-black/30">
      {/* Top row: icon + title */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
        >
          {icon}
        </div>
        <p className="text-[11px] font-semibold leading-tight text-al-text-muted">{title}</p>
      </div>

      {/* Value */}
      <p className="mt-2.5 text-[26px] font-black leading-none tracking-tight text-white">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-al-text-muted">{unit}</span>}
      </p>

      {/* Trend + comparison */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {change !== null && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isPositive
                ? 'bg-al-success/10 text-al-success'
                : 'bg-al-danger/10 text-al-danger'
            }`}
          >
            <span>{isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(change)}%</span>
          </div>
        )}
        {trendLabel && (
          <p className="text-[10px] font-medium text-al-text-secondary truncate">{trendLabel}</p>
        )}
      </div>

      {/* Hover arrow */}
      {href && (
        <div className="absolute bottom-3 right-3 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[10px] font-bold text-al-text-muted">View &rarr;</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}
