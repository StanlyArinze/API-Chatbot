import { generateLeadReply } from "./gemini.js";
import {
  getLead,
  hasProcessedMessage,
  markMessageProcessed,
  registerInboundMessage,
  registerOutboundMessage,
  updateLeadAnalysis
} from "./store.js";
import { normalizeText } from "../utils/text.js";

const UNSUPPORTED_MESSAGE_REPLY =
  "Recebi sua mensagem, mas no momento consigo atender melhor por texto. Se puder, me envie em texto qual produto voce precisa e a aplicacao desejada.";

function extractProfileName(changeValue, phone) {
  return changeValue?.contacts?.find((contact) => contact.wa_id === phone)?.profile?.name ?? "";
}

function extractIncomingMessages(body) {
  const events = [];

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;

      if (!value?.messages) {
        continue;
      }

      for (const message of value.messages) {
        const phone = message.from;

        if (!phone) {
          continue;
        }

        events.push({
          phone,
          profileName: normalizeText(extractProfileName(value, phone)),
          messageId: message.id,
          type: message.type,
          text: normalizeText(message.text?.body ?? "")
        });
      }
    }
  }

  return events;
}

export async function processWebhookPayload(body, sendReply) {
  const incomingMessages = extractIncomingMessages(body);
  const results = [];

  for (const item of incomingMessages) {
    results.push(await handleIncomingLeadMessage({ ...item, sendReply }));
  }

  return results;
}

export async function handleIncomingLeadMessage({ phone, profileName, messageId, type, text, sendReply }) {
  const normalizedProfileName = normalizeText(profileName);
  const normalizedText = normalizeText(text);

  if (await hasProcessedMessage(messageId)) {
    return { phone, ignored: true, reason: "duplicate" };
  }

  await markMessageProcessed(messageId);

  if (type !== "text" || !normalizedText) {
    await registerInboundMessage({
      phone,
      profileName: normalizedProfileName,
      text: `[mensagem ${type}]`,
      messageId,
      rawType: type
    });

    const providerResponse = await sendReply({
      phone,
      body: UNSUPPORTED_MESSAGE_REPLY
    });

    await registerOutboundMessage({
      phone,
      text: UNSUPPORTED_MESSAGE_REPLY,
      meta: {
        messageId: providerResponse?.messageId
      }
    });

    return { phone, replied: true, unsupported: true };
  }

  await registerInboundMessage({
    phone,
    profileName: normalizedProfileName,
    text: normalizedText,
    messageId,
    rawType: type
  });

  const lead = await getLead(phone);
  const analysis = await generateLeadReply({
    lead,
    incomingText: normalizedText
  });

  await updateLeadAnalysis(phone, analysis);

  const providerResponse = await sendReply({
    phone,
    body: analysis.reply
  });

  await registerOutboundMessage({
    phone,
    text: analysis.reply,
    meta: {
      messageId: providerResponse?.messageId
    }
  });

  return {
    phone,
    replied: true,
    needsHuman: analysis.needs_human,
    stage: analysis.lead_stage
  };
}

export async function simulateLeadConversation({ phone, name, message }) {
  await registerInboundMessage({
    phone,
    profileName: normalizeText(name),
    text: normalizeText(message),
    messageId: `simulate-${Date.now()}`,
    rawType: "text"
  });

  const lead = await getLead(phone);
  const analysis = await generateLeadReply({
    lead,
    incomingText: normalizeText(message)
  });

  await updateLeadAnalysis(phone, analysis);
  await registerOutboundMessage({
    phone,
    text: analysis.reply
  });

  return {
    lead: await getLead(phone),
    reply: analysis.reply,
    analysis
  };
}
