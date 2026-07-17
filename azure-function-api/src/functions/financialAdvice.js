const { app } = require("@azure/functions");
const { corsHeaders, jsonResponse, callAzureOpenAI } = require("../shared/azureOpenAI");

app.http("financialAdvice", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "financial-advice",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders() };
    }

    try {
      const summary = await request.json();

      const prompt = `
Kamu adalah financial advisor personal untuk user Indonesia.
Berikan saran praktis, singkat, dan tidak menghakimi berdasarkan ringkasan data berikut.

Data:
${JSON.stringify(summary, null, 2)}

Format jawaban:
Status Keuangan: [Aman / Perlu Diperhatikan / Kritis]

Ringkasan:
- ...
- ...

Rekomendasi:
1. ...
2. ...
3. ...

Catatan:
- Jangan memberi nasihat investasi spesifik berisiko tinggi.
- Jangan menyuruh user berutang.
- Fokus pada budgeting, cashflow, dana darurat, dan kontrol pengeluaran.
- Gunakan Rupiah.
`;

      const advice = await callAzureOpenAI(
        [
          {
            role: "system",
            content: "You are a cautious Indonesian personal finance advisor. Do not provide risky investment advice."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        {
          temperature: 0.4,
          max_tokens: 900
        }
      );

      return jsonResponse(200, {
        success: true,
        advice
      });
    } catch (error) {
      context.error(error);
      return jsonResponse(500, {
        success: false,
        message: error.message || "Internal server error."
      });
    }
  }
});
