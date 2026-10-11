import { useEffect, useState } from "react";
import SourceCard from "./SourceCard";

export default function DecisionList() {
  const [decisions, setDecisions] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDecisions();
  }, []);

  async function loadDecisions() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/decisions");

      if (!response.ok) {
        throw new Error("Failed to load decisions.");
      }

      const data = await response.json();
      setDecisions(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredDecisions = decisions.filter((decision) => {
    const query = search.toLowerCase().trim();

    if (!query) {
      return true;
    }

    return (
      decision.summary?.toLowerCase().includes(query) ||
      decision.rationale?.toLowerCase().includes(query) ||
      decision.owner?.toLowerCase().includes(query) ||
      decision.review_date?.toLowerCase().includes(query)
    );
  });

  function handleDeleted(deletedId) {
    setDecisions((current) => current.filter((decision) => decision.id !== deletedId));
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Decisions</h2>
        <p>Loading decisions...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Decisions</h2>
        <div className="error-message">{error}</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Decisions</h2>

      <p>Search and browse your saved decisions.</p>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search decisions..."
      />

      {filteredDecisions.length === 0 ? (
        <div className="empty-state">
          {search ? (
            <>
              <strong>No matching decisions</strong>
              <p>Try a different search term.</p>
            </>
          ) : (
            <>
              <strong>No decisions yet</strong>
              <p>Add meeting notes to extract your first decision.</p>
            </>
          )}
        </div>
      ) : (
        <div className="decisions-list">
          {filteredDecisions.map((decision) => (
            <DecisionItem key={decision.id} decision={decision} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </section>
  );
}

function DecisionItem({ decision, onDeleted }) {
  const [source, setSource] = useState(null);
  const [showSource, setShowSource] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSourceClick() {
    if (source) {
      setShowSource(!showSource);
      return;
    }

    try {
      setLoadingSource(true);

      const response = await fetch(`/api/sources/${decision.source_id}`);

      if (!response.ok) {
        throw new Error("Failed to load source.");
      }

      const data = await response.json();

      setSource(data);
      setShowSource(true);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingSource(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm("Are you sure you want to delete this decision?");

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);

      const response = await fetch(`/api/decisions/${decision.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete decision.");
      }

      onDeleted(decision.id);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="decision-card">
      <h3>{decision.summary}</h3>

      <p>
        <strong>Why:</strong> {decision.rationale || "No rationale recorded."}
      </p>

      <div className="decision-meta">
        {decision.owner && (
          <span>
            <strong>Owner:</strong> {decision.owner}
          </span>
        )}

        {decision.review_date && (
          <span>
            <strong>Review:</strong> {decision.review_date}
          </span>
        )}
      </div>

      {decision.alternatives?.length > 0 && (
        <p>
          <strong>Alternatives:</strong> {decision.alternatives.join(", ")}
        </p>
      )}

      <div className="decision-actions">
        <button
          type="button"
          className="primary"
          onClick={handleSourceClick}
          disabled={loadingSource || deleting}
        >
          {loadingSource ? "Loading..." : showSource ? "Hide Source" : "View Source"}
        </button>

        <button type="button" className="delete-button" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>

      {showSource && source && <SourceCard title={source.title} content={source.content} />}
    </article>
  );
}
