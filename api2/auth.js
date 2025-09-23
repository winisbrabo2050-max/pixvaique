    // api/auth.js
    export default async function handler(req, res) {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        // A documentação do RediaFile para /authorize espera 'key1' e 'key2'
        // Você pode passar essas chaves do frontend ou tê-las como variáveis de ambiente no Vercel
        // É mais seguro tê-las como variáveis de ambiente no Vercel.
        const REDIAFILE_KEY1 = process.env.REDIAFILE_KEY1;
        const REDIAFILE_KEY2 = process.env.REDIAFILE_KEY2;

        if (!REDIAFILE_KEY1 || !REDIAFILE_KEY2) {
            return res.status(500).json({ error: 'API Keys do RediaFile não configuradas no Vercel.' });
        }

        try {
            const rediafileAuthResponse = await fetch('https://apps.rediafile.com/api/v2/authorize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded', // RediaFile usa form-urlencoded
                },
                body: new URLSearchParams({
                    key1: REDIAFILE_KEY1,
                    key2: REDIAFILE_KEY2,
                }).toString(),
            });

            const authData = await rediafileAuthResponse.json();

            if (authData._status === 'error') {
                return res.status(rediafileAuthResponse.status).json({ error: authData.response || 'Falha na autenticação com RediaFile.' });
            }

            // Retorna o access_token e account_id para o frontend
            res.status(200).json({
                success: true,
                access_token: authData.data.access_token,
                account_id: authData.data.account_id,
            });

        } catch (error) {
            console.error('Erro no proxy de autenticação RediaFile:', error);
            res.status(500).json({ error: 'Erro interno no servidor ao autenticar.' });
        }
    }
    
