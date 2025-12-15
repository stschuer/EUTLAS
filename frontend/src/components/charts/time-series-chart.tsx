'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DataPoint {
  timestamp: number | string | Date;
  value: number;
  label?: string;
}

interface Series {
  name: string;
  data: DataPoint[];
  color?: string;
}

interface TimeSeriesChartProps {
  title?: string;
  series: Series[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  yAxisLabel?: string;
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
  onTimeRangeChange?: (range: string) => void;
  className?: string;
}

const defaultColors = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
];

export function TimeSeriesChart({
  title,
  series,
  height = 300,
  showLegend = true,
  showGrid = true,
  showTooltip = true,
  yAxisLabel,
  timeRange,
  onTimeRangeChange,
  className,
}: TimeSeriesChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    series: string;
    point: DataPoint;
    x: number;
    y: number;
  } | null>(null);

  const chartData = useMemo(() => {
    if (series.length === 0) return null;

    // Get all values for scaling
    const allValues = series.flatMap(s => s.data.map(d => d.value));
    const minValue = Math.min(...allValues, 0);
    const maxValue = Math.max(...allValues, 1);
    const valueRange = maxValue - minValue || 1;

    // Get time range
    const allTimes = series.flatMap(s => s.data.map(d => new Date(d.timestamp).getTime()));
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
    const timeRangeMs = maxTime - minTime || 1;

    const width = 600;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Process series
    const processedSeries = series.map((s, si) => {
      const color = s.color || defaultColors[si % defaultColors.length];
      const points = s.data.map(d => {
        const x = padding.left + ((new Date(d.timestamp).getTime() - minTime) / timeRangeMs) * chartWidth;
        const y = padding.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight;
        return { x, y, data: d };
      });

      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

      return { ...s, color, points, linePath, areaPath };
    });

    // Y axis ticks
    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const value = minValue + (valueRange * (4 - i)) / 4;
      const y = padding.top + (chartHeight * i) / 4;
      return { value, y };
    });

    // X axis ticks (time)
    const xTicks = Array.from({ length: 6 }, (_, i) => {
      const time = minTime + (timeRangeMs * i) / 5;
      const x = padding.left + (chartWidth * i) / 5;
      const date = new Date(time);
      const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { time, x, label };
    });

    return {
      width,
      height,
      padding,
      chartWidth,
      chartHeight,
      processedSeries,
      yTicks,
      xTicks,
    };
  }, [series, height]);

  if (!chartData) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    );
  }

  const formatValue = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(1);
  };

  return (
    <Card className={className}>
      {(title || onTimeRangeChange) && (
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {onTimeRangeChange && (
            <div className="flex gap-1">
              {['1h', '6h', '24h', '7d', '30d'].map(range => (
                <Button
                  key={range}
                  variant={timeRange === range ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onTimeRangeChange(range)}
                >
                  {range}
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
      )}
      <CardContent className="p-4">
        <div className="relative">
          <svg
            viewBox={`0 0 ${chartData.width} ${chartData.height}`}
            className="w-full"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Grid */}
            {showGrid && (
              <g className="text-muted-foreground/20">
                {chartData.yTicks.map((tick, i) => (
                  <line
                    key={i}
                    x1={chartData.padding.left}
                    y1={tick.y}
                    x2={chartData.width - chartData.padding.right}
                    y2={tick.y}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                  />
                ))}
              </g>
            )}

            {/* Y Axis */}
            <g className="text-xs fill-muted-foreground">
              {chartData.yTicks.map((tick, i) => (
                <text key={i} x={chartData.padding.left - 10} y={tick.y + 4} textAnchor="end">
                  {formatValue(tick.value)}
                </text>
              ))}
              {yAxisLabel && (
                <text
                  x={15}
                  y={chartData.height / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 15 ${chartData.height / 2})`}
                >
                  {yAxisLabel}
                </text>
              )}
            </g>

            {/* X Axis */}
            <g className="text-xs fill-muted-foreground">
              {chartData.xTicks.map((tick, i) => (
                <text key={i} x={tick.x} y={chartData.height - 10} textAnchor="middle">
                  {tick.label}
                </text>
              ))}
            </g>

            {/* Series */}
            {chartData.processedSeries.map((s, si) => (
              <g key={si}>
                {/* Area */}
                <path d={s.areaPath} fill={s.color} fillOpacity="0.1" />
                {/* Line */}
                <path d={s.linePath} fill="none" stroke={s.color} strokeWidth="2" />
                {/* Points */}
                {s.points.map((p, pi) => (
                  <circle
                    key={pi}
                    cx={p.x}
                    cy={p.y}
                    r={hoveredPoint?.point === p.data ? 5 : 3}
                    fill={s.color}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint({ series: s.name, point: p.data, x: p.x, y: p.y })}
                  />
                ))}
              </g>
            ))}
          </svg>

          {/* Tooltip */}
          {showTooltip && hoveredPoint && (
            <div
              className="absolute bg-popover border rounded-md shadow-lg p-2 text-sm pointer-events-none z-10"
              style={{
                left: hoveredPoint.x,
                top: hoveredPoint.y - 50,
                transform: 'translateX(-50%)',
              }}
            >
              <div className="font-medium">{hoveredPoint.series}</div>
              <div className="text-muted-foreground">
                {formatValue(hoveredPoint.point.value)}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(hoveredPoint.point.timestamp).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        {showLegend && chartData.processedSeries.length > 1 && (
          <div className="flex flex-wrap gap-4 justify-center mt-4">
            {chartData.processedSeries.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
                {s.name}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}





