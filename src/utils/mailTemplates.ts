/* ============================================================
    MAIL CONFIG & UTILS
============================================================ */

const LOGO_URL =
  "https://res.cloudinary.com/drls2cpnu/image/upload/v1765116373/The_Jud_rmzqa7.png"; // Replace with actual logo URL
const COLORS = {
  PRIMARY: "#1a3a32", // Judicial Deep Green
  ACCENT: "#c2a336", // Judicial Gold
  BG: "#f8f9fa",
  TEXT: "#333333",
  SLATE: "#64748b",
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
  appUrl?: string;
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
      <div style="background-color: ${
        COLORS.BG
      }; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
          <div style="background-color: ${
            COLORS.PRIMARY
          }; padding: 30px; text-align: center;">
            <img src="${LOGO_URL}" alt="Judicial Logo" style="height: 60px; margin-bottom: 15px;" />
            <div style="color: ${
              COLORS.ACCENT
            }; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Official Assignment</div>
            <h2 style="color: white; margin: 10px 0 0 0; font-size: 22px; letter-spacing: -0.5px;">New Indicator Assigned</h2>
          </div>

          <div style="padding: 40px; color: ${COLORS.TEXT};">
            <p style="margin-top: 0; font-size: 16px;">You have been assigned a new performance protocol in the registry:</p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 12px; border-left: 4px solid ${
              COLORS.ACCENT
            }; margin: 25px 0;">
              <h3 style="margin: 0 0 10px 0; color: ${
                COLORS.PRIMARY
              }; font-size: 18px;">${indicatorTitle}</h3>
              <p style="margin: 0; font-size: 14px; color: ${COLORS.SLATE};">
                <strong>Assigned By:</strong> ${assignedBy}<br />
                <strong>Deadline:</strong> ${formattedDate}
              </p>
            </div>

            ${
              appUrl
                ? `
              <div style="text-align: center; margin-top: 30px;">
                <a href="${appUrl}" style="background-color: ${COLORS.PRIMARY}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; border: 1px solid ${COLORS.ACCENT};">
                  ACCESS DASHBOARD
                </a>
              </div>
            `
                : ""
            }

            <p style="margin-top: 30px; font-size: 14px; color: ${
              COLORS.SLATE
            }; text-align: center;">
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

    text: `
OFFICIAL ASSIGNMENT
Indicator: ${indicatorTitle}
Assigned by: ${assignedBy}
Due date: ${formattedDate}

Access Dashboard: ${appUrl || "N/A"}

Please ensure timely submission for ratification.
    `.trim(),
  };
};

/* ============================================================
    EVIDENCE SUBMITTED (NOTIFICATION TO ADMIN)
============================================================ */

interface EvidenceSubmittedParams {
  indicatorTitle: string;
  submittedBy: string;
  submittedAt?: Date;
  appUrl?: string;
}

export const evidenceSubmittedTemplate = ({
  indicatorTitle,
  submittedBy,
  submittedAt = new Date(),
  appUrl,
}: EvidenceSubmittedParams): BaseMailTemplate => {
  const formattedDate = submittedAt.toLocaleString("en-GB");

  return {
    subject: `[REVIEW REQUIRED] Evidence Submitted: ${indicatorTitle}`,

    html: `
      <div style="background-color: ${
        COLORS.BG
      }; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
          <div style="background-color: ${
            COLORS.PRIMARY
          }; padding: 30px; text-align: center;">
            <img src="${LOGO_URL}" alt="Judicial Logo" style="height: 60px; margin-bottom: 15px;" />
            <div style="color: ${
              COLORS.ACCENT
            }; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Review Required</div>
            <h2 style="color: white; margin: 10px 0 0 0; font-size: 22px;">Evidence Submitted</h2>
          </div>

          <div style="padding: 40px; color: ${COLORS.TEXT};">
            <p style="margin-top: 0;">New evidence has been uploaded for your review:</p>
            
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin: 25px 0;">
                <div style="padding: 15px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    <strong style="color: ${
                      COLORS.PRIMARY
                    };">${indicatorTitle}</strong>
                </div>
                <div style="padding: 15px; font-size: 14px;">
                    <p style="margin: 5px 0;"><strong>Submitted By:</strong> ${submittedBy}</p>
                    <p style="margin: 5px 0;"><strong>Timestamp:</strong> ${formattedDate}</p>
                </div>
            </div>

            ${
              appUrl
                ? `
              <div style="text-align: center; margin-top: 30px;">
                <a href="${appUrl}" style="background-color: ${COLORS.PRIMARY}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; border: 1px solid ${COLORS.ACCENT};">
                  OPEN AUDIT DOSSIER
                </a>
              </div>
            `
                : ""
            }

            <p style="margin-top: 30px; font-size: 13px; color: ${
              COLORS.SLATE
            }; font-style: italic; text-align: center;">
              This indicator is now pending admin ratification.
            </p>
          </div>

          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
            <p style="font-size: 11px; color: #94a3b8; margin: 0;">
              Automated Judicial Registry System
            </p>
          </div>
        </div>
      </div>
    `,

    text: `
REVIEW REQUIRED
Evidence has been submitted for: ${indicatorTitle}
Submitted by: ${submittedBy}
Date: ${formattedDate}

Review Evidence: ${appUrl || "N/A"}
    `.trim(),
  };
};

/* ============================================================
    OTP LOGIN EMAIL TEMPLATE
============================================================ */
interface BaseMailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface OtpEmailParams {
  name: string;
  otp: string;
  appUrl?: string;
}

export const otpLoginTemplate = ({
  name,
  otp,
  appUrl,
}: OtpEmailParams): BaseMailTemplate => {
  return {
    subject: `[SECURE] ${otp} is your verification code`,

    html: `
      <div style="background-color: ${
        COLORS.BG
      }; padding: 40px 10px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08);">
          
          <div style="background-color: ${
            COLORS.PRIMARY
          }; padding: 40px 20px; text-align: center;">
            <img src="${LOGO_URL}" alt="Judicial Logo" style="height: 55px; margin-bottom: 20px; display: inline-block;" />
            <h2 style="color: white; margin: 0; font-size: 20px; letter-spacing: 0.5px; font-weight: 600;">Identity Verification</h2>
          </div>

          <div style="padding: 40px 30px; color: ${
            COLORS.TEXT
          }; line-height: 1.6;">
            <p style="margin-top: 0; font-size: 16px;">Hello <strong>${name}</strong>,</p>
            <p style="color: ${
              COLORS.SLATE
            }; font-size: 15px;">To complete your login to the <strong>Integrated Judicial Registry System</strong>, please use the following one-time password (OTP):</p>
            
            <div style="margin: 35px 0; text-align: center;">
              <div style="background: #f8fafc; border: 1px dashed ${
                COLORS.ACCENT
              }; padding: 25px; border-radius: 8px; display: inline-block; min-width: 200px;">
                <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; color: ${
                  COLORS.PRIMARY
                }; letter-spacing: 8px; margin-left: 8px;">
                  ${otp}
                </span>
              </div>
              <p style="color: #ef4444; font-size: 13px; font-weight: 600; margin-top: 15px; margin-bottom: 0;">
                Valid for 5 minutes only
              </p>
            </div>

            ${
              appUrl
                ? `<div style="text-align: center; margin-bottom: 30px;">
                     <a href="${appUrl}" style="background-color: ${COLORS.PRIMARY}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                       Return to Application
                     </a>
                   </div>`
                : ""
            }

            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            
            <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
              <strong>Security Note:</strong> If you did not request this code, your account may be at risk. Please change your password or contact the system administrator immediately.
            </p>
          </div>

          <div style="background-color: #f1f5f9; padding: 25px; text-align: center;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5;">
              This is an automated security notification.<br />
              Integrated Judicial Registry System &copy; ${new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    `,

    text: `
SECURITY VERIFICATION
---------------------
Hi ${name},

Your login OTP is: ${otp}

This code is valid for 5 minutes. 

If you did not request this OTP, please contact support or your system administrator immediately.

Integrated Judicial Registry System.
    `.trim(),
  };
};
