const STATE_COOKIE = "slack_oauth_state";
const REDIRECT_COOKIE = "slack_oauth_redirect";
const COOKIE_MAX_AGE_SECONDS = 60 * 10;

// Use the address the browser is on (sent by the frontend). Behind a tunnel
// the Worker only sees localhost, but the browser knows the public address.
// Slack still checks the result against the Redirect URLs configured in the Slack app.
function getRedirectUri(request) {
  const url = new URL(request.url);
  let origin = url.origin;

  const requested = url.searchParams.get("origin");

  if (requested) {
    try {
      const parsed = new URL(requested);

      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        origin = parsed.origin;
      }
    } catch {
      // Ignore an invalid origin and fall back to the request's own.
    }
  }

  return `${origin}/api/slack/oauth/callback`;
}

function makeCookie(name, value, secure) {
  return [
    `${name}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/slack/oauth",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export async function handleSlackInstall(request, env) {
  if (!env.SLACK_CLIENT_ID) {
    return new Response("SLACK_CLIENT_ID is not configured.", {
      status: 500,
    });
  }

  const redirectUri = getRedirectUri(request);
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: "chat:write,channels:history,groups:history,channels:read,groups:read",
    redirect_uri: redirectUri,
    state,
  });

  const slackUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

  // "Secure" is only added for https addresses so local http development still works.
  const secure = redirectUri.startsWith("https:");

  // Slack requires the SAME redirect_uri when the code is exchanged,
  // so it is remembered in a cookie alongside the state.
  const headers = new Headers({ Location: slackUrl });
  headers.append("Set-Cookie", makeCookie(STATE_COOKIE, state, secure));
  headers.append(
    "Set-Cookie",
    makeCookie(REDIRECT_COOKIE, encodeURIComponent(redirectUri), secure),
  );

  return new Response(null, { status: 302, headers });
}
