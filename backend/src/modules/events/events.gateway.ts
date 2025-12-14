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
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  orgIds?: string[];
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private connectedClients: Map<string, AuthenticatedSocket> = new Map();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake
      const token = client.handshake.auth?.token || 
                    client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} attempted connection without token`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      client.userId = payload.sub;
      this.connectedClients.set(client.id, client);

      this.logger.log(`Client connected: ${client.id}, User: ${payload.sub}`);
      
      // Acknowledge connection
      client.emit('connected', { 
        message: 'Connected to activity feed',
        clientId: client.id,
      });
    } catch (error) {
      this.logger.warn(`Client ${client.id} failed authentication: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:org')
  handleSubscribeOrg(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { orgId: string },
  ) {
    const room = `org:${data.orgId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to org: ${data.orgId}`);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('subscribe:project')
  handleSubscribeProject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    const room = `project:${data.projectId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to project: ${data.projectId}`);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('subscribe:cluster')
  handleSubscribeCluster(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clusterId: string },
  ) {
    const room = `cluster:${data.clusterId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to cluster: ${data.clusterId}`);
    return { event: 'subscribed', data: { room } };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { room: string },
  ) {
    client.leave(data.room);
    this.logger.log(`Client ${client.id} unsubscribed from: ${data.room}`);
    return { event: 'unsubscribed', data: { room: data.room } };
  }

  // Methods to emit events
  emitToOrg(orgId: string, event: any) {
    this.server.to(`org:${orgId}`).emit('event', event);
  }

  emitToProject(projectId: string, event: any) {
    this.server.to(`project:${projectId}`).emit('event', event);
  }

  emitToCluster(clusterId: string, event: any) {
    this.server.to(`cluster:${clusterId}`).emit('event', event);
  }

  // Broadcast event to all relevant rooms
  broadcastEvent(event: {
    orgId: string;
    projectId?: string;
    clusterId?: string;
    [key: string]: any;
  }) {
    // Always emit to org room
    this.emitToOrg(event.orgId, event);

    // Emit to project room if applicable
    if (event.projectId) {
      this.emitToProject(event.projectId, event);
    }

    // Emit to cluster room if applicable
    if (event.clusterId) {
      this.emitToCluster(event.clusterId, event);
    }
  }

  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}




