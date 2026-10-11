import { useState } from "react";

export default function NotesForm() {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const cleanTitle = title.trim();
    const cleanNotes = notes.trim();

    if (!cleanTitle) {
      setError("Please enter a meeting title.");
      return;
    }

    if (!cleanNotes) {
      setError("Please paste your meeting notes.");
      return;
    }

    if (cleanNotes.length < 30) {
      setError(
        "The notes are too short. Please provide enough meeting context to identify a decision.",
      );
      return;
    }

    if (cleanNotes.split(/\s+/).length < 8) {
      setError(
        "The notes do not contain enough information. Please provide more detailed meeting notes.",
      );
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: cleanTitle,
          notes: cleanNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to process the meeting notes.");
      }

      setSuccess("Notes submitted successfully. Your decisions are being extracted.");

      setTitle("");
      setNotes("");
    } catch (error) {
      setError(error.message || "Something went wrong while processing the notes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>Add Meeting Notes</h2>

      <p>Paste your meeting notes and we'll extract the important decisions.</p>

      {error && <div className="form-message error-message">{error}</div>}

      {success && <div className="form-message success-message">{success}</div>}

      <form onSubmit={handleSubmit}>
        <label>
          Meeting title
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError("");
              setSuccess("");
            }}
            placeholder="September Architecture Meeting"
            maxLength={200}
            disabled={loading}
          />
        </label>

        <label>
          Meeting notes
          <textarea
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setError("");
              setSuccess("");
            }}
            placeholder="Paste your meeting notes here..."
            rows={12}
            maxLength={10000}
            disabled={loading}
          />
        </label>

        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Processing..." : "Add Notes"}
        </button>
      </form>
    </section>
  );
}
