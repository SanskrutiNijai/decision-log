import { DecisionLog } from "./durable/DecisionLog";
import { IngestWorkflow } from "./workflows/ingest";
import { answerQuestion } from "./routes/chat";
import { handleSlackEvents } from "./routes/slack";
import { handleSlackInstall } from "./routes/slackOAuth";
import { handleSlackOAuthCallback } from "./routes/slackOAuthCallback";
import { handleSlackInteraction } from "./slack/approval";
import { DecisionAgent } from "./agents/DecisionAgent";

export { DecisionLog, IngestWorkflow, DecisionAgent };

// Input limits. The app is public and every request calls Workers AI,
// so oversized inputs are rejected before they reach the model.
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 10000;
const MAX_QUESTION_LENGTH = 500;

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

// Read the JSON body, returning null if it is missing or malformed.
async function readJsonBody(request) {
  try {
    const body = await request.json();

    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Application health check
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "decision-log",
      });
    }

    // Start Slack OAuth installation.
    if (url.pathname === "/api/slack/install" && request.method === "GET") {
      return handleSlackInstall(request, env);
    }

    // Slack OAuth callback.
    if (url.pathname === "/api/slack/oauth/callback" && request.method === "GET") {
      return handleSlackOAuthCallback(request, env);
    }

    // Slack Events API
    // Slack sends normal channel messages here.
    if (url.pathname === "/api/slack/events" && request.method === "POST") {
      return handleSlackEvents(request, env);
    }

    // Slack interactive buttons (Approve / Reject).
    // This is the only approve/reject entry point, and it is signature-verified.
    if (url.pathname === "/api/slack/interactions" && request.method === "POST") {
      return handleSlackInteraction(request, env);
    }

    // Add meeting notes.
    if (url.pathname === "/api/ingest" && request.method === "POST") {
      try {
        const body = await readJsonBody(request);

        if (!body) {
          return jsonError("Request body must be valid JSON", 400);
        }

        const title = typeof body.title === "string" ? body.title.trim() : "";
        const notes = typeof body.notes === "string" ? body.notes.trim() : "";

        if (!title || !notes) {
          return jsonError("title and notes are required", 400);
        }

        if (title.length > MAX_TITLE_LENGTH) {
          return jsonError(`title must be ${MAX_TITLE_LENGTH} characters or fewer`, 400);
        }

        if (notes.length > MAX_NOTES_LENGTH) {
          return jsonError(`notes must be ${MAX_NOTES_LENGTH} characters or fewer`, 400);
        }

        const sourceId = crypto.randomUUID();

        const instance = await env.INGEST_WORKFLOW.create({
          params: {
            sourceId,
            title,
            notes,
          },
        });

        return Response.json({
          ok: true,
          sourceId,
          workflowId: instance.id,
        });
      } catch (error) {
        console.error("Ingest error:", error);

        return jsonError(error?.message || "Failed to process meeting notes.", 500);
      }
    }

    // Get decisions.
    if (url.pathname === "/api/decisions" && request.method === "GET") {
      const id = env.DECISION_LOG.idFromName("default");

      const stub = env.DECISION_LOG.get(id);

      return stub.fetch("https://decision-log/decisions");
    }

    // Delete a decision.
    if (url.pathname.startsWith("/api/decisions/") && request.method === "DELETE") {
      const decisionId = url.pathname.split("/").pop();

      if (!decisionId) {
        return jsonError("Decision ID is required", 400);
      }

      const id = env.DECISION_LOG.idFromName("default");

      const stub = env.DECISION_LOG.get(id);

      return stub.fetch(`https://decision-log/decisions/${decisionId}`, {
        method: "DELETE",
      });
    }

    // Get source.
    if (url.pathname.startsWith("/api/sources/") && request.method === "GET") {
      const sourceId = url.pathname.split("/").pop();

      if (!sourceId) {
        return jsonError("Source ID is required", 400);
      }

      const id = env.DECISION_LOG.idFromName("default");

      const stub = env.DECISION_LOG.get(id);

      return stub.fetch(`https://decision-log/sources/${sourceId}`);
    }

    // Chat.
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await readJsonBody(request);

        if (!body) {
          return jsonError("Request body must be valid JSON", 400);
        }

        const question = typeof body.question === "string" ? body.question.trim() : "";

        if (!question) {
          return jsonError("question is required", 400);
        }

        if (question.length > MAX_QUESTION_LENGTH) {
          return jsonError(`question must be ${MAX_QUESTION_LENGTH} characters or fewer`, 400);
        }

        const result = await answerQuestion(env, question);

        return Response.json(result);
      } catch (error) {
        console.error("Chat error:", error);

        return jsonError(error?.message || "Failed to process question.", 500);
      }
    }

    // Unknown route.
    return new Response("Not Found", {
      status: 404,
    });
  },
};
