import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BriefInput, Contributor, WorkflowBrief } from "../src/types.js";
import {
  SYSTEM_PROMPT,
  WORKFLOW_BRIEF_SCHEMA,
  buildModelInput,
  isWorkflowBrief,
  normalizeBrief,
  screenSensitiveInput,
} from "./brief.js";

dotenv.config({ path: process.env.ENV_FILE || ".env.local", quiet: true });

const app = express();
const port = Number(process.env.PORT || 5173);
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

app.post("/api/generate", async (request, response) => {
  const validation = validateInput(request.body);
  if (!validation.ok) {
    response.status(400).json({ error: validation.error });
    return;
  }

  const screening = screenSensitiveInput(validation.input);
  if (screening.blocked) {
    response.status(422).json({ error: screening.error });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "OpenAI API key is not configured. Add it to .env.local, then restart the app." });
    return;
  }

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
        instructions: SYSTEM_PROMPT,
        input: buildModelInput(validation.input, screening.categories),
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "workflow_brief",
            strict: true,
            schema: WORKFLOW_BRIEF_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!openAIResponse.ok) {
      const errorPayload = (await openAIResponse.json().catch(() => null)) as { error?: { message?: string } } | null;
      console.error("OpenAI request failed", openAIResponse.status, errorPayload?.error?.message || "Unknown API error");
      response.status(502).json({ error: friendlyOpenAIError(openAIResponse.status) });
      return;
    }

    const payload = (await openAIResponse.json()) as OpenAIResponsePayload;
    const outputText = extractOutputText(payload);
    const parsedBrief: unknown = JSON.parse(outputText);

    if (!isWorkflowBrief(parsedBrief)) {
      throw new Error("The model returned an incomplete Workflow Brief.");
    }

    response.json({ brief: normalizeBrief(parsedBrief, screening.categories) });
  } catch (error) {
    console.error("Workflow Brief generation failed", error instanceof Error ? error.message : error);
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    response.status(502).json({ error: timedOut ? "The OpenAI request timed out. Please try again." : "The draft could not be generated. Please try again." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const staticDirectory = path.join(rootDirectory, "dist");
    app.use(express.static(staticDirectory));
    app.use((_request, response) => response.sendFile(path.join(staticDirectory, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(port, "127.0.0.1", () => {
    console.log(`Blossom is running at http://127.0.0.1:${port}`);
  });
}

function validateInput(value: unknown): { ok: true; input: BriefInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Submit the required brief inputs." };
  const candidate = value as Record<string, unknown>;
  const contributors: Contributor[] = ["Sales", "PMM", "SME"];
  if (!contributors.includes(candidate.contributor as Contributor)) return { ok: false, error: "Choose a valid contributor." };

  const industry = cleanString(candidate.industry);
  const workflow = cleanString(candidate.workflow);
  const fieldNotes = cleanString(candidate.fieldNotes);
  const supportingEvidence = cleanString(candidate.supportingEvidence);
  if (!industry || !workflow || !fieldNotes) return { ok: false, error: "Industry, workflow, and field notes are required." };
  if (industry.length > 160 || workflow.length > 240 || fieldNotes.length > 20_000 || supportingEvidence.length > 4_000) {
    return { ok: false, error: "One or more fields exceed the allowed length." };
  }

  return { ok: true, input: { contributor: candidate.contributor as Contributor, industry, workflow, fieldNotes, supportingEvidence } };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function friendlyOpenAIError(status: number) {
  if (status === 401) return "The OpenAI API key was rejected. Check .env.local and restart the app.";
  if (status === 429) return "The OpenAI API rate or usage limit was reached. Please wait and try again.";
  return "OpenAI could not generate the draft right now. Please try again.";
}

interface OpenAIResponsePayload {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output || []) {
    const output = item.content?.find((content) => content.type === "output_text" && content.text);
    if (output?.text) return output.text;
  }
  throw new Error("The model response did not contain output text.");
}

startServer().catch((error) => {
  console.error("Blossom failed to start", error);
  process.exit(1);
});

export { validateInput };
