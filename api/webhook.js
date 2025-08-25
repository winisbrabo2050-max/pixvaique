import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 🔒 Verificação do token de segurança
  const tokenRecebido = req.headers['x-pushinpay-token'];
  const tokenEsperado = process.env.PUSHINPAY_WEBHOOK_TOKEN;

  if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
    return res.status(403).json({ error: 'Token de autenticação inválido' });
  }

  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'Dados inválidos' });

  try {
    await client.connect();
    const db = client.db('pixdb');
    const transacoes = db.collection('transacoes');

    await transacoes.updateOne(
      { id },
      { $set: { status, updatedAt: new Date() } },
      { upsert: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar no banco', detalhes: error.message });
  } finally {
    await client.close();
  }
}
