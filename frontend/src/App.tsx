import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Code2,
  Copy,
  Database,
  FileCode2,
  GitBranch,
  Github,
  GitMerge,
  GitPullRequest,
  Menu,
  MessageSquare,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

const REPOSITORY_URL = "https://github.com/smxone/pr-precedent";
const README_URL = `${REPOSITORY_URL}#readme`;

type DemoStage = "review" | "capture" | "match" | "comment";
type DiffKind = "context" | "removed" | "added" | "empty";

interface DiffLine {
  number?: number;
  code?: string;
  kind: DiffKind;
}

const splitRows: Array<{ old: DiffLine; next: DiffLine }> = [
  {
    old: { number: 18, code: "export async function renew(command: RenewCommand) {", kind: "context" },
    next: { number: 18, code: "export async function renew(command: RenewCommand) {", kind: "context" },
  },
  {
    old: { number: 19, code: "  return subscriptions.renew(command);", kind: "removed" },
    next: { number: 19, code: "  const renewal = await subscriptions.renew(command);", kind: "added" },
  },
  {
    old: { kind: "empty" },
    next: { number: 20, code: "  await eventBus.publish(new SubscriptionRenewed(renewal.id));", kind: "added" },
  },
  {
    old: { kind: "empty" },
    next: { number: 21, code: "  return renewal;", kind: "added" },
  },
  {
    old: { number: 20, code: "}", kind: "context" },
    next: { number: 22, code: "}", kind: "context" },
  },
];

const unifiedRows: Array<DiffLine & { prefix: string }> = [
  { number: 18, code: "export async function renew(command: RenewCommand) {", kind: "context", prefix: " " },
  { number: 19, code: "  return subscriptions.renew(command);", kind: "removed", prefix: "−" },
  { number: 19, code: "  const renewal = await subscriptions.renew(command);", kind: "added", prefix: "+" },
  { number: 20, code: "  await eventBus.publish(new SubscriptionRenewed(renewal.id));", kind: "added", prefix: "+" },
  { number: 21, code: "  return renewal;", kind: "added", prefix: "+" },
  { number: 22, code: "}", kind: "context", prefix: " " },
];

const workflow = [
  {
    number: "01",
    icon: GitMerge,
    label: "Capture",
    title: "A review becomes repository memory.",
    body: "When a PR merges, Precedent keeps the substance of resolved review threads: the code context, the identity-free discussion, and the outcome.",
    detail: "merge webhook → resolved threads → add()",
  },
  {
    number: "02",
    icon: Search,
    label: "Recognize",
    title: "A future change touches the same idea.",
    body: "New and updated PRs are searched against prior decisions from the same repository, even when the file and wording have changed.",
    detail: "diff hunks → search.documents() → ranked matches",
  },
  {
    number: "03",
    icon: MessageSquare,
    label: "Surface",
    title: "The bot brings the decision back automatically.",
    body: "When an opened or updated PR touches a remembered pattern, the GitHub App posts one sourced comment that links the new change to the original discussion.",
    detail: "relevance gate → sourced GitHub comment",
  },
];

function highlightCode(code: string): ReactNode[] {
  const tokenPattern = /(\b(?:export|async|function|const|await|return|new)\b|\b(?:RenewCommand|SubscriptionRenewed|OrderApproved)\b|"[^"]*"|'[^']*'|\b\d+\b)/g;
  return code.split(tokenPattern).map((part, index) => {
    if (/^(export|async|function|const|await|return|new)$/.test(part)) {
      return <span className="syntax-keyword" key={`${part}-${index}`}>{part}</span>;
    }
    if (/^(RenewCommand|SubscriptionRenewed|OrderApproved)$/.test(part)) {
      return <span className="syntax-type" key={`${part}-${index}`}>{part}</span>;
    }
    if (/^("[^"]*"|'[^']*')$/.test(part)) {
      return <span className="syntax-string" key={`${part}-${index}`}>{part}</span>;
    }
    if (/^\d+$/.test(part)) {
      return <span className="syntax-number" key={`${part}-${index}`}>{part}</span>;
    }
    return part;
  });
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-node brand-node--one" />
      <span className="brand-node brand-node--two" />
      <span className="brand-node brand-node--three" />
      <span className="brand-line brand-line--one" />
      <span className="brand-line brand-line--two" />
    </span>
  );
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`reveal ${className}`}>{children}</div>;
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Precedent home">
        <BrandMark />
        <span>Precedent</span>
      </a>

      <nav className="desktop-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#supermemory">Supermemory</a>
        <a href="#integration">Integration</a>
      </nav>

      <a className="header-github" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
        <Github size={17} />
        <span>View on GitHub</span>
      </a>

      <button
        className="menu-button"
        type="button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X /> : <Menu />}
      </button>

      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#supermemory" onClick={() => setMenuOpen(false)}>Supermemory</a>
          <a href="#integration" onClick={() => setMenuOpen(false)}>Integration</a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">View on GitHub</a>
        </nav>
      )}
    </header>
  );
}

function StageControl({
  stage,
  active,
  number,
  title,
  shortTitle,
  onSelect,
}: {
  stage: DemoStage;
  active: boolean;
  number: string;
  title: string;
  shortTitle?: string;
  onSelect: (stage: DemoStage) => void;
}) {
  return (
    <button
      type="button"
      className={`stage-control ${active ? "stage-control--active" : ""}`}
      aria-pressed={active}
      onClick={() => onSelect(stage)}
    >
      <span>{number}</span>
      <strong className="stage-title stage-title--full">{title}</strong>
      <strong className="stage-title stage-title--short">{shortTitle ?? title}</strong>
    </button>
  );
}

function DiffCell({ line, matched }: { line: DiffLine; matched?: boolean }) {
  return (
    <div className={`diff-cell diff-cell--${line.kind} ${matched ? "diff-cell--matched" : ""}`}>
      <span className="line-number">{line.number ?? ""}</span>
      <code>{line.code ? highlightCode(line.code) : ""}</code>
    </div>
  );
}

function DiffView({ matched }: { matched: boolean }) {
  return (
    <div className={`diff-view ${matched ? "diff-view--matched" : ""}`}>
      <div className="file-toolbar">
        <div className="file-path">
          <ChevronDown size={16} />
          <FileCode2 size={16} />
          <span>src/billing/application/renew-subscription.ts</span>
          <button type="button" aria-label="Copy file path"><Copy size={14} /></button>
        </div>
        <div className="file-actions">
          <span className="change-count">+2 −2</span>
          <MessageSquare size={16} />
          <span className="viewed"><CheckCircle2 size={16} /> Viewed</span>
        </div>
      </div>

      <div className="hunk-header">@@ -18,3 +18,5 @@ export async function renew(command: RenewCommand)</div>

      <div className="diff-scroll" aria-label="Split code diff">
        <div className="split-diff">
          {splitRows.map((row, index) => (
            <div className="split-row" key={`${row.old.number}-${row.next.number}-${index}`}>
              <DiffCell line={row.old} />
              <DiffCell line={row.next} matched={matched && row.next.kind === "added"} />
            </div>
          ))}
        </div>
      </div>

      <div className="unified-diff" aria-label="Unified code diff">
        {unifiedRows.map((line, index) => (
          <div className={`unified-row unified-row--${line.kind} ${matched && line.kind === "added" ? "unified-row--matched" : ""}`} key={`${line.prefix}-${line.number}-${index}`}>
            <span className="diff-prefix">{line.prefix}</span>
            <span className="line-number">{line.number}</span>
            <code>{line.code ? highlightCode(line.code) : ""}</code>
          </div>
        ))}
      </div>

      {matched && (
        <div className="match-pill" role="status">
          <span className="match-pulse" />
          <div>
            <strong>Repository memory found</strong>
            <span>PR #184 · semantic match 0.86</span>
          </div>
          <ArrowRight size={16} />
        </div>
      )}
    </div>
  );
}

function PriorReviewView() {
  return (
    <div className="prior-review-view">
      <div className="prior-file-head">
        <span><FileCode2 size={15} /> src/orders/application/approve-order.ts</span>
        <span>Lines 24–27</span>
      </div>
      <div className="prior-code">
        <span className="line-number">26</span>
        <code>{highlightCode("await eventBus.publish(new OrderApproved(order.id));")}</code>
      </div>
      <article className="review-thread">
        <div className="review-thread-head">
          <div className="timeline-avatar reviewer-avatar">RK</div>
          <span><strong>reviewer</strong> commented during review</span>
        </div>
        <div className="review-thread-body">
          <p>Events derived from persisted state must go through the transactional outbox inside the same database transaction. Publishing directly can announce an order change that later rolls back.</p>
          <div className="review-reply"><span>author</span> Moved the event to <code>outbox.enqueue()</code> inside the order transaction.</div>
        </div>
        <div className="resolved-row"><CheckCircle2 size={15} /> Conversation resolved</div>
      </article>
      <div className="merge-event"><GitMerge size={16} /><span>Pull request merged after the review was resolved</span></div>
    </div>
  );
}

function CaptureView() {
  return (
    <div className="capture-view">
      <div className="capture-heading">
        <div><span className="capture-status"><Check size={13} /> Merge received</span><h4>Precedent composes the resolved thread into memory.</h4></div>
        <span className="capture-call">supermemory.add()</span>
      </div>

      <div className="capture-flow">
        <div className="capture-panel capture-panel--source">
          <div className="capture-panel-head"><GitPullRequest size={15} /><span>Resolved review thread</span><b>PR #184</b></div>
          <dl>
            <div><dt>Code context</dt><dd><code>eventBus.publish(OrderApproved)</code></dd></div>
            <div><dt>Discussion</dt><dd>Persist domain events through the transactional outbox.</dd></div>
            <div><dt>Outcome</dt><dd><CheckCircle2 size={13} /> Enqueued inside transaction</dd></div>
          </dl>
        </div>

        <div className="capture-arrow" aria-hidden="true"><span /><ArrowRight /></div>

        <div className="capture-panel capture-panel--memory">
          <div className="capture-panel-head"><Database size={15} /><span>Contextual memory</span><b>schema v2</b></div>
          <div className="memory-field"><span>container</span><code>northstar_platform</code></div>
          <div className="memory-field"><span>source</span><code>review-thread / PR #184</code></div>
          <div className="memory-field"><span>content</span><p>Original diff + identity-free discussion + resolution outcome</p></div>
        </div>
      </div>

      <div className="capture-complete" role="status">
        <span className="match-pulse" />
        <div><strong>Stored as repository memory</strong><span>Ready to recognize the same decision in future code</span></div>
        <CheckCircle2 size={18} />
      </div>
    </div>
  );
}

function ConversationView() {
  return (
    <div className="conversation-view">
      <div className="timeline-line" />
      <article className="timeline-event">
        <div className="timeline-avatar author-avatar">AM</div>
        <div className="event-card event-card--compact">
          <div className="event-head"><strong>alexm</strong> opened this pull request <span>2 minutes ago</span></div>
          <p>Add subscription renewal orchestration and emit a domain event for downstream billing workflows.</p>
        </div>
      </article>

      <article className="timeline-event timeline-event--bot">
        <div className="timeline-avatar bot-avatar"><BrandMark /></div>
        <div className="event-card bot-comment">
          <div className="event-head bot-comment-head">
            <span><strong>precedent-ai</strong> <em>bot</em> commented just now</span>
            <button type="button" aria-label="Comment options">•••</button>
          </div>
          <div className="bot-comment-body">
            <div className="precedent-title"><Search size={17} /> <strong>This has precedent.</strong></div>
            <p>
              Your change to <code>src/billing/application/renew-subscription.ts</code> touches a pattern the team discussed in <a href="#source-pr">#184</a>.
            </p>
            <div className="comment-code">
              <span>Current changed code</span>
              <code><b>+</b> await eventBus.publish(new SubscriptionRenewed(renewal.id));</code>
            </div>
            <div className="prior-decision">
              <span>Prior decision</span>
              <p>Events derived from persisted state must be enqueued through the transactional outbox inside the same transaction. Direct publishing can expose state that later rolls back.</p>
            </div>
            <div className="comment-meta">
              <span><Sparkles size={14} /> Supermemory semantic match <strong>0.86</strong></span>
              <span>Posted automatically by Precedent</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function PullRequestDemo() {
  const [stage, setStage] = useState<DemoStage>("review");
  const isPriorPullRequest = stage === "review" || stage === "capture";

  function selectStage(next: DemoStage) {
    setStage(next);
  }

  function selectTab(tab: "conversation" | "files") {
    if (tab === "files") {
      setStage("match");
      return;
    }
    setStage(isPriorPullRequest ? "review" : "comment");
  }

  return (
    <div className="product-demo" aria-label="Interactive Precedent product simulation">
      <div className="demo-caption">
        <span><CircleDot size={13} /> Interactive product simulation</span>
        <span>Follow one decision from review to reuse</span>
      </div>

      <div className="stage-controls" role="group" aria-label="Product demonstration stages">
        <StageControl stage="review" active={stage === "review"} number="01" title="Resolved review" shortTitle="Review" onSelect={selectStage} />
        <StageControl stage="capture" active={stage === "capture"} number="02" title="Memory captured" shortTitle="Capture" onSelect={selectStage} />
        <StageControl stage="match" active={stage === "match"} number="03" title="Related change" shortTitle="Match" onSelect={selectStage} />
        <StageControl stage="comment" active={stage === "comment"} number="04" title="Precedent surfaced" shortTitle="Surface" onSelect={selectStage} />
      </div>

      <div className="pr-window">
        <div className="window-bar">
          <div className="window-dots"><span /><span /><span /></div>
          <div className="window-url"><Github size={13} /> github.com/northstar/platform/pull/{isPriorPullRequest ? "184" : "247"}</div>
          <div className="window-spacer" />
        </div>

        <div className="pr-heading">
          <div>
            <div className="pr-title-row">
              <span className={`open-badge ${isPriorPullRequest ? "merged-badge" : ""}`}>
                {isPriorPullRequest ? <GitMerge size={15} /> : <GitPullRequest size={15} />}
                {isPriorPullRequest ? "Merged" : "Open"}
              </span>
              <h3>{isPriorPullRequest ? "Move order events to the transactional outbox" : "Add subscription renewal workflow"} <span>#{isPriorPullRequest ? "184" : "247"}</span></h3>
            </div>
            <p>
              <strong>{isPriorPullRequest ? "samdev" : "alexm"}</strong>
              {isPriorPullRequest ? " merged 3 commits into " : " wants to merge 2 commits into "}
              <code>main</code> from <code>{isPriorPullRequest ? "refactor/order-outbox" : "feat/subscription-renewal"}</code>
            </p>
          </div>
          {!isPriorPullRequest && <button className="review-button" type="button">Review changes <ChevronDown size={15} /></button>}
        </div>

        <div className="pr-tabs" role="tablist" aria-label="Pull request views">
          <button
            type="button"
            role="tab"
            aria-selected={stage === "review" || stage === "capture" || stage === "comment"}
            className={stage === "review" || stage === "capture" || stage === "comment" ? "active" : ""}
            onClick={() => selectTab("conversation")}
          >
            <MessageSquare size={15} /> Conversation <span>2</span>
          </button>
          <span className="pr-tab-static"><GitBranch size={15} /> Commits <b>2</b></span>
          <span className="pr-tab-static"><CheckCircle2 size={15} /> Checks <b>4</b></span>
          <button
            type="button"
            role="tab"
            aria-selected={stage === "match"}
            className={stage === "match" ? "active" : ""}
            onClick={() => selectTab("files")}
          >
            <FileCode2 size={15} /> Files changed <span>1</span>
          </button>
        </div>

        <div className="pr-content" role="tabpanel">
          {stage === "review" && <PriorReviewView />}
          {stage === "capture" && <CaptureView />}
          {stage === "match" && <DiffView matched />}
          {stage === "comment" && <ConversationView />}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <main id="top">
      <section className="hero section-shell">
        <div className="hero-orb hero-orb--one" />
        <div className="hero-orb hero-orb--two" />
        <div className="hero-copy">
          <div className="eyebrow"><span /> Repository memory for GitHub</div>
          <h1>Your code review decisions should <em>outlive the pull request.</em></h1>
          <p>Precedent turns resolved review discussions into repository memory, then automatically posts the relevant decision as a sourced GitHub bot comment when the pattern appears again.</p>
          <div className="hero-actions">
            <a className="button button--primary" href={README_URL} target="_blank" rel="noreferrer">
              Set up Precedent <ArrowRight size={17} />
            </a>
            <a className="button button--secondary" href="#product-demo">
              See how it works <ArrowDown size={17} />
            </a>
          </div>
          <div className="hero-proof" aria-label="Product principles">
            <span><Check size={14} /> Automatic GitHub comments</span>
            <span><Check size={14} /> Self-hosted memory</span>
            <span><Check size={14} /> Sources every memory</span>
          </div>
        </div>
        <div id="product-demo" className="hero-demo"><PullRequestDemo /></div>
      </section>

      <section className="manifesto section-shell">
        <Reveal className="manifesto-grid">
          <div className="section-kicker">The missing layer</div>
          <div>
            <h2>Teams remember in conversation.<br />Repositories remember in code.<br /><em>Neither remembers the decision.</em></h2>
            <p>Code review is where engineering standards become concrete. But after the merge, the reasoning is buried in an old pull request, and the same lesson gets explained again.</p>
          </div>
        </Reveal>
        <div className="memory-transition" aria-hidden="true">
          <span>write</span><ArrowRight /><span>review</span><ArrowRight /><span>resolve</span><ArrowRight /><span>merge</span><ArrowRight /><strong>remember</strong>
        </div>
      </section>

      <HowItWorks />
      <SupermemorySection />
      <IntegrationSection />
      <FinalCta />
    </main>
  );
}

function HowItWorks() {
  return (
    <section className="workflow section-shell" id="how-it-works">
      <Reveal className="section-heading">
        <div className="section-kicker">How it works</div>
        <h2>A learning loop with<br />no new workflow.</h2>
        <p>Reviewers keep reviewing. Authors keep opening pull requests. Precedent handles the remembering in the background.</p>
      </Reveal>

      <div className="workflow-grid">
        {workflow.map((step) => {
          const Icon = step.icon;
          return (
            <Reveal className="workflow-card" key={step.number}>
              <div className="workflow-number">{step.number}</div>
              <div className="workflow-icon"><Icon /></div>
              <span className="workflow-label">{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <code>{step.detail}</code>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="evidence-callout">
        <div className="evidence-visual">
          <div className="score-orbit"><span>0.86</span><i /></div>
          <div className="threshold-line"><span>relevance threshold</span></div>
          <div className="source-state"><GitPullRequest /><strong>Source verified</strong><span>PR #184 · resolved review thread</span></div>
        </div>
        <div className="evidence-copy">
          <div className="section-kicker">Evidence before assertion</div>
          <h2>Every precedent<br />carries its source.</h2>
          <p>Precedent does not declare that new code is wrong. It brings prior team reasoning back with the original discussion, the triggering code, and enough context for a reviewer to judge its relevance.</p>
          <ul>
            <li><CheckCircle2 /> Repository-scoped retrieval</li>
            <li><CheckCircle2 /> Linked original PR discussion</li>
            <li><CheckCircle2 /> One trusted comment per memory</li>
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

function ArchitectureNode({ icon, title, detail, accent }: { icon: ReactNode; title: string; detail: string; accent?: boolean }) {
  return (
    <div className={`architecture-node ${accent ? "architecture-node--accent" : ""}`}>
      <div className="node-icon">{icon}</div>
      <div><strong>{title}</strong><span>{detail}</span></div>
    </div>
  );
}

function SupermemorySection() {
  return (
    <section className="supermemory section-shell" id="supermemory">
      <Reveal className="supermemory-heading">
        <div>
          <div className="section-kicker">Powered by Supermemory Local</div>
          <h2>The memory layer<br />behind Precedent.</h2>
        </div>
        <p>Supermemory is not an add-on here. It stores the decisions, recognizes them in new code, and recalls them on demand. Precedent supplies the GitHub context and the safety gates around that intelligence.</p>
      </Reveal>

      <Reveal className="architecture-panel">
        <div className="architecture-track architecture-track--main">
          <ArchitectureNode icon={<Github />} title="Resolved review" detail="GitHub merge webhook" />
          <div className="flow-connector"><span /><ArrowRight /></div>
          <ArchitectureNode icon={<Braces />} title="Contextual document" detail="diff + discussion + outcome" />
          <div className="flow-connector"><span /><ArrowRight /></div>
          <ArchitectureNode icon={<Database />} title="add()" detail="repository container" accent />
        </div>
        <div className="architecture-divider"><span>when new code arrives</span></div>
        <div className="architecture-track architecture-track--main">
          <ArchitectureNode icon={<Code2 />} title="New PR diff" detail="changed hunks" />
          <div className="flow-connector"><span /><ArrowRight /></div>
          <ArchitectureNode icon={<Search />} title="search.documents()" detail="ranked semantic matches" accent />
          <div className="flow-connector"><span /><ArrowRight /></div>
          <ArchitectureNode icon={<MessageSquare />} title="Sourced comment" detail="relevance + provenance gates" />
        </div>
        <div className="profile-branch">
          <span className="branch-line" />
          <ArchitectureNode icon={<Sparkles />} title="profile()" detail="direct convention questions" accent />
        </div>
      </Reveal>

      <div className="capability-grid">
        <Reveal className="capability-card">
          <div className="capability-top"><Database /><span>01</span></div>
          <h3>Remember</h3>
          <p>Store the original diff, identity-free discussion, and resolution together, so the reasoning never loses its code context.</p>
          <code>supermemory.add()</code>
        </Reveal>
        <Reveal className="capability-card">
          <div className="capability-top"><Search /><span>02</span></div>
          <h3>Recognize</h3>
          <p>Find related decisions across different files and phrasing without building a custom embedding or vector-search layer.</p>
          <code>search.documents()</code>
        </Reveal>
        <Reveal className="capability-card">
          <div className="capability-top"><Sparkles /><span>03</span></div>
          <h3>Recall</h3>
          <p>Ask what the repository has established and receive a synthesized answer grounded in prior review discussions.</p>
          <code>supermemory.profile()</code>
        </Reveal>
      </div>

      <Reveal className="quality-panel">
        <div className="quality-copy">
          <div className="section-kicker">A retrieval system that earns the right to speak</div>
          <h3>Measured before it comments.</h3>
          <p>A versioned 25-case benchmark evaluates retrieval profiles. Experimental profiles stay observe-only until the promotion gate passes, and sparse-corpus false positives led to a more conservative relevance threshold.</p>
        </div>
        <div className="benchmark-card">
          <div className="benchmark-head"><span>retrieval-profile / candidate</span><span className="observe-badge">observe only</span></div>
          <div className="metric-row"><span>True-positive recall</span><strong>measured</strong></div>
          <div className="metric-row"><span>False-positive rate</span><strong>gated</strong></div>
          <div className="metric-row"><span>Holdout cases</span><strong>protected</strong></div>
          <div className="gate-row"><ShieldCheck size={18} /><span>Automatic comments locked until promotion passes</span></div>
        </div>
      </Reveal>

      <Reveal className="evolution-panel">
        <div className="evolution-copy">
          <div className="section-kicker">Designed to improve with the codebase</div>
          <h3>Team feedback can keep repository memory current.</h3>
          <p>As teams scale Precedent across larger repositories, surfaced comments can become a feedback channel: useful matches reinforce the memory, outdated guidance can be retired, and retrieval profiles can be evaluated before they change GitHub behavior.</p>
        </div>
        <div className="evolution-grid" aria-label="Future precision loop">
          <div className="evolution-item">
            <CheckCircle2 size={17} />
            <strong>Signal from maintainers</strong>
            <span>Mark a surfaced precedent as useful, outdated, or replaced by a newer convention.</span>
          </div>
          <div className="evolution-item">
            <CheckCircle2 size={17} />
            <strong>Cleaner semantic input</strong>
            <span>Normalize noisy diff fragments so retrieval focuses on meaningful code changes.</span>
          </div>
          <div className="evolution-item">
            <CheckCircle2 size={17} />
            <strong>Benchmarked rollout</strong>
            <span>Test new retrieval profiles against repository cases before changing automatic comments.</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const integrationSteps = [
  ["01", "Register the GitHub App", "Create a GitHub App with a secure webhook URL and secret."],
  ["02", "Grant focused permissions", "Pull requests and issue comments are all Precedent needs to read context and reply."],
  ["03", "Install it on selected repositories", "Every memory stays scoped to the repository where the decision was made."],
  ["04", "Run with Supermemory Local", "Start the self-hosted memory engine and the Precedent webhook receiver."],
];

function IntegrationSection() {
  return (
    <section className="integration section-shell" id="integration">
      <Reveal className="integration-heading">
        <div className="section-kicker">GitHub-native by design</div>
        <h2>The bot brings precedent<br />into the pull request.</h2>
        <p>Precedent listens when a pull request opens or changes. When its code touches a remembered pattern, the GitHub App automatically posts the prior decision, its source, and the triggering code without waiting for someone to ask.</p>
      </Reveal>

      <div className="integration-layout">
        <Reveal className="integration-steps">
          {integrationSteps.map(([number, title, body]) => (
            <div className="integration-step" key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </div>
          ))}
        </Reveal>

        <Reveal className="terminal-card">
          <div className="terminal-bar"><div><span /><span /><span /></div><p>precedent / setup</p></div>
          <div className="terminal-body">
            <p><span>$</span> npm install</p>
            <p><span>$</span> npx supermemory local</p>
            <p className="terminal-success"><Check size={14} /> Supermemory Local ready on :6767</p>
            <p><span>$</span> npm run dev</p>
            <p className="terminal-success"><Check size={14} /> Precedent listening for GitHub events</p>
            <div className="terminal-event">
              <Zap size={14} /> pull_request.opened
              <strong>checking for precedent…</strong>
            </div>
            <div className="bot-delivery">
              <div className="delivery-icon"><Bot size={15} /></div>
              <div><span>precedent-ai[bot] commented automatically</span><strong>Pattern matched · cites PR #184</strong></div>
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div className="terminal-footer"><Server size={15} /> Self-hosted. Repository-scoped. Under your control.</div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final-cta section-shell">
      <Reveal className="final-cta-inner">
        <div className="cta-mark"><BrandMark /></div>
        <div className="section-kicker">The review happens once. The learning should last.</div>
        <h2>Give your repository<br />a memory.</h2>
        <p>Connect GitHub, run Supermemory Local, and let every resolved decision make the next pull request better.</p>
        <div className="hero-actions">
          <a className="button button--primary" href={README_URL} target="_blank" rel="noreferrer">Read the setup guide <ArrowRight size={17} /></a>
          <a className="button button--secondary" href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={17} /> Explore the source</a>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer section-shell">
      <a className="brand" href="#top"><BrandMark /><span>Precedent</span></a>
      <p>Repository memory for engineering decisions.</p>
      <div><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub</a><a href={README_URL} target="_blank" rel="noreferrer">Setup</a></div>
    </footer>
  );
}

export default function App() {
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = appRef.current?.querySelectorAll<HTMLElement>(".reveal");
    if (!elements) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={appRef} className="app-shell">
      <Header />
      <Hero />
      <Footer />
    </div>
  );
}
