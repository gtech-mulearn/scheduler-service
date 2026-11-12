/**
 * Minimalist μLearn Email Templates for Grit Meter Alerts & Level Down.
 * Matches the official μLearn frontend theme (brand-blue: #2e85fe, warning: #ff8d0c, destructive: #f44336).
 */

export function getGritWarningTemplate(params: {
  firstName: string;
  grit: number;
  levelOrder: number;
  levelName: string;
}): { subject: string; html: string; text: string } {
  const { firstName, grit, levelOrder, levelName } = params;
  const daysLeft = grit;
  const isCritical = grit <= 5;
  const metricColor = isCritical ? '#f44336' : grit <= 20 ? '#ff8d0c' : '#2e85fe';

  const subject = isCritical
    ? `[Urgent] μLearn: Level ${levelOrder} Grit Alert (${grit}% Remaining)`
    : `μLearn: Level ${levelOrder} Grit Alert (${grit}% Remaining)`;

  const text = `Hi ${firstName},

Your current Grit is ${grit}% for ${levelName} (Level ${levelOrder}).

You have approximately ${daysLeft} day(s) before leveling down to Level ${levelOrder - 1}.

How to increase your grit:
Each day with verified karma activity adds +1 to your grit (up to 100). Inactive days reduce it by 1. Submit tasks or participate in interest group activities to maintain your level.

Dashboard: https://app.mulearn.org/dashboard

μLearn Foundation | Copyright © 2026. All rights reserved.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 40px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 28px;">
    <tr>
      <td>
        <!-- Logo -->
        <div style="margin-bottom: 24px;">
          <a href="https://app.mulearn.org/" target="_blank">
            <img src="https://app.mulearn.org/logo.webp" alt="μLearn" width="125" style="display: block; border: 0; max-width: 100%; height: auto;" />
          </a>
        </div>

        <!-- Greeting & Status -->
        <h2 style="font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 12px 0;">
          ${isCritical ? 'CRITICAL: ' : ''}Level ${levelOrder} Grit Alert
        </h2>
        <p style="font-size: 14px; line-height: 1.5; color: #334155; margin: 0 0 20px 0;">
          Hi ${firstName}, your current Grit is at <strong>${grit}%</strong> for <strong>${levelName} (Level ${levelOrder})</strong>.
        </p>

        <!-- Grit Metric Box -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 20px;">
          <div style="font-size: 32px; font-weight: 700; color: ${metricColor};">
            ${grit}%
          </div>
          <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
            ${daysLeft} Day${daysLeft === 1 ? '' : 's'} remaining before demotion
          </div>
        </div>

        <!-- Brief: How to increase -->
        <p style="font-size: 13px; line-height: 1.6; color: #475569; margin: 0 0 22px 0;">
          <strong>How to increase your grit:</strong><br />
          Each day with verified karma activity adds <strong>+1 grit</strong> (up to 100). Every day of inactivity reduces it by 1. Submit task proof on Discord or complete interest group activities to recharge your score.
        </p>

        <!-- Button with frontend brand-blue and rounded-full -->
        <div style="margin-bottom: 28px;">
          <a href="https://app.mulearn.org/dashboard" target="_blank" style="display: inline-block; background-color: #2e85fe; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 9999px; font-size: 13px; font-weight: 500;">
            View Tasks on Dashboard
          </a>
        </div>

        <!-- Copyright & Footer -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center;">
          μLearn Foundation | Copyright © 2026. All rights reserved.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export function getLevelDownTemplate(params: {
  firstName: string;
  previousLevelOrder: number;
  newLevelOrder: number;
  newLevelName: string;
}): { subject: string; html: string; text: string } {
  const { firstName, previousLevelOrder, newLevelOrder, newLevelName } = params;

  const subject = `μLearn: Leveled Down to Level ${newLevelOrder}`;

  const text = `Hi ${firstName},

Your Grit reached 0% due to inactivity. You have been moved down from Level ${previousLevelOrder} to Level ${newLevelOrder} (${newLevelName}).

Your Grit Meter has been reset to 100%.

How to regain your level:
Earn karma by completing tasks from today onwards. Submissions will count toward regaining Level ${previousLevelOrder}.

Dashboard: https://app.mulearn.org/dashboard

μLearn Foundation | Copyright © 2026. All rights reserved.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 40px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 28px;">
    <tr>
      <td>
        <!-- Logo -->
        <div style="margin-bottom: 24px;">
          <a href="https://app.mulearn.org/" target="_blank">
            <img src="https://app.mulearn.org/logo.webp" alt="μLearn" width="125" style="display: block; border: 0; max-width: 100%; height: auto;" />
          </a>
        </div>

        <!-- Heading & Notice -->
        <h2 style="font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 12px 0;">
          Level Demotion Notice
        </h2>
        <p style="font-size: 14px; line-height: 1.5; color: #334155; margin: 0 0 20px 0;">
          Hi ${firstName}, your Grit reached 0% due to inactivity. You have been moved down from <strong>Level ${previousLevelOrder}</strong> to <strong>Level ${newLevelOrder} (${newLevelName})</strong>.
        </p>

        <!-- Status Box -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
          <div style="font-size: 14px; color: #334155;">
            Current Level: <strong>Level ${newLevelOrder} (${newLevelName})</strong>
          </div>
          <div style="font-size: 12px; color: #4caf50; font-weight: 500; margin-top: 4px;">
            Grit Meter reset to 100%
          </div>
        </div>

        <!-- How to regain -->
        <p style="font-size: 13px; line-height: 1.6; color: #475569; margin: 0 0 22px 0;">
          <strong>How to regain Level ${previousLevelOrder}:</strong><br />
          Earn karma through fresh learning activities. Any tasks approved from today onwards count towards re-qualifying for Level ${previousLevelOrder}.
        </p>

        <!-- Button with frontend brand-blue and rounded-full -->
        <div style="margin-bottom: 28px;">
          <a href="https://app.mulearn.org/dashboard" target="_blank" style="display: inline-block; background-color: #2e85fe; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 9999px; font-size: 13px; font-weight: 500;">
            View Available Tasks
          </a>
        </div>

        <!-- Copyright & Footer -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center;">
          μLearn Foundation | Copyright © 2026. All rights reserved.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
