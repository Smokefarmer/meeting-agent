/**
 * Intent router: maps intents to GitHub issue creation.
 * Issue #4 — NostraAIAgent.
 *
 * Routes BUG and FEATURE intents to GitHub Issues API.
 * Other intent types are tracked in session but not externally routed.
 */

import { Octokit } from '@octokit/rest';
import type { Intent, CreatedIssue } from './models.js';
import type { MeetingSession } from './session.js';
import type { OpenClawConfig } from './config.js';
import { isDuplicate } from './dedup.js';
import { respond } from './speak.js';

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Returns true if the error is a transient HTTP error worth retrying.
 * Exported for testing.
 */
export function isRetryableHttpError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as unknown as Record<string, unknown>).status;
  if (typeof status === 'number') {
    return RETRYABLE_STATUS_CODES.includes(status);
  }
  return /429|500|502|503|504|rate.?limit/i.test(err.message);
}

/**
 * Retry wrapper with exponential backoff.
 * Exported for testing.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseMs: number = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableHttpError(err) || attempt === maxRetries) throw err;
      const delay = baseMs * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Route an intent to the appropriate action handler.
 * For BUG/FEATURE: creates GitHub issues with deduplication.
 * For other types: adds to session for tracking.
 */
export async function routeIntent(
  intent: Intent,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<void> {
  // Deduplication check first
  if (isDuplicate(intent, session)) {
    return;
  }

  // Track intent in session
  session.addIntent(intent);

  // Route based on intent type
  if (intent.type === 'BUG' || intent.type === 'FEATURE') {
    await handleGitHubIntent(intent, session, config);
  }
  // TODO: Future routing for MEETING_REQUEST → Calendar, etc.
}

/**
 * Handle BUG and FEATURE intents by creating GitHub issues.
 */
async function handleGitHubIntent(
  intent: Intent,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<void> {
  // Check GitHub configuration
  if (!config.githubToken || !config.githubRepo) {
    if (session.botId) {
      respond("I don't have GitHub connected. I noted it locally.", config, session.botId).catch(console.error);
    }
    return;
  }

  // Check confidence threshold
  if (intent.confidence < config.confidenceThreshold) {
    if (session.botId) {
      respond(`I detected a ${intent.type.toLowerCase()} but my confidence is low. Please confirm: "${intent.text}"`, config, session.botId).catch(console.error);
    }
    return;
  }

  try {
    const issue = await withRetry(() => createGitHubIssue(intent, session, config));
    session.addCreatedIssue(issue);
    if (session.botId) {
      respond(`Created GitHub issue #${issue.issueNumber}: ${issue.title}`, config, session.botId).catch(console.error);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('GitHub issue creation failed:', errMsg);
    if (session.botId) {
      respond('GitHub issue creation failed. I\'ll include this in the meeting summary instead.', config, session.botId).catch(console.error);
    }
  }
}

/**
 * Create a GitHub issue from an intent.
 */
async function createGitHubIssue(
  intent: Intent,
  session: MeetingSession,
  config: OpenClawConfig,
): Promise<CreatedIssue> {
  const title = formatIssueTitle(intent);
  const body = formatIssueBody(intent, session);
  const labels = getLabelsForIntent(intent);

  const [owner, repo] = config.githubRepo!.split('/');
  const octokit = new Octokit({ auth: config.githubToken });

  const response = await octokit.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });

  return {
    intentText: intent.text,
    issueUrl: response.data.html_url,
    issueNumber: response.data.number,
    title: response.data.title,
  };
}

/**
 * Format the issue title based on intent type.
 */
function formatIssueTitle(intent: Intent): string {
  const prefix = intent.type === 'BUG' ? 'Bug' : 'Feature';
  return `${prefix}: ${intent.text}`;
}

/**
 * Format the issue body with context from the meeting.
 */
function formatIssueBody(intent: Intent, session: MeetingSession): string {
  const lines: string[] = [
    '## Description',
    intent.text,
    '',
  ];

  if (intent.sourceQuote) {
    lines.push('## Source Quote');
    lines.push(`> ${intent.sourceQuote}`);
    lines.push('');
  }

  if (intent.owner) {
    lines.push(`**Mentioned by**: ${intent.owner}`);
  }

  if (intent.priority !== 'medium') {
    lines.push(`**Priority**: ${intent.priority}`);
  }

  if (intent.deadline) {
    lines.push(`**Deadline**: ${intent.deadline}`);
  }

  if (session.url) {
    lines.push(`**Meeting**: ${session.url}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('*Automatically created by MeetingClaw*');

  return lines.join('\n');
}

/**
 * Get GitHub labels based on intent type and priority.
 */
function getLabelsForIntent(intent: Intent): string[] {
  const labels: string[] = [];

  // Type label
  if (intent.type === 'BUG') {
    labels.push('bug');
  } else if (intent.type === 'FEATURE') {
    labels.push('enhancement');
  }

  // Priority label for high/critical
  if (intent.priority === 'critical' || intent.priority === 'high') {
    labels.push(`priority:${intent.priority}`);
  }

  return labels;
}
