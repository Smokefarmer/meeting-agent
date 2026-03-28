/**
 * Main meeting pipeline: transcript → extraction → routing → summary.
 * Orchestrates the full lifecycle of a meeting session.
 */

import type { MeetingSession } from './session.js';
import type { TranscriptSegment } from './models.js';
import type { LlmClient } from './llm.js';
import { streamTranscript } from './listen.js';
import { extractAndRoute } from './extract-and-route.js';
import { generateAndSendSummary } from './summary.js';
import { detectWakeWord, handleAddressedSpeech } from './converse.js';
import { safeErrorMessage } from './errors.js';

const EXTRACTION_INTERVAL_MS = 30_000;
const MIN_BUFFER_LENGTH = 100;

export async function runPipeline(session: MeetingSession, llmClient: LlmClient): Promise<void> {
  const { config } = session;

  if (!session.botId) {
    throw new Error('Cannot run pipeline: session has no botId (join step did not complete)');
  }
  if (!session.websocketUrl) {
    console.warn('No websocketUrl — Recall.ai did not return a WebSocket URL.');
  }

  // Bot joins silently — no greeting. Works in the background picking up
  // intents and only speaks when directly addressed by name.

  let bufferText = '';
  let lastExtractionTime = Date.now();
  let partialWakeHandled = false;

  const onSegment = async (segment: TranscriptSegment, isFinal: boolean): Promise<void> => {
    // Reset the partial-wake dedup flag when a final transcript arrives
    if (isFinal) {
      partialWakeHandled = false;
    }

    // Check if the bot is being addressed by name — handle Q&A
    const question = detectWakeWord(segment, config.instanceName);
    if (question !== null && question.length > 0) {
      if (!partialWakeHandled) {
        partialWakeHandled = true;
        handleAddressedSpeech(question, session, config, llmClient).catch((err) => {
          console.error('Q&A handler failed:', safeErrorMessage(err));
        });
      }
      return; // Don't include addressed speech in extraction buffer
    }

    // Only persist and buffer final transcripts
    if (!isFinal) return;

    session.addSegment(segment);

    const line = segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text;
    bufferText += line + '\n';

    if (shouldExtract(bufferText, lastExtractionTime)) {
      const chunk = bufferText;
      bufferText = '';
      lastExtractionTime = Date.now();

      try {
        await extractAndRoute(chunk, session, config, llmClient);
      } catch (err) {
        console.error('Extraction failed:', safeErrorMessage(err));
      }
    }
  };

  session.startCheckpointing();

  try {
    if (session.websocketUrl) {
      await streamTranscript(session.websocketUrl, config.recallApiKey, onSegment);
    } else {
      // Standard model — no real-time stream. Bot is in the call but transcript arrives post-meeting.
      console.log('Pipeline: waiting for meeting to end (no real-time stream)...');
      await new Promise<void>((resolve) => setTimeout(resolve, 60 * 60 * 1000)); // wait up to 1h
    }
  } finally {
    await session.end();
    try {
      await generateAndSendSummary(session, config, llmClient);
    } catch (err) {
      console.error('Summary generation failed:', safeErrorMessage(err));
    }
  }
}

function shouldExtract(buffer: string, lastTime: number): boolean {
  const elapsed = Date.now() - lastTime;
  return buffer.length >= MIN_BUFFER_LENGTH && elapsed >= EXTRACTION_INTERVAL_MS;
}
