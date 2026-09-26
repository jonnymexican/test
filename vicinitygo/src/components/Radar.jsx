import * as React from 'react';
import { distanceMeters, bearingDegrees } from '../lib/geo';

/**
 * A radar-style minimap: you at the center, checkpoints plotted by
 * bearing (angle) and distance (radius). Pure SVG, no map tiles.
 */
export default function Radar({ origin, checkpoints, size = 260 }) {
  const cx = size / 2;
  const cy = size / 2;
  const maxKm = 2.5;
  const rings = [0.4, 0.7, 1.0];

  const blips = checkpoints.map((c) => {
    const dist = distanceMeters(origin, c);
    const r = Math.min(1, dist / (maxKm * 1000));
    const brg = bearingDegrees(origin, c);
    return {
      id: c.id,
      x: cx + r * (size / 2 - 16) * Math.sin((brg * Math.PI) / 180),
      y: cy - r * (size / 2 - 16) * Math.cos((brg * Math.PI) / 180),
      done: c.done,
      dist,
      icon: c.icon,
    };
  });

  return (
    <svg
      className="radar"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Radar of nearby checkpoints"
    >
      <defs>
        <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4f7cff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#4f7cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={size / 2 - 4} fill="url(#radar-glow)" />
      {rings.map((f) => (
        <circle
          key={f}
          cx={cx}
          cy={cy}
          r={(size / 2 - 12) * f}
          fill="none"
          stroke="rgba(148,180,255,0.25)"
          strokeDasharray={f === 1 ? 'none' : '3 5'}
        />
      ))}
      <line x1={cx} y1={cy - (size / 2 - 12)} x2={cx} y2={cy + (size / 2 - 12)} stroke="rgba(148,180,255,0.12)" />
      <line x1={cx - (size / 2 - 12)} y1={cy} x2={cx + (size / 2 - 12)} y2={cy} stroke="rgba(148,180,255,0.12)" />
      <circle cx={cx} cy={cy} r={7} fill="#ffd166" stroke="#0b1020" strokeWidth={2} />
      {blips.map((b) => (
        <g key={b.id} transform={`translate(${b.x} ${b.y})`}>
          <circle r={13} fill={b.done ? 'rgba(72,215,133,0.25)' : 'rgba(79,124,255,0.25)'} stroke={b.done ? '#48d785' : '#7aa2ff'} />
          <text textAnchor="middle" dy={5} fontSize={14}>
            {b.icon}
          </text>
        </g>
      ))}
    </svg>
  );
}
