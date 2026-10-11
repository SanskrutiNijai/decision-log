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

// Send the browser back to the app and expire both cookies so they can only be used once.
// The app shows the result page (see SlackStatus.jsx). A relative Location keeps
// the user on the same address they came from.
function redirectToApp(request, query) {
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("X-Forwarded-Proto") === "https";

  const headers = new Headers({ Location: `/?${query}` });
  headers.append("Set-Cookie", expiredCookie(STATE_COOKIE, secure));
  headers.append("Set-Cookie", expiredCookie(REDIRECT_COOKIE, secure));

  return new Response(null, { status: 302, headers });
}

// Error codes are short and fixed; the app turns them into friendly messages.
function fail(request, reason) {
  return redirectToApp(request, `slack=error&reason=${reason}`);
}

export async function handleSlackOAuthCallback(request, env) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  // CSRF protection: the state Slack returns must match the cookie we set.
  const cookieState = getCookie(request, STATE_COOKIE);

  if (!state || !cookieState || state !== cookieState) {
    return fail(request, "invalid_state");
  }

  if (error) {
    console.error("Slack authorization failed:", error);

    return fail(request, error === "access_denied" ? "denied" : "slack_failed");
  }

  if (!code) {
    return fail(request, "missing_code");
  }

  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    console.error("Slack OAuth credentials are not configured.");

    return fail(request, "not_configured");
  }

  // Must be identical to the redirect_uri used when the install started.
  const savedRedirect = getCookie(request, REDIRECT_COOKIE);

  if (!savedRedirect) {
    return fail(request, "missing_redirect");
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

    return fail(request, "slack_failed");
  }

  const teamId = data.team?.id;

  if (!teamId) {
    return fail(request, "no_team");
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

  return redirectToApp(request, "slack=connected");
}
