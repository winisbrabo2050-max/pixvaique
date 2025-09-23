   // api/upload.js - Proxy para upload no Filebin + Discord (sem auth)
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

       // Parse FormData
       let formData;
       try {
           formData = await req.formData();
       } catch (error) {
           return res.status(400).json({ error: 'Erro ao processar FormData.' });
       }

       const file = formData.get('curriculum_file');
       const email = formData.get('email');
       const cpf = formData.get('cpf');

       const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

       if (!file || !email || !cpf || !DISCORD_WEBHOOK_URL) {
           return res.status(400).json({ error: 'Dados incompletos: arquivo, email e CPF são obrigatórios.' });
       }

       // Validações básicas no server (opcional)
       const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
       const maxSize = 5 * 1024 * 1024; // 5MB
       if (!allowedTypes.includes(file.type)) {
           return res.status(400).json({ error: 'Tipo de arquivo inválido: PDF, PNG, JPEG ou JPG.' });
       }
       if (file.size > maxSize) {
           return res.status(400).json({ error: 'Arquivo muito grande: máximo 5MB.' });
       }

       try {
           // Configurações do Filebin
           const BIN_NAME = 'candidaturas';  // Bin fixo para currículos (cria se não existir)
           const FILEBIN_BASE_URL = 'https://filebin.net';
           const timestamp = Date.now();
           const ext = file.name.split('.').pop();  // Extensão original
           const filename = `curriculo-${cpf.replace(/\D/g, '')}-${timestamp}.${ext}`;  // Único por CPF + timestamp

           // Upload para Filebin: POST /{bin}/{filename} com body = arquivo
           const uploadResponse = await fetch(`${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`, {
               method: 'POST',
               headers: {
                   'Content-Type': file.type || 'application/octet-stream',
               },
               body: await file.arrayBuffer(),  // Converte file para buffer (body binário)
           });

           if (!uploadResponse.ok) {
               const errorText = await uploadResponse.text();
               console.error('Erro Filebin:', errorText);
               return res.status(uploadResponse.status).json({ error: 'Falha no upload para Filebin: ' + errorText });
           }

           const uploadData = await uploadResponse.json();  // Response 201 com JSON (da doc)

           // URL do arquivo (da doc, response inclui metadata; assumimos estrutura padrão)
           const fileUrl = `${FILEBIN_BASE_URL}/${BIN_NAME}/${filename}`;
           const filesize = uploadData.size || file.size;  // Se response tiver size

           // Opcional: Lock o bin para read-only (PUT /{bin})
           await fetch(`${FILEBIN_BASE_URL}/${BIN_NAME}`, { method: 'PUT' });

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
                           { name: 'Tamanho', value: `${(filesize / 1024).toFixed(2)} KB`, inline: true },
                       ],
                       timestamp: new Date().toISOString(),
                       footer: { text: 'Filebin via Vercel Proxy' },
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

           // Resposta de sucesso
           res.status(200).json({ 
               success: true, 
               message: 'Upload e notificação enviados com sucesso!', 
               fileUrl,
               filename 
           });

       } catch (error) {
           console.error('Erro no upload Filebin:', error);
           res.status(500).json({ error: 'Erro interno no servidor.' });
       }
   }
   
