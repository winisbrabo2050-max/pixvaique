import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // ✅ 1. Lê o cookie idtransacao
    const transaction_id = req.cookies.idtransacao;

    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        message: "Cookie idtransacao não encontrado"
      });
    }

    // ✅ 2. Consulta o Supabase
    const { data, error } = await supabase
      .from("transacoes")
      .select("status")
      .eq("transaction_id", transaction_id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: "Transação não encontrada"
      });
    }

    const status = data.status;

    // ✅ 3. Se não estiver pago, apenas retorna
    if (status !== "paid") {
      return res.status(200).json({
        success: true,
        status,
        updated: false
      });
    }

    // ✅ 4. Conecta no MySQL do InfinityFree
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASS,
      database: process.env.MYSQL_DB
    });

    // ✅ 5. Atualiza a tabela gerados
    const [result] = await conn.execute(
      "UPDATE gerados SET status = 'paid' WHERE id_pix = ?",
      [transaction_id]
    );

    await conn.end();

    // ✅ 6. Retorna sucesso
    return res.status(200).json({
      success: true,
      status: "paid",
      updated: result.affectedRows > 0
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
