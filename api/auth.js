// api/auth.js - Proxy para autenticação no RediaFile (com CORS manual)
export default async function handler(req, res) {
    // Configuração de CORS manual
    const allowedOrigin = 'https://admin-thofer.wuaze.com';  // <-- SUBSTITUA PELO SEU DOMÍNIO EXATO NO INFINITYFREE
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight OPTIONS request (essencial para CORS com POST/FormData)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Só permite POST para auth
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Chaves do RediaFile como variáveis de ambiente (seguras no Vercel)
    const REDIAFILE_KEY1 = process.env.REDIAFILE_KEY1;
    const REDIAFILE_KEY2 = process.env.REDIAFILE_KEY2;

    if (!REDIAFILE_KEY1 || !REDIAFILE_KEY2) {
        return res.status(500).json({ error: 'Chaves da API do RediaFile não configuradas.' });
    }

    try {
        const authResponse = await fetch('https://apps.rediafile.com/api/v2/authorize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                key1: REDIAFILE_KEY1,
                key2: REDIAFILE_KEY2,
            }).toString(),
        });

        const authData = await authResponse.json();

        if (authData._status === 'error') {
            return res.status(authResponse.status).json({ error: authData.response || 'Falha na autenticação.' });
        }

        // Adiciona CORS header na resposta de sucesso (já setado no início, mas reforça se necessário)
        res.status(200).json({
            success: true,
            access_token: authData.data.access_token,
            account_id: authData.data.account_id,
        });

    } catch (error) {
        console.error('Erro na autenticação RediaFile:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}
