import { getAgentByName } from "agents";
import { verifySlackSignature } from "./verify";

function json(data, status = 200) {
  return Response.json(data, { status });
}

// Handle Slack Approve / Reject button clicks.
export async function handleSlackInteraction(request, env) {
  try {
    // Slack sends interactive payloads as application/x-www-form-urlencoded.
    const rawBody = await request.text();

    // Verify Slack signature before processing.
    if (!(await verifySlackSignature(request, env, rawBody))) {
      return json({ error: "Invalid Slack request signature." }, 401);
    }

    const formData = new URLSearchParams(rawBody);
    const payloadText = formData.get("payload");

    if (!payloadText) {
      return json({ error: "Missing Slack interaction payload." }, 400);
    }

    const payload = JSON.parse(payloadText);

    if (payload.type !== "block_actions") {
      return json({ ok: true });
    }

    const action = payload.actions?.[0];

    if (!action) {
      return json({ error: "No Slack action found." }, 400);
    }

    const decisionId = action.value;

    if (!decisionId) {
      return json({ error: "Decision ID is missing." }, 400);
    }

    // Pending decisions live in the agent for their Slack workspace,
    // so a missing team ID must be an error (never fall back to another agent).
    const teamId = payload.team?.id;

    if (!teamId) {
      return json({ error: "Slack workspace ID is missing." }, 400);
    }

    // Get the DecisionAgent for this workspace.
    const agent = await getAgentByName(env.DecisionAgent, teamId);

    let result;

    // APPROVE
    if (action.action_id === "approve_decision") {
      result = await agent.approveDecision(decisionId);
    }

    // REJECT
    else if (action.action_id === "reject_decision") {
      result = await agent.rejectDecision(decisionId);
    }

    // Unknown button.
    else {
      return json({ error: "Unknown Slack action." }, 400);
    }

    // Update the original Slack message so the user can see what happened.
    if (payload.response_url) {
      const approved = action.action_id === "approve_decision";

      let message;

      if (result?.alreadyProcessed) {
        message = "ℹ️ *This decision was already handled.*";
      } else if (!approved) {
        message = "❌ *Decision rejected and not saved.*";
      } else if (result?.duplicate) {
        message =
          "ℹ️ *This decision is already recorded in the Decision Log, so it wasn't added again.*";
      } else {
        message = "✅ *Decision approved and saved to Decision Log.*";
      }

      await fetch(payload.response_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          replace_original: true,

          // Plain-text fallback (used in notifications), without the bold marks.
          text: message.replace(/\*/g, ""),

          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: message,
              },
            },
          ],
        }),
      });
    }

    // Slack expects a quick 2xx response.
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("Slack interaction error:", error);

    return json({ error: error?.message || "Failed to process Slack interaction." }, 500);
  }
}
