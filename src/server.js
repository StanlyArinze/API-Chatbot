import http from "node:http";
import { URL } from "node:url";
import { config, getEnvDebugInfo, getMissingConfig } from "./config.js";
import { getAiStatus } from "./services/gemini.js";
import { processWebhookPayload, simulateLeadConversation } from "./services/leadResponder.js";
import { getLead, listLeads } from "./services/store.js";
import { getProviderStatus, initWhatsAppProvider, sendProviderReply } from "./services/whatsappGateway.js";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(payload);
}

function sendHtml(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Body JSON invalido.");
  }
}

function getPhoneFromPath(pathname) {
  const match = pathname.match(/^\/api\/leads\/([^/]+)$/);
  return match?.[1] ?? null;
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "argacon-whatsapp-leads-api",
        provider: config.whatsappProvider,
        missingConfig: getMissingConfig(),
        configStatus: {
          whatsappVerifyToken: Boolean(config.whatsappVerifyToken),
          whatsappAccessToken: Boolean(config.whatsappAccessToken),
          whatsappPhoneNumberId: Boolean(config.whatsappPhoneNumberId),
          whatsappWebSessionPath: Boolean(config.whatsappWebSessionPath),
          geminiApiKey: Boolean(config.geminiApiKey)
        },
        environment: getEnvDebugInfo(),
        whatsapp: getProviderStatus(),
        ai: getAiStatus(),
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (method === "GET" && pathname === "/webhook") {
      if (config.whatsappProvider !== "cloud") {
        sendJson(res, 400, {
          ok: false,
          error: "Webhook do Meta disponivel apenas quando WHATSAPP_PROVIDER=cloud."
        });
        return;
      }

      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === config.whatsappVerifyToken) {
        sendText(res, 200, challenge || "ok");
        return;
      }

      sendJson(res, 403, {
        ok: false,
        error: "Falha na verificacao do webhook."
      });
      return;
    }

    if (method === "POST" && pathname === "/webhook") {
      if (config.whatsappProvider !== "cloud") {
        sendJson(res, 400, {
          ok: false,
          error: "Webhook do Meta disponivel apenas quando WHATSAPP_PROVIDER=cloud."
        });
        return;
      }

      const body = await readJsonBody(req);
      const results = await processWebhookPayload(body, sendProviderReply);

      sendJson(res, 200, {
        ok: true,
        processed: results
      });
      return;
    }

    if (method === "GET" && pathname === "/api/whatsapp/status") {
      sendJson(res, 200, {
        ok: true,
        whatsapp: getProviderStatus()
      });
      return;
    }

    if (method === "GET" && pathname === "/api/whatsapp/qr") {
      if (config.whatsappProvider !== "web") {
        sendJson(res, 400, {
          ok: false,
          error: "QR Code disponivel apenas quando WHATSAPP_PROVIDER=web."
        });
        return;
      }

      const status = getProviderStatus();

      sendJson(res, 200, {
        ok: true,
        provider: "web",
        status: status.status,
        qrUpdatedAt: status.qrUpdatedAt,
        qrDataUrl: status.qrDataUrl
      });
      return;
    }

    if (method === "GET" && pathname === "/api/whatsapp/qr/view") {
      if (config.whatsappProvider !== "web") {
        sendHtml(
          res,
          400,
          "<h1>QR indisponivel</h1><p>Defina <code>WHATSAPP_PROVIDER=web</code> para usar login por QR Code.</p>"
        );
        return;
      }

      const status = getProviderStatus();

      if (!status.qrDataUrl) {
        sendHtml(
          res,
          200,
          `<!doctype html>
          <html lang="pt-BR">
          <head><meta charset="utf-8"><title>QR Code WhatsApp</title></head>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h1>WhatsApp Status</h1>
            <p>Status atual: <strong>${status.status}</strong></p>
            <p>Se o QR ainda nao apareceu, aguarde alguns segundos e atualize a pagina.</p>
          </body>
          </html>`
        );
        return;
      }

      sendHtml(
        res,
        200,
        `<!doctype html>
        <html lang="pt-BR">
        <head><meta charset="utf-8"><title>QR Code WhatsApp</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px; text-align: center;">
          <h1>Escaneie o QR Code</h1>
          <p>Status atual: <strong>${status.status}</strong></p>
          <img src="${status.qrDataUrl}" alt="QR Code do WhatsApp" style="max-width: 320px; width: 100%; height: auto;" />
          <p>Depois do login, esta pagina pode passar a mostrar apenas o status <strong>ready</strong>.</p>
        </body>
        </html>`
      );
      return;
    }

    if (method === "POST" && pathname === "/api/chat/simulate") {
      const body = await readJsonBody(req);
      const phone = String(body.phone || "").trim();
      const name = String(body.name || "").trim();
      const message = String(body.message || "").trim();

      if (!phone || !message) {
        sendJson(res, 400, {
          ok: false,
          error: "Informe phone e message."
        });
        return;
      }

      const simulation = await simulateLeadConversation({
        phone,
        name,
        message
      });

      sendJson(res, 200, {
        ok: true,
        ...simulation
      });
      return;
    }

    if (method === "GET" && pathname === "/api/leads") {
      const leads = await listLeads();
      sendJson(res, 200, {
        ok: true,
        total: leads.length,
        leads
      });
      return;
    }

    if (method === "GET" && getPhoneFromPath(pathname)) {
      const phone = getPhoneFromPath(pathname);
      const lead = await getLead(phone);

      if (!lead) {
        sendJson(res, 404, {
          ok: false,
          error: "Lead nao encontrado."
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        lead
      });
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: "Rota nao encontrada."
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Erro interno."
    });
  }
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(
      `A porta ${config.port} ja esta em uso. Altere PORT no arquivo .env ou finalize o processo que esta usando essa porta.`
    );
    return;
  }

  console.error("Falha ao iniciar o servidor:", error);
});

server.listen(config.port, () => {
  const missing = getMissingConfig();

  console.log(`API rodando em http://localhost:${config.port}`);
  console.log(`Provider de WhatsApp: ${config.whatsappProvider}`);

  if (missing.length) {
    console.log(`Configuracoes pendentes: ${missing.join(", ")}`);
  }

  initWhatsAppProvider().catch((error) => {
    console.error("Falha ao iniciar provider de WhatsApp:", error);
  });
});
