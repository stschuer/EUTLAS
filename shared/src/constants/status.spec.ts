import {
  CLUSTER_STATUS_CONFIG,
  JOB_STATUS_CONFIG,
  BACKUP_STATUS_CONFIG,
} from './status';

describe('Status Constants', () => {
  // ==================== CLUSTER_STATUS_CONFIG ====================

  describe('CLUSTER_STATUS_CONFIG', () => {
    const expectedStatuses = [
      'creating',
      'ready',
      'updating',
      'deleting',
      'failed',
      'degraded',
      'stopped',
    ];

    it('should contain all expected cluster statuses', () => {
      const keys = Object.keys(CLUSTER_STATUS_CONFIG);
      for (const status of expectedStatuses) {
        expect(keys).toContain(status);
      }
    });

    it('should have 7 cluster statuses', () => {
      expect(Object.keys(CLUSTER_STATUS_CONFIG)).toHaveLength(7);
    });

    it('each status should have required fields', () => {
      for (const [status, config] of Object.entries(CLUSTER_STATUS_CONFIG)) {
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('color');
        expect(config).toHaveProperty('isTerminal');
        expect(config).toHaveProperty('allowsOperations');
        expect(typeof config.label).toBe('string');
        expect(typeof config.color).toBe('string');
        expect(typeof config.isTerminal).toBe('boolean');
        expect(typeof config.allowsOperations).toBe('boolean');
      }
    });

    it('only "ready" and "degraded" should allow operations', () => {
      const allowsOps = Object.entries(CLUSTER_STATUS_CONFIG)
        .filter(([, config]) => config.allowsOperations)
        .map(([status]) => status);

      expect(allowsOps).toEqual(expect.arrayContaining(['ready', 'degraded']));
      expect(allowsOps).toHaveLength(2);
    });

    it('only "failed" should be terminal', () => {
      const terminals = Object.entries(CLUSTER_STATUS_CONFIG)
        .filter(([, config]) => config.isTerminal)
        .map(([status]) => status);

      expect(terminals).toEqual(['failed']);
    });

    it('"ready" should be green', () => {
      expect(CLUSTER_STATUS_CONFIG.ready.color).toBe('green');
    });

    it('"failed" should be red', () => {
      expect(CLUSTER_STATUS_CONFIG.failed.color).toBe('red');
    });
  });

  // ==================== JOB_STATUS_CONFIG ====================

  describe('JOB_STATUS_CONFIG', () => {
    const expectedStatuses = ['pending', 'in_progress', 'success', 'failed', 'canceled'];

    it('should contain all expected job statuses', () => {
      const keys = Object.keys(JOB_STATUS_CONFIG);
      for (const status of expectedStatuses) {
        expect(keys).toContain(status);
      }
    });

    it('should have 5 job statuses', () => {
      expect(Object.keys(JOB_STATUS_CONFIG)).toHaveLength(5);
    });

    it('each status should have label, color, and isTerminal', () => {
      for (const config of Object.values(JOB_STATUS_CONFIG)) {
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('color');
        expect(config).toHaveProperty('isTerminal');
      }
    });

    it('terminal statuses should be success, failed, and canceled', () => {
      const terminals = Object.entries(JOB_STATUS_CONFIG)
        .filter(([, config]) => config.isTerminal)
        .map(([status]) => status);

      expect(terminals).toEqual(expect.arrayContaining(['success', 'failed', 'canceled']));
      expect(terminals).toHaveLength(3);
    });

    it('non-terminal statuses should be pending and in_progress', () => {
      const nonTerminals = Object.entries(JOB_STATUS_CONFIG)
        .filter(([, config]) => !config.isTerminal)
        .map(([status]) => status);

      expect(nonTerminals).toEqual(expect.arrayContaining(['pending', 'in_progress']));
      expect(nonTerminals).toHaveLength(2);
    });
  });

  // ==================== BACKUP_STATUS_CONFIG ====================

  describe('BACKUP_STATUS_CONFIG', () => {
    const expectedStatuses = ['scheduled', 'running', 'success', 'failed'];

    it('should contain all expected backup statuses', () => {
      const keys = Object.keys(BACKUP_STATUS_CONFIG);
      for (const status of expectedStatuses) {
        expect(keys).toContain(status);
      }
    });

    it('should have 4 backup statuses', () => {
      expect(Object.keys(BACKUP_STATUS_CONFIG)).toHaveLength(4);
    });

    it('each status should have label and color', () => {
      for (const config of Object.values(BACKUP_STATUS_CONFIG)) {
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('color');
        expect(typeof config.label).toBe('string');
        expect(typeof config.color).toBe('string');
      }
    });

    it('"success" should be labeled "Completed"', () => {
      expect(BACKUP_STATUS_CONFIG.success.label).toBe('Completed');
    });

    it('"failed" should be red', () => {
      expect(BACKUP_STATUS_CONFIG.failed.color).toBe('red');
    });
  });
});
