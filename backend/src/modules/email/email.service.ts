import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private fromEmail: string;
  private fromName: string;
  private isEnabled: boolean;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>('EMAIL_FROM') || 'noreply@eutlas.eu';
    this.fromName = this.configService.get<string>('EMAIL_FROM_NAME') || 'EUTLAS';
    this.isEnabled = !!apiKey;

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Email service initialized with Resend');
    } else {
      this.logger.warn('RESEND_API_KEY not configured - emails will be logged only');
    }
  }

  async send(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, subject, html, text, replyTo, cc, bcc } = options;

    if (!this.isEnabled) {
      this.logger.log(`[DEV] Email would be sent to: ${to}`);
      this.logger.log(`[DEV] Subject: ${subject}`);
      this.logger.debug(`[DEV] HTML: ${html.substring(0, 200)}...`);
      return { success: true, messageId: 'dev-mode' };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        replyTo: replyTo,
        cc,
        bcc,
      });

      if (error) {
        this.logger.error(`Failed to send email: ${error.message}`);
        return { success: false, error: error.message };
      }

      this.logger.log(`Email sent successfully to ${to}: ${data?.id}`);
      return { success: true, messageId: data?.id };
    } catch (error: any) {
      this.logger.error(`Email sending failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ===== Email Templates =====

  async sendPasswordReset(email: string, resetToken: string, userName?: string): Promise<boolean> {
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;
    
    const result = await this.send({
      to: email,
      subject: 'Reset Your EUTLAS Password',
      html: this.getPasswordResetTemplate(resetUrl, userName),
    });

    return result.success;
  }

  async sendEmailVerification(email: string, verificationToken: string, userName?: string): Promise<boolean> {
    const verifyUrl = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${verificationToken}`;
    
    const result = await this.send({
      to: email,
      subject: 'Verify Your EUTLAS Email',
      html: this.getEmailVerificationTemplate(verifyUrl, userName),
    });

    return result.success;
  }

  async sendTeamInvitation(
    email: string,
    inviterName: string,
    orgName: string,
    invitationToken: string,
    role: string,
  ): Promise<boolean> {
    const acceptUrl = `${this.configService.get('FRONTEND_URL')}/accept-invitation?token=${invitationToken}`;
    
    const result = await this.send({
      to: email,
      subject: `You've been invited to join ${orgName} on EUTLAS`,
      html: this.getTeamInvitationTemplate(inviterName, orgName, acceptUrl, role),
    });

    return result.success;
  }

  async sendAlertNotification(
    email: string,
    alertTitle: string,
    alertMessage: string,
    severity: string,
    clusterName: string,
    dashboardUrl?: string,
  ): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: `[${severity.toUpperCase()}] Alert: ${alertTitle}`,
      html: this.getAlertTemplate(alertTitle, alertMessage, severity, clusterName, dashboardUrl),
    });

    return result.success;
  }

  async sendBackupNotification(
    email: string,
    clusterName: string,
    backupType: 'completed' | 'failed',
    details?: string,
  ): Promise<boolean> {
    const subject = backupType === 'completed' 
      ? `Backup Completed: ${clusterName}`
      : `Backup Failed: ${clusterName}`;
    
    const result = await this.send({
      to: email,
      subject,
      html: this.getBackupNotificationTemplate(clusterName, backupType, details),
    });

    return result.success;
  }

  async sendWelcomeEmail(email: string, userName: string): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: 'Welcome to EUTLAS - Your EU MongoDB Cloud',
      html: this.getWelcomeTemplate(userName),
    });

    return result.success;
  }

  async sendInvitationEmail(options: {
    to: string;
    inviterName: string;
    orgName: string;
    role: string;
    token: string;
    message?: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const acceptUrl = `${this.configService.get('FRONTEND_URL')}/accept-invitation?token=${options.token}`;
    
    const result = await this.send({
      to: options.to,
      subject: `You've been invited to join ${options.orgName} on EUTLAS`,
      html: this.getTeamInvitationTemplate(
        options.inviterName,
        options.orgName,
        acceptUrl,
        options.role,
      ),
    });

    return result.success;
  }

  async sendAlertEmail(options: {
    to: string;
    alertName: string;
    severity: string;
    message: string;
    clusterName: string;
    alertUrl: string;
    firedAt: Date;
  }): Promise<boolean> {
    const result = await this.send({
      to: options.to,
      subject: `[${options.severity.toUpperCase()}] ${options.alertName} - ${options.clusterName}`,
      html: this.getAlertTemplate(
        options.alertName,
        options.message,
        options.severity,
        options.clusterName,
        options.alertUrl,
      ),
    });

    return result.success;
  }

  // ===== HTML Templates =====

  private getBaseTemplate(content: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EUTLAS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; border-bottom: 1px solid #e4e4e7;">
              <table width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 24px; color: #18181b; font-weight: 700;">
                      🇪🇺 EUTLAS
                    </h1>
                    <p style="margin: 4px 0 0; font-size: 14px; color: #71717a;">
                      EU MongoDB Cloud Platform
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #71717a; text-align: center;">
                © ${new Date().getFullYear()} EUTLAS. All rights reserved.<br>
                This email was sent from EUTLAS. If you didn't expect this email, please ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getPasswordResetTemplate(resetUrl: string, userName?: string): string {
    return this.getBaseTemplate(`
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #18181b;">Reset Your Password</h2>
      <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        ${userName ? `Hi ${userName},` : 'Hi there,'}<br><br>
        We received a request to reset your password. Click the button below to create a new password:
      </p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Reset Password
      </a>
      <p style="margin: 24px 0 0; font-size: 14px; color: #71717a; line-height: 1.6;">
        This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
      </p>
    `);
  }

  private getEmailVerificationTemplate(verifyUrl: string, userName?: string): string {
    return this.getBaseTemplate(`
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #18181b;">Verify Your Email</h2>
      <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        ${userName ? `Hi ${userName},` : 'Hi there,'}<br><br>
        Thanks for signing up for EUTLAS! Please verify your email address by clicking the button below:
      </p>
      <a href="${verifyUrl}" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Verify Email
      </a>
      <p style="margin: 24px 0 0; font-size: 14px; color: #71717a; line-height: 1.6;">
        This link will expire in 24 hours.
      </p>
    `);
  }

  private getTeamInvitationTemplate(inviterName: string, orgName: string, acceptUrl: string, role: string): string {
    return this.getBaseTemplate(`
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #18181b;">You're Invited!</h2>
      <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on EUTLAS as a <strong>${role}</strong>.
      </p>
      <a href="${acceptUrl}" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
      <p style="margin: 24px 0 0; font-size: 14px; color: #71717a; line-height: 1.6;">
        This invitation will expire in 7 days.
      </p>
    `);
  }

  private getAlertTemplate(title: string, message: string, severity: string, clusterName: string, dashboardUrl?: string): string {
    const severityColors: Record<string, string> = {
      critical: '#dc2626',
      warning: '#f59e0b',
      info: '#3b82f6',
    };
    const color = severityColors[severity] || severityColors.info;

    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: ${color}10; border-left: 4px solid ${color}; border-radius: 4px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 12px; color: ${color}; font-weight: 600; text-transform: uppercase;">
          ${severity} Alert
        </p>
        <h2 style="margin: 8px 0 0; font-size: 18px; color: #18181b;">${title}</h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        <strong>Cluster:</strong> ${clusterName}
      </p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        ${message}
      </p>
      ${dashboardUrl ? `
        <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
          View Dashboard
        </a>
      ` : ''}
    `);
  }

  private getBackupNotificationTemplate(clusterName: string, type: 'completed' | 'failed', details?: string): string {
    const isSuccess = type === 'completed';
    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: ${isSuccess ? '#dcfce7' : '#fef2f2'}; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 48px;">${isSuccess ? '✅' : '❌'}</span>
        <h2 style="margin: 16px 0 0; font-size: 20px; color: ${isSuccess ? '#166534' : '#dc2626'};">
          Backup ${isSuccess ? 'Completed' : 'Failed'}
        </h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        <strong>Cluster:</strong> ${clusterName}
      </p>
      ${details ? `
        <p style="margin: 0 0 16px; font-size: 14px; color: #71717a; line-height: 1.6;">
          ${details}
        </p>
      ` : ''}
    `);
  }

  private getWelcomeTemplate(userName: string): string {
    return this.getBaseTemplate(`
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #18181b;">Welcome to EUTLAS! 🎉</h2>
      <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        Hi ${userName},<br><br>
        Welcome to EUTLAS - your EU-based MongoDB cloud platform. We're excited to have you on board!
      </p>
      <h3 style="margin: 0 0 12px; font-size: 16px; color: #18181b;">Getting Started:</h3>
      <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 15px; color: #3f3f46; line-height: 1.8;">
        <li>Create your first organization</li>
        <li>Set up a project for your application</li>
        <li>Deploy a MongoDB cluster in minutes</li>
        <li>Configure IP whitelist for security</li>
        <li>Connect your application</li>
      </ul>
      <a href="${this.configService.get('FRONTEND_URL')}/dashboard" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Go to Dashboard
      </a>
    `);
  }

  // ===== Cluster Lifecycle Emails =====

  async sendClusterReady(
    email: string,
    clusterName: string,
    connectionString: string,
    projectName: string,
  ): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: `Your MongoDB Cluster "${clusterName}" is Ready!`,
      html: this.getClusterReadyTemplate(clusterName, connectionString, projectName),
    });
    return result.success;
  }

  async sendClusterPaused(
    email: string,
    clusterName: string,
    reason: string,
    resumeUrl: string,
  ): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: `Action Required: Cluster "${clusterName}" Has Been Paused`,
      html: this.getClusterPausedTemplate(clusterName, reason, resumeUrl),
    });
    return result.success;
  }

  async sendUsageWarning(
    email: string,
    clusterName: string,
    usagePercent: number,
    resourceType: string,
    upgradeUrl: string,
  ): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: `Usage Alert: ${clusterName} at ${usagePercent}% ${resourceType}`,
      html: this.getUsageWarningTemplate(clusterName, usagePercent, resourceType, upgradeUrl),
    });
    return result.success;
  }

  // ===== Payment Emails =====

  async sendPaymentFailed(
    email: string,
    amount: string,
    updatePaymentUrl: string,
  ): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: 'Payment Failed - Action Required',
      html: this.getPaymentFailedTemplate(amount, updatePaymentUrl),
    });
    return result.success;
  }

  async sendPaymentSuccess(
    email: string,
    amount: string,
    invoiceUrl: string,
  ): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: 'Payment Received - Thank You!',
      html: this.getPaymentSuccessTemplate(amount, invoiceUrl),
    });
    return result.success;
  }

  async sendSubscriptionUpgraded(
    email: string,
    oldPlan: string,
    newPlan: string,
    effectiveDate: string,
  ): Promise<boolean> {
    const result = await this.send({
      to: email,
      subject: `Plan Upgraded to ${newPlan}`,
      html: this.getSubscriptionUpgradedTemplate(oldPlan, newPlan, effectiveDate),
    });
    return result.success;
  }

  // ===== Additional Templates =====

  private getClusterReadyTemplate(clusterName: string, connectionString: string, projectName: string): string {
    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: #dcfce7; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 48px;">🚀</span>
        <h2 style="margin: 16px 0 0; font-size: 20px; color: #166534;">
          Your Cluster is Ready!
        </h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        Great news! Your MongoDB cluster <strong>${clusterName}</strong> in project <strong>${projectName}</strong> is now ready to use.
      </p>
      <h3 style="margin: 24px 0 12px; font-size: 16px; color: #18181b;">Connection String:</h3>
      <div style="padding: 16px; background-color: #f4f4f5; border-radius: 8px; font-family: monospace; font-size: 13px; word-break: break-all; margin-bottom: 24px;">
        ${connectionString}
      </div>
      <h3 style="margin: 0 0 12px; font-size: 16px; color: #18181b;">Next Steps:</h3>
      <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 15px; color: #3f3f46; line-height: 1.8;">
        <li>Add your IP address to the network access list</li>
        <li>Create database users with appropriate roles</li>
        <li>Connect your application using the connection string</li>
      </ul>
      <a href="${this.configService.get('FRONTEND_URL')}/dashboard/clusters" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        View Cluster
      </a>
    `);
  }

  private getClusterPausedTemplate(clusterName: string, reason: string, resumeUrl: string): string {
    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: #fef2f2; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 48px;">⏸️</span>
        <h2 style="margin: 16px 0 0; font-size: 20px; color: #dc2626;">
          Cluster Paused
        </h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        Your MongoDB cluster <strong>${clusterName}</strong> has been paused.
      </p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        <strong>Reason:</strong> ${reason}
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #71717a; line-height: 1.6;">
        Your data is safe, but the cluster is not accessible. Please take action to resume your cluster.
      </p>
      <a href="${resumeUrl}" style="display: inline-block; padding: 12px 32px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Resume Cluster
      </a>
    `);
  }

  private getUsageWarningTemplate(clusterName: string, usagePercent: number, resourceType: string, upgradeUrl: string): string {
    const color = usagePercent >= 90 ? '#dc2626' : '#f59e0b';
    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: ${color}10; border-left: 4px solid ${color}; border-radius: 4px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 12px; color: ${color}; font-weight: 600; text-transform: uppercase;">
          Usage Warning
        </p>
        <h2 style="margin: 8px 0 0; font-size: 18px; color: #18181b;">
          ${resourceType} at ${usagePercent}%
        </h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        Your cluster <strong>${clusterName}</strong> is approaching its ${resourceType.toLowerCase()} limit.
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #71717a; line-height: 1.6;">
        ${usagePercent >= 90 
          ? 'Critical: Your cluster may become unavailable if usage exceeds 100%.'
          : 'Consider upgrading your plan to ensure uninterrupted service.'}
      </p>
      <a href="${upgradeUrl}" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Upgrade Plan
      </a>
    `);
  }

  private getPaymentFailedTemplate(amount: string, updatePaymentUrl: string): string {
    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: #fef2f2; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 48px;">❌</span>
        <h2 style="margin: 16px 0 0; font-size: 20px; color: #dc2626;">
          Payment Failed
        </h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        We were unable to process your payment of <strong>${amount}</strong>.
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #71717a; line-height: 1.6;">
        Please update your payment method to avoid service interruption. If payment is not received within 7 days, your clusters may be paused.
      </p>
      <a href="${updatePaymentUrl}" style="display: inline-block; padding: 12px 32px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Update Payment Method
      </a>
    `);
  }

  private getPaymentSuccessTemplate(amount: string, invoiceUrl: string): string {
    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: #dcfce7; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 48px;">✅</span>
        <h2 style="margin: 16px 0 0; font-size: 20px; color: #166534;">
          Payment Received
        </h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        Thank you! Your payment of <strong>${amount}</strong> has been processed successfully.
      </p>
      <a href="${invoiceUrl}" style="display: inline-block; padding: 12px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        View Invoice
      </a>
    `);
  }

  private getSubscriptionUpgradedTemplate(oldPlan: string, newPlan: string, effectiveDate: string): string {
    return this.getBaseTemplate(`
      <div style="padding: 16px; background-color: #dbeafe; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 48px;">🎉</span>
        <h2 style="margin: 16px 0 0; font-size: 20px; color: #1e40af;">
          Plan Upgraded!
        </h2>
      </div>
      <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        Your subscription has been upgraded from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>.
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #71717a; line-height: 1.6;">
        Effective: ${effectiveDate}
      </p>
      <p style="margin: 0 0 24px; font-size: 16px; color: #3f3f46; line-height: 1.6;">
        You now have access to additional resources and features. Thank you for choosing EUTLAS!
      </p>
      <a href="${this.configService.get('FRONTEND_URL')}/dashboard" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Go to Dashboard
      </a>
    `);
  }
}
