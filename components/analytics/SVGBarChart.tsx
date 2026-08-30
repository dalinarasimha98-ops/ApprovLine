type BarData = {
  label: string;
  value: number;
};

type Props = {
  data: BarData[];
  width?: number;
  height?: number;
  color?: string;
  showValues?: boolean;
};

function nf(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

export function SVGBarChart({
  data,
  width = 480,
  height = 200,
  color = '#7C3AED',
  showValues = true,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm font-semibold text-slate-500">
        No data available
      </div>
    );
  }

  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 24;
  const paddingBottom = 32;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(4, (chartWidth / data.length) * 0.65);
  const barGap = chartWidth / data.length;

  const gridLines = 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxValue / gridLines) * (gridLines - i)),
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* Grid lines */}
      {gridValues.map((val) => {
        const y = paddingTop + ((maxValue - val) / maxValue) * chartHeight;
        return (
          <g key={val}>
            <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#1E2D4A" strokeWidth={1} />
            <text x={paddingLeft - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#4B5563">
              {val > 999 ? `${Math.round(val / 1000)}k` : val}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / maxValue) * chartHeight);
        const x = paddingLeft + i * barGap + (barGap - barWidth) / 2;
        const y = paddingTop + chartHeight - barH;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={3}
              fill={color}
              fillOpacity={0.85}
            />
            {showValues && d.value > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={8}
                fill="#9CA3AF"
                fontWeight="bold"
              >
                {nf(d.value)}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={height - paddingBottom + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#4B5563"
            >
              {d.label.slice(0, 6)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
