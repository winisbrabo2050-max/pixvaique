// api/upload.js - Proxy para upload no RediaFile + Discord (com CORS manual)
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

    // Só permite POST para upload
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Parse FormData (Vercel suporta nativamente)
    let formData;
    try {
        formData = await req.formData();
    } catch (error) {
        return res.status(400).json({ error: 'Erro ao processar FormData.' });
    }

    const file = formData.get('curriculum_file');
    const access_token = formData.get('access_token');
    const account_id = formData.get('account_id');
    const email = formData.get('email');
    const cpf = formData.get('cpf');

    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

    if (!file || !access_token || !account_id || !email || !cpf || !DISCORD_WEBHOOK_URL) {
        return res.status(400).json({ error: 'Dados incompletos.' });
    }

    try {
        // Upload para RediaFile
        const uploadFormData = new FormData();
        uploadFormData.append('access_token', access_token);
        uploadFormData.append('account_id', account_id);
        uploadFormData.append('upload_file', file); // Campo esperado pelo RediaFile

        const uploadResponse = await fetch('https://apps.rediafile.com/api/v2/file/upload', {
            method: 'POST',
            body: uploadFormData,
        });

        const uploadData = await uploadResponse.json();

        if (uploadData._status === 'error') {
            return res.status(uploadResponse.status).json({ error: uploadData.response || 'Falha no upload.' });
        }

        // Extrair URL do arquivo (ajuste se a estrutura da resposta for diferente, baseado no apidola.txt)
        const fileUrl = uploadData.data && uploadData.data[0] ? uploadData.data[0].url : 'URL não disponível';
        const filename = uploadData.data && uploadData.data[0] ? uploadData.data[0].name : file.name;

        // Notificação para Discord
        const discordPayload = {
            username: 'Candidaturas - Trabalhe Conosco',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2922/2922550.png',
            embeds: [
                {
                    title: 'Nova Candidatura Recebida!',
                    description: 'Uma nova pessoa se candidatou para uma vaga.',
                    color: 3447003,
                    fields: [
                        { name: 'E-mail', value: email, inline: true },
                        { name: 'CPF', value: cpf, inline: true },
                        { name: 'Currículo', value: `[Baixar](${fileUrl})`, inline: false },
                        { name: 'Nome do Arquivo', value: filename, inline: false },
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'RediaFile via Vercel Proxy' },
                },
            ],
        };

        const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload),
        });

        if (!discordResponse.ok) {
            console.error('Falha no Discord, mas upload OK');
        }

        // Resposta com CORS (já setado no início)
        res.status(200).json({ success: true, message: 'Upload e notificação enviados!', fileUrl });

    } catch (error) {
        console.error('Erro no upload RediaFile:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}
