#!/bin/bash
# MeetingClaw — quick join test
# Usage: ./test-join.sh https://meet.google.com/xxx-yyyy-zzz

MEET_URL="${1:-https://meet.google.com/fnn-jxms-bny}"

echo "🎙️ MeetingClaw join test"
echo "URL: $MEET_URL"
echo ""

npx tsx -e "
import { handleMessage } from './src/skill.ts';
handleMessage('join $MEET_URL', async (msg) => {
  console.log('[NostraAI]', msg);
});
"
