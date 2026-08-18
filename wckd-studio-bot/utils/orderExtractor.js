// Free, rule-based best-effort extraction of order details from a ticket transcript.
// I didn't add any external API calls — pure keyword/regex matching. Staff always reviews and
// corrects the guesses in a form before anything is finalized, so this only needs
// to be a reasonable starting point, not perfect.

function detectService(text) {
  const lower = text.toLowerCase();
  // Check most-specific keywords first to avoid "solo" matching inside other words, etc.
  if (/\b(group|gang)\b/.test(lower)) return 'group';
  if (/\bfamily\b/.test(lower)) return 'family';
  if (/\bcouple\b/.test(lower)) return 'couple';
  if (/\bvideo( edit)?\b/.test(lower)) return 'video';
  if (/\bsolo\b/.test(lower)) return 'solo';
  return 'unclear';
}

function firstNumberNear(text, keywordsRegex) {
  const lower = text.toLowerCase();
  // number anywhere within a short window before the keyword, e.g.
  // "12 members", "we're 8 pax", "2 of us have tattoos"
  const beforeMatch = lower.match(new RegExp(`(\\d+)[^0-9]{0,25}(?:${keywordsRegex})`, 'i'));
  if (beforeMatch) return parseInt(beforeMatch[1], 10);
  // number shortly after the keyword, e.g. "members: 12", "tattoos - 2"
  const afterMatch = lower.match(new RegExp(`(?:${keywordsRegex})[^0-9]{0,15}(\\d+)`, 'i'));
  if (afterMatch) return parseInt(afterMatch[1], 10);
  return null;
}

function detectGraphicDesign(text) {
  const lower = text.toLowerCase();
  if (/\bno\s+(graphic\s+)?design\b/.test(lower)) return false;
  if (/\b(graphic design|gd)\b/.test(lower)) return true;
  return false;
}

function guessOrderFromTranscript(transcript) {
  const service = detectService(transcript);
  const memberCount = firstNumberNear(transcript, 'members?|people|pax|of us|persons?');
  const tattooCount = firstNumberNear(transcript, 'tattoos?');
  const xmlCount = firstNumberNear(transcript, 'xml');
  const graphicDesign = detectGraphicDesign(transcript);

  return {
    service,
    memberCount,
    tattooCount,
    xmlCount,
    graphicDesign,
  };
}

module.exports = { guessOrderFromTranscript };
