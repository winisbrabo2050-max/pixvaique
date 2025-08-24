import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID não informado' });

  try {
    await client.connect();
    const db = client.db('pixdb');
    const transacoes = db.collection('transacoes');

    const transacao = await transacoes.findOne({ id });

    if (!transacao) {
      return res.status(404).json({ status: 'not_found' });
    }

    res.status(200).json({ status: transacao.status });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar banco', detalhes: error.message });
  } finally {
    await client.close();
  }
}
