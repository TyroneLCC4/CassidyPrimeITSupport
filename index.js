// api/tickets/index.js
// POST /api/tickets
// Creates a ticket in Firebase Realtime Database using Admin SDK.
// Optional: sends email via SendGrid and WhatsApp via Twilio if env vars are present.

const initFirebaseAdmin = require('../_firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

let admin;
try { admin = initFirebaseAdmin(); } catch (e) {
  // Delay throwing until handler runs so Vercel build doesn't fail
  admin = null;
}

const sgMail = (() => {
  try {
    const sg = require('@sendgrid/mail');
    if (process.env.SENDGRID_API_KEY) sg.setApiKey(process.env.SENDGRID_API_KEY);
    return sg;
  } catch { return null; }
})();

const twilioClient = (() => {
  try {
    const twilio = require('twilio');
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
    return null;
  } catch { return null; }
})();

function normalizePhone(raw = '') {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Basic SA normalization: leading 0 -> +27
  if (/^0\d{9}$/.test(digits)) return `+27${digits.slice(1)}`;
  if (/^27\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+?\d{8,15}$/.test(raw)) return raw.startsWith('+') ? raw : `+${raw}`;
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (!admin) {
    try { admin = initFirebaseAdmin(); } catch (err) {
      console.error('Firebase init error:', err.message);
      return res.status(500).json({ error: 'Server misconfiguration' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const name = (body.name || '').trim();
    const phoneRaw = (body.phone || '').trim();
    const email = (body.email || '').trim().toLowerCase() || null;
    const location = (body.location || '').trim();
    const issue = (body.issue || '').trim();
    const message = (body.message || '').trim() || null;

    // Basic server-side validation
    const errors = [];
    if (!name || name.length < 2) errors.push('Invalid name');
    const phone = normalizePhone(phoneRaw);
    if (!phone) errors.push('Invalid phone');
    if (!location) errors.push('Invalid location');
    if (!issue) errors.push('Invalid issue');
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const ticketId = `CPT-${new Date().getFullYear()}-${uuidv4()}`;
    const ticketData = {
      id: ticketId,
      name,
      phone,
      email,
      location,
      issue,
      message,
      status: 'new',
      submittedAt: new Date().toISOString(),
      updatedAt: Date.now()
    };

    // Save to Firebase Realtime Database under tickets/{ticketId}
    const db = admin.database();
    await db.ref(`tickets/${ticketId}`).set(ticketData);

    // Send email via SendGrid if configured and email provided
    if (sgMail && process.env.SENDGRID_API_KEY && email) {
      try {
        const mail = {
          to: email,
          from: process.env.SENDGRID_FROM || 'no-reply@cassidyprime.tech',
          subject: `Cassidy Prime Tech - Ticket ${ticketId} received`,
          text: `Hi ${name},\n\nYour ticket ${ticketId} has been logged.\n\nIssue: ${issue}\n\nRegards,\nCassidy Prime Tech`
        };
        await sgMail.send(mail);
      } catch (err) {
        console.warn('SendGrid send failed:', err?.message || err);
      }
    }

    // Notify admin via Twilio WhatsApp if configured
    if (twilioClient && process.env.TWILIO_WHATSAPP_FROM && process.env.ADMIN_WHATSAPP_NUMBER) {
      try {
        const adminText = `NEW TICKET\nID: ${ticketId}\nName: ${name}\nPhone: ${phone}\nIssue: ${issue}`;
        await twilioClient.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${process.env.ADMIN_WHATSAPP_NUMBER}`,
          body: adminText
        });
      } catch (err) {
        console.warn('Twilio admin notify failed:', err?.message || err);
      }
    }

    // Optionally notify client via WhatsApp
    if (twilioClient && process.env.TWILIO_WHATSAPP_FROM) {
      try {
        const clientText = `Thank you ${name}! Your ticket ${ticketId} has been logged. Track at https://www.cassidyprime.tech/#track-ticket`;
        await twilioClient.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${phone}`,
          body: clientText
        });
      } catch (err) {
        console.warn('Twilio client notify failed:', err?.message || err);
      }
    }

    return res.status(201).json({ success: true, ticketId });
  } catch (err) {
    console.error('POST /api/tickets error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
