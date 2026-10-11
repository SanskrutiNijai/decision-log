export function validateExtraction(data) {
  if (!data || !Array.isArray(data.decisions)) {
    throw new Error("Invalid AI response: decisions must be an array");
  }

  return {
    decisions: data.decisions.map((decision) => ({
      summary: String(decision.summary ?? "").trim(),
      rationale: String(decision.rationale ?? "").trim(),
      alternatives: Array.isArray(decision.alternatives) ? decision.alternatives.map(String) : [],
      owner: decision.owner ? String(decision.owner).trim() : null,
      review_date: decision.review_date ? String(decision.review_date).trim() : null,
      // Used only for Slack decision detection
      confidence:
        typeof decision.confidence === "number"
          ? Math.min(1, Math.max(0, decision.confidence))
          : null,
    })),
  };
}
