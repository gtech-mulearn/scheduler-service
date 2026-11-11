/**
 * Clean, responsive HTML email templates for Grit Meter alerts & level-down notifications.
 */

export function getGritWarningTemplate(params: {
  firstName: string;
  grit: number;
  levelOrder: number;
  levelName: string;
}): { subject: string; html: string; text: string } {
  const { firstName, grit, levelOrder, levelName } = params;
  const daysLeft = grit; // Since grit decays by 1 per day of inactivity

  let urgencyColor = '#F59E0B'; // Amber
  let urgencyTitle = 'Grit Meter Alert: Your Level Is At Risk';
  let badgeText = `${grit}% Grit Remaining`;

  if (grit <= 5) {
    urgencyColor = '#EF4444'; // Red
    urgencyTitle = 'Urgent: Imminent Level Demotion';
    badgeText = `CRITICAL: ${daysLeft} Day${daysLeft === 1 ? '' : 's'} Left`;
  } else if (grit <= 20) {
    urgencyColor = '#F97316'; // Orange
    urgencyTitle = 'Attention: Your Grit Is Dropping Fast';
  }

  const subject = `[μLearn] ${urgencyTitle} (Level ${levelOrder})`;

  const text = `Hi ${firstName},

Your Grit Meter for ${levelName} is currently at ${grit}%. 
You have approximately ${daysLeft} day(s) of inactivity left before being leveled down to Level ${levelOrder - 1}.

To restore your grit and keep your level intact, submit any verified task proof on Discord or complete a learning activity today!

Visit Dashboard: https://app.mulearn.org/dashboard

Best regards,
The μLearn Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0ea5e9, #6366f1); padding: 25px 30px; text-align: left;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: 700; letter-spacing: -0.5px;">μLearn</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 1px;">Grit Meter Status Alert</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; margin: 0 0 18px; color: #e2e8f0;">Hi <strong>${firstName}</strong>,</p>
              
              <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #94a3b8;">
                We noticed you haven't been active recently. Your Grit Meter on <strong style="color: #f1f5f9;">${levelName} (Level ${levelOrder})</strong> has decayed to:
              </p>

              <!-- Grit Meter Card -->
              <table role="presentation" width="100%" style="background-color: #0f172a; border-radius: 8px; border-left: 4px solid ${urgencyColor}; padding: 16px; margin: 0 0 24px;">
                <tr>
                  <td>
                    <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; color: ${urgencyColor}; margin-bottom: 6px;">${badgeText}</div>
                    <div style="font-size: 26px; font-weight: 800; color: #f8fafc; margin-bottom: 8px;">${grit}%</div>
                    <div style="background-color: #334155; border-radius: 6px; height: 10px; width: 100%; overflow: hidden;">
                      <div style="background-color: ${urgencyColor}; height: 10px; width: ${Math.max(4, grit)}%; border-radius: 6px;"></div>
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                      Estimated time until level demotion: <strong>~${daysLeft} day(s)</strong> of inactivity.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin: 0 0 24px;">
                Every day without verified karma activity reduces your grit by 1. Once grit reaches zero, you will level down to <strong>Level ${levelOrder - 1}</strong>.
              </p>

              <!-- CTA -->
              <div style="text-align: center; margin: 30px 0 20px;">
                <a href="https://app.mulearn.org/dashboard" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);">
                  Submit a Task & Save Your Level
                </a>
              </div>

              <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 20px 0 0; text-align: center;">
                Submitting any task on Discord or participating in an Interest Group task immediately awards +1 grit and re-activates your streak!
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #0b1120; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #475569;">
              © ${new Date().getFullYear()} GTech μLearn. All rights reserved.<br>
              You are receiving this because you are an active learner on the μLearn platform.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return { subject, html, text };
}

export function getLevelDownTemplate(params: {
  firstName: string;
  previousLevelOrder: number;
  newLevelOrder: number;
  newLevelName: string;
}): { subject: string; html: string; text: string } {
  const { firstName, previousLevelOrder, newLevelOrder, newLevelName } = params;

  const subject = `[μLearn] Notice: You Have Leveled Down to Level ${newLevelOrder}`;

  const text = `Hi ${firstName},

Your Grit Meter reached 0% due to prolonged inactivity, and your profile has been leveled down from Level ${previousLevelOrder} to Level ${newLevelOrder} (${newLevelName}).

Your Grit Meter has been reset to 100% to protect your current level.

How to regain your level:
Complete new tasks and earn the required karma for Level ${previousLevelOrder}. Note that only tasks submitted after today will count towards re-qualifying.

Visit Dashboard: https://app.mulearn.org/dashboard

Keep learning,
The μLearn Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 25px 30px; text-align: left;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: 700; letter-spacing: -0.5px;">μLearn</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 1px;">Level Demotion Notice</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; margin: 0 0 18px; color: #e2e8f0;">Hi <strong>${firstName}</strong>,</p>
              
              <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #94a3b8;">
                Your Grit Meter reached 0% after extended inactivity. As part of our anti-decay progression system, your profile has been updated:
              </p>

              <!-- Level Down Card -->
              <table role="presentation" width="100%" style="background-color: #0f172a; border-radius: 8px; border: 1px solid #ef4444/30; padding: 18px; margin: 0 0 24px; text-align: center;">
                <tr>
                  <td>
                    <div style="font-size: 14px; color: #94a3b8; margin-bottom: 6px;">Previous Level: <span style="text-decoration: line-through; color: #ef4444;">Level ${previousLevelOrder}</span></div>
                    <div style="font-size: 24px; font-weight: 800; color: #38bdf8;">Current: Level ${newLevelOrder} (${newLevelName})</div>
                    <div style="font-size: 12px; color: #10b981; margin-top: 8px; font-weight: 600;">Grit reset to 100% (Protected)</div>
                  </td>
                </tr>
              </table>

              <div style="background-color: #1e293b; border-left: 3px solid #38bdf8; padding: 12px 16px; border-radius: 4px; margin: 0 0 24px;">
                <p style="font-size: 13px; line-height: 1.5; color: #cbd5e1; margin: 0;">
                  <strong>How to re-qualify:</strong> Submit fresh task proofs on Discord! Only karma earned after today's demotion will count toward unlocking Level ${previousLevelOrder} again.
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin: 30px 0 20px;">
                <a href="https://app.mulearn.org/dashboard" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);">
                  View Available Tasks
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #0b1120; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #475569;">
              © ${new Date().getFullYear()} GTech μLearn. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return { subject, html, text };
}
