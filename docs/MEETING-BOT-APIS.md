# Meeting Bot APIs — Market Analysis 2026

## What is a Meeting Bot API?

A Meeting Bot API (also called MBaaS — Meeting Bot as a Service) provides a virtual participant that autonomously joins Zoom, Google Meet, or Microsoft Teams calls to record, transcribe, and stream audio/metadata. This is the "Join Layer" — highly complex infrastructure involving headless Chrome automation, virtual audio routing (PulseAudio), anti-bot detection bypasses, and real-time media pipelines.

**Building this from scratch takes months. Don't.**

---

## Why Not Build It Yourself?

- Google Meet has no native bot API → requires headless Chromium + PulseAudio + stealth plugins
- Zoom/Teams native APIs require complex OAuth flows, enterprise tenant approvals, and constant maintenance
- Anti-bot countermeasures are actively updated — bypassing them is a full-time job
- Orphaned/ghost bots without lifecycle management = runaway cloud costs

The value of MBaaS providers: one HTTP POST with a meeting URL → bot joins, records, transcribes.

---

## Speaker Diarization: Two Methods

| Method | When | Accuracy |
|--------|------|----------|
| **Mechanical** | Native SDK (e.g. Zoom SDK) — individual audio streams per participant | Perfect |
| **Acoustic** | Headless browser (e.g. Google Meet) — single mixed audio stream, AI-separated | High, but slight margin of error in crosstalk |

---

## Provider Comparison

| Provider | Price/hr | Platforms | Real-Time | Self-Host | Notable Features |
|----------|----------|-----------|-----------|-----------|-----------------|
| **Recall.ai** | $0.50 | Zoom, Meet, Teams, Webex, Slack, GoTo | ✅ | ❌ | Market leader, SOC2/HIPAA, Desktop/Mobile SDK, Calendar API |
| **Skribby** | $0.35 | Zoom, Meet, Teams | ✅ WebSocket | ❌ | 5-min setup, BYOK STT, custom bot avatars, no platform fees |
| **MeetingBaaS** | $0.35–0.50 + tiers | Zoom, Meet, Teams | ✅ | Partial (open source components) | MCP Server, Calendar sync, open-source UI templates |
| **Attendee.dev** | $0.50 hosted / Free self-hosted | Zoom, Meet, Teams | ✅ | ✅ Docker/Django | Interactive bots (speak, display images), deep Zoom RTMS support |
| **Vexa.ai** | $0.45 hosted / Free self-hosted | Meet, Teams, Zoom | ✅ sub-second | ✅ Docker Compose | Interactive Bots API, MCP integration, 100+ language translation |
| **MeetStream.ai** | Custom (sales) | Zoom, Meet, Teams, Webex | ✅ | ❌ | CRM sync (Salesforce/HubSpot/Jira), AI Agent Builder, SOC2/ISO27001 |
| **Chatter-Box.io** | ~$0.90 | Zoom, Meet, Teams | ✅ WebSocket | ❌ | Lightweight Python/JS SDK, MCP server, simple setup |

---

## Detailed Profiles

### Recall.ai — The Baseline
- **Pricing**: $0.50/hr recording + optional $0.15/hr transcription. First 5 hours free.
- **Strengths**: Widest platform support, SOC2 Type II + HIPAA, Desktop Recording SDK (no visible bot), Calendar API for auto-dispatch
- **Integrations**: AssemblyAI, Deepgram, Gladia, Rev, Speechmatics
- **Weakness**: Historical enterprise-first sales motion, was expensive before 2026 pricing reset
- **Best for**: Compliance-sensitive production deployments

### Skribby — Best for Hackathons
- **Pricing**: $0.35/hr base. BYOK transcription options from $0.39/hr (Whisper) to $0.97/hr (Gladia). No credit card required.
- **Setup**: Account + first bot via curl in under 5 minutes
- **Strengths**: Transparent pricing, BYOK architecture, custom bot avatars, direct Discord engineering support
- **Weakness**: Cloud-only, no self-hosting
- **Best for**: Hackathons, startups, rapid prototyping

### MeetingBaaS — Best for AI Agents
- **Pricing**: Tiered ($0/mo free → $299/mo enterprise) + token system (~$0.35–0.50/token/hr)
- **Strengths**: Open-source MCP server (`meeting-mcp`) for Claude/Cursor integration, open-source Next.js transcript viewer UI, Calendar sync
- **Weakness**: Complex token + subscription hybrid pricing, lobby wait time billed
- **Best for**: AI agent projects, teams that want ready-made LLM integration

### Attendee.dev — Best for Self-Hosting
- **Pricing**: $0.50/hr hosted or free self-hosted. Volume discounts to $0.35/hr.
- **Strengths**: Full open source (Django + Docker), interactive bots (speak, show images, send chat), deep Zoom RTMS support
- **Use case**: Hospitals in Switzerland (strict GDPR — no data to external clouds)
- **Best for**: Data sovereignty, regulated industries, cost optimization at scale

### Vexa.ai — Best Open Source + Interactive
- **Pricing**: $0.45/hr hosted, $12/mo subscription, or free self-hosted
- **Strengths**: Sub-second transcript delivery, Interactive Bots API (speak/chat/screen share), native MCP integration, 100+ language translation, GPU-free self-hosting option
- **Deployment**: Full self-host or hybrid (local bot + remote STT API)
- **Best for**: Privacy-first with interactive bot features

### MeetStream.ai — Best for Enterprise Workflows
- **Pricing**: Custom (requires sales demo)
- **Strengths**: Deep CRM integrations (Salesforce, HubSpot, Pipedrive, Jira, Asana), AI Agent Builder for real-time meeting participation, bypasses OAuth complexity
- **Compliance**: SOC2 Type II, ISO 27001, GDPR, HIPAA
- **Best for**: Enterprise sales teams, compliance-heavy environments

### Chatter-Box.io — Lightweight Option
- **Pricing**: ~$0.90/hr (most expensive)
- **Strengths**: Simple Python/JS SDK, MCP server (TypeScript), fast setup
- **Weakness**: Most expensive, fewer advanced features
- **Best for**: Simple transcription use cases only

---

## Underlying STT Providers (BYOK Ecosystem)

| Provider | Strength | Latency |
|----------|----------|---------|
| **Gladia** | Default in Recall.ai + MeetingBaaS, real-time code-switching (multilingual), word-level timestamps | <300ms |
| **Deepgram Nova-2/3** | Extreme speed, custom vocabulary, acoustic diarization | Very low |
| **AssemblyAI** | Profanity filtering, universal language detection, sentiment analysis | Low |
| **Speechmatics** | Multilingual, specialized domains | Low |
| **OpenAI Whisper** | Cost-effective, good accuracy | Higher (async) |

---

## Open Source Alternatives

For teams that need full infrastructure control:

| Project | Stack | Notes |
|---------|-------|-------|
| **meetingbot/meetingbot** | Next.js + Express + tRPC + Postgres (AWS/Terraform) | Full Recall.ai alternative, self-hosted |
| **meeting-bot69** | Next.js 15 + Pinecone + OpenAI + Stripe | Full-stack SaaS starter (Otter/Fireflies alternative) |
| **Vexa Lite** | Docker Compose | Production-ready, GPU-free option available |
| **Attendee self-hosted** | Django + Docker | Single image, Postgres + Redis only |

**Warning**: All open-source bots rely on Puppeteer/Playwright headless automation. Video conferencing platforms actively fight this. Expect constant maintenance overhead — not recommended for hackathon timeframes.

---

## Recommendations

### Hackathon (24h MVP)

**→ Primary: Skribby**
- 5-minute setup, no credit card, 5 hours free
- Simple REST + WebSocket API
- Direct engineering support via Discord at 3am

**→ Secondary: MeetingBaaS**
- If the project is AI-agent focused
- Pre-built MCP server for Claude/Cursor integration
- Open-source Next.js transcript UI = skip all frontend boilerplate

### Production

| Use Case | Recommended |
|----------|-------------|
| General SaaS | Recall.ai or Skribby |
| GDPR / Healthcare / On-prem | Attendee.dev or Vexa self-hosted |
| Enterprise + CRM workflows | MeetStream.ai |
| AI agent platform | MeetingBaaS or Vexa |

---

## Integration with MeetingAgent (OpenClaw Skill)

Since MeetingAgent is an OpenClaw skill, the bot API is just the **input layer**. The agent inherits all OpenClaw integrations automatically:

```
Meeting Bot API (Skribby/MeetingBaaS)
    ↓ transcript + speaker data
MeetingAgent Skill (OpenClaw)
    ↓ intent detection + action routing
GitHub Issues / Calendar / Tasks / Telegram / Email
(whatever is connected to the OpenClaw instance)
```

No extra integration work needed per output target — OpenClaw handles routing.

---

*Research compiled 2026-03-27. Sources: Gemini deep research + direct API documentation.*
