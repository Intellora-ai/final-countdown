"""The model boundary: what the LLM is told, what it returns, and what checks it.

Four files, in the order the data moves:

    contract.py    what the policy layer permits, as fields a validator reads
    client.py      the interface, and a deterministic fake that needs no key
    select.py      which implementation this environment asked for
    validation.py  whether the returned content honoured the contract

The split is the point. `contract.py` alone is a prompt; it becomes a contract
only because `validation.py` can fail it.

THE LIVE ADAPTERS ARE NOT RE-EXPORTED HERE, ON PURPOSE.
`anthropic_client`, `gemini_client` and `groq_client` are reachable by their
full path and by `select.client_from_env`, and by nothing else. Importing this
package must not pull a vendor adapter into a process that only wanted the
contract types -- that is what keeps "the SDK is optional" a fact about the
import graph rather than a promise about how carefully people import.

Their CREDENTIAL NAMES are exported, and that is not an inconsistency. A name is
not a vendor: `api/speak.py` and `api/ask.py` have to be able to tell somebody
which variable to export without importing the adapter that reads it, and the
value itself is never read here -- see `client.api_key_present`.
"""

from learning_os.llm.client import (
    API_KEY_ENV,
    GEMINI_API_KEY_ENV,
    GROQ_API_KEY_ENV,
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
from learning_os.llm.select import (
    DEFAULT_PROVIDER,
    PROVIDER_ENV,
    PROVIDERS,
    client_from_env,
    configured_provider,
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
    "DEFAULT_PROVIDER",
    "GEMINI_API_KEY_ENV",
    "GROQ_API_KEY_ENV",
    "PROVIDERS",
    "PROVIDER_ENV",
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
    "client_from_env",
    "configured_provider",
    "is_repairable",
    "is_usable",
    "validate",
]
