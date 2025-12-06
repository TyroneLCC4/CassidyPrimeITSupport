// api/ping.js
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ ok: true, env: !!process.env.FIREBASE_SERVICE_ACCOUNT });
};
