import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ou sua API Key pública
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('transacoes')
      .insert([
        {
          transaction_id: 'teste123',
          status: 'paid',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
