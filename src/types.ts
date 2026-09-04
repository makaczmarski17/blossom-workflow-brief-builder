export type Contributor = "Sales" | "PMM" | "SME";

export interface BriefInput {
  contributor: Contributor;
  industry: string;
  workflow: string;
  fieldNotes: string;
  supportingEvidence?: string;
}

export interface WorkflowBrief {
  sections: {
    context: string;
    aiApplication: string;
    humanOversight: string;
    potentialValue: string;
    workflowStages: string[];
  };
  openQuestions: string;
  sensitivity: {
    detected: boolean;
    categories: string[];
    summary: string;
  };
  reviewStatus: {
    contentMarketing: {
      required: boolean;
      reason: string;
    };
    legalPrivacy: {
      recommended: boolean;
      reason: string;
    };
  };
}
