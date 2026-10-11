export default function SourceCard({ title, content }) {
  return (
    <div className="source-card">
      <strong>Source</strong>
      <p>
        <strong>{title}</strong>
      </p>
      <p>{content}</p>
    </div>
  );
}
