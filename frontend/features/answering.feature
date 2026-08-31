Feature: A student asks this server something, on a real machine

  Anyone can run these. Every one is a thing that really happens to a real
  person, driven through the real program over real HTTP -- a real process, a
  real socket, a real request in, a real answer out. Nothing here is pretend.

  Every scenario runs with NO vendor key and with the model deliberately
  unreachable, because that is the state most machines are really in: a fresh
  clone, an expired key, or school wifi that is down. The rule underneath all
  of it: whatever is broken behind the scenes, the person in front of the
  screen is answered in words she can act on, and is never shown the inside of
  the program.

  Scenario: The server still answers while the model is unreachable
    Given the server is running with no key and no model behind it
    When a student asks "why does heating a gas raise its pressure?"
    Then she gets an answer she can read
    And she is never shown the inside of the program
    And no credential appears anywhere in the answer

  Scenario: She is told what happened, not given a number
    Given the server is running with no key and no model behind it
    When a student asks "what is kinetic energy?"
    Then the answer explains itself in words
    And the answer contains no bare status code

  Scenario Outline: Every way a request arrives broken
    Given the server is running with no key and no model behind it
    When the raw request "<body>" arrives at "/api/ask"
    Then the server answers with a document a program can read
    And she is never shown the inside of the program

    Examples: things that really get sent
      | body                    |
      | {"question": ""}        |
      | {"question": null}      |
      | {"wrong_field": "x"}    |
      | {}                      |
      | not json at all         |
      | {"question": "  "}      |

  Scenario: A question longer than any child would type
    Given the server is running with no key and no model behind it
    When a student asks a question of 20000 characters
    Then the server answers with a document a program can read
    And she is never shown the inside of the program

  Scenario: The whole class asks at once
    Given the server is running with no key and no model behind it
    When 12 students all ask at the same moment
    Then every student gets their own answer
    And nobody gets another student's answer

  Scenario: She asks the same thing twice
    Given the server is running with no key and no model behind it
    When a student asks "what is pressure?"
    And she asks the same thing again
    Then both answers are usable

  Scenario: The server says it is alive even when the model is not
    Given the server is running with no key and no model behind it
    When anyone checks whether the server is up
    Then it says it is up
    And she is never shown the inside of the program

  Scenario: A route nobody wrote is refused in words
    Given the server is running with no key and no model behind it
    When the raw request "{}" arrives at "/api/does-not-exist"
    Then the server answers with a document a program can read
    And she is never shown the inside of the program

  Scenario: A school laptop with nothing configured at all
    Given a machine with no key and no model named
    When the server is started
    Then it says exactly how to configure a model
    And it names every way that is supported
    And she is never shown the inside of the program

  # ONE PART AT A TIME -- invariant I3.
  #
  # The lecture must not be written before she reads a word of it. The server
  # is told what she has already been shown and what she just said, and asked
  # for the NEXT part only. This drives that over real HTTP.
  #
  # With no model reachable it cannot check what the model WROTE -- that needs
  # a key, and this suite deliberately runs without one. What it does check is
  # that the request carrying a lesson-in-progress is accepted and acted on
  # rather than rejected, which is the half that can rot silently.
  Scenario: The next part is asked for, not pre-written
    Given the server is running with no key and no model behind it
    When she asks to carry on from what she has already been taught
    Then the server accepts a lesson-in-progress
    And she is never shown the inside of the program

  Scenario: A part request with nothing taught yet is still a fair question
    Given the server is running with no key and no model behind it
    When she asks to carry on having been taught nothing yet
    Then the server accepts a lesson-in-progress
    And she is never shown the inside of the program

  # THE INCIDENT THIS SUITE EXISTS FOR.
  #
  # `run-real-tests.sh` records it in one line: "390 were green while two
  # replicas lost 28 of 60 students' marks." This is that, reproduced. Two
  # servers, one shared store, one mark each. Both marks must survive.
  #
  # A single server can never show this. It is only ever wrong when two are
  # running, which is why every unit test in the project missed it.
  # AT THE SAME MOMENT, and that word is the whole test.
  #
  # Written first as "mark on one, then mark on the other" -- and it PASSED on
  # the first run, which CLAUDE.md calls a smell rather than a success. It
  # passed because sequential marks never overlap: the second server loads
  # after the first has already saved, so it sees the first mark and keeps it.
  #
  # The defect needs both servers to LOAD before either SAVES. That is what a
  # class of students on two replicas does every minute of a school day.
  Scenario: Two servers are marking work done at the same moment
    Given two servers are running against the same shared store
    When 20 concepts are marked done across both servers at the same moment
    Then every one of those concepts is still marked done
    And neither server has overwritten the other
