# A person arriving with nothing: no account, no history, and no reason yet to
# trust what this system tells them.
#
# Every step below is a real call to a real route. Nothing here is a mock, and
# nothing here describes a feature the app does not have -- there is no
# password, no email and no session, because the app has none. Signing up IS
# `POST /learners`, and saying otherwise in a feature file would make this
# document a wish rather than a description.

Feature: Signing up
  As someone who wants to learn
  I want to join and be remembered
  So that the work I do is attributed to me and not lost

  Background:
    Given the Learning OS is running

  Scenario: A new learner joins and is remembered
    When I sign up for the "y11" cohort on the "python" stream
    Then I am given a learner id
    And looking myself up returns the cohort and stream I signed up with

  Scenario: A learner who names no stream is still a learner
    # `stream` is optional and `cohort` is not. A person who does not know which
    # stream they are on must still be able to start.
    When I sign up for the "y11" cohort with no stream
    Then I am given a learner id
    And my stream is empty

  Scenario: Signing up with no cohort is refused, and the refusal says which field
    # "Invalid request" is not something a person can act on. The field and the
    # reason are what turn a rejection into a fix.
    When I sign up with an empty cohort
    Then I am refused as a bad request
    And the refusal names the "cohort" field

  Scenario: A brand new learner is told to be diagnosed, not taught
    # The honesty property, at the very first moment it can be broken. Nothing
    # is known about this person, so the only defensible next move is to find
    # out -- not to pick a lesson and pretend the choice was informed.
    Given I have signed up
    When I ask what I should do next
    Then I am told to "diagnose"
    And no skill is named, because nothing is known about me yet

  Scenario: A learner id that was never issued is not honoured
    When I ask for the progress of learner "00000000-0000-4000-8000-000000000000"
    Then I am told that learner does not exist
