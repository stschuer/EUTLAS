'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DataPoint {
  timestamp: string | number;
  value: number;
}

interface MetricWidgetProps {
  title: string;
  value: number | string;
  unit?: string;
  change?: number;
  changeLabel?: string;
  data?: DataPoint[];
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showSparkline?: boolean;
  icon?: React.ReactNode;
}

const colorClasses = {
  blue: { line: '#3b82f6', fill: 'rgba(59, 130, 246, 0.2)', text: 'text-blue-600' },
  green: { line: '#22c55e', fill: 'rgba(34, 197, 94, 0.2)', text: 'text-green-600' },
  yellow: { line: '#f59e0b', fill: 'rgba(245, 158, 11, 0.2)', text: 'text-yellow-600' },
  red: { line: '#ef4444', fill: 'rgba(239, 68, 68, 0.2)', text: 'text-red-600' },
  purple: { line: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.2)', text: 'text-purple-600' },
  orange: { line: '#f97316', fill: 'rgba(249, 115, 22, 0.2)', text: 'text-orange-600' },
};

export function MetricWidget({
  title,
  value,
  unit,
  change,
  changeLabel,
  data = [],
  color = 'blue',
  size = 'md',
  className,
  showSparkline = true,
  icon,
}: MetricWidgetProps) {
  const colors = colorClasses[color];

  const sparklinePath = useMemo(() => {
    if (!data || data.length < 2) return null;

    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const width = 100;
    const height = 40;
    const padding = 2;

    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((d.value - min) / range) * (height - 2 * padding);
      return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${width - padding} ${height} L ${padding} ${height} Z`;

    return { linePath, areaPath, width, height };
  }, [data]);

  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const valueClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className={cn(sizeClasses[size])}>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {icon}
              {title}
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn('font-bold', valueClasses[size])}>
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
              {unit && <span className="text-muted-foreground text-sm">{unit}</span>}
            </div>
            {change !== undefined && (
              <div className="flex items-center gap-1 text-sm">
                <span className={cn(
                  change >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
                </span>
                {changeLabel && <span className="text-muted-foreground">{changeLabel}</span>}
              </div>
            )}
          </div>

          {/* Sparkline */}
          {showSparkline && sparklinePath && (
            <div className="w-24 h-10">
              <svg viewBox={`0 0 ${sparklinePath.width} ${sparklinePath.height}`} className="w-full h-full">
                <path d={sparklinePath.areaPath} fill={colors.fill} />
                <path d={sparklinePath.linePath} fill="none" stroke={colors.line} strokeWidth="2" />
              </svg>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricGridProps {
  metrics: MetricWidgetProps[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function MetricGrid({ metrics, columns = 4, className }: MetricGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {metrics.map((metric, i) => (
        <MetricWidget key={i} {...metric} />
      ))}
    </div>
  );
}



