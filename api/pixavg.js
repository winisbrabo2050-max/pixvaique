// pages/api/pix.js
export default async function handler(req, res) {
  try {
    let { amount, cpf } = req.query;

    // força duas casas decimais
    amount = parseFloat(amount).toFixed(2);

    const apiKey = process.env.PIX_API_KEY;

    let url = `http://191.101.18.157:8081/api/v1/pix/${apiKey}/${amount}`;
    if (cpf) url += `/${cpf}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      return res.status(400).json({ error: "Falha ao gerar cobrança PIX" });
    }

    return res.status(200).json({
      pixCode: data.data.pixCode, // apenas o código PIX
      id: data.data.id,
      status: data.data.status,
      amount: data.data.amount,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
}
