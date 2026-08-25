"""The HTTP surface over the decision engine.

Empty of logic on purpose. `app.build_app` is the entry point; importing it here
would run FastAPI's import chain for anyone touching `learning_os`, and the
engine must stay importable without a web framework installed.
"""
