"""The instruction policy: the layer that decides, and can say why.

Everything else in the engine describes a learner or checks an answer. This is
the only module that CHOOSES, which makes it the only module whose absence would
leave two different learners receiving the same lesson.
"""

from learning_os.policy.select import (
    BottleneckLike,
    Decision,
    ReasonCode,
    choose_strategy,
    select_action,
)

__all__ = [
    "BottleneckLike",
    "Decision",
    "ReasonCode",
    "choose_strategy",
    "select_action",
]
