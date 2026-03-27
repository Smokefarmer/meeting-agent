# MeetingAgent - Market Research & Competitor Analysis

## Executive Summary

The AI meeting assistant market is dominated by **transcription-first** tools that extract action items but **do not act on them**. MeetingAgent's key differentiator is **autonomous action execution** — creating issues, scheduling meetings, and sending follow-ups automatically.

---

## Market Landscape

```
                    PASSIVE                              ACTIVE
                 (Notes Only)                      (Takes Action)
                      │                                  │
    ┌─────────────────┼──────────────────────────────────┼─────────┐
    │                 │                                  │         │
    │  Otter.ai ────────┐                               │         │
    │  Fireflies.ai ────┼── Transcribe + Extract        │         │
    │  Fathom ──────────┤   but NO auto-action          │         │
    │  Read AI ─────────┘                               │         │
    │                 │                                  │         │
    │  Fellow.ai ─────── Syncs to Jira/GitHub           │         │
    │  Meetily ──────── Creates Jira tickets        ────┼── Partial
    │                 │                                  │         │
    │                 │                          MeetingAgent ◀────┤
    │                 │                          (Our Position)    │
    │                 │                                  │         │
    └─────────────────┼──────────────────────────────────┼─────────┘
                      │                                  │
                  CLOUD/SAAS                      SELF-HOSTED
```

---

## Competitor Deep Dive

### 1. Otter.ai

| Aspect | Details |
|--------|---------|
| **What it does** | Real-time transcription, AI summaries, action item extraction |
| **Strengths** | Great transcription accuracy, collaboration features, Zoom/Meet integration |
| **Weaknesses** | No auto-action, limited dev tool integration, US-only data storage |
| **Pricing** | Free (300 min/mo), Pro $17/mo, Business $30/mo |
| **Action Items** | Extracts to "My Action Items" list — user must manually create tickets |

**Gap**: Otter shows you action items but doesn't create GitHub issues or calendar events.

### 2. Fireflies.ai

| Aspect | Details |
|--------|---------|
| **What it does** | Records, transcribes, summarizes meetings across platforms |
| **Strengths** | Wide integrations (Trello, Asana, Slack, HubSpot), multilingual |
| **Weaknesses** | Integrations are "sync" not "auto-create", requires manual trigger |
| **Pricing** | Free (limited), Pro $19/mo, Business $39/mo |
| **Action Items** | Can push to Trello/Asana but requires manual confirmation |

**Gap**: Integration exists but is not autonomous — user must review and click "send to Trello".

### 3. Fellow.ai

| Aspect | Details |
|--------|---------|
| **What it does** | Meeting notes, action items, 1:1 templates, OKR tracking |
| **Strengths** | GitHub/Jira integration, team collaboration, privacy-focused |
| **Weaknesses** | Action items sync but don't auto-create, aimed at managers not devs |
| **Pricing** | Free (limited), Pro $9/mo, Business $14/mo |
| **Action Items** | "Send to GitHub" button — not automatic |

**Gap**: Has the integrations but requires human in the loop.

### 4. Fathom

| Aspect | Details |
|--------|---------|
| **What it does** | Free AI notetaker, summaries, action items, CRM integration |
| **Strengths** | Generous free tier, good CRM sync (HubSpot, Salesforce) |
| **Weaknesses** | No GitHub/Jira, focused on sales use cases |
| **Pricing** | Free (unlimited), Premium $24/mo |
| **Action Items** | Extracted but not actionable beyond CRM |

**Gap**: Sales-focused, no developer workflow integration.

### 5. Meetily

| Aspect | Details |
|--------|---------|
| **What it does** | AI meeting assistant for tech teams, Jira integration |
| **Strengths** | Auto-creates Jira tickets, sprint management, dev-focused |
| **Weaknesses** | Jira-only, no GitHub, cloud-only, enterprise pricing |
| **Pricing** | Enterprise (contact sales) |
| **Action Items** | Auto-creates Jira tickets ✓ |

**Closest competitor** — but Jira-only and not open source.

### 6. Microsoft Copilot (Teams)

| Aspect | Details |
|--------|---------|
| **What it does** | AI assistant in Microsoft 365, meeting summaries, action items |
| **Strengths** | Native Teams integration, enterprise trust |
| **Weaknesses** | Suggests but doesn't act, locked to Microsoft ecosystem |
| **Pricing** | $30/user/month (requires M365) |
| **Action Items** | Shows summary, user must manually create tasks |

**Gap**: Microsoft shows you what to do, doesn't do it for you.

---

## Feature Comparison Matrix

| Feature | Otter | Fireflies | Fellow | Fathom | Meetily | MS Copilot | **MeetingAgent** |
|---------|-------|-----------|--------|--------|---------|------------|------------------|
| Transcription | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Speaker ID | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Action Extraction | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Auto GitHub Issue** | ❌ | ❌ | ❌* | ❌ | ❌ | ❌ | ✅ |
| **Auto Calendar** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Auto Follow-up** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Auto Jira | ❌ | ❌* | ❌* | ❌ | ✅ | ❌ | 🔜 |
| Self-Hosted | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Open Source | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| GDPR/On-Prem | ❌ | ❌ | ✅ | ❌ | ❌ | ✅* | ✅ |

*Limited or manual trigger required

---

## The Gap We Fill

### What Exists (Passive)
```
Meeting → Transcription → Action Items List → [HUMAN DOES WORK] → Ticket Created
```

### What We Build (Active)
```
Meeting → Transcription → Action Items → [AUTO] → Ticket Created + Calendar + Follow-up
```

**Key Insight**: Every competitor stops at "here's what you should do." 
We go to "here's what we did for you."

---

## Target Users

### Primary: Developer Teams
- Sprint planning meetings
- Bug triage sessions
- Architecture discussions
- Want: GitHub issues, PRs, technical action items

### Secondary: Startups / Small Teams
- All-hands meetings
- Planning sessions
- Want: Tasks, calendar events, follow-ups without admin overhead

### Future: Enterprise (Compliance-Sensitive)
- Legal, finance, healthcare
- Cannot use cloud transcription (data residency)
- Want: Self-hosted, audit trail, GDPR compliance

---

## Why Self-Hosted Matters

### Enterprise Pain Point

Companies like Ernst & Young, Deloitte, banks, healthcare:
- **Cannot** send meeting audio to US cloud services
- **Cannot** have client discussions transcribed by third parties
- **Need** on-premise or private cloud deployment
- **Need** audit logs and data retention controls

### Current Options
- Microsoft Copilot (expensive, limited action)
- Build custom solution (expensive, slow)
- Don't use AI at all (status quo)

### Our Opportunity
**Self-hosted, open-source, action-taking meeting assistant** = no competitor in this space.

---

## Pricing Analysis

| Tool | Free Tier | Pro | Business/Enterprise |
|------|-----------|-----|---------------------|
| Otter.ai | 300 min/mo | $17/mo | $30/mo |
| Fireflies.ai | Limited | $19/mo | $39/mo |
| Fellow.ai | 3 meetings | $9/mo | $14/mo |
| Fathom | Unlimited | $24/mo | - |
| MS Copilot | - | - | $30/user/mo |
| **MeetingAgent** | ∞ (self-hosted) | - | Support/Enterprise |

**Our model**: Free & open source, optional paid support/enterprise features.

---

## Competitive Moats

### Short-term (Hackathon)
1. **First OpenClaw skill** for meeting automation
2. **Actually executes actions** (not just extracts)
3. **Open source** from day one

### Medium-term (6 months)
1. **Self-hosted** option for compliance
2. **Multi-tool routing** (GitHub + Jira + Linear intelligently)
3. **Follow-up automation** (reminders, status checks)

### Long-term (Defensible)
1. **Community + ecosystem** (OpenClaw skill marketplace)
2. **Enterprise features** (SSO, audit, compliance)
3. **Voice fingerprinting** (know who's who without labels)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Microsoft adds auto-action to Copilot | Medium | High | Move fast, own open-source niche |
| Otter/Fireflies copy feature | Medium | Medium | Self-hosted differentiator |
| Transcription quality issues | Low | High | Multiple engine support |
| LLM extraction unreliable | Medium | Medium | Human review option, confidence thresholds |
| Enterprise sales cycle long | High | Medium | Focus on SMB first, enterprise later |

---

## Summary

**Market opportunity**: Every major player transcribes and extracts, none truly automates action.

**Our position**: Action-first, self-hosted, open-source.

**Timing**: AI meeting tools are mainstream, but automation gap is unfilled.

**Ask**: Build MVP, demo at hackathon, validate with real users.
