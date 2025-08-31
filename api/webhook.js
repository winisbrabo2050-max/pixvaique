export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 🔍 Logs para depuração
  console.log('🔔 Webhook ativado');
  console.log('🧾 Headers recebidos:', req.headers);
  console.log('🔑 Token recebido:', req.headers['x-pushinpay-token']);
  console.log('📦 Body recebido:', req.body);

  // 🔒 Verificação do token de segurança
  const tokenRecebido = req.headers['x-pushinpay-token'];
  const tokenEsperado = process.env.PUSHINPAY_WEBHOOK_TOKEN;

  if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
    console.warn('⚠️ Token inválido ou ausente');
    return res.status(403).json({ error: 'Token de autenticação inválido' });
  }

  const { id, status } = req.body;
  if (!id || !status) {
    console.warn('⚠️ Dados inválidos no corpo da requisição');
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  // ✅ Monta a mensagem para o Discord
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const mensagem = {
    content: `📢 Nova transação recebida!\n🆔 ID: \`${id}\`\n📌 Status: \`${status}\`\n🕒 Horário: ${new Date().toLocaleString()}`
  };

  try {
    const resposta = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensagem)
    });

    if (!resposta.ok) {
      throw new Error(`Erro ao enviar para Discord: ${resposta.statusText}`);
    }

    console.log('✅ Mensagem enviada com sucesso para o Discord');
    res.status(200).json({ success: true, enviadoParaDiscord: true });
  } catch (error) {
    console.error('❌ Erro ao enviar para Discord:', error.message);
    res.status(500).json({ error: 'Erro ao enviar para Discord', detalhes: error.message });
  }
}
