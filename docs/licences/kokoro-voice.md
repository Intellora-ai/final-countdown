# Open-source voice dependencies

Verified 2026-10-14 from installed package licence files and public model metadata. All are Apache-2.0; commercial use is permitted subject to the licence/notice obligations. Packages carry their upstream licence files in deployment dependencies.

| Package | Exact version | Publisher | Official source | Licence text SHA-256 | Status |
|---|---|---|---|---|---|
| kokoro-js | 1.2.1 | hexgrad/Kokoro.js | https://github.com/hexgrad/kokoro/tree/main/kokoro.js | c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | direct |
| @huggingface/transformers | 3.8.1 | Hugging Face | https://github.com/huggingface/transformers.js/blob/main/LICENSE | cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30 | direct |
| phonemizer | 1.2.1 | Xenova | https://github.com/xenova/phonemizer.js | c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | transitive |

Model: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231 . The actual Hugging Face model metadata identifies Apache-2.0; the immutable revision is pinned in the adapter. Verification: `sha256sum frontend/node_modules/{kokoro-js,@huggingface/transformers,phonemizer}/LICENSE`; model metadata retrieved from the official Hugging Face API. ONNX Runtime is MIT and Sharp Apache-2.0; patched versions are lockfile-pinned. Upstream distribution licence/notice files remain included.
