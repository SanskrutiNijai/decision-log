import { useState } from "react";
import NotesForm from "./components/NotesForm";
import DecisionList from "./components/DecisionList";
import Chat from "./components/Chat";
import "./styles.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("notes");

  // Send the address the browser is on, so Slack redirects back to it
  // (the Worker behind a tunnel only sees localhost).
  function connectSlack() {
    const origin = encodeURIComponent(window.location.origin);

    window.location.href = `/api/slack/install?origin=${origin}`;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-copy">
          <h1>Decision Log</h1>
          <p>Remember what your team decided — and why.</p>
        </div>

        <button type="button" className="slack-button" onClick={connectSlack}>
          <span className="slack-icon" aria-hidden="true">
            #
          </span>
          <span>Connect to Slack</span>
        </button>
      </header>

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
    </div>
  );
}