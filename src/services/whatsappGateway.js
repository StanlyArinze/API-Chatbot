import { config } from "../config.js";
import { handleIncomingLeadMessage } from "./leadResponder.js";
import { sendWhatsAppText as sendCloudText } from "./whatsapp.js";
import {
  getWhatsAppWebStatus,
  initWhatsAppWebClient,
  sendWhatsAppWebText
} from "./whatsappWeb.js";

function normalizeCloudResponse(response) {
  return {
    messageId: response?.messages?.[0]?.id ?? null
  };
}

export async function initWhatsAppProvider() {
  if (config.whatsappProvider !== "web") {
    return;
  }

  await initWhatsAppWebClient({
    onTextMessage: (message) =>
      handleIncomingLeadMessage({
        ...message,
        sendReply: sendProviderReply
      })
  });
}

export async function sendProviderReply({ phone, body }) {
  if (config.whatsappProvider === "web") {
    return sendWhatsAppWebText({ phone, body });
  }

  const cloudResponse = await sendCloudText({
    to: phone,
    body
  });

  return normalizeCloudResponse(cloudResponse);
}

export function getProviderStatus() {
  if (config.whatsappProvider === "web") {
    return getWhatsAppWebStatus();
  }

  return {
    provider: "cloud",
    status: "webhook"
  };
}
