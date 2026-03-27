/**
 * Tests for extractMeetUrl() — Google Meet URL extraction from message text.
 */

import { extractMeetUrl } from './skill.js';

describe('extractMeetUrl', () => {
  describe('valid Google Meet URLs', () => {
    it('extracts a standard meet.google.com URL', () => {
      const result = extractMeetUrl('Join at https://meet.google.com/abc-defg-hij');

      expect(result).toBe('https://meet.google.com/abc-defg-hij');
    });

    it('extracts a URL from the middle of a message', () => {
      const message = 'Hey team, the call is at https://meet.google.com/xyz-abcd-efg please join on time';
      const result = extractMeetUrl(message);

      expect(result).toBe('https://meet.google.com/xyz-abcd-efg');
    });

    it('extracts a URL when it is the entire message', () => {
      const result = extractMeetUrl('https://meet.google.com/abc-defg-hij');

      expect(result).toBe('https://meet.google.com/abc-defg-hij');
    });

    it('rejects http:// URLs (HTTPS only)', () => {
      const result = extractMeetUrl('http://meet.google.com/abc-defg-hij');

      expect(result).toBeNull();
    });

    it('extracts the first URL when multiple are present', () => {
      const message = 'Links: https://meet.google.com/aaa-bbbb-ccc and https://meet.google.com/ddd-eeee-fff';
      const result = extractMeetUrl(message);

      expect(result).toBe('https://meet.google.com/aaa-bbbb-ccc');
    });

    it('handles mixed-case URLs (case-insensitive matching)', () => {
      const result = extractMeetUrl('https://Meet.Google.Com/abc-defg-hij');

      expect(result).toBe('https://Meet.Google.Com/abc-defg-hij');
    });
  });

  describe('non-Meet URLs', () => {
    it('returns null for a Zoom URL', () => {
      const result = extractMeetUrl('https://zoom.us/j/1234567890');

      expect(result).toBeNull();
    });

    it('returns null for a generic Google URL', () => {
      const result = extractMeetUrl('https://google.com/search?q=hello');

      expect(result).toBeNull();
    });

    it('returns null for a Teams URL', () => {
      const result = extractMeetUrl('https://teams.microsoft.com/l/meetup-join/abc');

      expect(result).toBeNull();
    });

    it('returns null for a URL with wrong path pattern', () => {
      // Meet URLs have the pattern: 3 letters, dash, 4 letters, dash, 3 letters
      const result = extractMeetUrl('https://meet.google.com/invalid-url');

      expect(result).toBeNull();
    });

    it('returns null for a partial meet URL', () => {
      const result = extractMeetUrl('https://meet.google.com/ab-cdef-ghi');

      expect(result).toBeNull();
    });
  });

  describe('empty and non-URL strings', () => {
    it('returns null for an empty string', () => {
      const result = extractMeetUrl('');

      expect(result).toBeNull();
    });

    it('returns null for a string with no URLs', () => {
      const result = extractMeetUrl('Hey team, let us meet at 3pm');

      expect(result).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
      const result = extractMeetUrl('   \n\t  ');

      expect(result).toBeNull();
    });

    it('returns null for "meet.google.com" without protocol', () => {
      const result = extractMeetUrl('meet.google.com/abc-defg-hij');

      expect(result).toBeNull();
    });
  });
});
