import { describe, expect, it } from 'vitest';

import { asChapterId, asSubjectId, asTopicId } from './ids';
import type { ChapterId, TopicId } from './ids';

/**
 * A TOPIC ID AND A CHAPTER ID ARE DIFFERENT KINDS OF NAME.
 *
 * They were both `string`, and the practice engine's whole topic boundary is an
 * equality check between two of them. An equality check between two strings
 * cannot tell you that one of them is the wrong kind of string, which is how a
 * chapter id came to sit in the topic slot of every question in a chapter-scoped
 * set: `verify.ts` compared it to itself and passed.
 *
 * That bug was fixed at the value level. This makes the SHAPE of it
 * unrepresentable, so the next one cannot be written.
 *
 * WHY `@ts-expect-error` IS THE ASSERTION AND NOT A SUPPRESSION
 * ------------------------------------------------------------
 * `@ts-ignore` hides an error and passes whether or not one exists.
 * `@ts-expect-error` REQUIRES one: if the line below ever compiles, TypeScript
 * reports the unused directive and the build fails. It is the only way to
 * assert that something does not compile, and it fails in the direction that
 * matters -- the day the brand stops working.
 */

describe('the brands keep the two kinds of id apart', () => {
  it('refuses a chapter id where a topic id belongs', () => {
    const chapter: ChapterId = asChapterId('functions');

    // @ts-expect-error a ChapterId is not a TopicId, and that is the point
    const wrong: TopicId = chapter;

    /* Referenced so the binding is not merely unused; the assertion above is
       the compiler's, this one keeps the runtime honest about the value. */
    expect(String(wrong)).toBe('functions');
  });

  it('refuses a topic id where a chapter id belongs', () => {
    const topic: TopicId = asTopicId('functions--graphs');

    // @ts-expect-error a TopicId is not a ChapterId, in either direction
    const wrong: ChapterId = topic;

    expect(String(wrong)).toBe('functions--graphs');
  });

  it('refuses a bare string where a topic id belongs', () => {
    // @ts-expect-error a raw string has not been through asTopicId
    const wrong: TopicId = 'functions--graphs';

    expect(String(wrong)).toBe('functions--graphs');
  });

  it('carries the raw value through unchanged, because a brand is types only', () => {
    /*
     * The brand costs nothing at runtime. If `asTopicId` ever started wrapping
     * or normalising, every persisted id would silently stop matching the ones
     * already in a student's localStorage.
     */
    expect(asTopicId('functions--graphs')).toBe('functions--graphs');
    expect(asChapterId('functions')).toBe('functions');
    expect(asSubjectId('mathematics')).toBe('mathematics');
  });

  it('still compares as a plain string, so equality checks keep working', () => {
    expect(asTopicId('t') === asTopicId('t')).toBe(true);
    expect(asTopicId('t') === asTopicId('u')).toBe(false);
  });
});
