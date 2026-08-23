"""The model boundary: what the LLM is told, what it returns, and what checks it.

Three files, in the order the data moves:

    contract.py    what the policy layer permits, as fields a validator reads
    client.py      the interface, and a deterministic fake that needs no key
    validation.py  whether the returned content honoured the contract

The split is the point. `contract.py` alone is a prompt; it becomes a contract
only because `validation.py` can fail it.
"""

from learning_os.llm.client import (
    API_KEY_ENV,
    FailureMode,
    FakeLLMClient,
    GeneratedContent,
    LLMClient,
    LLMUnavailable,
    api_key_present,
)
from learning_os.llm.contract import (
    DiagnosisKind,
    InstructionContract,
    SimplicityConstraints,
    Strategy,
)
from learning_os.llm.validation import (
    BLOCK_KINDS,
    Violation,
    ViolationKind,
    is_repairable,
    is_usable,
    validate,
)

__all__ = [
    "API_KEY_ENV",
    "BLOCK_KINDS",
    "DiagnosisKind",
    "FailureMode",
    "FakeLLMClient",
    "GeneratedContent",
    "InstructionContract",
    "LLMClient",
    "LLMUnavailable",
    "SimplicityConstraints",
    "Strategy",
    "Violation",
    "ViolationKind",
    "api_key_present",
    "is_repairable",
    "is_usable",
    "validate",
]
