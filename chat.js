// api/chat.js

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 2. Get the message from the frontend
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  try {
    // 3. Call the xAI (Grok) API securely
    // We use process.env.XAI_API_KEY so the key is never in the code
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}` 
      },
      body: JSON.stringify({
        model: "grok-beta", // Or the latest model available to you
        messages: [
          { 
            role: "system", 
            content: "You are a helpful, professional IT support assistant for Cassidy Prime Tech. You answer questions about IT services, ransomware recovery, and networking." 
          },
          { 
            role: "user", 
            content: message 
          }
        ],
        stream: false
      })
    });

    // 4. Handle errors from xAI
    if (!response.ok) {
      const errorData = await response.json();
      console.error('xAI API Error:', errorData);
      return res.status(500).json({ error: 'Failed to communicate with AI provider.' });
    }

    // 5. Send the AI's reply back to your frontend
    const data = await response.json();
    const botReply = data.choices[0].message.content;

    return res.status(200).json({ reply: botReply });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
