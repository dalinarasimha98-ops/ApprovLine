type SeriesConfig = {
  key: string;
  color: string;
  label: string;
};

type DataPoint = Record<string, number | string>;

type Props = {
  data: DataPoint[];
  series: SeriesConfig[];
  width?: number;
  height?: number;
  showLegend?: boolean;
  labelKey?: string;
  labelEvery?: number;
};

function nf(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

export function SVGLineChart({
  data,
  series,
  width = 500,
  height = 220,
  showLegend = true,
  labelKey = 'label',
  labelEvery = 5,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm font-semibold text-slate-500">
        No data available for this period
      </div>
    );
  }

  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 32;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Compute min/max across all series
  const allValues = data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)));
  const maxValue = Math.max(...allValues, 1);
  const minValue = 0;

  function xPos(index: number) {
    return paddingLeft + (index / Math.max(data.length - 1, 1)) * chartWidth;
  }

  function yPos(value: number) {
    return paddingTop + ((maxValue - value) / (maxValue - minValue)) * chartHeight;
  }

  const gridLines = 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxValue / gridLines) * (gridLines - i)),
  );

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        {/* Grid lines */}
        {gridValues.map((val) => (
          <g key={val}>
            <line
              x1={paddingLeft}
              y1={yPos(val)}
              x2={width - paddingRight}
              y2={yPos(val)}
              stroke="#1E2D4A"
              strokeWidth={1}
            />
            <text
              x={paddingLeft - 4}
              y={yPos(val) + 4}
              textAnchor="end"
              fontSize={9}
              fill="#4B5563"
            >
              {val > 999 ? `${Math.round(val / 1000)}k` : val}
            </text>
          </g>
        ))}

        {/* Series polylines */}
        {series.map((s) => {
          const points = data
            .map((d, i) => `${xPos(i)},${yPos(Number(d[s.key] ?? 0))}`)
            .join(' ');
          return (
            <g key={s.key}>
              {/* Gradient area fill */}
              <defs>
                <linearGradient id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
              />
              {/* Dots on data points */}
              {data.map((d, i) => (
                <circle
                  key={i}
                  cx={xPos(i)}
                  cy={yPos(Number(d[s.key] ?? 0))}
                  r={3}
                  fill={s.color}
                  stroke="#0D1526"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % labelEvery !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={i}
              x={xPos(i)}
              y={height - paddingBottom + 16}
              textAnchor="middle"
              fontSize={9}
              fill="#4B5563"
            >
              {String(d[labelKey] ?? '').slice(0, 8)}
            </text>
          );
        })}

        {/* Tooltip text on hover — simplified: show values on last point */}
        {series.map((s) => {
          const lastPoint = data[data.length - 1];
          const val = Number(lastPoint?.[s.key] ?? 0);
          if (val === 0) return null;
          return (
            <text
              key={`label-${s.key}`}
              x={xPos(data.length - 1) + 4}
              y={yPos(val) - 4}
              fontSize={8}
              fill={s.color}
              fontWeight="bold"
            >
              {nf(val)}
            </text>
          );
        })}
      </svg>

      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className="h-2 w-4 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-xs font-medium text-slate-400">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
