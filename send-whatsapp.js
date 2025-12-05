// api/send-whatsapp.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, text } = req.body;

  if (!to || !text) {
    return res.status(400).json({ error: 'Missing phone or message' });
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: text }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) throw data;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('WhatsApp Error:', error);
    res.status(500).json({ error: error.error?.message || 'Failed to send' });
  }
}

// Required for Vercel
export const config = {
  api: {
    bodyParser: true
  }
};
