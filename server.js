// server.js
// Secure ticket API for Cassidy Prime Tech
// Environment variables required:
// FIREBASE_SERVICE_ACCOUNT (JSON string), FIREBASE_DB_URL,
// SENDGRID_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM,
// ADMIN_WHATSAPP_NUMBER, PORT (optional)

const express = require('express');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const libphonenumber = require('libphonenumber-js');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
const admin = require('firebase-admin');

// --- Init Firebase Admin ---
if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FIREBASE_DB_URL) {
  console.error('Missing Firebase environment variables.');
  process.exit(1);
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

// --- Init SendGrid ---
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// --- Init Twilio ---
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const app = express();
app.use(helmet());
app.use(cors({ origin: true }));
app.use(bodyParser.json({ limit: '10kb' }));

// --- Rate limiting ---
const limiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// --- Helpers ---
function normalizePhone(raw) {
  try {
    const digits = raw.replace(/\D/g, '');
    // If starts with 0 and looks like SA number, convert to +27
    if (/^0\d{9}$/.test(digits)) return '+27' + digits.slice(1);
    if (/^\+/.test(raw)) return raw;
    // Try parse with libphonenumber
    const parsed = libphonenumber.parsePhoneNumberFromString(raw, 'ZA');
    return parsed ? parsed.number : null;
  } catch {
    return null;
  }
}

function validateTicketPayload(payload) {
  const errors = [];
  if (!payload.name || typeof payload.name !== 'string' || payload.name.trim().length < 2) {
    errors.push('Invalid name');
  }
  if (!payload.phone || !normalizePhone(payload.phone)) {
    errors.push('Invalid phone');
  }
  if (!payload.location || typeof payload.location !== 'string') {
    errors.push('Invalid location');
  }
  if (!payload.issue || typeof payload.issue !== 'string') {
    errors.push('Invalid issue');
  }
  if (payload.email && !validator.isEmail(payload.email)) {
    errors.push('Invalid email');
  }
  return errors;
}

// --- POST /api/tickets ---
// Creates ticket, stores in Firebase via Admin SDK, sends email and WhatsApp notifications
app.post('/api/tickets', async (req, res) => {
  try {
    const { name, phone, email, location, issue, message } = req.body || {};
    const payload = { name, phone, email, location, issue, message };

    // Server-side validation
    const errors = validateTicketPayload(payload);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone format' });

    // Generate robust ticket ID
    const ticketId = `CPT-${new Date().getFullYear()}-${uuidv4()}`;

    const ticketData = {
      id: ticketId,
      name: name.trim(),
      phone: normalizedPhone,
      email: email ? email.trim().toLowerCase() : null,
      location: location.trim(),
      issue: issue.trim(),
      message: message ? message.trim() : null,
      status: 'new',
      ownerUid: null, // optional: set if authenticated
      submittedAt: new Date().toISOString(),
      updatedAt: Date.now()
    };

    // Save to Firebase (Admin SDK)
    await db.ref(`tickets/${ticketId}`).set(ticketData);

    // Send email (if configured)
    if (process.env.SENDGRID_API_KEY && ticketData.email) {
      const mail = {
        to: ticketData.email,
        from: process.env.SENDGRID_FROM || 'no-reply@cassidyprime.tech',
        subject: `Cassidy Prime Tech - Ticket ${ticketId} received`,
        text: `Hi ${ticketData.name},\n\nYour ticket ${ticketId} has been logged. We'll be in touch shortly.\n\nIssue: ${ticketData.issue}\n\nRegards,\nCassidy Prime Tech`,
        html: `<p>Hi ${ticketData.name},</p><p>Your ticket <strong>${ticketId}</strong> has been logged. We'll be in touch shortly.</p><p><strong>Issue:</strong> ${ticketData.issue}</p><p>Regards,<br/>Cassidy Prime Tech</p>`
      };
      try { await sgMail.send(mail); } catch (err) { console.warn('SendGrid send failed', err?.message || err); }
    }

    // Notify admin via WhatsApp (if Twilio configured)
    if (twilioClient && process.env.ADMIN_WHATSAPP_NUMBER && process.env.TWILIO_WHATSAPP_FROM) {
      const adminText = `NEW TICKET\nID: ${ticketId}\nName: ${ticketData.name}\nPhone: ${ticketData.phone}\nIssue: ${ticketData.issue}`;
      try {
        await twilioClient.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${process.env.ADMIN_WHATSAPP_NUMBER}`,
          body: adminText
        });
      } catch (err) { console.warn('Twilio admin notify failed', err?.message || err); }
    }

    // Notify client via WhatsApp (optional)
    if (twilioClient && process.env.TWILIO_WHATSAPP_FROM) {
      const clientText = `Thank you ${ticketData.name}! Your ticket ${ticketId} has been logged. Track at https://www.cassidyprime.tech/#track-ticket`;
      try {
        await twilioClient.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${ticketData.phone}`,
          body: clientText
        });
      } catch (err) { console.warn('Twilio client notify failed', err?.message || err); }
    }

    return res.json({ success: true, ticketId });
  } catch (err) {
    console.error('Ticket creation error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- POST /api/send-whatsapp ---
// Admin-only endpoint to send WhatsApp messages (protect with auth in production)
app.post('/api/send-whatsapp', async (req, res) => {
  try {
    if (!twilioClient) return res.status(503).json({ error: 'WhatsApp provider not configured' });
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ error: 'Missing to or text' });

    const normalized = normalizePhone(to);
    if (!normalized) return res.status(400).json({ error: 'Invalid phone' });

    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${normalized}`,
      body: text
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('WhatsApp send error', err);
    return res.status(500).json({ error: 'Failed to send' });
  }
});

// --- Simple health check ---
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

// server.js (add this)
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing ticket id' });

    const snapshot = await db.ref(`tickets/${id}`).once('value');
    const ticket = snapshot.val();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    return res.json(ticket);
  } catch (err) {
    console.error('GET /api/tickets/:id error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});
