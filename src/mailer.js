const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

async function sendRecallAlert(toEmail, item, recall) {
  const subject = `Recall alert: ${item.label}`;
  const text = [
    `One of your watched items may have been recalled.`,
    ``,
    `You're watching: ${item.label}`,
    `Source: ${recall.sourceLabel}`,
    `Title: ${recall.title}`,
    recall.reason ? `Reason: ${recall.reason}` : null,
    recall.url ? `Details: ${recall.url}` : null,
    ``,
    `If this doesn't match your item, you can ignore this email.`
  ].filter(Boolean).join('\n');

  const html = `
    <p>One of your watched items may have been recalled.</p>
    <p><strong>You're watching:</strong> ${escapeHtml(item.label)}</p>
    <p><strong>Source:</strong> ${escapeHtml(recall.sourceLabel)}</p>
    <p><strong>Title:</strong> ${escapeHtml(recall.title)}</p>
    ${recall.reason ? `<p><strong>Reason:</strong> ${escapeHtml(recall.reason)}</p>` : ''}
    ${recall.url ? `<p><a href="${recall.url}">View full recall details</a></p>` : ''}
    <p style="color:#777;font-size:12px;">If this doesn't match your item, you can ignore this email.</p>
  `;

  await getTransporter().sendMail({
    from: process.env.ALERT_FROM_EMAIL,
    to: toEmail,
    subject,
    text,
    html
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

module.exports = { sendRecallAlert };
