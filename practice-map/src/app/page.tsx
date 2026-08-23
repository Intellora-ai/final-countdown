import { redirect } from "next/navigation";

/**
 * There is one screen in this workspace, and it is not at the root.
 *
 * A redirect rather than rendering the map here as well: two routes rendering
 * the same component is two places to keep in step, and the map's URL is
 * `/practice` in every link and screenshot.
 */
export default function Home() {
  redirect("/practice");
}
