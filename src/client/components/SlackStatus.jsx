// Friendly messages for each error code sent by the OAuth callback.
const ERROR_MESSAGES = {
  denied: "The Slack authorization was cancelled, so nothing was connected.",
  invalid_state: "The connection request expired or could not be verified. Please try again.",
  missing_code: "Slack did not send an authorization code. Please try again.",
  missing_redirect: "The connection session was lost. Please try again.",
  not_configured: "Slack is not configured on the server yet.",
  no_team: "Slack did not return a workspace. Please try again.",
  slack_failed: "Slack could not complete the connection. Please try again.",
};

export default function SlackStatus({ status, reason, onContinue, onRetry }) {
  const connected = status === "connected";

  const message =
    ERROR_MESSAGES[reason] || "Something went wrong while connecting to Slack. Please try again.";

  return (
    <section className="slack-status" role="status">
      <div
        className={`slack-status-icon ${connected ? "slack-status-icon-success" : "slack-status-icon-error"}`}
        aria-hidden="true"
      >
        {connected ? "✓" : "!"}
      </div>

      <h2>{connected ? "Slack connected successfully" : "Slack connection failed"}</h2>

      <p>
        {connected
          ? "Decision Log can now watch your channels. Invite the app to a channel with /invite @Decision Log, and it will suggest decisions for your approval."
          : message}
      </p>

      <div className="slack-status-actions">
        <button type="button" className="primary" onClick={onContinue}>
          Go to Decision Log
        </button>

        {!connected && (
          <button type="button" className="slack-status-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}
