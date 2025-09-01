import mysql from 'mysql2/promise';

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

  const { id: transaction_id, status } = req.body;
  if (!transaction_id || !status) {
    console.warn('⚠️ Dados inválidos no corpo da requisição');
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  try {
    // 🔗 Conexão com o banco MySQL
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });

    // 📝 Inserção ou atualização da transação
    await connection.execute(
      `INSERT INTO sua_tabela (transaction_id, status, created_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE status = VALUES(status), created_at = NOW()`,
      [transaction_id, status]
    );

    await connection.end();

    console.log('✅ Transação registrada no banco com sucesso');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao salvar no MySQL:', error.message);
    res.status(500).json({ error: 'Erro ao salvar no banco', detalhes: error.message });
  }
}
