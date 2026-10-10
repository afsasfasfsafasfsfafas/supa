require('dotenv').config(); // Opcional: caso use um arquivo .env
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const CONFIG = {
    API_KEY: process.env.INVICTUS_API_KEY || 'sk_I8A9gb2jhneMItnpnlxUpXmNyD0KtzSH2YyOA9qtuSdztVLrBNNperIr',
    BASE_URL: 'https://api.invictuspayv2.com.br/api/v1',
    OFFER_HASH: 'off_01m4k4bq8znfps2kc459xyver7',
    PRODUCT_ID: 'prd_01m4k4bq8vrrrfv4ekhsh14znt',
    AMOUNT: 6892, // R$ 68,92 em centavos
    WHITELIST_IP: '186.219.105.144'
};

// Gera um CPF válido matematicamente (passa na validação do gateway)
function generateValidCPF() {
    const rnd = (n) => Math.round(Math.random() * n);
    const mod = (dividendo, divisor) => Math.round(dividendo - (Math.floor(dividendo / divisor) * divisor));

    const n1 = rnd(9);
    const n2 = rnd(9);
    const n3 = rnd(9);
    const n4 = rnd(9);
    const n5 = rnd(9);
    const n6 = rnd(9);
    const n7 = rnd(9);
    const n8 = rnd(9);
    const n9 = rnd(9);

    let d1 = n9 * 2 + n8 * 3 + n7 * 4 + n6 * 5 + n5 * 6 + n4 * 7 + n3 * 8 + n2 * 9 + n1 * 10;
    d1 = 11 - mod(d1, 11);
    if (d1 >= 10) d1 = 0;

    let d2 = d1 * 2 + n9 * 3 + n8 * 4 + n7 * 5 + n6 * 6 + n5 * 7 + n4 * 8 + n3 * 9 + n2 * 10 + n1 * 11;
    d2 = 11 - mod(d2, 11);
    if (d2 >= 10) d2 = 0;

    return `${n1}${n2}${n3}${n4}${n5}${n6}${n7}${n8}${n9}${d1}${d2}`;
}

function generateCustomer() {
    const timestamp = Date.now().toString().slice(-4);
    return {
        name: "Cliente Desenrola",
        email: `cliente${timestamp}${Math.floor(Math.random() * 1000)}@gmail.com`,
        document: generateValidCPF(),
        phone: "11999999999"
    };
}

app.post('/generate-pix', async (req, res) => {
    // Extrai o IP real mesmo se estiver atrás de proxy/Cloudflare
    const rawForwarded = req.headers['x-forwarded-for'];
    const userIp = typeof rawForwarded === 'string' 
        ? rawForwarded.split(',')[0].trim() 
        : req.socket.remoteAddress;

    const userAgent = req.headers['user-agent'] || '';

    // Bloqueia IP da whitelist se essa for a regra de negócio
    if (userIp === CONFIG.WHITELIST_IP) {
        return res.status(403).json({ success: false, message: "Acesso bloqueado por IP." });
    }

    // Validação de dispositivo mobile
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(userAgent);
    if (!isMobile) {
        return res.status(403).json({ success: false, message: "Acesso permitido apenas via dispositivo móvel." });
    }

    try {
        const payload = {
            amount: CONFIG.AMOUNT,
            paymentMethod: "pix",
            customer: generateCustomer(),
            items: [
                {
                    offer_hash: CONFIG.OFFER_HASH,
                    quantity: 1,
                    amount: CONFIG.AMOUNT
                }
            ],
            pix: { 
                expirationInSeconds: 1800 
            }
        };

        const response = await axios.post(`${CONFIG.BASE_URL}/transactions`, payload, {
            headers: {
                'X-Api-Key': CONFIG.API_KEY,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            },
            timeout: 15000 // Timeout de 15 segundos
        });

        const tx = response.data;

        // Retorna os dados do Pix gerados
        return res.json({
            success: true,
            qrcode_url: tx?.pix?.qrcode_url || tx?.pix?.qrcode,
            pix_copy_paste: tx?.pix?.copy_paste || tx?.pix?.qrcode_text,
            transaction_id: tx?.id
        });

    } catch (error) {
        console.error("Erro na integração com a InvictusPay:", error.response?.data || error.message);
        
        return res.status(error.response?.status || 500).json({ 
            success: false, 
            message: "Erro ao gerar cobrança PIX",
            details: error.response?.data || null
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));