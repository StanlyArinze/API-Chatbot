import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const srcDir = path.dirname(currentFilePath);
export const projectRoot = path.resolve(srcDir, "..");
const envDebugInfo = {
  loadedPath: null,
  checkedPaths: []
};

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return false;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

function loadDotEnv() {
  const envCandidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(projectRoot, ".env")
  ];

  envDebugInfo.checkedPaths = [...new Set(envCandidates)];

  for (const envPath of envCandidates) {
    if (loadEnvFile(envPath)) {
      envDebugInfo.loadedPath = envPath;
      return;
    }
  }
}

loadDotEnv();

export const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  baseUrl: process.env.BASE_URL ?? "",
  whatsappProvider: process.env.WHATSAPP_PROVIDER ?? "web",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION ?? "v22.0",
  whatsappWebSessionPath: process.env.WHATSAPP_WEB_SESSION_PATH ?? ".wwebjs_auth",
  whatsappWebClientId: process.env.WHATSAPP_WEB_CLIENT_ID ?? "argacon-leads",
  whatsappWebHeadless: (process.env.WHATSAPP_WEB_HEADLESS ?? "true").toLowerCase() !== "false",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash"
};

export function getMissingConfig() {
  const required =
    config.whatsappProvider === "cloud"
      ? ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]
      : [];

  return required.filter((key) => !process.env[key]);
}

export function getEnvDebugInfo() {
  return {
    ...envDebugInfo
  };
}
