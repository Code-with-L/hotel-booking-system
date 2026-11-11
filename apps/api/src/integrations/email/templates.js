// Branded transactional email templates (HTML + plain text), with safe escaping.
// Visual identity: limestone ground, ink serif wordmark, deep olive accents — no imagery dependency.
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const layout = ({ title, preheader = '', bodyHtml, footerNote }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F1EFE8;font-family:Georgia,'Times New Roman',serif;color:#242722;">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFE8;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
<tr><td style="border-bottom:1px solid #D7D3C9;padding:0 4px 18px 4px;">
  <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:0.32em;color:#242722;">THE STILLHOUSE</div>
  <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#77786F;margin-top:6px;">Naivasha · Great Rift Valley</div>
</td></tr>
<tr><td style="padding:26px 4px 8px 4px;">
${bodyHtml}
</td></tr>
<tr><td style="border-top:1px solid #D7D3C9;padding:18px 4px 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#77786F;">
${footerNote || 'The Stillhouse · reservations@stillhouse.example · +254 000 000 000'}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

const row = (label, value) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr>
  <td style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#77786F;padding:8px 0;border-bottom:1px solid #E8E4DA;">${escapeHtml(label)}</td>
  <td align="right" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#242722;padding:8px 0;border-bottom:1px solid #E8E4DA;">${value}</td>
</tr></table>`;

const fmtKes = (minor) => `KSh ${Math.round((Number(minor) || 0) / 100).toLocaleString('en-KE')}`;
const fmtDateLong = (iso) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const TEMPLATES = {
  bookingConfirmation: {
    subject: (v) => `Your reservation at The Stillhouse — ${v.reference}`,
    html: (v) => layout({
      title: `Reservation received — ${v.reference}`,
      preheader: `We have your booking, ${v.firstName}. Your reference is ${v.reference}.`,
      bodyHtml: `<div style="font-family:Georgia,serif;font-size:30px;color:#242722;margin:0 0 14px 0;">Booking received.</div>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">Dear ${escapeHtml(v.firstName)},</p>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">Thank you — we have received your reservation. Your room is held for 15 minutes while payment settles. Please quote your reference at the front desk or in any correspondence.</p>
      ${row('Reference', `<strong>${escapeHtml(v.reference)}</strong>`)}
      ${row('Room', `${escapeHtml(v.roomName)} · ${escapeHtml(v.ratePlanName)}`)}
      ${row('Check-in', escapeHtml(fmtDateLong(v.checkIn)))}
      ${row('Check-out', escapeHtml(fmtDateLong(v.checkOut)))}
      ${row('Guests', `${escapeHtml(String(v.adults))} adults${Number(v.children) > 0 ? `, ${escapeHtml(String(v.children))} children` : ''} · ${escapeHtml(String(v.rooms))} room${Number(v.rooms) > 1 ? 's' : ''}`)}
      ${row('Total', fmtKes(v.totalMinor))}
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#77786F;margin-top:16px;">Status: <strong>${escapeHtml(v.statusLabel || 'Pending payment')}</strong>. Payment is settled at the front desk or by M-Pesa once enabled.</p>`,
    }),
    text: (v) => [
      `THE STILLHOUSE — Booking received`,
      ``,
      `Dear ${v.firstName},`,
      ``,
      `We have received your reservation at The Stillhouse.`,
      `Reference: ${v.reference}`,
      `Room: ${v.roomName} (${v.ratePlanName})`,
      `Check-in: ${fmtDateLong(v.checkIn)}`,
      `Check-out: ${fmtDateLong(v.checkOut)}`,
      `Guests: ${v.adults} adults${Number(v.children) > 0 ? `, ${v.children} children` : ''} · ${v.rooms} room(s)`,
      `Total: ${fmtKes(v.totalMinor)}`,
      `Status: ${v.statusLabel || 'Pending payment'}`,
      ``,
      `Please quote your reference at the front desk or in any correspondence.`,
      `The Stillhouse · reservations@stillhouse.example · +254 000 000 000`,
    ].join('\n'),
  },

  paymentReceived: {
    subject: (v) => `Payment received — ${v.reference}`,
    html: (v) => layout({
      title: `Payment received — ${v.reference}`,
      preheader: `Payment of ${fmtKes(v.totalMinor)} received for ${v.reference}.`,
      bodyHtml: `<div style="font-family:Georgia,serif;font-size:30px;color:#242722;margin:0 0 14px 0;">Payment received.</div>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">Dear ${escapeHtml(v.firstName)},</p>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">We have received payment of <strong>${fmtKes(v.totalMinor)}</strong> for your stay. Your reservation is confirmed. We look forward to welcoming you.</p>
      ${row('Reference', `<strong>${escapeHtml(v.reference)}</strong>`)}
      ${row('Check-in', escapeHtml(fmtDateLong(v.checkIn)))}
      ${row('Check-out', escapeHtml(fmtDateLong(v.checkOut)))}
      ${row('Amount paid', fmtKes(v.totalMinor))}`,
    }),
    text: (v) => [
      `THE STILLHOUSE — Payment received`,
      ``,
      `Dear ${v.firstName},`,
      ``,
      `We have received payment of ${fmtKes(v.totalMinor)} for your stay.`,
      `Your reservation is confirmed.`,
      ``,
      `Reference: ${v.reference}`,
      `Check-in: ${fmtDateLong(v.checkIn)}`,
      `Check-out: ${fmtDateLong(v.checkOut)}`,
      `Please quote your reference at the front desk.`,
      `The Stillhouse · reservations@stillhouse.example · +254 000 000 000`,
    ].join('\n'),
  },

  bookingCancelled: {
    subject: (v) => `Reservation cancelled — ${v.reference}`,
    html: (v) => layout({
      title: `Reservation cancelled — ${v.reference}`,
      preheader: `Your reservation ${v.reference} has been cancelled.`,
      bodyHtml: `<div style="font-family:Georgia,serif;font-size:30px;color:#242722;margin:0 0 14px 0;">Reservation cancelled.</div>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">Dear ${escapeHtml(v.firstName)},</p>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">As requested, we have cancelled your reservation <strong>${escapeHtml(v.reference)}</strong>. ${Number(v.cancelFeeMinor) > 0 ? `A cancellation fee of <strong>${fmtKes(v.cancelFeeMinor)}</strong> applies per the rate plan you chose.` : 'No cancellation fee applies.'}</p>`,
    }),
    text: (v) => [
      `THE STILLHOUSE — Reservation cancelled`,
      ``,
      `Dear ${v.firstName},`,
      ``,
      `Your reservation ${v.reference} has been cancelled.`,
      Number(v.cancelFeeMinor) > 0 ? `A cancellation fee of ${fmtKes(v.cancelFeeMinor)} applies.` : `No cancellation fee applies.`,
      ``,
      `The Stillhouse · reservations@stillhouse.example · +254 000 000 000`,
    ].join('\n'),
  },

  passwordReset: {
    subject: () => 'Reset your The Stillhouse password',
    html: (v) => layout({
      title: 'Password reset',
      preheader: 'A password reset was requested for your account.',
      bodyHtml: `<div style="font-family:Georgia,serif;font-size:30px;color:#242722;margin:0 0 14px 0;">Reset your password.</div>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">Dear ${escapeHtml(v.firstName || 'guest')},</p>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">We received a request to reset the password for your The Stillhouse account. Use the link below within 60 minutes. If you did not request this, you can safely ignore this email.</p>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;"><a href="${escapeHtml(v.resetUrl)}" style="color:#535B45;font-weight:bold;text-decoration:underline;">Reset your password</a></p>`,
    }),
    text: (v) => [
      `THE STILLHOUSE — Password reset`,
      ``,
      `Dear ${v.firstName || 'guest'},`,
      ``,
      `Reset your password within 60 minutes:`,
      v.resetUrl,
      ``,
      `If you did not request this, you can safely ignore it.`,
    ].join('\n'),
  },

  adminNewBooking: {
    subject: (v) => `New booking ${v.reference} — ${v.roomName}`,
    html: (v) => layout({
      title: `New booking — ${v.reference}`,
      preheader: `${v.firstName} ${v.lastName} booked the ${v.roomName}, ${v.checkIn} → ${v.checkOut}.`,
      footerNote: 'Internal notification · The Stillhouse',
      bodyHtml: `<div style="font-family:Georgia,serif;font-size:24px;color:#242722;margin:0 0 14px 0;">New booking.</div>
      ${row('Reference', `<strong>${escapeHtml(v.reference)}</strong>`)}
      ${row('Guest', `${escapeHtml(v.firstName)} ${escapeHtml(v.lastName)} · ${escapeHtml(v.email)} · ${escapeHtml(v.phone)}`)}
      ${row('Room', `${escapeHtml(v.roomName)} · ${escapeHtml(v.ratePlanName)}`)}
      ${row('Dates', `${escapeHtml(fmtDateLong(v.checkIn))} → ${escapeHtml(fmtDateLong(v.checkOut))}`)}
      ${row('Total', fmtKes(v.totalMinor))}
      ${row('Source', escapeHtml(v.source || 'web'))}
      ${row('Requests', escapeHtml(v.requests || '—'))}`,
    }),
    text: (v) => [
      `New booking ${v.reference}`,
      `Guest: ${v.firstName} ${v.lastName} · ${v.email} · ${v.phone}`,
      `Room: ${v.roomName} (${v.ratePlanName})`,
      `Dates: ${v.checkIn} → ${v.checkOut}`,
      `Total: ${fmtKes(v.totalMinor)}`,
      `Source: ${v.source || 'web'}`,
      `Requests: ${v.requests || '-'}`,
    ].join('\n'),
  },
};

export const renderTemplate = (name, vars) => {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`Unknown email template: ${name}`);
  return { subject: t.subject(vars), html: t.html(vars), text: t.text(vars) };
};
