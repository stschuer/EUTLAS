'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  BarChart3,
  LineChart,
  PieChart,
  Table as TableIcon,
  X,
} from 'lucide-react';

interface QueryResultChartProps {
  data: any[];
  onClose?: () => void;
}

type ChartType = 'table' | 'bar' | 'line' | 'pie';

export function QueryResultChart({ data, onClose }: QueryResultChartProps) {
  const [chartType, setChartType] = useState<ChartType>('table');
  const [xField, setXField] = useState<string>('');
  const [yField, setYField] = useState<string>('');

  // Extract field names from data
  const fields = useMemo(() => {
    if (!data || data.length === 0) return [];
    const firstDoc = data[0];
    return Object.keys(firstDoc).filter(k => k !== '_id');
  }, [data]);

  // Numeric fields for Y axis
  const numericFields = useMemo(() => {
    if (!data || data.length === 0) return [];
    const firstDoc = data[0];
    return Object.keys(firstDoc).filter(k => {
      const val = firstDoc[k];
      return typeof val === 'number' || !isNaN(parseFloat(val));
    });
  }, [data]);

  // Auto-select fields
  useMemo(() => {
    if (fields.length > 0 && !xField) {
      setXField(fields[0]);
    }
    if (numericFields.length > 0 && !yField) {
      setYField(numericFields[0]);
    }
  }, [fields, numericFields, xField, yField]);

  // Chart data
  const chartData = useMemo(() => {
    if (!xField || !yField || !data) return [];
    return data.slice(0, 20).map(doc => ({
      x: String(doc[xField] || ''),
      y: parseFloat(doc[yField]) || 0,
    }));
  }, [data, xField, yField]);

  // Calculate max for scaling
  const maxY = useMemo(() => {
    if (chartData.length === 0) return 100;
    return Math.max(...chartData.map(d => d.y), 1);
  }, [chartData]);

  // Pie chart data with colors
  const pieData = useMemo(() => {
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
    const total = chartData.reduce((sum, d) => sum + d.y, 0) || 1;
    let currentAngle = 0;
    
    return chartData.map((d, i) => {
      const percentage = d.y / total;
      const angle = percentage * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return {
        ...d,
        color: colors[i % colors.length],
        percentage: (percentage * 100).toFixed(1),
        startAngle,
        endAngle: currentAngle,
      };
    });
  }, [chartData]);

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No data to visualize
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Visualization</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={chartType === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setChartType('table')}
            >
              <TableIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={chartType === 'bar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setChartType('bar')}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant={chartType === 'line' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setChartType('line')}
            >
              <LineChart className="h-4 w-4" />
            </Button>
            <Button
              variant={chartType === 'pie' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setChartType('pie')}
            >
              <PieChart className="h-4 w-4" />
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Field Selection */}
        {chartType !== 'table' && (
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">X Axis:</Label>
              <Select value={xField} onValueChange={setXField}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Y Axis:</Label>
              <Select value={yField} onValueChange={setYField}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {numericFields.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Table View */}
        {chartType === 'table' && (
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {fields.slice(0, 6).map(f => (
                    <th key={f} className="text-left p-2 font-medium">{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 50).map((doc, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    {fields.slice(0, 6).map(f => (
                      <td key={f} className="p-2 truncate max-w-[200px]">
                        {typeof doc[f] === 'object' ? JSON.stringify(doc[f]) : String(doc[f] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 50 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                Showing 50 of {data.length} results
              </p>
            )}
          </div>
        )}

        {/* Bar Chart */}
        {chartType === 'bar' && (
          <div className="h-[300px] flex items-end gap-1 pt-4">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
                  style={{ height: `${(d.y / maxY) * 250}px` }}
                  title={`${d.x}: ${d.y}`}
                />
                <div className="text-xs text-muted-foreground mt-1 truncate max-w-full">
                  {d.x.slice(0, 8)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Line Chart */}
        {chartType === 'line' && (
          <div className="h-[300px] relative pt-4">
            <svg className="w-full h-full" viewBox={`0 0 ${chartData.length * 40} 260`} preserveAspectRatio="none">
              {/* Grid lines */}
              {[0, 25, 50, 75, 100].map(p => (
                <line
                  key={p}
                  x1="0"
                  y1={260 - (p / 100) * 250}
                  x2={chartData.length * 40}
                  y2={260 - (p / 100) * 250}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
              ))}
              {/* Line */}
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                points={chartData.map((d, i) => `${i * 40 + 20},${260 - (d.y / maxY) * 250}`).join(' ')}
              />
              {/* Points */}
              {chartData.map((d, i) => (
                <circle
                  key={i}
                  cx={i * 40 + 20}
                  cy={260 - (d.y / maxY) * 250}
                  r="4"
                  fill="#3b82f6"
                >
                  <title>{`${d.x}: ${d.y}`}</title>
                </circle>
              ))}
            </svg>
            {/* X axis labels */}
            <div className="flex justify-around mt-2">
              {chartData.map((d, i) => (
                <div key={i} className="text-xs text-muted-foreground truncate">
                  {d.x.slice(0, 6)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pie Chart */}
        {chartType === 'pie' && (
          <div className="flex items-center justify-center gap-8 py-4">
            <svg width="200" height="200" viewBox="-100 -100 200 200">
              {pieData.map((d, i) => {
                const startRad = (d.startAngle - 90) * (Math.PI / 180);
                const endRad = (d.endAngle - 90) * (Math.PI / 180);
                const x1 = Math.cos(startRad) * 80;
                const y1 = Math.sin(startRad) * 80;
                const x2 = Math.cos(endRad) * 80;
                const y2 = Math.sin(endRad) * 80;
                const largeArc = d.endAngle - d.startAngle > 180 ? 1 : 0;
                
                return (
                  <path
                    key={i}
                    d={`M 0 0 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={d.color}
                    stroke="white"
                    strokeWidth="2"
                    className="hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <title>{`${d.x}: ${d.y} (${d.percentage}%)`}</title>
                  </path>
                );
              })}
            </svg>
            <div className="space-y-2">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: d.color }} />
                  <span className="truncate max-w-[120px]">{d.x}</span>
                  <span className="text-muted-foreground">({d.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}





