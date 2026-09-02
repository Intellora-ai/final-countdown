/**
 * THE FAST PATH FOR THINGS THAT ARE CONVERSATION AND NOTHING ELSE.
 *
 * "hi", "thanks", "ok". Today each of these pays the controller's model call
 * before anything can answer -- ten seconds of silence for a hello on a
 * laptop model, and a metered call on a hosted one. The owner's brief is
 * explicit: a greeting gets a greeting; the expensive path is earned by the
 * request.
 *
 * THIS IS NOT THE INTENT SYSTEM. It is a short, explicit, tested list of the
 * phrases people type that carry no request at all. It answers `null` for
 * anything it does not recognise whole -- a greeting with a question attached,
 * a bare "what", a topic -- and those go to the model's controller exactly as
 * before. It is deliberately dumb so that the thing behind it can stay smart.
 *
 * NEVER INSIDE A LESSON. Typed while a lesson is on screen, "ok" and "got it"
 * are answers -- evidence of what landed -- and the model must read them. The
 * handler applies this only to a message with no lesson around it.
 */

export type SmallTalk = 'greeting' | 'thanks' | 'ack'

const GREETINGS = new Set([
  'hi', 'hii', 'hiii', 'hlo', 'helo', 'hello', 'hey', 'heya', 'yo', 'hola', 'sup', 'wassup',
  'namaste', 'namaskar', 'good morning', 'good afternoon', 'good evening',
  'hello there', 'hi there', 'hey there', 'hi hi', 'hello hello',
])
const THANKS = new Set([
  'thanks', 'thank you', 'thank u', 'thx', 'ty', 'thanks a lot', 'thank you so much', 'thanks so much',
  'shukriya', 'dhanyavad', 'dhanyawad',
])
const ACKS = new Set([
  'ok', 'okay', 'k', 'kk', 'cool', 'got it', 'fine', 'sure', 'alright', 'nice', 'great',
  'bye', 'goodbye', 'good night', 'see you', 'see ya', 'done', 'theek hai', 'thik hai', 'acha', 'achha',
])

/** Lower-cased, punctuation and emoji stripped, one space between words. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function smallTalk(text: string): SmallTalk | null {
  const said = plain(text)
  if (said === '' || said.split(' ').length > 3) return null
  if (GREETINGS.has(said)) return 'greeting'
  if (THANKS.has(said)) return 'thanks'
  if (ACKS.has(said)) return 'ack'
  return null
}

/** What is said back. Plain words, and the box stays open. */
export const SMALL_TALK_REPLY: Readonly<Record<SmallTalk, string>> = {
  greeting: "Hi! What would you like to learn today? Type any topic and I'll write it for you.",
  thanks: "You're welcome. Ask me anything else whenever you're ready.",
  ack: "Okay. Whenever you want more, just type what you'd like to learn next.",
}
