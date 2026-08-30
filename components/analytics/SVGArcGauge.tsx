type Props = {
  value: number; // 0-100
  label?: string;
  sublabel?: string;
  size?: number;
  color?: string;
};

/**
 * Semi-circular arc gauge. The arc sweeps from -180° to 0° (left to right).
 * `value` is 0–100; the arc fills proportionally.
 */
export function SVGArcGauge({
  value,
  label,
  sublabel,
  size = 180,
  color = '#7C3AED',
}: Props) {
  const cx = size / 2;
  const cy = size * 0.65; // push center down so semicircle fits
  const r = size * 0.38;
  const strokeWidth = size * 0.1;
  const trackColor = '#1E2D4A';

  // Semi-circle: from 180° to 360° (left to right across the bottom)
  const startAngle = 180;
  const endAngle = 360;
  const sweepAngle = (value / 100) * (endAngle - startAngle);

  function polarToCartesian(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(start: number, end: number) {
    const s = polarToCartesian(start);
    const e = polarToCartesian(Math.min(end, start + 359.99));
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const trackPath = describeArc(startAngle, endAngle);
  const fillPath = sweepAngle > 0 ? describeArc(startAngle, startAngle + sweepAngle) : null;

  // Color by value
  let arcColor = color;
  if (value < 50) arcColor = '#EF4444';
  else if (value < 75) arcColor = '#F59E0B';
  else arcColor = '#10B981';

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${cy + strokeWidth / 2 + 4}`}
        className="w-full"
        style={{ height: cy + strokeWidth / 2 + 4 }}
      >
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        {/* Center value text */}
        <text
          x={cx}
          y={cy - r * 0.05}
          textAnchor="middle"
          fontSize={size * 0.22}
          fontWeight="900"
          fill="white"
        >
          {value}%
        </text>
        {label && (
          <text
            x={cx}
            y={cy + r * 0.28}
            textAnchor="middle"
            fontSize={size * 0.075}
            fill="#9CA3AF"
            fontWeight="600"
          >
            {label}
          </text>
        )}
      </svg>
      {sublabel && (
        <p className="mt-1 text-center text-xs font-medium text-slate-400">{sublabel}</p>
      )}
    </div>
  );
}
