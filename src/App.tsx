import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, TextareaHTMLAttributes } from "react";
import type { BriefInput, Contributor, WorkflowBrief } from "./types";

const EMPTY_FORM: BriefInput = {
  contributor: "Sales",
  industry: "",
  workflow: "",
  fieldNotes: "",
  supportingEvidence: "",
};

type TextSectionKey = Exclude<keyof WorkflowBrief["sections"], "workflowStages">;

const TEXT_SECTION_LABELS: Array<[TextSectionKey, string]> = [
  ["context", "Context"],
  ["aiApplication", "How AI is being applied or considered"],
  ["humanOversight", "Human role / oversight"],
  ["potentialValue", "Potential value"],
];

function App() {
  const [form, setForm] = useState<BriefInput>(EMPTY_FORM);
  const [brief, setBrief] = useState<WorkflowBrief | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(form.industry.trim() && form.workflow.trim() && form.fieldNotes.trim()),
    [form.industry, form.workflow, form.fieldNotes],
  );

  function updateForm<K extends keyof BriefInput>(key: K, value: BriefInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCopied(false);

    if (!canSubmit) {
      setError("Add an industry, workflow, and field notes before generating a brief.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "The brief could not be generated. Please try again.");
      }

      setBrief(payload.brief);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The brief could not be generated.");
    } finally {
      setIsLoading(false);
    }
  }

  function updateSection(key: TextSectionKey, value: string) {
    setBrief((current) =>
      current ? { ...current, sections: { ...current.sections, [key]: value } } : current,
    );
  }

  function updateWorkflowStage(index: number, value: string) {
    setBrief((current) => {
      if (!current) return current;
      const workflowStages = [...current.sections.workflowStages];
      workflowStages[index] = value;
      return { ...current, sections: { ...current.sections, workflowStages } };
    });
  }

  function updateOpenQuestions(value: string) {
    setBrief((current) => (current ? { ...current, openQuestions: value } : current));
  }

  async function copyBrief() {
    if (!brief) return;
    const status = [
      `Content Marketing review — ${brief.reviewStatus.contentMarketing.reason}`,
      brief.reviewStatus.legalPrivacy.recommended
        ? `Legal / Privacy review recommended — ${brief.reviewStatus.legalPrivacy.reason}`
        : null,
    ].filter(Boolean);
    const text = [
      "# Workflow Brief",
      ...TEXT_SECTION_LABELS.flatMap(([key, label]) => [`\n## ${label}`, brief.sections[key]]),
      "\n## Workflow described",
      ...brief.sections.workflowStages.map((stage, index) => `${index + 1}. ${stage}`),
      ...(brief.openQuestions ? ["\n### Open questions", brief.openQuestions] : []),
      "\n## Review status",
      ...status.map((item) => `- ${item}`),
      "\nAI-assisted draft. Human review required before external use.",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copying was blocked by the browser. You can still select the editable text directly.");
    }
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <p className="wordmark">Blossom Security</p>
        <div className="product-heading">
          <p className="eyebrow">Content operations / AI-assisted</p>
          <h1>Workflow Brief Builder</h1>
        </div>
        <p className="header-note">Internal working draft</p>
      </header>

      <div className="workspace">
        <section className="input-panel" aria-labelledby="input-heading">
          <div className="panel-heading">
            <span className="step">01</span>
            <div>
              <h2 id="input-heading">Source notes</h2>
              <p>Capture what you heard or observed. Before generating, remove customer-specific, personal, confidential, or security-sensitive details.</p>
            </div>
          </div>

          <p className="input-safety-note">Do not submit personal, customer-confidential, credential, or security-sensitive information.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-row">
              <label>
                <span>Contributor</span>
                <select
                  value={form.contributor}
                  onChange={(event) => updateForm("contributor", event.target.value as Contributor)}
                >
                  <option>Sales</option>
                  <option>PMM</option>
                  <option>SME</option>
                </select>
              </label>
              <label>
                <span>Industry</span>
                <input
                  value={form.industry}
                  onChange={(event) => updateForm("industry", event.target.value)}
                  placeholder="e.g. Financial services"
                  maxLength={160}
                  required
                />
              </label>
            </div>

            <label>
              <span>Workflow</span>
              <input
                value={form.workflow}
                onChange={(event) => updateForm("workflow", event.target.value)}
                placeholder="e.g. Investigating suspicious authentication activity"
                maxLength={240}
                required
              />
            </label>

            <label className="notes-field">
              <span>Field notes</span>
              <textarea
                value={form.fieldNotes}
                onChange={(event) => updateForm("fieldNotes", event.target.value)}
                placeholder="Paste your notes here."
                maxLength={20000}
                required
              />
              <small>{form.fieldNotes.length.toLocaleString()} / 20,000</small>
            </label>

            <label>
              <span>Supporting evidence / source <em>Optional</em></span>
              <textarea
                className="compact-textarea"
                value={form.supportingEvidence}
                onChange={(event) => updateForm("supportingEvidence", event.target.value)}
                placeholder="Optional: link, document name, research reference, or context that supports an observation"
                maxLength={4000}
              />
            </label>

            {error && <div className="error-message" role="alert">{error}</div>}

            <button className="generate-button" type="submit" disabled={isLoading}>
              {isLoading ? "Generating draft…" : "Generate workflow brief"}
            </button>
          </form>
        </section>

        <section className={`output-panel ${brief ? "has-brief" : ""}`} aria-labelledby="output-heading" aria-busy={isLoading}>
          <div className="panel-heading output-heading">
            <span className="step">02</span>
            <div>
              <h2 id="output-heading">Workflow Brief</h2>
              <p>A structured draft will appear here.</p>
            </div>
            {brief && <button className="copy-button" type="button" onClick={copyBrief}>{copied ? "Copied" : "Copy brief"}</button>}
          </div>

          {isLoading ? (
            <div className="loading-state" role="status">
              <div className="loading-orbit"><span /></div>
              <h3>Applying the brief rules</h3>
              <p>Generalizing customer-specific details, qualifying observations, and preserving open questions.</p>
            </div>
          ) : brief ? (
            <div className="brief-content">
              <div className="review-card">
                <div className="review-title-row">
                  <p className="section-kicker">Review status</p>
                  <span className="draft-pill">Draft</span>
                </div>
                <StatusItem label="Content Marketing review" reason={brief.reviewStatus.contentMarketing.reason} />
                {brief.reviewStatus.legalPrivacy.recommended && (
                  <StatusItem label="Legal / Privacy review recommended" reason={brief.reviewStatus.legalPrivacy.reason} tone="human" />
                )}
              </div>

              {brief.sensitivity.detected && (
                <aside className="sensitivity-note">
                  <strong>Customer-specific details identified</strong>
                  <p>{brief.sensitivity.summary}</p>
                </aside>
              )}

              <div className="editable-sections">
                {TEXT_SECTION_LABELS.map(([key, label], index) => (
                  <label className="brief-section" key={key}>
                    <span><b>{String(index + 1).padStart(2, "0")}</b>{label}</span>
                    <AutoResizeTextarea
                      value={brief.sections[key]}
                      onValueChange={(value) => updateSection(key, value)}
                    />
                  </label>
                ))}
                <div className="brief-section workflow-section">
                  <span><b>05</b>Workflow described</span>
                  <div className="workflow-stages">
                    {brief.sections.workflowStages.map((stage, index) => (
                      <label className="workflow-stage" key={index}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <AutoResizeTextarea
                          aria-label={`Workflow stage ${index + 1}`}
                          value={stage}
                          onValueChange={(value) => updateWorkflowStage(index, value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {brief.openQuestions && (
                <label className="open-questions">
                  <span>Open questions</span>
                  <AutoResizeTextarea value={brief.openQuestions} onValueChange={updateOpenQuestions} />
                </label>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <p className="empty-eyebrow">01</p>
              <h3>Ready for field intelligence</h3>
              <p>Use de-identified field intelligence. The draft will distinguish supported observations from assumptions and suggest a candidate workflow for human review and validation.</p>
              <p className="supporting-line">Use customer conversations, sales notes, SME input, research, or discovery findings.</p>
            </div>
          )}

          <footer className="draft-notice">
            <span aria-hidden="true">!</span>
            <strong>AI-assisted draft.</strong> Human review required before external use.
          </footer>
        </section>
      </div>
    </main>
  );
}

interface AutoResizeTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
}

function AutoResizeTextarea({ value, onValueChange, className = "", ...props }: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeToContent = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useLayoutEffect(resizeToContent, [resizeToContent, value]);

  useEffect(() => {
    window.addEventListener("resize", resizeToContent);
    return () => window.removeEventListener("resize", resizeToContent);
  }, [resizeToContent]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      className={`generated-textarea ${className}`.trim()}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}

function StatusItem({ label, reason, tone }: { label: string; reason: string; tone?: "human" }) {
  return (
    <div className={`status-item ${tone === "human" ? "human-review" : ""}`}>
      <span className="status-index" aria-hidden="true" />
      <div><strong>{label}</strong><p>{reason}</p></div>
    </div>
  );
}

export default App;
