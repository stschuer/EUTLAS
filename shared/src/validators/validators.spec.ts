import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createOrgSchema,
  inviteMemberSchema,
  createProjectSchema,
  createClusterSchema,
  resizeClusterSchema,
} from './index';

describe('Zod Validators', () => {
  // ==================== loginSchema ====================

  describe('loginSchema', () => {
    it('should accept valid login', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'mypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'mypassword',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing email', () => {
      const result = loginSchema.safeParse({ password: 'test' });
      expect(result.success).toBe(false);
    });

    it('should reject missing password', () => {
      const result = loginSchema.safeParse({ email: 'user@example.com' });
      expect(result.success).toBe(false);
    });
  });

  // ==================== signupSchema ====================

  describe('signupSchema', () => {
    it('should accept valid signup with all fields', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'Password1',
        name: 'John',
      });
      expect(result.success).toBe(true);
    });

    it('should accept signup without optional name', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'Password1',
      });
      expect(result.success).toBe(true);
    });

    it('should reject password shorter than 8 chars', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'Pass1',
      });
      expect(result.success).toBe(false);
    });

    it('should reject password without uppercase', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'password1',
      });
      expect(result.success).toBe(false);
    });

    it('should reject password without lowercase', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'PASSWORD1',
      });
      expect(result.success).toBe(false);
    });

    it('should reject password without number', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'Passworddd',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name shorter than 2 chars', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'Password1',
        name: 'J',
      });
      expect(result.success).toBe(false);
    });
  });

  // ==================== forgotPasswordSchema ====================

  describe('forgotPasswordSchema', () => {
    it('should accept valid email', () => {
      const result = forgotPasswordSchema.safeParse({ email: 'user@example.com' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = forgotPasswordSchema.safeParse({ email: 'bad' });
      expect(result.success).toBe(false);
    });
  });

  // ==================== resetPasswordSchema ====================

  describe('resetPasswordSchema', () => {
    it('should accept valid token and password', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'abc123',
        password: 'NewPassword1',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty token', () => {
      const result = resetPasswordSchema.safeParse({
        token: '',
        password: 'NewPassword1',
      });
      expect(result.success).toBe(false);
    });

    it('should enforce same password rules as signup', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'abc123',
        password: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  // ==================== createOrgSchema ====================

  describe('createOrgSchema', () => {
    it('should accept valid org name', () => {
      const result = createOrgSchema.safeParse({ name: 'My Org' });
      expect(result.success).toBe(true);
    });

    it('should reject name shorter than 2 chars', () => {
      const result = createOrgSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });

    it('should reject name longer than 50 chars', () => {
      const result = createOrgSchema.safeParse({ name: 'A'.repeat(51) });
      expect(result.success).toBe(false);
    });

    it('should accept name exactly 2 chars', () => {
      const result = createOrgSchema.safeParse({ name: 'AB' });
      expect(result.success).toBe(true);
    });

    it('should accept name exactly 50 chars', () => {
      const result = createOrgSchema.safeParse({ name: 'A'.repeat(50) });
      expect(result.success).toBe(true);
    });
  });

  // ==================== inviteMemberSchema ====================

  describe('inviteMemberSchema', () => {
    it('should accept ADMIN role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'member@example.com',
        role: 'ADMIN',
      });
      expect(result.success).toBe(true);
    });

    it('should accept MEMBER role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'member@example.com',
        role: 'MEMBER',
      });
      expect(result.success).toBe(true);
    });

    it('should accept READONLY role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'member@example.com',
        role: 'READONLY',
      });
      expect(result.success).toBe(true);
    });

    it('should reject OWNER role (cannot invite as owner)', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'member@example.com',
        role: 'OWNER',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'member@example.com',
        role: 'SUPERADMIN',
      });
      expect(result.success).toBe(false);
    });
  });

  // ==================== createProjectSchema ====================

  describe('createProjectSchema', () => {
    it('should accept valid project name', () => {
      const result = createProjectSchema.safeParse({ name: 'My Project' });
      expect(result.success).toBe(true);
    });

    it('should accept project with description', () => {
      const result = createProjectSchema.safeParse({
        name: 'My Project',
        description: 'A nice project',
      });
      expect(result.success).toBe(true);
    });

    it('should reject name shorter than 2 chars', () => {
      const result = createProjectSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });

    it('should reject name longer than 50 chars', () => {
      const result = createProjectSchema.safeParse({ name: 'A'.repeat(51) });
      expect(result.success).toBe(false);
    });

    it('should reject description longer than 200 chars', () => {
      const result = createProjectSchema.safeParse({
        name: 'Valid',
        description: 'A'.repeat(201),
      });
      expect(result.success).toBe(false);
    });
  });

  // ==================== createClusterSchema ====================

  describe('createClusterSchema', () => {
    it('should accept valid cluster name', () => {
      const result = createClusterSchema.safeParse({
        name: 'my-cluster',
        plan: 'MEDIUM',
      });
      expect(result.success).toBe(true);
    });

    it('should accept cluster with optional mongoVersion', () => {
      const result = createClusterSchema.safeParse({
        name: 'my-cluster',
        plan: 'LARGE',
        mongoVersion: '7.0',
      });
      expect(result.success).toBe(true);
    });

    it('should reject cluster name starting with number', () => {
      const result = createClusterSchema.safeParse({
        name: '1cluster',
        plan: 'DEV',
      });
      expect(result.success).toBe(false);
    });

    it('should reject cluster name with uppercase', () => {
      const result = createClusterSchema.safeParse({
        name: 'MyCluster',
        plan: 'DEV',
      });
      expect(result.success).toBe(false);
    });

    it('should reject cluster name ending with hyphen', () => {
      const result = createClusterSchema.safeParse({
        name: 'my-cluster-',
        plan: 'DEV',
      });
      expect(result.success).toBe(false);
    });

    it('should reject cluster name shorter than 3 chars', () => {
      const result = createClusterSchema.safeParse({
        name: 'ab',
        plan: 'DEV',
      });
      expect(result.success).toBe(false);
    });

    it('should reject cluster name longer than 30 chars', () => {
      const result = createClusterSchema.safeParse({
        name: 'a' + 'b'.repeat(30),
        plan: 'DEV',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid plan types', () => {
      const plans = ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];
      for (const plan of plans) {
        const result = createClusterSchema.safeParse({
          name: 'test-cluster',
          plan,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid plan type', () => {
      const result = createClusterSchema.safeParse({
        name: 'test-cluster',
        plan: 'MEGA',
      });
      expect(result.success).toBe(false);
    });

    it('should accept both valid mongo versions', () => {
      for (const mongoVersion of ['6.0', '7.0']) {
        const result = createClusterSchema.safeParse({
          name: 'test-cluster',
          plan: 'DEV',
          mongoVersion,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid mongo version', () => {
      const result = createClusterSchema.safeParse({
        name: 'test-cluster',
        plan: 'DEV',
        mongoVersion: '5.0',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid names with hyphens in the middle', () => {
      const validNames = ['my-cluster', 'a-b-c', 'test-db-01', 'abc'];
      for (const name of validNames) {
        const result = createClusterSchema.safeParse({ name, plan: 'DEV' });
        expect(result.success).toBe(true);
      }
    });
  });

  // ==================== resizeClusterSchema ====================

  describe('resizeClusterSchema', () => {
    it('should accept valid plan', () => {
      const result = resizeClusterSchema.safeParse({ plan: 'XLARGE' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid plan', () => {
      const result = resizeClusterSchema.safeParse({ plan: 'INVALID' });
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = resizeClusterSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
