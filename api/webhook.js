export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 🔍 Logs para depuração
  console.log('🔔 Webhook ativado');
  console.log('🧾 Headers recebidos:', req.headers);
  console.log('🔑 Token recebido:', req.headers['x-pushinpay-token']);
  console.log('📦 Body recebido:', req.body);

  // 🔒 Verificação do token de segurança da PushinPay
  const tokenRecebido = req.headers['x-pushinpay-token'];
  const tokenEsperado = process.env.PUSHINPAY_WEBHOOK_TOKEN;

  if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
    console.warn('⚠️ Token inválido ou ausente');
    return res.status(403).json({ error: 'Token de autenticação inválido' });
  }

  const { id: transaction_id, status } = req.body;
  if (!transaction_id || !status) {
    console.warn('⚠️ Dados inválidos no corpo da requisição');
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  try {
    // 🔐 Token secreto para autenticar com seu script PHP
    const phpToken = process.env.VERCEL_TO_PHP_TOKEN;

    // 🌐 Envia os dados para o script PHP
    const response = await fetch('https://vaiqueganha.kesug.com/salvar-transacao.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-vercel-token': 'token-segurozada'
  },
  body: JSON.stringify({ transaction_id, status })
});

const respostaTexto = await response.text();
console.log('🔁 Resposta do PHP:', respostaTexto);

    if (!response.ok) {
      throw new Error(`Erro ao enviar para PHP: ${response.statusText}`);
    }

    console.log('✅ Transação enviada com sucesso para o PHP');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao enviar para PHP:', error.message);
    res.status(500).json({ error: 'Erro ao enviar para PHP', detalhes: error.message });
  }
}
