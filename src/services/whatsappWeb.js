import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";
import whatsappWeb from "whatsapp-web.js";
import { config } from "../config.js";
import { normalizeText } from "../utils/text.js";

const { Client, LocalAuth } = whatsappWeb;

const state = {
  status: "idle",
  qr: null,
  qrDataUrl: null,
  qrUpdatedAt: null,
  authenticatedAt: null,
  readyAt: null,
  loading: null,
  lastError: null,
  lastDisconnectReason: null
};

let client = null;
let initPromise = null;
let messageHandler = async () => {};

function setStatus(status, extra = {}) {
  state.status = status;
  Object.assign(state, extra);
}

function ensurePhoneId(phone) {
  return phone.includes("@") ? phone : `${phone}@c.us`;
}

function normalizeIncomingPhone(chatId = "") {
  return chatId.replace(/@.+$/, "");
}

async function ensureSessionDir() {
  const fullPath = path.resolve(process.cwd(), config.whatsappWebSessionPath);
  await fs.mkdir(fullPath, { recursive: true });
  return fullPath;
}

export function getWhatsAppWebStatus() {
  return {
    provider: "web",
    ...state
  };
}

export async function sendWhatsAppWebText({ phone, body }) {
  if (!client || state.status !== "ready") {
    throw new Error("WhatsApp Web ainda nao esta pronto. Escaneie o QR Code e aguarde a conexao.");
  }

  const message = await client.sendMessage(ensurePhoneId(phone), normalizeText(body));

  return {
    messageId: message?.id?._serialized ?? null
  };
}

export async function initWhatsAppWebClient({ onTextMessage }) {
  messageHandler = onTextMessage;

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const dataPath = await ensureSessionDir();

    client = new Client({
      authStrategy: new LocalAuth({
        clientId: config.whatsappWebClientId,
        dataPath
      }),
      puppeteer: {
        headless: config.whatsappWebHeadless,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      }
    });

    client.on("qr", async (qr) => {
      const qrDataUrl = await QRCode.toDataURL(qr);

      setStatus("waiting_qr", {
        qr,
        qrDataUrl,
        qrUpdatedAt: new Date().toISOString(),
        lastError: null
      });

      qrcodeTerminal.generate(qr, { small: true });
      console.log("QR Code atualizado. Abra /api/whatsapp/qr ou escaneie pelo terminal.");
    });

    client.on("loading_screen", (percent, message) => {
      setStatus("loading", {
        loading: { percent, message }
      });
    });

    client.on("authenticated", () => {
      setStatus("authenticated", {
        authenticatedAt: new Date().toISOString(),
        lastError: null
      });
      console.log("WhatsApp Web autenticado.");
    });

    client.on("ready", () => {
      setStatus("ready", {
        readyAt: new Date().toISOString(),
        qr: null,
        qrDataUrl: null,
        loading: null
      });
      console.log("WhatsApp Web pronto para atender leads.");
    });

    client.on("auth_failure", (message) => {
      setStatus("auth_failure", {
        lastError: message || "Falha de autenticacao."
      });
      console.error("Falha de autenticacao no WhatsApp Web:", message);
    });

    client.on("disconnected", (reason) => {
      setStatus("disconnected", {
        lastDisconnectReason: String(reason || ""),
        qr: null,
        qrDataUrl: null
      });
      console.warn("WhatsApp Web desconectado:", reason);
    });

    client.on("message", async (message) => {
      if (
        message.fromMe ||
        message.from === "status@broadcast" ||
        message.from.endsWith("@broadcast") ||
        message.from.endsWith("@g.us") ||
        !message.from.endsWith("@c.us")
      ) {
        return;
      }

      try {
        const contact = await message.getContact();

        await messageHandler({
          phone: normalizeIncomingPhone(message.from),
          profileName: normalizeText(contact?.pushname || contact?.name || ""),
          messageId: message.id?._serialized ?? `wweb-${Date.now()}`,
          type: message.type === "chat" ? "text" : message.type,
          text: normalizeText(message.body || "")
        });
      } catch (error) {
        console.error("Erro ao processar mensagem do WhatsApp Web:", error);
      }
    });

    setStatus("initializing");
    await client.initialize();
    return client;
  })();

  return initPromise;
}
