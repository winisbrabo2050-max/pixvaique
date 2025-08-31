export default async function handler(req, res) {
  // ✅ Libera CORS para qualquer origem
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Trata requisição OPTIONS (pré-flight do navegador)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ✅ Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { value } = req.body;

  // ✅ Validação do valor
  if (!value || value < 50) {
    return res.status(400).json({ error: 'Valor mínimo é R$ 0,50' });
  }

  const token = process.env.PUSHINPAY_TOKEN;

  // ✅ URL do webhook que receberá notificações de pagamento
  const webhookUrl = 'https://webhook.site/82fa7f49-a71d-4665-a1cc-191b764d3c07';

  try {
    const response = await fetch('https://api.pushinpay.com.br/api/pix/cashIn', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        value,
        webhook_url: webhookUrl
        // split_rules: [] // se quiser usar futuramente
      })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao conectar com PushinPay', detalhes: error.message });
  }
}
