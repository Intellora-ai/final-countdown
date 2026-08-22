import type { BoardSource } from '../types/learningBoard'

/* UNSUPPORTED BLOCK TYPES — preserved, never executed, never silently dropped.
 *
 * A block type this build cannot draw is a gap in the build, not a fault in
 * the content. Dropping it would tell the learner nothing was there; rendering
 * whatever payload came with it would hand presentation to the content. The
 * validator does neither: it keeps the id and the original type name, discards
 * the payload entirely, and the registry draws a visible placeholder.
 *
 * The payloads below are the reason the discard matters. Each one is an
 * attempt to smuggle something executable or presentational through a type the
 * validator has no schema for — HTML, a style object, a component name, a
 * script source. All of it is thrown away before anything reaches React.
 *
 * Expected: status 'repaired', with the two valid explanations intact.
 */
export const UNSUPPORTED_BLOCKS_BOARD: BoardSource = {
  type: 'learning_board',
  version: 1,
  id: 'board-unsupported-blocks',
  title: 'Blocks this build cannot draw',
  subtitle: 'Kept as placeholders, stripped of everything they were carrying',
  layout: 'grid',
  blocks: [
    {
      id: 'unsup-intro',
      type: 'explanation',
      title: 'A gap you can see is better than a gap you cannot',
      content:
        'When a board arrives with a block type this build does not implement, the honest response is to say so in the place the block would have been. The learner then knows something is missing and can ask about it, instead of reading a board with a hole in the argument.',
    },
    {
      id: 'unsup-holo',
      /* Unknown type carrying markup. */
      type: 'holographic_projection',
      title: 'A projection from a later build',
      html: '<script>alert(1)</script><p style="color:red">rendered?</p>',
      style: { background: 'hotpink', fontSize: '48px' },
    },
    {
      id: 'unsup-widget',
      /* Unknown type carrying a component reference and a URL. */
      type: 'remote_widget',
      title: 'A widget that wants to be loaded',
      component: 'RemoteWidget',
      src: 'https://example.com/widget.js',
      props: { autoplay: true, token: 'not-a-real-token' },
    },
    {
      id: 'unsup-outro',
      type: 'explanation',
      title: 'What survived',
      content:
        'Both placeholders above kept their id and the name of the type that was asked for. Everything else they arrived with — markup, styles, a component name, a script URL — was discarded at the door and never reached the renderer.',
    },
  ],
  metadata: { source: 'fixture' },
}
