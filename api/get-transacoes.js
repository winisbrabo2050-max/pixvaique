import mysql from "mysql2/promise";

export default async function handler(req, res) {
  // ✅ CORS básico
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // ✅ Pegando o ID pela URL: /api/get-transacoes?id=123
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ success: false, message: "ID não enviado" });
    }

    // ✅ Conexão com o MySQL do InfinityFree
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASS,
      database: process.env.MYSQL_DB
    });

    // ✅ Atualiza o status
    const [result] = await conn.execute(
      "UPDATE gerados SET status = 'paid' WHERE id_pix = ?",
      [id]
    );

    await conn.end();

    return res.status(200).json({
      success: true,
      updated: result.affectedRows > 0,
      id
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
