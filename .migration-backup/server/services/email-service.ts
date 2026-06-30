import nodemailer from "nodemailer";
import { log } from "../index";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  log("SMTP not configured — emails will be logged to console only", "email");
  return null;
}

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:5000";
}

function getFromAddress(): string {
  return process.env.SMTP_FROM || "noreply@heygrand.com";
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    log(`[EMAIL SIMULATED] To: ${to} | Subject: ${subject} | ${text}`, "email");
    return true;
  }

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject,
      text,
      html,
    });
    log(`Email sent to ${to}: ${subject}`, "email");
    return true;
  } catch (err: any) {
    log(`Failed to send email to ${to}: ${err.message}`, "email");
    return false;
  }
}

export async function sendVerificationEmail(
  to: string,
  contactName: string,
  token: string
): Promise<boolean> {
  const appUrl = getAppUrl();
  const verificationUrl = `${appUrl}/verify-email?token=${token}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Welcome to HeyGrand, ${contactName}!</h2>
      <p>Thank you for registering your facility. Please verify your email address to activate your 30-day free trial.</p>
      <p style="margin: 24px 0;">
        <a href="${verificationUrl}"
           style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Verify Email Address
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">This link expires in 24 hours. If you didn't register, you can safely ignore this email.</p>
      <p style="color: #666; font-size: 12px;">Or copy this URL: ${verificationUrl}</p>
    </div>
  `;

  const text = `Welcome to HeyGrand, ${contactName}!\n\nVerify your email: ${verificationUrl}\n\nThis link expires in 24 hours.`;

  return sendEmail(to, "Verify your HeyGrand email address", html, text);
}

export async function sendWelcomeAndCredentialsEmail(
  to: string,
  contactName: string,
  facilityName: string,
  loginUrl: string,
  username: string,
  trialEndsAt: Date
): Promise<boolean> {
  const trialEndStr = trialEndsAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Your HeyGrand trial is ready!</h2>
      <p>Hi ${contactName},</p>
      <p>Your facility <strong>${facilityName}</strong> has been verified and your 30-day free trial is now active.</p>
      <p><strong>Trial period ends:</strong> ${trialEndStr}</p>
      <h3>Login credentials</h3>
      <p><strong>Dashboard URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p><strong>Username:</strong> ${username}</p>
      <p style="color: #666; font-size: 14px;">Use the password you set during registration to log in.</p>
      <p style="margin: 24px 0;">
        <a href="${loginUrl}"
           style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Access Dashboard
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">During your trial, you have full access to all HeyGrand features. Subscribe before your trial ends to keep your data and continue uninterrupted.</p>
    </div>
  `;

  const text = `Hi ${contactName},\n\nYour HeyGrand trial for ${facilityName} is now active!\n\nTrial ends: ${trialEndStr}\nDashboard: ${loginUrl}\nUsername: ${username}\n\nUse the password you set during registration.`;

  return sendEmail(to, `Your HeyGrand trial is active — welcome, ${facilityName}!`, html, text);
}

export async function sendSuperAdminNewRegistrationEmail(
  to: string,
  facilityName: string,
  contactName: string,
  contactEmail: string,
  trialEndsAt: Date
): Promise<boolean> {
  const trialEndStr = trialEndsAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">New facility trial started</h2>
      <p>A new facility has completed email verification and started a trial:</p>
      <ul>
        <li><strong>Facility:</strong> ${facilityName}</li>
        <li><strong>Contact:</strong> ${contactName} (${contactEmail})</li>
        <li><strong>Trial ends:</strong> ${trialEndStr}</li>
      </ul>
      <p>You can review this facility in the Super Admin dashboard.</p>
    </div>
  `;

  const text = `New facility trial started:\nFacility: ${facilityName}\nContact: ${contactName} (${contactEmail})\nTrial ends: ${trialEndStr}`;

  return sendEmail(to, `New trial: ${facilityName}`, html, text);
}
