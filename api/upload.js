// api/upload.js - Proxy para upload no Filebin + Discord (sem lock no bin)
// Atualizado para o formulário com novos campos:
//   - sistemaOperacional (radio)
//   - instalacaoForaPlayStore (radio)
//   - disponibilidade (radio)
//   - idiomas (checkbox múltiplo — pode vir mais de um valor)
//   - lgpdAccepted (checkbox obrigatório)
//
// Deploy: este arquivo deve ficar em /api/upload.js no projeto Vercel.

import formidable from 'formidable';
import fs from 'fs';  // Para limpar arquivos temporários

export default async function handler(req, res) {
    // Configuração de CORS manual
    const allowedOrigin = 'https://admin-thofer.wuaze.com';  // <-- SUBSTITUA PELO SEU DOMÍNIO EXATO NO INFINITYFREE
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Só permite POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Parse FormData com formidable
    const form = formidable({
        multiples: false,  // Um arquivo só
        maxFileSize: 5 * 1024 * 1024,  // 5MB
        keepExtensions: true,
        uploadDir: '/tmp',  // Pasta temp no serverless
    });

    let fields, files;
    try {
        [fields, files] = await form.parse(req);
    } catch (error) {
        console.error('Erro no formidable:', error);
        return res.status(400).json({ error: 'Erro ao processar o formulário. Verifique o arquivo.' });
    }

    // Helpers: formidable retorna cada campo como array (mesmo para valor único)
    const getField = (key) => (fields[key] && fields[key][0]) || null;
    const getAllFields = (key) => (fields[key] || []);

    // Extrai TODOS os dados
    const email                   = getField('email');
    const cpf                     = getField('cpf');
    const sistemaOperacional      = getField('sistemaOperacional');
    const instalacaoForaPlayStore = getField('instalacaoForaPlayStore');
    const disponibilidade         = getField('disponibilidade');
    const idiomasArray            = getAllFields('idiomas');  // array de strings (0..n)
    const lgpdAccepted            = getField('lgpdAccepted');  // 'true' ou null
    const file                     = files.curriculum_file ? files.curriculum_file[0] : null;

    const DISCORD_WEBHOOK_URL2 = process.env.DISCORD_WEBHOOK_URL2;

    // Validações de campos obrigatórios
    if (!file || !email || !cpf || !DISCORD_WEBHOOK_URL2) {
        if (file && file.filepath) fs.unlinkSync(file.filepath);
        return res.status(400).json({ error: 'Dados incompletos: arquivo, email e CPF são obrigatórios.' });
    }
    if (!sistemaOperacional || !instalacaoForaPlayStore || !disponibilidade) {
        if (file && file.filepath) fs.unlinkSync(file.filepath);
        return res.status(400).json({ error: 'Dados incompletos: sistema operacional, instalação e disponibilidade são obrigatórios.' });
    }
    if (idiomasArray.length === 0) {
        if (file && file.filepath) fs.unlinkSync(file.filepath);
        return res.status(400).json({ error: 'Selecione ao menos um idioma.' });
    }
    if (!lgpdAccepted) {
        if (file && file.filepath) fs.unlinkSync(file.filepath);
        return res.status(400).json({ error: 'É necessário aceitar o termo de tratamento de dados (LGPD).' });
    }

    // Validações de arquivo (servidor — nunca confie só no client-side)
    const allowedTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'  // MIME para DOCX
    ];
    const mimeType = file.mimetype || '';
    if (!allowedTypes.includes(mimeType)) {
        fs.unlinkSync(file.filepath);  // Limpa temp
        return res.status(400).json({ error: 'Tipo de arquivo inválido: PDF, PNG, JPEG ou JPG.' });
    }
    if (file.size > 5 * 1024 * 1024) {
        fs.unlinkSync(file.filepath);
        return res.status(400).json({ error: 'Arquivo muito grande: máximo 5MB.' });
    }

    try {
        // Configurações do Filebin
        const BIN_NAME = 'curriculos8089';  // Bin fixo
        const FILEBIN_BASE_URL = 'https://filebin.net';
        const timestamp = Date.now();
        const ext = file.originalFilename ? file.originalFilename.split('.').pop() : 'pdf';
        const filename = `curriculo-${cpf.replace(/\D/g, '')}-${timestamp}.${ext}`;

        // Lê o arquivo temp como buffer para upload
        const fileBuffer = fs.readFileSync(file.filepath);

        // Upload para Filebin: POST /{bin}/{filename} com body = buffer
        const uploadResponse = await fetch(`${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`, {
            method: 'POST',
            headers: {
                'Content-Type': mimeType || 'application/octet-stream',
            },
            body: fileBuffer,
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('Erro Filebin:', errorText, 'Status:', uploadResponse.status);
            fs.unlinkSync(file.filepath);  // Limpa temp
            return res.status(uploadResponse.status).json({ error: 'Falha no upload para Filebin: ' + errorText });
        }

        const uploadData = await uploadResponse.json();  // 201 com JSON

        // URL do arquivo
        const fileUrl = `${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`;
        const filesize = uploadData.size || file.size;

        // REMOVIDO: Lock o bin (causava 405 em uploads subsequentes)
        // await fetch(`${FILEBIN_BASE_URL}/${BIN_NAME}`, { method: 'PUT' });

        // Limpa arquivo temp
        fs.unlinkSync(file.filepath);

        // Idiomas para exibição (junta com vírgula)
        const idiomasStr = idiomasArray.join(', ');

        // Notificação para Discord com TODOS os campos
        const discordPayload = {
            username: 'Candidaturas - Trabalhe Conosco',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2922/2922550.png',
            embeds: [
                {
                    title: 'Nova Candidatura Recebida!',
                    description: 'Uma nova pessoa se candidatou para a vaga de Testador de Apps (QA).',
                    color: 0x024ab4,  // azul da marca (decimal: 150196)
                    fields: [
                        { name: 'E-mail',                        value: email,                       inline: true  },
                        { name: 'CPF',                           value: cpf,                         inline: true  },
                        { name: 'Sistema Operacional',           value: sistemaOperacional,          inline: true  },
                        { name: 'Instalação fora da Play Store',  value: instalacaoForaPlayStore,     inline: true  },
                        { name: 'Disponibilidade semanal',       value: disponibilidade,             inline: true  },
                        { name: 'Idiomas',                       value: idiomasStr,                  inline: true  },
                        { name: 'Aceite LGPD',                   value: '✓ Aceito',                  inline: true  },
                        { name: 'Currículo',                     value: `[Baixar](${fileUrl})`,       inline: false },
                        { name: 'Nome do Arquivo',               value: filename,                    inline: false },
                        { name: 'Tamanho',                       value: `${(filesize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Tipo',                          value: mimeType,                    inline: true  },
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Filebin via Vercel Proxy' },
                },
            ],
        };

        const discordResponse = await fetch(DISCORD_WEBHOOK_URL2, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload),
        });

        if (!discordResponse.ok) {
            console.error('Falha no Discord, mas upload OK');
        }

        // Resposta de sucesso
        res.status(200).json({
            success: true,
            message: 'Upload e notificação enviados com sucesso!',
            fileUrl,
            filename
        });

    } catch (error) {
        console.error('Erro no upload Filebin:', error);
        if (file && file.filepath) fs.unlinkSync(file.filepath);  // Limpa temp em erro
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}

export const config = {
    api: {
        bodyParser: false,  // Essencial para multipart/form-data
    },
};
