import assert from "node:assert/strict";
import test from "node:test";
import type { BriefInput, WorkflowBrief } from "../src/types.js";
import {
  SYSTEM_PROMPT,
  WORKFLOW_BRIEF_SCHEMA,
  buildModelInput,
  detectSensitiveSignals,
  isWorkflowBrief,
  normalizeBrief,
  screenSensitiveInput,
} from "../server/brief.js";

const input: BriefInput = {
  contributor: "Sales",
  industry: "Financial services",
  workflow: "Alert triage",
  fieldNotes: "Two prospects said analysts manually review the alerts.",
  supportingEvidence: "Sales conversation notes",
};

test("the model prompt explicitly contains all three processing rules", () => {
  assert.match(SYSTEM_PROMPT, /DE-IDENTIFICATION AND SENSITIVITY/);
  assert.match(SYSTEM_PROMPT, /EVIDENCE DISCIPLINE/);
  assert.match(SYSTEM_PROMPT, /PROVENANCE/);
  assert.match(SYSTEM_PROMPT, /Never reproduce secrets/);
  assert.match(SYSTEM_PROMPT, /ordered sequence of 3–5 short stages/);
  assert.match(SYSTEM_PROMPT, /Never invent a missing stage/);
});

test("the v2 schema removes SME review and requires workflow stages plus open questions", () => {
  const root = WORKFLOW_BRIEF_SCHEMA as unknown as {
    required: string[];
    properties: {
      sections: { properties: Record<string, unknown> };
      reviewStatus: { properties: Record<string, unknown> };
    };
  };
  assert.ok(root.required.includes("openQuestions"));
  assert.ok("workflowStages" in root.properties.sections.properties);
  assert.ok(!("requiresValidation" in root.properties.sections.properties));
  assert.ok(!("smePmm" in root.properties.reviewStatus.properties));
});

test("model input preserves contributor provenance", () => {
  const modelInput = JSON.parse(buildModelInput(input, []));
  assert.equal(modelInput.contributor, "Sales");
  assert.equal(modelInput.fieldNotes, input.fieldNotes);
  assert.match(modelInput.deterministicSensitivitySignals, /None detected/);
});

test("pre-submission screening checks both note fields for high-confidence categories", () => {
  const signals = detectSensitiveSignals({
    ...input,
    fieldNotes: "Contact name: Jane Example; jane@example.com; (415) 555-0123; case ID CASE-4821; password: example-pass.",
    supportingEvidence: "API key: sk-example0123456789abcdef. Internal server: 10.0.0.7. This is under NDA.",
  });
  assert.deepEqual(signals, [
    "email address",
    "phone number",
    "API key or access token",
    "password",
    "account or case identifier",
    "personal or contact detail",
    "network or infrastructure detail",
    "customer-confidential information",
  ]);
});

test("blocked screening errors disclose categories only and require contributor judgment", () => {
  const screened = screenSensitiveInput({
    ...input,
    fieldNotes: "Email jane@example.com about case ID CASE-4821.",
    supportingEvidence: "",
  });

  assert.equal(screened.blocked, true);
  if (!screened.blocked) return;
  assert.deepEqual(screened.categories, ["email address", "account or case identifier"]);
  assert.match(screened.error, /email address/);
  assert.match(screened.error, /account or case identifier/);
  assert.match(screened.error, /Remove or generalize/);
  assert.match(screened.error, /not every sensitive detail/);
  assert.doesNotMatch(screened.error, /jane@example\.com|CASE-4821/);
});

test("clean input passes pre-submission screening without alteration", () => {
  const screened = screenSensitiveInput(input);
  assert.deepEqual(screened, { blocked: false, categories: [] });
  assert.equal(input.fieldNotes, "Two prospects said analysts manually review the alerts.");
});

test("normalization always requires Content Marketing review", () => {
  const brief: WorkflowBrief = {
    sections: {
      context: "Observed in two prospect conversations.",
      aiApplication: "AI is being considered for prioritization.",
      humanOversight: "Analysts would review suggestions.",
      potentialValue: "May reduce manual sorting.",
      workflowStages: ["An alert enters the queue.", "AI prioritizes the alert.", "An analyst reviews the suggestion."],
    },
    openQuestions: "Confirm the proposed review process.",
    sensitivity: { detected: false, categories: [], summary: "" },
    reviewStatus: {
      contentMarketing: { required: false, reason: "" },
      legalPrivacy: { recommended: false, reason: "No signal identified." },
    },
  };

  const normalized = normalizeBrief(brief, ["API key or access token"]);
  assert.equal(normalized.reviewStatus.contentMarketing.required, true);
  assert.equal(normalized.reviewStatus.legalPrivacy.recommended, true);
  assert.equal(normalized.sensitivity.detected, true);
  assert.equal(
    normalized.sensitivity.summary,
    "Customer-specific or identifying information has been excluded or generalized in this draft and may warrant review before external use.",
  );
  assert.doesNotMatch(normalized.sensitivity.summary, /credential|secret/i);
});

test("workflow brief validation accepts up to five supported stages", () => {
  const brief: WorkflowBrief = {
    sections: {
      context: "Observed in two prospect conversations.",
      aiApplication: "AI is being considered for prioritization.",
      humanOversight: "Analysts review suggestions.",
      potentialValue: "The workflow may reduce manual sorting.",
      workflowStages: ["Receive an alert.", "Prioritize it.", "Review the suggestion."],
    },
    openQuestions: "Confirm how escalations are handled.",
    sensitivity: { detected: false, categories: [], summary: "" },
    reviewStatus: {
      contentMarketing: { required: true, reason: "Confirm accuracy and intended use." },
      legalPrivacy: { recommended: false, reason: "" },
    },
  };
  assert.equal(isWorkflowBrief(brief), true);
  brief.sections.workflowStages = ["1", "2", "3", "4", "5", "6"];
  assert.equal(isWorkflowBrief(brief), false);
});
