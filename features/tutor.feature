Feature: A student uses the tutor
  Anyone can run these. Each one is a thing that really happens to a real
  person, driven through the real program — a real process, real typing in,
  real answer out. Nothing here is pretend.

  The one rule underneath all of it: the tutor must never make an answer up,
  and must never show a child the inside of the program.

  Scenario: Ada asks a real question
    Given a student called "ada"
    When she asks "why does recursion need a base case?"
    Then she gets a lesson she can read
    And the lesson is about the thing she asked
    And she is never shown the inside of the program

  Scenario: Ada asks about something the tutor does not teach
    Given a student called "ada"
    When she asks "how do I bake a chocolate cake?"
    Then the tutor says it does not cover that
    And no lesson is invented
    And she is never shown the inside of the program

  Scenario Outline: The tutor refuses to guess, whatever the subject
    Given a student called "sam"
    When she asks "<question>"
    Then the tutor says it does not cover that

    Examples: things this tutor does not teach
      | question                           |
      | what is the capital of France?     |
      | who won the world cup in 1998?     |
      | should I buy this stock?           |

  Scenario: Ada presses enter on an empty box
    Given a student called "ada"
    When she sends nothing at all
    Then the tutor answers with a document a program can read
    And she is never shown the inside of the program

  Scenario: Ada sends only spaces
    Given a student called "ada"
    When she sends only whitespace
    Then the tutor answers with a document a program can read
    And she is never shown the inside of the program

  Scenario Outline: The request arrives broken
    Given a student called "ada"
    When she sends the raw request "<raw>"
    Then the tutor answers with a document a program can read
    And she is never shown the inside of the program

    Examples: every way input arrives wrong
      | raw                  |
      | not json at all      |
      | {                    |
      | []                   |
      | {"text": null}       |
      | {"wrong_field": "x"} |

  Scenario: Ada refreshes and asks again
    Given a student called "ada"
    When she asks "why does recursion need a base case?"
    And she asks the same thing again
    Then both answers are usable

  Scenario: The whole class asks at once
    Given a class of 12 students
    When they all ask at the same moment
    Then every student gets their own answer
    And nobody gets another student's lesson

  Scenario: A school laptop with no API key
    Given a student called "ada"
    And there is no API key configured
    When she asks "why does recursion need a base case?"
    Then she still gets a lesson she can read
    And the answer says which provider produced it
