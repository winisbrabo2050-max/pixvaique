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
    // Configuração de CORS dinâmica — aceita múltiplas origens permitidas
    // e devolve exatamente a Origin recebida (boa prática de segurança).
    const ALLOWED_ORIGINS = [
        'https://farasat.wuaze.com',       // novo domínio no InfinityFree
    ];
    const requestOrigin = req.headers.origin;
    if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
    } else {
        // Se a origem não estiver na lista, não envia o header CORS — o navegador bloqueia.
        // Em produção você pode simplesmente não enviar o header. Para debug, comente a linha abaixo.
        res.setHeader('Access-Control-Allow-Origin', 'null');
    }
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
    const clientHintsAvailable    = getField('clientHintsAvailable');  // 'yes' ou 'no'
    const deviceInfoRaw            = getField('deviceInfo');  // string JSON ou null
    const file                     = files.curriculum_file ? files.curriculum_file[0] : null;

    // Faz parse do deviceInfo (se veio e for válido)
    let deviceInfo = null;
    if (deviceInfoRaw) {
        try {
            deviceInfo = JSON.parse(deviceInfoRaw);
        } catch (e) {
            console.warn('deviceInfo veio como JSON inválido — ignorando:', e.message);
            deviceInfo = null;
        }
    }

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

        // ----- Resumo do dispositivo (a partir de Client Hints + fallback) -----
        // Tudo em uma linha legível para o Discord, evitando estourar o limite de 25 fields.
        function buildDeviceInfoSummary(info) {
            if (!info) return 'Indisponível (navegador sem Client Hints)';
            const parts = [];

            // Plataforma / SO (preferencial UA-CH, com fallback para userAgent)
            if (info.uaPlatform) {
                let plat = info.uaPlatform;
                if (info.uaPlatformVersion) plat += ' ' + info.uaPlatformVersion;
                if (info.uaMobile === 'yes') plat += ' [mobile]';
                parts.push(plat);
            } else if (info.platform) {
                parts.push(info.platform);
            }

            // Arquitetura + bitness
            if (info.uaArchitecture) {
                let arch = info.uaArchitecture;
                if (info.uaBitness) arch += ' ' + info.uaBitness + '-bit';
                parts.push(arch);
            }

            // Modelo (principalmente em mobile)
            if (info.uaModel) parts.push('Modelo: ' + info.uaModel);

            // Navegador (resumo da brand list)
            if (info.uaFullVersionList) {
                parts.push('Navegador: ' + info.uaFullVersionList);
            }

            // Tela + pixel ratio
            if (info.screenWidth && info.screenHeight) {
                let screen = info.screenWidth + 'x' + info.screenHeight;
                if (info.pixelRatio) screen += ' @' + info.pixelRatio + 'x';
                if (info.colorDepth) screen += ' (' + info.colorDepth + '-bit)';
                parts.push('Tela: ' + screen);
            }

            // Hardware
            const hwParts = [];
            if (info.hardwareConcurrency) hwParts.push(info.hardwareConcurrency + ' cores');
            if (info.deviceMemory) hwParts.push(info.deviceMemory + ' GB RAM');
            if (hwParts.length) parts.push('CPU/RAM: ' + hwParts.join(', '));

            // Touch
            if (info.maxTouchPoints && info.maxTouchPoints > 0) {
                parts.push('Touch: ' + info.maxTouchPoints + ' pontos');
            }

            // Idioma + timezone
            if (info.language) parts.push('Idioma: ' + info.language);
            if (info.timezone) parts.push('TZ: ' + info.timezone);

            // Conexão
            if (info.connectionType) {
                let conn = 'Rede: ' + info.connectionType;
                if (info.connectionDownlink) conn += ' (' + info.connectionDownlink + ' Mbps)';
                parts.push(conn);
            }

            // Marcador UA-CH
            parts.push('UA-CH: ' + (info.hasUACH ? 'sim' : 'nao (fallback)'));

            return parts.join(' | ');
        }
        const deviceSummary = buildDeviceInfoSummary(deviceInfo);
        const userAgentStr = (deviceInfo && deviceInfo.userAgent)
            ? ('```' + deviceInfo.userAgent + '```')
            : 'Indisponível';

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
                        { name: 'Dispositivo (Client Hints)',    value: deviceSummary,               inline: false },
                        { name: 'User-Agent',                   value: userAgentStr,                inline: false },
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
