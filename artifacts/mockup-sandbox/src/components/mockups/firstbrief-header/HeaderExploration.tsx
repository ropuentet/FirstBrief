import './_group.css';
import { Clock3, ExternalLink, Library, RefreshCw } from 'lucide-react';

function AiMark() {
  return (
    <svg className="fb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function NuclearMark() {
  return (
    <svg className="fb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 20h15M7 20c0-4.4 1.2-6.8 3-8.2h4c1.8 1.4 3 3.8 3 8.2M10 11.8 8.5 4h7L14 11.8M8.5 4h7" />
      <path d="M9.3 8h5.4M10.3 6h3.4" />
    </svg>
  );
}

function FootballMark() {
  return (
    <svg className="fb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.7" />
      <path d="m12 7 2.4 1.8-.9 2.9h-3l-.9-2.9L12 7ZM5.8 9.3l3.8-.5M18.2 9.3l-3.8-.5M8 17l2.5-2.2M16 17l-2.5-2.2M12 19v-4.2" />
    </svg>
  );
}

export function HeaderExploration() {
  return (
    <main className="firstbrief-exploration p-6 sm:p-10 lg:p-14">
      <header>
        <div className="fb-brand">
          <div className="fb-brand-mark"><Library strokeWidth={1.4} /></div>
          <div className="fb-brand-name">FirstBrief</div>
          <div className="fb-brand-subtitle">A quick rundown to start the day</div>
        </div>
        <div className="fb-meta-row">
          <div className="fb-meta">
            <div className="fb-meta-item"><span className="fb-label">Briefing date</span><span className="fb-meta-value">Sunday 26 July 2026</span></div>
            <div className="fb-meta-divider" />
            <div className="fb-meta-item"><Clock3 size={13} /><span className="fb-label">Last updated</span><span className="fb-meta-value fb-mono">01:37</span></div>
          </div>
          <button className="fb-refresh" type="button"><RefreshCw /><span>Refresh</span></button>
        </div>
      </header>

      <nav className="fb-focus-row" aria-label="Focus">
        <span className="fb-label fb-focus-heading">Focus</span>
        <button className="fb-focus-item" type="button"><AiMark /><span>Artificial Intelligence</span></button>
        <button className="fb-focus-item" type="button"><NuclearMark /><span>Nuclear Energy &amp; SMRs</span></button>
        <button className="fb-focus-item" type="button"><FootballMark /><span>European Football</span></button>
      </nav>

      <div className="fb-index">
        <div className="fb-index-item"><span className="fb-label fb-mono">01 / AI</span><strong>Microsoft and OpenAI reset the terms of their partnership</strong></div>
        <div className="fb-index-item"><span className="fb-label fb-mono">02 / NUCLEAR</span><strong>The UK selects a site and financing model for a new SMR fleet</strong></div>
        <div className="fb-index-item"><span className="fb-label fb-mono">03 / FOOTBALL</span><strong>Inter’s late win reshapes the Champions League picture</strong></div>
      </div>

      <div className="fb-question">
        <strong>What is FirstBrief?</strong>
        <span>One edited view of the last 24 hours <ExternalLink size={12} /></span>
      </div>
    </main>
  );
}