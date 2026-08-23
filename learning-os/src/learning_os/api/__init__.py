"""The canvas boundary: emitting a lesson the existing schema will accept.

There is no second `LessonSpec`. The canvas defines it in
`frontend/src/canvas/spec/spec.ts`; this package produces `LessonInput`-shaped
payloads for it and `validateLesson` remains the only adapter.
"""

from learning_os.api.emit import (
    EMPHASIS,
    MAX_BLOCKS,
    MAX_PROSE,
    MAX_QUESTION,
    MAX_RELATIONS,
    RELATION_KINDS,
    TEXT_BLOCK_KINDS,
    EmitError,
    Lesson,
    emit,
    slug,
)

__all__ = [
    "EMPHASIS",
    "MAX_BLOCKS",
    "MAX_PROSE",
    "MAX_QUESTION",
    "MAX_RELATIONS",
    "RELATION_KINDS",
    "TEXT_BLOCK_KINDS",
    "EmitError",
    "Lesson",
    "emit",
    "slug",
]
