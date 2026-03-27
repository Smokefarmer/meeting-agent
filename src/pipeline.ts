/**
 * Main meeting pipeline: transcript → extraction → routing → summary.
 * Orchestrates the full lifecycle of a meeting session.
 */

import type { MeetingSession } from './session.js';
import type { TranscriptSegment } from './models.js';
import { streamTranscript } from './listen.js';
import { extractIntents } from './detect.js';
import { isDuplicate } from './dedup.js';
import { routeIntent } from './route.js';
import { speakGreeting } from './speak.js';
import { generateAndSendSummary } from './summary.js';
import { detectWakeWord, handleAddressedSpeech } from './converse.js';

const EXTRACTION_INTERVAL_MS = 30_000;
const MIN_BUFFER_LENGTH = 100;

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export async function runPipeline(session: MeetingSession): Promise<void> {
  const { config } = session;

  if (!session.botId) {
    throw new Error('Cannot run pipeline: session has no botId (join step did not complete)');
  }

  await speakGreeting(config, session.botId);

  let bufferText = '';
  let lastExtractionTime = Date.now();

  const onSegment = async (segment: TranscriptSegment): Promise<void> => {
    session.addSegment(segment);

    // Check if the bot is being addressed by name — handle Q&A
    const question = detectWakeWord(segment, config.instanceName);
    if (question !== null && question.length > 0) {
      handleAddressedSpeech(question, session, config).catch((err) => {
        console.error('Q&A handler failed:', safeErrorMessage(err));
      });
      return; // Don't include addressed speech in extraction buffer
    }

    const line = segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text;
    bufferText += line + '\n';

    if (shouldExtract(bufferText, lastExtractionTime)) {
      const chunk = bufferText;
      bufferText = '';
      lastExtractionTime = Date.now();

      try {
        const intents = await extractIntents(chunk, config);
        for (const intent of intents) {
          if (!isDuplicate(intent, session)) {
            session.addIntent(intent);
            await routeIntent(intent, session, config);
          }
        }
      } catch (err) {
        console.error('Extraction failed:', safeErrorMessage(err));
      }
    }
  };

  try {
    await streamTranscript(session.botId, config.skribbyApiKey, onSegment);
  } finally {
    session.end();
    try {
      await generateAndSendSummary(session);
    } catch (err) {
      console.error('Summary generation failed:', safeErrorMessage(err));
    }
  }
}

function shouldExtract(buffer: string, lastTime: number): boolean {
  const elapsed = Date.now() - lastTime;
  return buffer.length >= MIN_BUFFER_LENGTH && elapsed >= EXTRACTION_INTERVAL_MS;
}
