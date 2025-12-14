import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { MetricsService } from './metrics.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  subscribedClusters?: Set<string>;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/metrics',
})
export class MetricsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MetricsGateway.name);
  private connectedClients: Map<string, AuthenticatedSocket> = new Map();
  private clusterSubscriptions: Map<string, Set<string>> = new Map(); // clusterId -> clientIds

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private metricsService: MetricsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token || 
                    client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} attempted connection without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      client.userId = payload.sub;
      client.subscribedClusters = new Set();
      this.connectedClients.set(client.id, client);

      this.logger.log(`Metrics client connected: ${client.id}, User: ${payload.sub}`);
      
      client.emit('connected', { 
        message: 'Connected to metrics stream',
        clientId: client.id,
      });
    } catch (error) {
      this.logger.warn(`Client ${client.id} failed authentication: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    // Clean up subscriptions
    if (client.subscribedClusters) {
      for (const clusterId of client.subscribedClusters) {
        const subscribers = this.clusterSubscriptions.get(clusterId);
        if (subscribers) {
          subscribers.delete(client.id);
          if (subscribers.size === 0) {
            this.clusterSubscriptions.delete(clusterId);
          }
        }
      }
    }
    
    this.connectedClients.delete(client.id);
    this.logger.log(`Metrics client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:cluster')
  handleSubscribeCluster(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clusterId: string },
  ) {
    const { clusterId } = data;
    
    // Add to client's subscriptions
    client.subscribedClusters?.add(clusterId);
    
    // Add to cluster's subscribers
    if (!this.clusterSubscriptions.has(clusterId)) {
      this.clusterSubscriptions.set(clusterId, new Set());
    }
    this.clusterSubscriptions.get(clusterId)!.add(client.id);
    
    // Join room for this cluster
    client.join(`cluster:${clusterId}`);
    
    this.logger.log(`Client ${client.id} subscribed to cluster: ${clusterId}`);
    
    // Send current metrics immediately
    this.sendCurrentMetrics(clusterId, client);
    
    return { event: 'subscribed', data: { clusterId } };
  }

  @SubscribeMessage('unsubscribe:cluster')
  handleUnsubscribeCluster(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clusterId: string },
  ) {
    const { clusterId } = data;
    
    client.subscribedClusters?.delete(clusterId);
    
    const subscribers = this.clusterSubscriptions.get(clusterId);
    if (subscribers) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.clusterSubscriptions.delete(clusterId);
      }
    }
    
    client.leave(`cluster:${clusterId}`);
    
    this.logger.log(`Client ${client.id} unsubscribed from cluster: ${clusterId}`);
    return { event: 'unsubscribed', data: { clusterId } };
  }

  private async sendCurrentMetrics(clusterId: string, client: Socket) {
    try {
      const metrics = await this.metricsService.getCurrentMetrics(clusterId);
      client.emit('metrics', {
        clusterId,
        timestamp: new Date(),
        metrics,
      });
    } catch (error) {
      this.logger.error(`Failed to send metrics for cluster ${clusterId}: ${error.message}`);
    }
  }

  // Push metrics to all subscribed clients every 5 seconds
  @Interval(5000)
  async pushMetricsToSubscribers() {
    for (const [clusterId, subscribers] of this.clusterSubscriptions.entries()) {
      if (subscribers.size === 0) continue;
      
      try {
        const metrics = await this.metricsService.getCurrentMetrics(clusterId);
        
        this.server.to(`cluster:${clusterId}`).emit('metrics', {
          clusterId,
          timestamp: new Date(),
          metrics,
        });
      } catch (error) {
        this.logger.error(`Failed to push metrics for cluster ${clusterId}: ${error.message}`);
      }
    }
  }

  // Emit alert when metric crosses threshold
  emitMetricAlert(clusterId: string, alert: {
    metric: string;
    value: number;
    threshold: number;
    severity: 'warning' | 'critical';
  }) {
    this.server.to(`cluster:${clusterId}`).emit('metric-alert', {
      clusterId,
      timestamp: new Date(),
      ...alert,
    });
  }

  getSubscribedClusterCount(): number {
    return this.clusterSubscriptions.size;
  }

  getConnectedClientCount(): number {
    return this.connectedClients.size;
  }
}




