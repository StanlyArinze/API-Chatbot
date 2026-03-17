import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../config.js";
import { normalizeObjectStrings, normalizeText } from "../utils/text.js";

const storePath = path.resolve(projectRoot, "data", "leads.json");
let storeQueue = Promise.resolve();

function buildDefaultStore() {
  return {
    leads: {},
    processedMessageIds: []
  };
}

async function ensureStoreFile() {
  await fs.mkdir(path.dirname(storePath), { recursive: true });

  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify(buildDefaultStore(), null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStoreFile();
  const content = await fs.readFile(storePath, "utf8");

  try {
    return normalizeObjectStrings(JSON.parse(content));
  } catch {
    return buildDefaultStore();
  }
}

async function writeStore(store) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

function withStore(action) {
  const execution = storeQueue.then(async () => {
    const store = await readStore();
    const result = await action(store);
    await writeStore(store);
    return result;
  });

  storeQueue = execution.catch(() => undefined);
  return execution;
}

function normalizeLead(phone, profileName = "") {
  return {
    phone,
    profileName: normalizeText(profileName),
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    stage: "new",
    intent: "unknown",
    status: "open",
    needsHuman: false,
    summary: "",
    collectedData: {
      nome: "",
      empresa: "",
      cnpj: "",
      cidade: "",
      produto_interesse: "",
      aplicacao: "",
      quantidade: "",
      urgencia: "",
      email: ""
    },
    messages: []
  };
}

function upsertLead(store, phone, profileName = "") {
  if (!store.leads[phone]) {
    store.leads[phone] = normalizeLead(phone, profileName);
  }

  if (profileName) {
    store.leads[phone].profileName = normalizeText(profileName);
  }

  store.leads[phone].lastUpdatedAt = new Date().toISOString();
  return store.leads[phone];
}

export async function hasProcessedMessage(messageId) {
  if (!messageId) {
    return false;
  }

  return withStore((store) => store.processedMessageIds.includes(messageId));
}

export async function markMessageProcessed(messageId) {
  if (!messageId) {
    return;
  }

  return withStore((store) => {
    if (!store.processedMessageIds.includes(messageId)) {
      store.processedMessageIds.push(messageId);
      store.processedMessageIds = store.processedMessageIds.slice(-500);
    }
  });
}

export async function registerInboundMessage({ phone, profileName, text, messageId, rawType = "text" }) {
  return withStore((store) => {
    const lead = upsertLead(store, phone, profileName);

    lead.messages.push({
      id: messageId || null,
      direction: "inbound",
      type: rawType,
      text: normalizeText(text),
      timestamp: new Date().toISOString()
    });

    return lead;
  });
}

export async function registerOutboundMessage({ phone, text, meta = {} }) {
  return withStore((store) => {
    const lead = upsertLead(store, phone);

    lead.messages.push({
      id: meta.messageId || null,
      direction: "outbound",
      type: "text",
      text: normalizeText(text),
      timestamp: new Date().toISOString(),
      provider: "whatsapp"
    });

    return lead;
  });
}

export async function updateLeadAnalysis(phone, analysis) {
  return withStore((store) => {
    const lead = upsertLead(store, phone);
    const normalizedAnalysis = normalizeObjectStrings(analysis);

    lead.stage = normalizedAnalysis.lead_stage || lead.stage;
    lead.intent = normalizedAnalysis.intent || lead.intent;
    lead.summary = normalizedAnalysis.summary || lead.summary;
    lead.needsHuman = Boolean(normalizedAnalysis.needs_human);

    if (normalizedAnalysis.collected_data && typeof normalizedAnalysis.collected_data === "object") {
      lead.collectedData = {
        ...lead.collectedData,
        ...Object.fromEntries(
          Object.entries(normalizedAnalysis.collected_data).filter(
            ([, value]) => typeof value === "string" && value.trim()
          )
        )
      };
    }

    lead.lastUpdatedAt = new Date().toISOString();
    return lead;
  });
}

export async function getLead(phone) {
  return withStore((store) => store.leads[phone] || null);
}

export async function listLeads() {
  return withStore((store) =>
    Object.values(store.leads)
      .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime())
      .map((lead) => ({
        phone: lead.phone,
        profileName: lead.profileName,
        stage: lead.stage,
        intent: lead.intent,
        status: lead.status,
        needsHuman: lead.needsHuman,
        summary: lead.summary,
        lastUpdatedAt: lead.lastUpdatedAt,
        lastMessage: lead.messages.at(-1)?.text ?? ""
      }))
  );
}
