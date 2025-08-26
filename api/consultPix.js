export default async function handler(req, res) {
  // ✅ Libera CORS para qualquer origem
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Trata requisição OPTIONS (pré-flight do navegador)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ✅ Só aceita GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // ✅ Obtém o ID da transação a partir dos parâmetros da query
  const { id } = req.query;

  // ✅ Validação do ID da transação
  if (!id) {
    return res.status(400).json({ error: 'ID da transação não fornecido.' });
  }

  const token = process.env.PUSHINPAY_TOKEN;

  try {
    const response = await fetch(`https://api.pushinpay.com.br/api/transactions/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao conectar com PushinPay', detalhes: error.message });
  }
}
