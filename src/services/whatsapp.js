import { config } from "../config.js";

function getGraphUrl() {
  return `https://graph.facebook.com/${config.whatsappApiVersion}/${config.whatsappPhoneNumberId}/messages`;
}

export async function sendWhatsAppText({ to, body }) {
  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
    throw new Error("WhatsApp Cloud API nao configurado.");
  }

  const response = await fetch(getGraphUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsappAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Falha ao enviar WhatsApp: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}
