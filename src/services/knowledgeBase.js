import fs from "node:fs/promises";
import path from "node:path";
import pdf from "pdf-parse";
import { projectRoot } from "../config.js";
import { ARGACON_CONTEXT } from "../knowledge/argacon.js";

const knowledgeDir = path.resolve(projectRoot, "data", "knowledge");

async function readKnowledgeFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    const buffer = await fs.readFile(filePath);
    const parsed = await pdf(buffer);
    return parsed.text ?? "";
  }

  const content = await fs.readFile(filePath, "utf8");

  if (extension === ".json") {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }

  return content;
}

export async function getKnowledgeContext() {
  const sections = [ARGACON_CONTEXT];

  try {
    await fs.mkdir(knowledgeDir, { recursive: true });
    const files = await fs.readdir(knowledgeDir);

    for (const file of files.sort()) {
      const extension = path.extname(file).toLowerCase();

      if (![".txt", ".md", ".json", ".pdf"].includes(extension)) {
        continue;
      }

      const fullPath = path.join(knowledgeDir, file);
      const content = (await readKnowledgeFile(fullPath)).trim();

      if (!content) {
        continue;
      }

      sections.push(`Arquivo de apoio: ${file}\n${content}`);
    }
  } catch {
    return ARGACON_CONTEXT;
  }

  return sections.join("\n\n");
}
