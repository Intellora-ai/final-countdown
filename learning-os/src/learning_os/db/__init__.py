"""Persistence for the Learning OS.

Empty of logic. `models` holds the schema, `seed` the synthetic dataset. Nothing
is re-exported here: importing `learning_os.db` must not drag SQLAlchemy into a
process that only wanted the decision engine.
"""
