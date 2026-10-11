import { useState } from "react";
import SourceCard from "./SourceCard";

export default function Chat() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!question.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    setAnswer("");
    setSource(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: question.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get an answer.");
      }

      setAnswer(data.answer);

      if (data.source?.source_id) {
        const sourceResponse = await fetch(`/api/sources/${data.source.source_id}`);

        if (sourceResponse.ok) {
          const sourceData = await sourceResponse.json();
          setSource(sourceData);
        }
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>Ask about a decision</h2>
      <p>Ask why your team made a particular decision.</p>

      <form onSubmit={handleSubmit}>
        <div className="chat-input">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Why did we choose PostgreSQL?"
            maxLength={500}
            disabled={loading}
          />

          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Asking..." : "Ask"}
          </button>
        </div>
      </form>

      {error && <div className="error-message">{error}</div>}

      {!loading && !error && answer && (
        <div className="chat-answer">
          <h3>Answer</h3>

          <p className="chat-answer-text">{answer}</p>

          {source && (
            <div className="chat-source">
              <SourceCard title={source.title} content={source.content} />
            </div>
          )}
        </div>
      )}

      {!loading && !error && !answer && (
        <div className="empty-state">Ask a question to see the answer and its source.</div>
      )}
    </section>
  );
}
