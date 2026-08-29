/**
 * SUBJECT, CHAPTER AND TOPIC IDS ARE THREE DIFFERENT KINDS OF NAME.
 *
 * They were all `string`, and the practice engine's entire topic boundary is an
 * equality check between two of them:
 *
 *     question.topicId === session.topicId
 *
 * An equality check between two strings cannot tell you that one of them is the
 * WRONG KIND of string. That is precisely how a chapter id came to sit in the
 * topic slot of every question in a chapter-scoped set: `profileFor` wrote
 * `{ topicId: chapter.id, chapterId: chapter.id }`, `buildPlan` stamped it onto
 * fifteen questions covering five topics, and the boundary check compared the
 * chapter id to itself and passed. Every gate was green. The metadata was wrong.
 *
 * That defect was fixed at the value level. This makes its SHAPE
 * unrepresentable, so the next one cannot be written.
 *
 * WHY A UNIQUE SYMBOL AND NOT A STRING LITERAL BRAND
 * --------------------------------------------------
 * `string & { __brand: 'TopicId' }` is defeated by any object that happens to
 * declare `__brand: 'TopicId'`. A `unique symbol` cannot be named or forged from
 * outside this module, so the only way to obtain a `TopicId` is to call
 * `asTopicId` — which makes every conversion a visible, greppable decision
 * rather than an implicit one.
 *
 * ZERO RUNTIME COST, AND THAT IS LOAD BEARING
 * -------------------------------------------
 * The brand exists only in the type system. `asTopicId(x)` returns `x`. If it
 * ever started wrapping or normalising, every id already sitting in a student's
 * localStorage would stop matching the ones the app produces, and their saved
 * progress would silently detach. `ids.test.ts` pins that.
 */

declare const SUBJECT_BRAND: unique symbol;
declare const CHAPTER_BRAND: unique symbol;
declare const TOPIC_BRAND: unique symbol;

/** A subject, as the student picked it: "Mathematics". */
export type SubjectId = string & { readonly [SUBJECT_BRAND]: true };

/** A chapter within a subject: "Sections of a cone". */
export type ChapterId = string & { readonly [CHAPTER_BRAND]: true };

/**
 * A topic within a chapter: "parabola". THE PRACTICE SCOPE.
 *
 * This is the one the invariant is about. A session is bound to exactly one,
 * and every question it serves must name the same one.
 */
export type TopicId = string & { readonly [TOPIC_BRAND]: true };

/**
 * The only way in.
 *
 * Deliberately not validating. There is no syntactic difference between a topic
 * id and a chapter id -- both are slugs -- so a check here would either reject
 * legitimate ids or pass everything and lie about doing more. What this buys is
 * that every crossing from `string` into the type system is written down, so
 * "where did this id come from" is answerable by grep.
 */
export const asSubjectId = (raw: string): SubjectId => raw as SubjectId;
export const asChapterId = (raw: string): ChapterId => raw as ChapterId;
export const asTopicId = (raw: string): TopicId => raw as TopicId;
