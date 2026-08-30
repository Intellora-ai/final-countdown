# Code a learner types into the box, which this system then RUNS.
#
# WHAT THIS FILE CLAIMS, AND WHAT IT DOES NOT.
#
# `run_python` executes the submission with `-I -S`, in a temporary working
# directory, under a timeout. That buys four specific properties, and each one
# below is a scenario because each one is a thing a learner could otherwise do.
#
# It is NOT a general sandbox, and this file will not pretend it is. MEASURED on
# this branch: a submission can still `import subprocess` and run a command, and
# can still read a file such as /etc/passwd. Those are stdlib, and `-I -S`
# removes import PATHS, not capabilities.
#
# That absence is written down rather than left to be discovered, for the same
# reason the engine refuses to report mastery it has not evidenced: a scenario
# file that quietly implies containment it does not have is worse than no
# scenario file, because the next person reads it as a guarantee and stops
# looking. Real confinement is an OS-level job -- a container, a seccomp filter,
# a separate user -- and none of that exists here yet.

Feature: Code a learner submits
  As the operator of a system that runs other people's code
  I want a submission kept away from the machinery that marks it
  So that a learner cannot rewrite their own grade or read the answers

  Scenario: A submission cannot reach the engine that is marking it
    # The one that would actually go wrong: an exercise reaching into the engine
    # and editing the code deciding whether it passed.
    Given a learner has written some code
      """
      import learning_os
      """
    When the system runs it
    Then it fails
    And the reason is that the module could not be found

  Scenario: A submission cannot reach a package the engine has installed
    # The stronger half. The engine is on PYTHONPATH, which `-I` strips anyway,
    # so the scenario above can pass for a reason that has nothing to do with
    # the guard. pydantic is in real site-packages -- exactly where the engine
    # sits once deployed -- so this is the one that fails if `-S` is dropped.
    Given a learner has written some code
      """
      import pydantic
      """
    When the system runs it
    Then it fails
    And the reason is that the module could not be found

  Scenario: Text in a submission does not become a shell command
    Given a learner has written some code
      """
      x = '; echo owned'
      print('safe')
      """
    When the system runs it
    Then it succeeds
    And it printed "safe"
    And it did not print "owned"

  Scenario: Code that never stops is cut off instead of hanging the service
    # A student writes a loop with no exit. Without a timeout that request never
    # returns and the next learner waits behind it.
    Given a learner has written some code
      """
      while True:
          pass
      """
    When the system runs it with a 2 second limit
    Then it is cut off for taking too long

  Scenario: Recursion with no base case is named as such, not just "wrong"
    # The single most diagnostic outcome in this subject. "Your code is wrong"
    # and "your code never stops" call for different next moves from the
    # teacher, so the system must not collapse them into one failure.
    Given a learner has written some code
      """
      def f(n):
          return f(n - 1)
      f(5)
      """
    When the system runs it
    Then it fails
    And it is reported as running away rather than as an ordinary error

  Scenario: An escape attempt is still marked wrong
    # Refusing the import is not enough on its own. If the submission then
    # counted as a pass, a learner would be rewarded for trying.
    Given a learner submits this as their answer to "write a factorial"
      """
      import learning_os

      def factorial(n):
          return 1
      """
    When the answer is marked
    Then the answer does not pass
    And the mark states what it did not check
