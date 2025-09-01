export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { mensagem, token } = req.body;
  const tokenEsperado = process.env.PHP_TO_VERCEL_TOKEN;

  if (token !== tokenEsperado) {
    console.warn('❌ Token inválido');
    return res.status(403).json({ error: 'Token inválido' });
  }

  try {
    await fetch('https://discord.com/api/webhooks/1319901047698886726/LImC5PEFJT8XoPAsePs86IouzaFqM3Fx572ctdLTn6QeNMXZmmCVRyEHmzjc27JdkQYN', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: mensagem })
    });

    console.log('✅ Log enviado ao Discord');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao enviar ao Discord:', error.message);
    res.status(500).json({ error: 'Erro ao enviar ao Discord' });
  }
}
