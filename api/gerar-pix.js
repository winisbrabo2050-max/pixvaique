export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { value } = req.body;

  if (!value || value < 50) {
    return res.status(400).json({ error: 'Valor mínimo é R$ 0,50' });
  }

  const token = process.env.PUSHINPAY_TOKEN;

  try {
    const response = await fetch('https://api.pushinpay.com.br/api/pix/cashIn', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao conectar com PushinPay', detalhes: error.message });
  }
}
