export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  console.log('🔔 Webhook ativado');
  console.log('🧾 Headers recebidos:', req.headers);
  console.log('📦 Body recebido:', req.body);

  // ✅ Validação do token enviado pelo PushinPay
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

  // ✅ Ajusta horário para São Paulo (UTC-3)
  const now = new Date();
  const offsetMs = -3 * 60 * 60 * 1000;
  const saoPauloTime = new Date(now.getTime() + offsetMs).toISOString();

  // ✅ Envia para o PHP no InfinityFree
  try {
    const respostaPHP = await fetch("https://vaiqueganha.kesug.com/webhook.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Token": process.env.PUSHINPAY_WEBHOOK_TOKEN
      },
      body: JSON.stringify({
        id,
        status,
        created_at: saoPauloTime
      })
    });

    const resultado = await respostaPHP.text();

    console.log("✅ Resposta do PHP:", resultado);

    return res.status(200).json({
      success: true,
      forwarded: true,
      php_response: resultado
    });

  } catch (err) {
    console.error("❌ Erro ao enviar para o PHP:", err.message);
    return res.status(500).json({ error: "Erro ao enviar para o PHP" });
  }
}
