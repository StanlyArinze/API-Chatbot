import { config } from "../config.js";
import { SALES_BEHAVIOR } from "../knowledge/argacon.js";
import { getKnowledgeContext } from "./knowledgeBase.js";
import { expandBusinessAbbreviations, normalizeObjectStrings, normalizeText } from "../utils/text.js";

const FALLBACK_REPLY =
  "Obrigado pelo contato com a Argacon. Para eu te ajudar melhor, me diga qual produto voce precisa, a aplicacao e a quantidade aproximada. Se preferir, nosso comercial tambem atende em comercial@argacon.com.br e no WhatsApp (51) 9729-7850.";

const aiStatus = {
  provider: "gemini",
  model: config.geminiModel,
  configured: Boolean(config.geminiApiKey),
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFallbackAt: null,
  lastError: null
};

export function buildFallbackAnalysis(reason = "") {
  aiStatus.lastFallbackAt = new Date().toISOString();
  aiStatus.lastError = reason || "Fallback acionado.";

  return {
    reply: FALLBACK_REPLY,
    summary: reason || "Lead sem resposta estruturada da IA.",
    lead_stage: "new",
    intent: "contato inicial",
    needs_human: true,
    collected_data: {}
  };
}

function sanitizeHistory(messages = []) {
  return messages.slice(-12).map((message) => ({
    direction: message.direction,
    text: normalizeText(message.text),
    interpreted_text: expandBusinessAbbreviations(message.text)
  }));
}

function buildPrompt({ knowledgeContext, lead, incomingText }) {
  const history = sanitizeHistory(lead?.messages);
  const interpretedIncomingText = expandBusinessAbbreviations(incomingText);

  return `
${knowledgeContext}

${SALES_BEHAVIOR}

Historico recente:
${JSON.stringify(history, null, 2)}

Dados ja coletados do lead:
${JSON.stringify(normalizeObjectStrings(lead?.collectedData ?? {}), null, 2)}

Mensagem atual do cliente:
${normalizeText(incomingText)}

Mensagem atual interpretada com abreviacoes comerciais expandidas:
${interpretedIncomingText}

Responda com JSON valido no formato:
{
  "reply": "texto curto para WhatsApp",
  "summary": "resumo curto do lead",
  "lead_stage": "new|qualifying|qualified|hot|handoff",
  "intent": "interesse principal do lead",
  "needs_human": true,
  "collected_data": {
    "nome": "",
    "empresa": "",
    "cnpj": "",
    "cidade": "",
    "produto_interesse": "",
    "aplicacao": "",
    "quantidade": "",
    "urgencia": "",
    "email": ""
  }
}

Instrucoes adicionais:
- "reply" deve ter no maximo 450 caracteres.
- Nao invente informacoes que nao estejam confirmadas.
- Considere abreviacoes comerciais comuns. Exemplos: "cx" = "caixas", "un/und" = "unidades", "pct" = "pacotes", "pc/pca/pç" = "peca/pecas", "qtd" = "quantidade", "urg" = "urgente".
- Se o cliente pedir informacoes basicas sobre a empresa, categorias, contatos, enderecos ou produtos citados no contexto, responda objetivamente usando o contexto antes de tentar qualificar.
- Se a pergunta for institucional ou informativa, nao fique repetindo a abordagem comercial.
- Se pedirem algo como "mais vendido", "melhor preco", "estoque", "prazo" ou "frete" e isso nao estiver no contexto, diga claramente que precisa de confirmacao do comercial.
- Se faltar dado importante, faca no maximo 2 perguntas na mesma resposta.
- Quando o lead demonstrar interesse comercial, priorize coletar nome, cnpj e cidade sem fazer interrogatorio grande demais.
- Se o cliente ja informou parte dos dados, reconheca o que ja foi informado e peça apenas o que falta.
- Se o cliente pedir preco, prazo, frete, catalogo ou negociacao, diga que o comercial confirma e marque "needs_human": true.
- Se a mensagem do cliente estiver vaga, conduza a qualificacao.
`.trim();
}

function parseJsonResponse(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const fullObjectMatch = cleaned.match(/\{[\s\S]*\}/);

    if (fullObjectMatch) {
      try {
        return JSON.parse(fullObjectMatch[0]);
      } catch {
        // Continua para as estrategias de recuperacao abaixo.
      }
    }

    const partialReplyMatch = cleaned.match(/"reply"\s*:\s*"((?:\\.|[^"])*)/);

    if (partialReplyMatch?.[1]) {
      return {
        reply: JSON.parse(`"${partialReplyMatch[1]}"`),
        summary: "Resposta parcial do Gemini recuperada do campo reply.",
        lead_stage: "qualifying",
        intent: "informacao",
        needs_human: false,
        collected_data: {}
      };
    }

    const looksLikeBrokenJson =
      cleaned.startsWith("{") ||
      cleaned.startsWith("[") ||
      cleaned.includes('"reply"') ||
      cleaned.includes('"summary"');

    if (looksLikeBrokenJson) {
      throw new Error("Gemini retornou JSON incompleto ou invalido.");
    }

    return {
      reply: cleaned,
      summary: "Resposta livre do Gemini convertida sem JSON estruturado.",
      lead_stage: "qualifying",
      intent: "informacao",
      needs_human: false,
      collected_data: {}
    };
  }
}

function normalizeReply(reply) {
  const normalized = String(reply || "").trim();

  if (!normalized) {
    return FALLBACK_REPLY;
  }

  const looksLikeBrokenJson =
    normalized === "{" ||
    normalized === "}" ||
    normalized.startsWith('{"') ||
    normalized.startsWith('{\n') ||
    normalized.startsWith('"reply"') ||
    normalized.startsWith("{\r\n");

  if (looksLikeBrokenJson) {
    return FALLBACK_REPLY;
  }

  return normalizeText(normalized);
}

export function getAiStatus() {
  return {
    ...aiStatus,
    provider: "gemini",
    model: config.geminiModel,
    configured: Boolean(config.geminiApiKey)
  };
}

async function requestGemini(prompt) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 500,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            reply: { type: "STRING" },
            summary: { type: "STRING" },
            lead_stage: { type: "STRING" },
            intent: { type: "STRING" },
            needs_human: { type: "BOOLEAN" },
            collected_data: {
              type: "OBJECT",
              properties: {
                nome: { type: "STRING" },
                empresa: { type: "STRING" },
                cnpj: { type: "STRING" },
                cidade: { type: "STRING" },
                produto_interesse: { type: "STRING" },
                aplicacao: { type: "STRING" },
                quantidade: { type: "STRING" },
                urgencia: { type: "STRING" },
                email: { type: "STRING" }
              }
            }
          },
          required: ["reply", "summary", "lead_stage", "intent", "needs_human", "collected_data"]
        }
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao consultar Gemini: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  const finishReason = data?.candidates?.[0]?.finishReason;

  if (!text) {
    throw new Error(`Gemini retornou resposta vazia. finishReason=${finishReason ?? "desconhecido"}`);
  }

  return text;
}

export async function generateLeadReply({ lead, incomingText }) {
  aiStatus.lastAttemptAt = new Date().toISOString();
  aiStatus.provider = "gemini";
  aiStatus.model = config.geminiModel;
  aiStatus.configured = Boolean(config.geminiApiKey);

  if (!config.geminiApiKey) {
    return buildFallbackAnalysis("Lead sem resposta de IA por falta de configuracao do Gemini.");
  }

  try {
    const knowledgeContext = await getKnowledgeContext();
    const prompt = buildPrompt({ knowledgeContext, lead, incomingText });
    const text = await requestGemini(prompt);

    const parsed = parseJsonResponse(text);

    aiStatus.lastSuccessAt = new Date().toISOString();
    aiStatus.lastError = null;

    const normalizedParsed = normalizeObjectStrings(parsed);

    return {
      reply: normalizeReply(normalizedParsed.reply),
      summary: normalizeText(normalizedParsed.summary || ""),
      lead_stage: normalizedParsed.lead_stage || "new",
      intent: normalizeText(normalizedParsed.intent || "contato inicial"),
      needs_human: Boolean(normalizedParsed.needs_human),
      collected_data: normalizeObjectStrings(normalizedParsed.collected_data || {})
    };
  } catch (error) {
    const reason =
      error instanceof Error ? `Fallback acionado: ${error.message}` : "Fallback acionado por erro desconhecido.";

    console.error("Falha ao gerar resposta com Gemini:", error);
    return buildFallbackAnalysis(reason);
  }
}
