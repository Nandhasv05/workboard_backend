import nodemailer from 'nodemailer';
import env from '../config/env.js';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.secure,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.password,
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false,
  },
});

export const sendEmail = async (options: EmailOptions) => {
  try {
    const toAddress = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    if (!toAddress || toAddress.trim() === '') {
      console.warn('[EmailService] Skipped sending: No recipient address provided');
      return null;
    }

    const info = await transporter.sendMail({
      from: options.from || env.smtp.from,
      to: toAddress,
      subject: options.subject,
      text: options.text || '',
      html: options.html || `<p>${options.text || ''}</p>`,
    });

    console.log(`[EmailService] Email sent successfully to ${toAddress} (Message ID: ${info.messageId})`);
    return info;
  } catch (error: any) {
    console.error('[EmailService] Failed to send email:', error?.message || error);
    throw error;
  }
};

export const sendTaskAssignmentEmail = async (params: {
  to: string;
  recipientName: string;
  taskTitle: string;
  boardName?: string;
  assignerName?: string;
  dueDate?: string;
  taskUrl?: string;
}) => {
  const subject = `[WorkBoard] You have been assigned: ${params.taskTitle}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
        <div style="background: #0052cc; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 6px;">WorkBoard</div>
        <span style="color: #64748b; font-size: 13px;">Task Assignment Notification</span>
      </div>
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Hello ${params.recipientName || 'there'},</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">
        ${params.assignerName ? `<strong>${params.assignerName}</strong> assigned you` : 'You have been assigned'} to a task on WorkBoard:
      </p>
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #0052cc; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 17px;">${params.taskTitle}</h3>
        ${params.boardName ? `<p style="margin: 4px 0; font-size: 13px; color: #64748b;">Board: <strong style="color: #1e293b;">${params.boardName}</strong></p>` : ''}
        ${params.dueDate ? `<p style="margin: 4px 0; font-size: 13px; color: #d97706;">Due Date: <strong>${params.dueDate}</strong></p>` : ''}
      </div>
      ${params.taskUrl ? `
        <div style="margin: 28px 0;">
          <a href="${params.taskUrl}" style="background: #0052cc; color: #ffffff; text-decoration: none; padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 6px; display: inline-block;">
            Open Task in WorkBoard &rarr;
          </a>
        </div>
      ` : ''}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        Sent automatically from WorkBoard • Evolv Clothing System
      </p>
    </div>
  `;

  return sendEmail({
    to: params.to,
    subject,
    text: `You were assigned to "${params.taskTitle}" on WorkBoard.`,
    html,
  });
};

export const sendBoardMemberEmail = async (params: {
  to: string;
  recipientName: string;
  boardName: string;
  inviterName?: string;
  role?: string;
  boardUrl?: string;
}) => {
  const subject = `[WorkBoard] You have been added to ${params.boardName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="background: #0052cc; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 6px; display: inline-block; margin-bottom: 20px;">WorkBoard</div>
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Hello ${params.recipientName || 'there'},</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">
        ${params.inviterName ? `<strong>${params.inviterName}</strong> added you` : 'You have been added'} to the board <strong>${params.boardName}</strong>${params.role ? ` as a <em>${params.role}</em>` : ''}.
      </p>
      ${params.boardUrl ? `
        <div style="margin: 24px 0;">
          <a href="${params.boardUrl}" style="background: #0052cc; color: #ffffff; text-decoration: none; padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 6px; display: inline-block;">
            Open Board &rarr;
          </a>
        </div>
      ` : ''}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        Sent automatically from WorkBoard • Evolv Clothing System
      </p>
    </div>
  `;

  return sendEmail({
    to: params.to,
    subject,
    text: `You have been added to "${params.boardName}" on WorkBoard.`,
    html,
  });
};

export const sendMentionEmail = async (params: {
  to: string;
  recipientName: string;
  mentionerName: string;
  taskTitle: string;
  boardName: string;
  contextText: string;
  source: 'description' | 'comment';
  taskUrl?: string;
}) => {
  const subject = `[WorkBoard] ${params.mentionerName} mentioned you in "${params.taskTitle}"`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
        <div style="background: #0052cc; color: #ffffff; font-weight: 800; font-size: 14px; padding: 6px 12px; border-radius: 6px;">WorkBoard</div>
        <span style="color: #64748b; font-size: 13px;">Team Mention Notification</span>
      </div>
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Hello ${params.recipientName || 'there'},</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">
        <strong>${params.mentionerName}</strong> mentioned you in the <strong>${params.source === 'comment' ? 'comment' : 'description'}</strong> of <strong>${params.taskTitle}</strong>:
      </p>
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #7c3aed; border-radius: 8px; padding: 16px; margin: 20px 0; color: #1e293b; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
        ${params.contextText}
      </div>
      ${params.boardName ? `<p style="font-size: 13px; color: #64748b; margin: 8px 0;">Board: <strong style="color: #0f172a;">${params.boardName}</strong></p>` : ''}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        Sent automatically from WorkBoard • Evolv Clothing System
      </p>
    </div>
  `;

  return sendEmail({
    to: params.to,
    subject,
    text: `${params.mentionerName} mentioned you in "${params.taskTitle}": ${params.contextText}`,
    html,
  });
};
