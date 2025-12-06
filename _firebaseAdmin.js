// api/_firebaseAdmin.js
// Singleton Firebase Admin initializer for Vercel serverless functions.

const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return admin;
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var');
  }
  let serviceAccount;
  try {
    serviceAccount = typeof svc === 'string' ? JSON.parse(svc) : svc;
  } catch (err) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be a valid JSON string');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DB_URL || null
  });
  return admin;
}

module.exports = initFirebaseAdmin;
