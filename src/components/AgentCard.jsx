"use client";
import Image from "next/image";

export default function AgentCard({ agent="", coverSrc, charSrc, className="" }) {
  return (
    <div className={`agent-card ${className}`} aria-label={agent || "Agent"}>
      <div className="agent-card__frame" />
      <div className="agent-card__cover">
        <Image src={coverSrc} alt="" fill className="object-cover" unoptimized />
        <span className="agent-card__veil-top" />
        <span className="agent-card__veil-bottom" />
      </div>
      <div className="agent-card__label">{agent}</div>
      <div className="agent-card__character">
        <Image src={charSrc} alt={agent} fill className="object-contain" unoptimized />
      </div>
    </div>
  );
}
