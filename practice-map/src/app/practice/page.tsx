import type { Metadata } from "next";

import { PracticeCanvas } from "@/components/PracticeCanvas";

/**
 * The practice map.
 *
 * Thin on purpose: the route names the screen and nothing else. The curriculum
 * is a module import rather than a fetch, so the map's structure is in the
 * first response — there is no spinner that resolves into a syllabus.
 */

export const metadata: Metadata = {
  title: "Practice",
  description: "Your syllabus as a map. Pick a chapter or a topic to practise.",
};

export default function PracticePage() {
  return <PracticeCanvas />;
}
