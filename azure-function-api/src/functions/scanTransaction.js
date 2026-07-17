const { app } = require("@azure/functions");
const { corsHeaders, jsonResponse, extractJson, callAzureOpenAI } = require("../shared/azureOpenAI");

app.http("scanTransaction", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "scan-transaction",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders() };
    }

    try {
      const body = await request.json();
      const { imageBase64, fileType, fileName, allowedCategories } = body;

      if (!imageBase64) {
        return jsonResponse(400, {
          success: false,
          message: "imageBase64 is required."
        });
      }

      const categories = Array.isArray(allowedCategories) && allowedCategories.length
        ? allowedCategories.join(", ")
        : "Makan, Transportasi, Belanja, Tagihan, Hiburan, Kesehatan, Transfer, Lainnya";

      const prompt = `
Kamu adalah AI parser transaksi keuangan Indonesia.
Baca screenshot transaksi dari QRIS, m-banking, e-wallet, struk toko, transfer receipt, atau email receipt.

Ekstrak informasi transaksi dan balas HANYA JSON valid.
Jangan menambahkan markdown.

Kategori yang boleh dipakai:
${categories}

Aturan:
- type harus salah satu: "expense", "income", "transfer".
- Untuk pembayaran/struk/QRIS/e-wallet debit gunakan "expense".
- Untuk transfer antar rekening/dompet sendiri gunakan "transfer".
- Untuk uang masuk/gaji/refund/pembayaran masuk gunakan "income".
- tanggal format YYYY-MM-DD. Jika tidak yakin, gunakan tanggal hari ini dan beri warning.
- nominal harus number tanpa titik/koma.
- bank isi bank/dompet sumber atau yang terlihat paling relevan.
- toBank hanya untuk transfer jika terbaca.
- merchant isi toko/sumber transaksi/email sender jika ada.
- kategori pilih dari daftar kategori.
- confidence angka 0 sampai 1.
- suggestedFileName format: YYYY-MM-DD-kategori-nominal.ext

JSON schema:
{
  "success": true,
  "transaction": {
    "type": "expense",
    "tanggal": "YYYY-MM-DD",
    "nominal": 0,
    "bank": "",
    "toBank": "",
    "merchant": "",
    "kategori": "Lainnya",
    "keterangan": "",
    "confidence": 0.0,
    "suggestedFileName": "YYYY-MM-DD-kategori-nominal.png"
  },
  "warnings": []
}

Jika screenshot tidak bisa dibaca, balas:
{
  "success": false,
  "message": "alasan",
  "transaction": null,
  "warnings": []
}

Nama file asli: ${fileName || "unknown"}
`;

      const content = await callAzureOpenAI(
        [
          {
            role: "system",
            content: "You extract Indonesian financial transaction data from screenshots. Return strict JSON only."
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${fileType || "image/png"};base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        {
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: "json_object" }
        }
      );

      const parsed = extractJson(content);

      if (!parsed) {
        return jsonResponse(502, {
          success: false,
          message: "AI response is not valid JSON.",
          raw: content
        });
      }

      return jsonResponse(200, parsed);
    } catch (error) {
      context.error(error);
      return jsonResponse(500, {
        success: false,
        message: error.message || "Internal server error."
      });
    }
  }
});
