'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiClient } from '@/lib/api-client';

interface MetricData {
  cpuPercent: number;
  memoryPercent: number;
  storagePercent: number;
  connections: number;
  maxConnections: number;
  operationsPerSec: {
    insert: number;
    query: number;
    update: number;
    delete: number;
  };
  networkBytesIn: number;
  networkBytesOut: number;
}

interface RealtimeMetric {
  clusterId: string;
  timestamp: Date;
  metrics: MetricData;
}

interface MetricAlert {
  clusterId: string;
  timestamp: Date;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
}

export function useRealtimeMetrics(clusterId: string | undefined) {
  const [connected, setConnected] = useState(false);
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<Array<{ timestamp: Date; metrics: MetricData }>>([]);
  const [alerts, setAlerts] = useState<MetricAlert[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (!clusterId) return;
    
    const token = apiClient.getToken();
    if (!token) {
      console.warn('No auth token for metrics WebSocket');
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';
    
    const socket = io(`${baseUrl}/metrics`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Connected to metrics stream');
      setConnected(true);
    });

    socket.on('connected', (data) => {
      console.log('Metrics connection confirmed:', data);
      // Subscribe to cluster metrics
      socket.emit('subscribe:cluster', { clusterId });
    });

    socket.on('metrics', (data: RealtimeMetric) => {
      if (data.clusterId === clusterId) {
        setMetrics(data.metrics);
        setLastUpdate(new Date(data.timestamp));
        setMetricsHistory(prev => {
          const newHistory = [...prev, { timestamp: new Date(data.timestamp), metrics: data.metrics }];
          // Keep last 60 data points (5 minutes at 5-second intervals)
          return newHistory.slice(-60);
        });
      }
    });

    socket.on('metric-alert', (alert: MetricAlert) => {
      if (alert.clusterId === clusterId) {
        setAlerts(prev => [alert, ...prev].slice(0, 10));
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from metrics stream');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Metrics connection error:', error);
      setConnected(false);
    });

    socketRef.current = socket;

    return () => {
      socket.emit('unsubscribe:cluster', { clusterId });
      socket.disconnect();
    };
  }, [clusterId]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      socketRef.current?.disconnect();
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    socketRef.current?.disconnect();
    connect();
  }, [connect]);

  return {
    connected,
    metrics,
    metricsHistory,
    alerts,
    lastUpdate,
    reconnect,
  };
}



