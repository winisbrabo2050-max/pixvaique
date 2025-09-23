// api/upload.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Vercel 3+ suporta req.formData() para parsear multipart/form-data
    const formData = await req.formData();
    const file = formData.get('curriculum_file'); // Nome do campo do arquivo no frontend
    const access_token = formData.get('access_token');
    const account_id = formData.get('account_id');
    const email = formData.get('email');
    const cpf = formData.get('cpf');
    const folder_id = formData.get('folder_id') || ''; // Opcional, se você tiver um folder_id

    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // Variável de ambiente

    if (!file || !access_token || !account_id || !email || !cpf || !DISCORD_WEBHOOK_URL) {
        return res.status(400).json({ error: 'Dados incompletos para upload.' });
    }

    try {
        // 1. Upload para o RediaFile
        const rediafileUploadFormData = new FormData();
        rediafileUploadFormData.append('access_token', access_token);
        rediafileUploadFormData.append('account_id', account_id);
        rediafileUploadFormData.append('upload_file', file); // O RediaFile espera 'upload_file'
        if (folder_id) {
            rediafileUploadFormData.append('folder_id', folder_id);
        }

        const rediafileUploadResponse = await fetch('https://apps.rediafile.com/api/v2/file/upload', {
            method: 'POST',
            body: rediafileUploadFormData,
        });

        const uploadData = await rediafileUploadResponse.json();

        if (uploadData._status === 'error') {
            return res.status(rediafileUploadResponse.status).json({ error: uploadData.response || 'Falha no upload para RediaFile.' });
        }

        // Extrair URL do arquivo do RediaFile (ajuste conforme a estrutura exata da resposta)
        const fileUrl = uploadData.data && uploadData.data[0] ? uploadData.data[0].url : 'URL não disponível';
        const filename = uploadData.data && uploadData.data[0] ? uploadData.data[0].name : 'Arquivo';

        // 2. Enviar notificação para o Discord
        const discordPayload = {
            username: 'Candidaturas - Trabalhe Conosco',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2922/2922550.png',
            embeds: [
                {
                    title: 'Nova Candidatura Recebida!',
                    description: `Uma nova pessoa se candidatou para uma vaga.`,
                    color: 3447003,
                    fields: [
                        { name: 'E-mail', value: email, inline: true },
                        { name: 'CPF', value: cpf, inline: true },
                        { name: 'Currículo', value: `[Baixar Currículo](${fileUrl})`, inline: false },
                        { name: 'Nome do Arquivo', value: filename, inline: false },
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Sistema de Candidaturas - RediaFile via Vercel' },
                },
            ],
        };

        const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload),
        });

        if (!discordResponse.ok) {
            console.error('Falha ao enviar notificação para o Discord, mas upload para RediaFile OK.');
            // Decide se quer retornar erro ou continuar mesmo assim
        }

        res.status(200).json({ success: true, message: 'Candidatura enviada com sucesso!', fileUrl: fileUrl });

    } catch (error) {
        console.error('Erro no proxy de upload RediaFile:', error);
        res.status(500).json({ error: 'Erro interno no servidor ao processar upload.' });
    }
}
