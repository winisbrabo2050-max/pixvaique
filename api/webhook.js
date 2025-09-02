import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  console.log('🔔 Webhook ativado');
  console.log('🧾 Headers recebidos:', req.headers);
  console.log('📦 Body recebido:', req.body);

  // 🔒 Verificação do token de segurança
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

  // 📝 Insere no Supabase
  try {
    const { data, error } = await supabase
      .from('transacoes')
      .insert([
        {
          transaction_id: id,
          status,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error('❌ Erro ao salvar no Supabase:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ Transação salva com sucesso no Supabase');
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('❌ Erro inesperado:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
