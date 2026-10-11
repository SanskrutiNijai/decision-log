const MAX_AGE_SECONDS = 60 * 5;

// Verify that a request really came from Slack.
// `rawBody` must be the exact, unparsed request body text.
export async function verifySlackSignature(request, env, rawBody) {
  const signingSecret = env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    throw new Error("SLACK_SIGNING_SECRET is not configured.");
  }

  const timestamp = request.headers.get("X-Slack-Request-Timestamp");
  const slackSignature = request.headers.get("X-Slack-Signature");

  if (!timestamp || !slackSignature) {
    return false;
  }

  // Reject old requests to prevent replay attacks.
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);

  if (!Number.isFinite(age) || Math.abs(age) > MAX_AGE_SECONDS) {
    return false;
  }

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`v0:${timestamp}:${rawBody}`),
  );

  const hex = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(`v0=${hex}`, slackSignature);
}

// Compare two strings without leaking where they first differ.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}
