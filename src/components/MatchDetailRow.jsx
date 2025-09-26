// src/components/MatchDetailRow.jsx
export default function MatchDetailRow({ children }) {
  return (
    <div className="sched-detail-row">
      <div className="sched-detail-inner">
        {children}
      </div>
    </div>
  );
}
