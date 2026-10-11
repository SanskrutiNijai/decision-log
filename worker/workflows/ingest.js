import { WorkflowEntrypoint } from "cloudflare:workers";
import { extractDecisions } from "../services/extraction";

export class IngestWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { sourceId, title, notes } = event.payload;

    const extracted = await step.do("extract-decisions", async () => {
      return extractDecisions(this.env, notes);
    });

    const decisions = extracted.decisions.map((decision) => ({
      id: crypto.randomUUID(),
      summary: decision.summary,
      rationale: decision.rationale,
      alternatives: decision.alternatives,
      owner: decision.owner,
      review_date: decision.review_date,
      created_at: new Date().toISOString(),
    }));

    await step.do("save-decisions", async () => {
      const id = this.env.DECISION_LOG.idFromName("default");

      const stub = this.env.DECISION_LOG.get(id);

      const response = await stub.fetch("https://decision-log/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: {
            id: sourceId,
            title,
            content: notes,
            created_at: new Date().toISOString(),
          },
          decisions,
        }),
      });

      // Throwing makes the workflow step fail and retry instead of silently succeeding.
      if (!response.ok) {
        const details = await response.text();

        throw new Error(`Failed to save decisions (${response.status}): ${details}`);
      }
    });

    return {
      sourceId,
      decisions,
    };
  }
}
