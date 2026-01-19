import nodemailer from "nodemailer";
import SMTPConnection from "nodemailer/lib/smtp-connection";
import { env } from "../config/env";

/* ============================================================
   SMTP OPTIONS (FORCE CORRECT OVERLOAD)
============================================================ */

const smtpOptions: SMTPConnection.Options = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: env.GMAIL_USER,
    pass: env.GMAIL_PASS, // App Password
  },
};

/* ============================================================
   TRANSPORTER
============================================================ */

const transporter = nodemailer.createTransport(smtpOptions);

/* ============================================================
   TYPES
============================================================ */

interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/* ============================================================
   SEND MAIL (MAIN FUNCTION)
============================================================ */

/**
 * Sends an email using the pre-configured transporter.
 * Exported as default to prevent "is not a function" errors
 * during complex module resolution.
 */
const sendMail = async ({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendMailOptions): Promise<void> => {
  await transporter.sendMail({
    from: `"${env.GMAIL_FROM_NAME ?? "ORHC"}" <${
      env.GMAIL_FROM_EMAIL ?? env.GMAIL_USER
    }>`,
    to,
    subject,
    html,
    text,
    replyTo,
  });
};

// Default export for the primary function
export default sendMail;

/* ============================================================
   UTILITIES (NAMED EXPORTS)
============================================================ */

export const verifyMailConnection = async (): Promise<void> => {
  await transporter.verify();
};
