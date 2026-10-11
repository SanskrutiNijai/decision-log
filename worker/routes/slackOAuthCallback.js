import { getAgentByName } from "agents";

const STATE_COOKIE = "slack_oauth_state";
const REDIRECT_COOKIE = "slack_oauth_redirect";

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}

function expiredCookie(name, secure) {
  return [
    `${name}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/slack/oauth",
    "Max-Age=0",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

// Reply and expire both cookies so they can only be used once.
function reply(request, message, status) {
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("X-Forwarded-Proto") === "https";

  const headers = new Headers({ "Content-Type": "text/plain" });
  headers.append("Set-Cookie", expiredCookie(STATE_COOKIE, secure));
  headers.append("Set-Cookie", expiredCookie(REDIRECT_COOKIE, secure));

  return new Response(message, { status, headers });
}

export async function handleSlackOAuthCallback(request, env) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  // CSRF protection: the state Slack returns must match the cookie we set.
  const cookieState = getCookie(request, STATE_COOKIE);

  if (!state || !cookieState || state !== cookieState) {
    return reply(
      request,
      "Invalid or expired Slack OAuth state. Please try connecting again.",
      400,
    );
  }

  if (error) {
    return reply(request, `Slack authorization failed: ${error}`, 400);
  }

  if (!code) {
    return reply(request, "Missing Slack OAuth code.", 400);
  }

  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    return reply(request, "Slack OAuth credentials are not configured.", 500);
  }

  // Must be identical to the redirect_uri used when the install started.
  const savedRedirect = getCookie(request, REDIRECT_COOKIE);

  if (!savedRedirect) {
    return reply(request, "Missing redirect information. Please try connecting again.", 400);
  }

  const redirectUri = decodeURIComponent(savedRedirect);

  const body = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!data.ok) {
    console.error("Slack OAuth error:", data);

    return reply(request, `Slack OAuth failed: ${data.error || "Unknown error"}`, 400);
  }

  const teamId = data.team?.id;

  if (!teamId) {
    return reply(request, "Slack OAuth response did not include a workspace ID.", 400);
  }

  // Store the OAuth installation inside the DecisionAgent belonging to this Slack workspace.
  const agent = await getAgentByName(env.DecisionAgent, teamId);

  await agent.saveSlackInstallation({
    team_id: teamId,
    team_name: data.team?.name || null,
    bot_user_id: data.bot_user_id || null,
    bot_token: data.access_token,
    scope: data.scope || null,
    connected_at: new Date().toISOString(),
  });

  console.log("Slack workspace connected:", {
    teamId,
    teamName: data.team?.name,
    botUserId: data.bot_user_id,
    scope: data.scope,
  });

  return reply(request, "Slack connected successfully. You can close this window.", 200);
}