# Browsing what there is to learn, and asking for a lesson.
#
# The lesson route runs the deterministic fake LLM -- the same `FakeLLMClient`
# the committed fixture is built from -- so these scenarios need no key and no
# network. That is not a testing convenience. A suite that needs a real model is
# a suite that gets skipped the first time a key expires, and the scenarios that
# then stop running are exactly the ones asserting the engine does not fabricate
# what it teaches.

Feature: Being taught
  As a learner
  I want to see what there is to learn and ask for a lesson
  So that I can start on something real rather than guess

  Background:
    Given the Learning OS is running

  Scenario: I can see what there is to learn
    When I browse the concepts
    Then I am shown at least one concept
    And every concept tells me how many subskills it has

  Scenario: I can narrow the list to one subject
    When I browse the concepts for the "python" subject
    Then every concept I am shown belongs to "python"

  Scenario: Asking for more than exists gives me an empty page, not an error
    # A caller paging through results runs off the end. That is normal, and it
    # must look like the end of a list rather than a fault.
    When I browse the concepts starting from position 1000
    Then I am shown no concepts
    And I am still told the real total

  Scenario: I ask for a lesson and get one I can read
    When I ask for a lesson on "python.recursion.identify_base_case" because "Why does my factorial never stop?"
    Then I am given a lesson
    And the lesson repeats back the question I asked
    And the lesson has something in it to read

  Scenario: I ask for a lesson on a skill that does not exist
    When I ask for a lesson on "python.recursion.not_a_real_skill" because "What is this?"
    Then I am told that skill does not exist

  Scenario: I ask for a lesson with a blank question
    # A question made only of spaces is not a question. It is refused as a bad
    # request, with the field named, rather than answered with something invented.
    When I ask for a lesson on "python.recursion.identify_base_case" because "   "
    Then I am refused as a bad request
    And the refusal names the "question" field
