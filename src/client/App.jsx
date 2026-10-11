import { useState } from "react";
import NotesForm from "./components/NotesForm";
import DecisionList from "./components/DecisionList";
import Chat from "./components/Chat";
import SlackStatus from "./components/SlackStatus";
import "./styles.css";

// Reads the result of the Slack install from the URL (?slack=connected or ?slack=error&reason=...).
function readSlackResult() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("slack");

  if (status !== "connected" && status !== "error") {
    return null;
  }

  return { status, reason: params.get("reason") };
}

export default function App() {
  const [activeTab, setActiveTab] = useState("notes");
  const [slackResult, setSlackResult] = useState(readSlackResult);

  // Open the Slack install in a new tab. The browser sends its own address
  // so Slack redirects back to it (the Worker behind a tunnel only sees localhost).
  function connectSlack() {
    const origin = encodeURIComponent(window.location.origin);

    window.open(`/api/slack/install?origin=${origin}`, "_blank", "noopener,noreferrer");
  }

  // Leave the result page and show the normal app.
  function continueToApp() {
    window.history.replaceState({}, "", window.location.pathname);
    setSlackResult(null);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-copy">
          <h1>Decision Log</h1>
          <p>Remember what your team decided — and why.</p>
        </div>

        <div className="header-example">
          <span className="example-label">Try it</span>

          <div className="header-example-body">
            <div>
              <strong>Meeting Title:</strong> Frontend Meeting
            </div>
            <div>
              <strong>Meeting Notes:</strong> We decided to build the dashboard in React with Vite,
              because the team already knows React. Alternatives considered: Vue and Svelte. Owner:
              Sneha. Review in March.
            </div>
          </div>
        </div>

        <button type="button" className="slack-button" onClick={connectSlack}>
          <span className="slack-icon" aria-hidden="true">
            #
          </span>
          <span>Connect to Slack</span>
        </button>
      </header>

      {slackResult ? (
        <main className="content">
          <SlackStatus
            status={slackResult.status}
            reason={slackResult.reason}
            onContinue={continueToApp}
            onRetry={connectSlack}
          />
        </main>
      ) : (
        <>
          <nav className="tabs">
            <button
              type="button"
              className={activeTab === "notes" ? "active" : ""}
              onClick={() => setActiveTab("notes")}
            >
              Add Notes
            </button>

            <button
              type="button"
              className={activeTab === "decisions" ? "active" : ""}
              onClick={() => setActiveTab("decisions")}
            >
              Decisions
            </button>

            <button
              type="button"
              className={activeTab === "chat" ? "active" : ""}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
          </nav>

          <main className="content">
            {activeTab === "notes" && <NotesForm />}
            {activeTab === "decisions" && <DecisionList />}
            {activeTab === "chat" && <Chat />}
          </main>
        </>
      )}
    </div>
  );
}
