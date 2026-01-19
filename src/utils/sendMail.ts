import * as SibApiV3Sdk from "@sendinblue/client";
import { env } from "../config/env";

/* ============================================================
   BREVO CLIENT SETUP
============================================================ */
const transactionalApi = new SibApiV3Sdk.TransactionalEmailsApi();
transactionalApi.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, env.BREVO_API_KEY);

const accountApi = new SibApiV3Sdk.AccountApi();
accountApi.setApiKey(SibApiV3Sdk.AccountApiApiKeys.apiKey, env.BREVO_API_KEY);

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
   SEND MAIL FUNCTION
============================================================ */
export const sendMail = async ({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendMailOptions) => {
  try {
    const recipients = Array.isArray(to) ? to.map((email) => ({ email })) : [{ email: to }];

    const emailData: SibApiV3Sdk.SendSmtpEmail = {
      sender: {
        name: env.MAIL_FROM_NAME,
        email: env.MAIL_FROM_EMAIL, // Must be a verified domain email in production
      },
      to: recipients,
      subject,
      htmlContent: html,
      textContent: text,
      replyTo: replyTo ? { email: replyTo } : undefined,
    };

    const response = await transactionalApi.sendTransacEmail(emailData);

    const messageId = (response as any)?.messageId || "N/A";
    console.log(`[EMAIL SENT] to ${to} | Message ID: ${messageId}`);

    return response;
  } catch (err: any) {
    console.error(`[EMAIL ERROR] to ${to}:`, err?.response?.body || err.message || err);
    throw new Error(`Email sending failed: ${err?.response?.body?.message || err.message}`);
  }
};

/* ============================================================
   VERIFY MAIL CONNECTION
============================================================ */
export const verifyMailConnection = async () => {
  try {
    const accountInfo = await accountApi.getAccount();
    const email = (accountInfo.body as any)?.email || "N/A";
    console.log("[BREVO] Connected successfully:", email);
  } catch (err: any) {
    console.error("[BREVO] Connection failed:", err.message || err);
    throw err;
  }
};

export default sendMail;
