import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI; // Defina essa variável no painel do Vercel
const client = new MongoClient(uri);

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db('pixdb'); // substitua pelo nome do seu banco
    const collection = db.collection('transacoes');

    const resultado = await collection.insertOne({
      transaction_id: 'teste123',
      status: 'paid',
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      insertedId: resultado.insertedId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await client.close();
  }
}
