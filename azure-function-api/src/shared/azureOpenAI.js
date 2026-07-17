function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  };
}

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json"
    },
    jsonBody: body
  };
}

function normalizeEndpoint(endpoint) {
  if (!endpoint) return "";
  return endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
}

function extractJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }
}

async function callAzureOpenAI(messages, options = {}) {
  const endpoint = normalizeEndpoint(process.env.AZURE_OPENAI_ENDPOINT);
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  if (!endpoint || !apiKey || !deployment) {
    throw new Error("Azure OpenAI environment variables are incomplete.");
  }

  const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const payload = {
    messages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.max_tokens ?? 1200
  };

  if (options.response_format) {
    payload.response_format = options.response_format;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `Azure OpenAI error: ${response.status}`);
  }

  return data.choices?.[0]?.message?.content || "";
}

module.exports = {
  corsHeaders,
  jsonResponse,
  extractJson,
  callAzureOpenAI
};
