// api/tickets/[id].js
// GET /api/tickets/:id
const initFirebaseAdmin = require('../_firebaseAdmin');

let admin;
try { admin = initFirebaseAdmin(); } catch (e) { admin = null; }

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (!admin) {
    try { admin = initFirebaseAdmin(); } catch (err) {
      console.error('Firebase init error:', err.message);
      return res.status(500).json({ error: 'Server misconfiguration' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const id = req.query.id || req.query['id'] || (req.url && req.url.split('/').pop());
    if (!id) return res.status(400).json({ error: 'Missing ticket id' });

    const db = admin.database();
    const snapshot = await db.ref(`tickets/${id}`).once('value');
    const ticket = snapshot.val();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    return res.status(200).json(ticket);
  } catch (err) {
    console.error('GET /api/tickets/:id error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
