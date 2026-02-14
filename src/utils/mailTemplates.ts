/* ============================================================
    MAIL CONFIG & UTILS
============================================================ */

const LOGO_URL =
  "https://res.cloudinary.com/drls2cpnu/image/upload/v1765116373/The_Jud_rmzqa7.png";

const COLORS = {
  PRIMARY: "#1a3a32", // Judicial Deep Green
  ACCENT: "#c2a336", // Judicial Gold
  BG: "#f8f9fa",
  TEXT: "#333333",
  SLATE: "#64748b",
  DANGER: "#be123c", // Rejection Red
  SUCCESS: "#06402B",
};

interface BaseMailTemplate {
  subject: string;
  html: string;
  text: string;
}

/* ============================================================
    INDICATOR CREATED (ASSIGNMENT)
============================================================ */

interface IndicatorCreatedParams {
  indicatorTitle: string;
  assignedBy: string;
  dueDate: Date;
  appUrl: string; // Added to match controller logic and fix ts(2353)
}

export const indicatorCreatedTemplate = ({
  indicatorTitle,
  assignedBy,
  dueDate,
  appUrl,
}: IndicatorCreatedParams): BaseMailTemplate => {
  const formattedDate = dueDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    subject: `[OFFICIAL] New Performance Indicator Assigned: ${indicatorTitle}`,

    html: `
      <div style="background-color: ${COLORS.BG}; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
          <div style="background-color: ${COLORS.PRIMARY}; padding: 30px; text-align: center;">
            <img src="${LOGO_URL}" alt="Judicial Logo" style="height: 60px; margin-bottom: 15px;" />
            <div style="color: ${COLORS.ACCENT}; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Official Assignment</div>
            <h2 style="color: white; margin: 10px 0 0 0; font-size: 22px; letter-spacing: -0.5px;">New Indicator Assigned</h2>
          </div>

          <div style="padding: 40px; color: ${COLORS.TEXT};">
            <p style="margin-top: 0; font-size: 16px;">You have been assigned a new performance protocol in the registry:</p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 12px; border-left: 4px solid ${COLORS.ACCENT}; margin: 25px 0;">
              <h3 style="margin: 0 0 10px 0; color: ${COLORS.PRIMARY}; font-size: 18px;">${indicatorTitle}</h3>
              <p style="margin: 0; font-size: 14px; color: ${COLORS.SLATE};">
                <strong>Assigned By:</strong> ${assignedBy}<br />
                <strong>Deadline:</strong> ${formattedDate}
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${appUrl}" style="background-color: ${COLORS.PRIMARY}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; border: 1px solid ${COLORS.ACCENT};">
                ACCESS DASHBOARD
              </a>
            </div>

            <p style="margin-top: 30px; font-size: 14px; color: ${COLORS.SLATE}; text-align: center;">
              Please ensure all evidence is uploaded prior to the deadline for ratification.
            </p>
          </div>

          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
            <p style="font-size: 11px; color: #94a3b8; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
              Integrated Performance Management System &copy; ${new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    `,

    text: `OFFICIAL ASSIGNMENT: ${indicatorTitle}. Assigned by: ${assignedBy}. Due: ${formattedDate}. Access: ${appUrl}`,
  };
};

/* ============================================================
    INDICATOR REJECTED (REVISION REQUIRED)
============================================================ */

interface IndicatorRejectedParams {
  indicatorTitle: string;
  rejectionNotes: string;
  appUrl: string; // Synchronized with current URL pattern
}

export const indicatorRejectedTemplate = ({
  indicatorTitle,
  rejectionNotes,
  appUrl,
}: IndicatorRejectedParams): BaseMailTemplate => {
  return {
    subject: `[ACTION REQUIRED] Revision Needed: ${indicatorTitle}`,
    html: `
      <div style="background-color: ${COLORS.BG}; padding: 40px 20px; font-family: sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background-color: ${COLORS.DANGER}; padding: 30px; text-align: center;">
            <h2 style="color: white; margin: 0;">Revision Required</h2>
          </div>
          <div style="padding: 40px; color: ${COLORS.TEXT};">
            <p>Your submission for <strong>${indicatorTitle}</strong> requires updates based on the following auditor notes:</p>
            <div style="background: #fff1f2; border-left: 4px solid ${COLORS.DANGER}; padding: 20px; margin: 25px 0; font-style: italic; color: #9f1239;">
              "${rejectionNotes}"
            </div>
            <div style="text-align: center;">
              <a href="${appUrl}" style="background-color: ${COLORS.PRIMARY}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                RE-SUBMIT EVIDENCE
              </a>
            </div>
          </div>
        </div>
      </div>
    `,
    text: `REVISION REQUIRED: ${indicatorTitle}. Notes: ${rejectionNotes}. Access: ${appUrl}`,
  };
};

export interface IndicatorApprovedParams {
  indicatorTitle: string;
  appUrl: string;
}

export const indicatorApprovedTemplate = ({
  indicatorTitle,
  appUrl,
}: IndicatorApprovedParams): BaseMailTemplate => {
  return {
    subject: `[SUCCESS] Indicator Approved: ${indicatorTitle}`,
    html: `
      <div style="background-color: ${COLORS.BG}; padding: 40px 20px; font-family: sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background-color: ${COLORS.SUCCESS}; padding: 30px; text-align: center;">
            <h2 style="color: white; margin: 0;">Indicator Approved</h2>
          </div>
          <div style="padding: 40px; color: ${COLORS.TEXT};">
            <p>Good news! Your submission for <strong>${indicatorTitle}</strong> has been reviewed and approved.</p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${appUrl}" style="background-color: ${COLORS.PRIMARY}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                VIEW INDICATOR
              </a>
            </div>
          </div>
        </div>
      </div>
    `,
    text: `SUCCESS: Your submission for "${indicatorTitle}" has been approved. Access it here: ${appUrl}`,
  };
};

/* ============================================================
    EVIDENCE SUBMITTED (NOTIFICATION TO ADMIN)
============================================================ */

interface EvidenceSubmittedParams {
  indicatorTitle: string;
  submittedBy: string;
  appUrl: string; // Synchronized with current URL pattern
}

export const evidenceSubmittedTemplate = ({
  indicatorTitle,
  submittedBy,
  appUrl,
}: EvidenceSubmittedParams): BaseMailTemplate => {
  return {
    subject: `[REVIEW REQUIRED] Evidence Submitted: ${indicatorTitle}`,
    html: `
      <div style="background-color: ${COLORS.BG}; padding: 40px 20px; font-family: sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background-color: ${COLORS.PRIMARY}; padding: 30px; text-align: center;">
            <img src="${LOGO_URL}" alt="Judicial Logo" style="height: 55px;" />
            <h2 style="color: white; margin-top: 15px;">Review Required</h2>
          </div>
          <div style="padding: 40px;">
            <p>New evidence has been uploaded by <strong>${submittedBy}</strong> for:</p>
            <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 30px;">
              <strong>${indicatorTitle}</strong>
            </div>
            <div style="text-align: center;">
              <a href="${appUrl}" style="background-color: ${COLORS.PRIMARY}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                OPEN AUDIT DOSSIER
              </a>
            </div>
          </div>
        </div>
      </div>
    `,
    text: `Review required for ${indicatorTitle} submitted by ${submittedBy}. Link: ${appUrl}`,
  };
};

/* ============================================================
    OTP LOGIN EMAIL TEMPLATE
============================================================ */

interface OtpEmailParams {
  name: string;
  otp: string;
  appUrl?: string; // Optional return link
}

export const otpLoginTemplate = ({
  name,
  otp,
  appUrl,
}: OtpEmailParams): BaseMailTemplate => {
  return {
    subject: `[SECURE] ${otp} is your verification code`,
    html: `
      <div style="background-color: ${COLORS.BG}; padding: 40px 10px; font-family: sans-serif;">
        <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
          <div style="background-color: ${COLORS.PRIMARY}; padding: 40px 20px; text-align: center;">
            <img src="${LOGO_URL}" alt="Judicial Logo" style="height: 55px; margin-bottom: 20px;" />
            <h2 style="color: white; margin: 0;">Identity Verification</h2>
          </div>
          <div style="padding: 40px 30px; color: ${COLORS.TEXT}; text-align: center;">
            <p>Hello <strong>${name}</strong>, use the code below to log in:</p>
            <div style="margin: 30px 0; background: #f8fafc; border: 1px dashed ${COLORS.ACCENT}; padding: 25px; border-radius: 8px;">
              <span style="font-family: monospace; font-size: 36px; font-weight: 700; color: ${COLORS.PRIMARY}; letter-spacing: 8px;">
                ${otp}
              </span>
            </div>
            <p style="color: #ef4444; font-size: 13px; font-weight: 600;">Valid for 5 minutes only</p>
            ${appUrl ? `<a href="${appUrl}" style="color: ${COLORS.PRIMARY}; font-size: 14px; text-decoration: underline;">Back to App</a>` : ""}
          </div>
        </div>
      </div>
    `,
    text: `Your login OTP is: ${otp}`,
  };
};

/* ============================================================
    OVERDUE REMINDER (NUDGE)
============================================================ */

interface OverdueReminderParams {
  indicatorTitle: string;
  dueDate: Date;
  appUrl: string;
}

export const overdueReminderTemplate = ({
  userName,
  indicatorTitle,
  dueDate,
  appUrl,
}: OverdueReminderParams & { userName: string }): BaseMailTemplate => {
  const formattedDate = new Date(dueDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    subject: `Overdue Task: ${indicatorTitle}`,

    html: `
      <div style="background-color: #F8FAFC; padding: 40px 20px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
          
          <div style="background-color: #1E3A2B; padding: 30px; text-align: center;">
            <img src="${LOGO_URL}" alt="Judiciary Logo" style="height: 60px; margin-bottom: 10px;" />
            <h2 style="color: white; margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.5px;">Office of the Registrar High Court</h2>
          </div>

          <div style="padding: 40px; color: #1e293b; line-height: 1.6;">
            <p style="margin-top: 0; font-size: 16px;">Dear <strong>${userName}</strong>,</p>
            
            <p style="font-size: 15px;">
              I note that the following task is overdue:
            </p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #EFBF04;">
              <p style="margin: 0; font-weight: 700; color: #1E3A2B; font-size: 16px;">${indicatorTitle}</p>
              <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">Deadline: ${formattedDate}</p>
            </div>

            <p style="font-size: 15px;">
              Kindly let me know the challenges you are facing in completing the task and any support you may need.
            </p>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${appUrl}" style="background-color: #1E3A2B; color: #EFBF04; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
                VIEW TASK DETAILS
              </a>
            </div>
          </div>

          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #94a3b8; margin: 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
              REGISTRAR HIGH COURT
            </p>
            <p style="font-size: 10px; color: #cbd5e1; margin: 5px 0 0 0;">
              Performance Management System &copy; ${new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    `,

    text: `Dear ${userName}, I note that the task "${indicatorTitle}" is overdue. Kindly let me know the challenges you are facing in completing the task and any support you may need. RHC - OFFICE OF THE REGISTRAR HIGH COURT`,
  };
};