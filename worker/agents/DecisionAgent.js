import { Agent } from "agents";
import { extractDecisions } from "../services/extraction";

const SLACK_CONFIDENCE_THRESHOLD = 0.85;

export class DecisionAgent extends Agent {
  async processSlackMessage(message) {
    const text = message.text?.trim();

    if (!text) {
      return {
        ok: true,
        decisionDetected: false,
      };
    }

    // If an event_id is provided, prevent the same Slack event from being processed more than once.
    if (message.event_id) {
      const alreadyProcessed = await this.hasProcessedSlackEvent(message.event_id);

      if (alreadyProcessed) {
        return {
          ok: true,
          decisionDetected: false,
          duplicate: true,
        };
      }

      await this.markSlackEventProcessed(message.event_id);
    }

    const extraction = await extractDecisions(this.env, text, {
      source: "slack",
    });

    if (!extraction || !Array.isArray(extraction.decisions) || extraction.decisions.length === 0) {
      return {
        ok: true,
        decisionDetected: false,
      };
    }

    // Process only the first detected decision.
    const decision = extraction.decisions[0];

    const confidence = Number(decision.confidence) || 0;

    // Ignore uncertain decisions.
    if (confidence < SLACK_CONFIDENCE_THRESHOLD) {
      return {
        ok: true,
        decisionDetected: false,
        ignored: true,
        reason: "Decision confidence below threshold.",
        confidence,
      };
    }

    const pendingDecision = {
      id: crypto.randomUUID(),
      summary: decision.summary,
      rationale: decision.rationale || "",
      alternatives: Array.isArray(decision.alternatives) ? decision.alternatives : [],
      owner: decision.owner || null,
      review_date: decision.review_date || null,
      confidence,

      // The original Slack message, kept so the decision's source is traceable.
      slack_content: text,

      slack_channel_id: message.channel || null,
      slack_message_ts: message.ts || null,
      slack_user_id: message.user || null,
      team_id: message.team_id || null,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    await this.savePendingDecision(pendingDecision);

    return {
      ok: true,
      decisionDetected: true,
      decision: pendingDecision,
    };
  }

  // Slack installation
  async saveSlackInstallation(installation) {
    await this.ctx.storage.put("slack-installation", installation);
  }

  async getSlackInstallation() {
    return await this.ctx.storage.get("slack-installation");
  }

  // Slack event deduplication
  async hasProcessedSlackEvent(eventId) {
    const value = await this.ctx.storage.get(`slack-event:${eventId}`);

    return Boolean(value);
  }

  async markSlackEventProcessed(eventId) {
    await this.ctx.storage.put(`slack-event:${eventId}`, {
      processed_at: new Date().toISOString(),
    });
  }

  // Pending decisions
  async savePendingDecision(decision) {
    await this.ctx.storage.put(`pending:${decision.id}`, decision);
  }

  async getPendingDecision(id) {
    return await this.ctx.storage.get(`pending:${id}`);
  }

  // APPROVE
  async approveDecision(id) {
    const decision = await this.getPendingDecision(id);

    if (!decision) {
      throw new Error("Pending decision not found.");
    }

    // Claim the decision BEFORE making the external DecisionLog request.
    // This prevents two simultaneous Slack clicks from both seeing "pending".
    if (decision.status !== "pending") {
      return {
        ok: true,
        alreadyProcessed: true,
        status: decision.status,
        decisionId: id,
      };
    }

    decision.status = "approval_in_progress";
    decision.approval_started_at = new Date().toISOString();

    // This write happens before the external fetch below.
    await this.ctx.storage.put(`pending:${decision.id}`, decision);

    try {
      // Now save it to the actual Decision Log.
      // "saved" is false when an identical decision is already recorded.
      const { decisionId, saved } = await this.saveApprovedDecision(decision);

      // Final state.
      decision.status = saved ? "approved" : "duplicate";
      decision.approved_at = new Date().toISOString();

      await this.ctx.storage.put(`pending:${decision.id}`, decision);

      return {
        ok: true,
        decisionId,
        duplicate: !saved,
      };
    } catch (error) {
      // If saving to DecisionLog failed, return the decision to pending so the user can try again.
      decision.status = "pending";

      delete decision.approval_started_at;

      await this.ctx.storage.put(`pending:${decision.id}`, decision);

      throw error;
    }
  }

  // REJECT
  async rejectDecision(id) {
    const decision = await this.getPendingDecision(id);

    if (!decision) {
      throw new Error("Pending decision not found.");
    }

    // If another request already processed this decision, don't process it again.
    if (decision.status !== "pending") {
      return {
        ok: true,
        alreadyProcessed: true,
        status: decision.status,
        rejectedId: id,
      };
    }

    // Change the status immediately. Any subsequent request will now see "rejected" instead of "pending".
    decision.status = "rejected";
    decision.rejected_at = new Date().toISOString();

    await this.ctx.storage.put(`pending:${decision.id}`, decision);

    return {
      ok: true,
      rejectedId: id,
    };
  }

  // Save approved decision
  async saveApprovedDecision(decision) {
    const id = this.env.DECISION_LOG.idFromName("default");

    const stub = this.env.DECISION_LOG.get(id);

    const response = await stub.fetch("https://decision-log/decisions/from-slack", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        id: decision.id,
        summary: decision.summary,
        rationale: decision.rationale,
        alternatives: decision.alternatives,
        owner: decision.owner,
        review_date: decision.review_date,
        source_id: `slack:${decision.slack_channel_id}:${decision.slack_message_ts}`,

        // Original message text, stored as the source content.
        slack_content: decision.slack_content,

        created_at: decision.created_at,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save approved decision.");
    }

    // The DecisionLog reports whether a new record was actually created.
    const result = await response.json();

    return {
      decisionId: decision.id,
      saved: result.saved !== false,
    };
  }
}
