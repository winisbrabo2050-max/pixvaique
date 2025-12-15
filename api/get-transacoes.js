import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // ✅ CORS
  res.setHeader("Access-Control-Allow-Origin", "https://vaiqueganha.kesug.com");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // ✅ 1. Lê cookie
    const transaction_id = req.cookies.idtransacao;

    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        message: "Cookie idtransacao não encontrado"
      });
    }

    // ✅ 2. Consulta Supabase
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

    // ✅ 3. Se não estiver pago, só retorna
    if (status !== "paid") {
      return res.status(200).json({
        success: true,
        status,
        updated: false
      });
    }

    // ✅ 4. Atualiza MySQL do InfinityFree
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASS,
      database: process.env.MYSQL_DB
    });

    const [result] = await conn.execute(
      "UPDATE gerados SET status = 'paid' WHERE id_pix = ?",
      [transaction_id]
    );

    await conn.end();

    // ✅ 5. Retorna sucesso
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
