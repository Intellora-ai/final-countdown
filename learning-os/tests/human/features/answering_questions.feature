# What a learner actually spends their time doing: answering, and then looking
# to see whether it counted.
#
# The scenario that matters most here is the retry. A student answering on a
# phone loses signal mid-request more often than any other failure in this file,
# and a system that counts that answer twice has quietly corrupted the record it
# uses to decide what to teach next. That is why `Idempotency-Key` is required
# rather than optional -- the retry that does the damage is the one nobody
# planned.

Feature: Answering questions and seeing progress
  As a learner
  I want my answers recorded once and reflected honestly
  So that what the system believes about me is what I actually did

  Background:
    Given the Learning OS is running
    And I have signed up

  Scenario: My answer is recorded and shows up in my progress
    When I answer "python.recursion.identify_base_case" correctly
    Then the answer is recorded as new
    And my progress lists "python.recursion.identify_base_case"
    And that skill shows 1 piece of evidence

  Scenario: One correct answer does not make me a master
    # THE HONESTY PROPERTY. Getting one question right is not mastery, and a
    # system that says it is has taught the learner to trust a number that has
    # not earned it. This is the claim the whole engine exists to protect.
    When I answer "python.recursion.identify_base_case" correctly
    Then my progress does not say I have mastered "python.recursion.identify_base_case"

  Scenario: A dropped connection does not count my answer twice
    # The phone-on-a-train scenario. The client retries because it never saw the
    # first reply, and the second call must change nothing.
    When I answer "python.recursion.identify_base_case" correctly
    And the connection drops and my client sends the same answer again
    Then the second attempt is reported as a replay
    And that skill still shows 1 piece of evidence

  Scenario: A different answer to the same question is counted separately
    # The other half of the rule above. Idempotency must not swallow a genuine
    # second attempt, or a learner who practises twice is recorded as practising
    # once.
    When I answer "python.recursion.identify_base_case" correctly
    And I answer "python.recursion.identify_base_case" correctly again later
    Then that skill shows 2 pieces of evidence

  Scenario: An answer sent without a retry key is refused
    # Not optional. An optional idempotency key is no idempotency at all.
    When I answer "python.recursion.identify_base_case" without a retry key
    Then I am refused as a bad request

  Scenario: Answering about a skill that does not exist is refused
    # 404 and not 422: the request is perfectly well formed, and no edit to it
    # can make that skill exist.
    When I answer "python.recursion.not_a_real_skill" correctly
    Then I am told that skill does not exist

  Scenario: Practising several times moves the estimate without declaring mastery
    When I answer "python.recursion.identify_base_case" correctly 6 times
    Then that skill shows 6 pieces of evidence
    And my progress does not say I have mastered "python.recursion.identify_base_case"
