import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { KubernetesService } from '../kubernetes/kubernetes.service';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly kubernetesService: KubernetesService,
  ) {}

  getReadinessChecks(): {
    status: 'ready' | 'not_ready';
    checks: Record<string, 'ok' | 'error' | 'degraded'>;
  } {
    const database = this.connection.readyState === 1 ? 'ok' : 'error';
    const kubernetes = this.kubernetesService.isKubernetesConnected() ? 'ok' : 'degraded';
    const allOk = database === 'ok';

    return {
      status: allOk ? 'ready' : 'not_ready',
      checks: {
        database,
        kubernetes,
      },
    };
  }
}
