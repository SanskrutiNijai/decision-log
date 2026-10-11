import { getAgentByName } from "agents";
import { verifySlackSignature } from "../slack/verify";

function json(data, status = 200) {
  return Response.json(data, { status });
}

async function postApprovalMessage(slackToken, decision) {
  if (!slackToken) {
    throw new Error("Slack workspace is not connected.");
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",

    headers: {
      Authorization: `Bearer ${slackToken}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      channel: decision.slack_channel_id,

      text: `Potential decision detected: ${decision.summary}`,

      blocks: [
        {
          type: "section",

          text: {
            type: "mrkdwn",

            text:
              `*Potential decision detected*\n\n` +
              `*Decision:* ${decision.summary}\n\n` +
              `*Why:* ${decision.rationale || "No rationale recorded."}\n\n` +
              `*Confidence:* ${Math.round(decision.confidence * 100)}%`,
          },
        },

        ...(decision.owner
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Owner:* ${decision.owner}`,
                },
              },
            ]
          : []),

        ...(decision.review_date
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Review:* ${decision.review_date}`,
                },
              },
            ]
          : []),

        {
          type: "actions",

          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Approve",
              },
              style: "primary",
              action_id: "approve_decision",
              value: decision.id,
            },

            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Reject",
              },
              style: "danger",
              action_id: "reject_decision",
              value: decision.id,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || "Failed to send Slack approval message.");
  }

  return data;
}

export async function handleSlackEvents(request, env) {
  // Read the raw body once: Slack's signature is computed over the exact text.
  const rawBody = await request.text();

  // Verify Slack signature before processing any incoming event.
  if (!(await verifySlackSignature(request, env, rawBody))) {
    return json({ error: "Invalid Slack request signature." }, 401);
  }

  // Parse the body after verification.
  const body = JSON.parse(rawBody);

  // Slack URL verification.
  if (body.type === "url_verification") {
    return new Response(body.challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  // Slack event callback.
  if (body.type === "event_callback") {
    const event = body.event;

    if (!event) {
      return json({ ok: true });
    }

    // Ignore bot messages so our own approval messages don't trigger the agent again.
    if (event.bot_id || event.subtype === "bot_message") {
      return json({ ok: true, ignored: true });
    }

    // Only process normal messages.
    if (event.type !== "message") {
      return json({ ok: true, ignored: true });
    }

    const teamId = body.team_id;

    if (!teamId) {
      return json({ error: "Slack workspace ID is missing." }, 400);
    }

    // Get the DecisionAgent for this Slack workspace.
    const agent = await getAgentByName(env.DecisionAgent, teamId);

    // Make sure this workspace has completed Slack OAuth.
    const installation = await agent.getSlackInstallation();

    if (!installation?.bot_token) {
      console.error("No Slack installation found for workspace:", teamId);

      return json({ error: "Slack workspace is not connected." }, 400);
    }

    // Send the Slack message to the AI decision detector.
    const result = await agent.processSlackMessage({
      text: event.text,
      channel: event.channel,
      ts: event.ts,
      user: event.user,
      team_id: teamId,
      event_id: body.event_id,
    });

    // No decision detected or confidence was below the threshold.
    if (!result?.decisionDetected) {
      return json({ ok: true, decisionDetected: false });
    }

    // Decision detected with sufficient confidence.
    // Send it back to Slack with Approve / Reject buttons.
    await postApprovalMessage(installation.bot_token, result.decision);

    return json({
      ok: true,
      decisionDetected: true,
      pendingDecisionId: result.decision.id,
    });
  }

  return json({ ok: true });
}
