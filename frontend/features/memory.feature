Feature: The canvas remembers each student, in each tab, for each lesson

  Anyone can run these. Every one is a thing that really happens to a real
  person, driven through the real program over real HTTP. Nothing is pretend.

  WHAT IS BROKEN TODAY, MEASURED BEFORE THESE WERE WRITTEN.
  `teachStore.ts` keeps canvas memory in the browser under ONE key --
  `TEACH_STORAGE_KEY = 'canvas-teach'` -- for every lesson there is. Switch from
  physics to civics and the physics memory is gone. There is no tab identity
  anywhere in the canvas, so two tabs overwrite each other, and the canvas never
  reads `studentId`, so two students on one machine share one memory.

  The rule underneath all of it: what a student was taught belongs to HER, in
  THAT tab, for THAT lesson, and it survives everything.

  Background:
    Given the canvas memory service is running

  # M1 --- IT SURVIVES
  Scenario: Her work is still there after the server restarts
    Given "ada" has been taught something in tab "tab-1" of lesson "gas"
    When the server is restarted
    Then reading that lesson back returns exactly what she was taught

  Scenario: Her work is still there when she comes back tomorrow
    Given "ada" has been taught something in tab "tab-1" of lesson "gas"
    When she closes everything and opens it again later
    Then reading that lesson back returns exactly what she was taught

  # M2 --- IT NEVER LEAKS
  Scenario: One lesson's memory never appears under another
    Given "ada" has been taught something in tab "tab-1" of lesson "gas"
    And "ada" has been taught something different in tab "tab-1" of lesson "bill"
    Then each lesson returns only its own memory

  Scenario: Two tabs of the same lesson do not overwrite each other
    Given "ada" has been taught something in tab "tab-1" of lesson "gas"
    And "ada" has been taught something different in tab "tab-2" of lesson "gas"
    Then each tab returns only its own memory

  Scenario: One student never sees another student's work
    Given "ada" has been taught something in tab "tab-1" of lesson "gas"
    And "sam" has been taught something different in tab "tab-1" of lesson "gas"
    Then each student returns only their own memory

  # M3 --- IT IS EXACT AND REPEATABLE
  Scenario: Reading the same lesson twice gives the same answer both times
    Given "ada" has been taught something in tab "tab-1" of lesson "gas"
    When that lesson is read twice
    Then both reads are identical

  Scenario: A memory that was never written comes back as nothing, not as junk
    When a lesson nobody has studied is read
    Then the answer is plainly empty

  # THE REAL WORLD IS RUDE
  Scenario Outline: A request with a broken key is refused, never guessed at
    When memory is written with student "<student>", tab "<tab>", lesson "<lesson>"
    Then the write is refused in words

    Examples: keys that must never be accepted
      | student | tab   | lesson |
      |         | tab-1 | gas    |
      | ada     |       | gas    |
      | ada     | tab-1 |        |
      |         |       |        |

  Scenario: A whole class saves at the same moment and nobody loses anything
    When 30 students all save their work at the same moment
    Then all 30 memories are stored and readable

  # WHAT "NEVER STORE A BROKEN RECORD" MEANS FOR A STORE THAT HOLDS ANYTHING.
  #
  # This scenario used to send a record with fields missing and expect a
  # refusal. That was written against an earlier design where the store fixed
  # the shape of a memory -- six named fields, everything else rejected -- and
  # that design was wrong: a store that dictates what it holds has to be edited
  # every time the thing it holds learns something new.
  #
  # The store now holds ANY value and promises one thing about it: what comes
  # out equals what went in, or nothing comes out. So these are the failures it
  # can actually have, and both are real. Whether a memory has all the fields
  # the canvas meant to put in it is the canvas's business, not the store's.
  Scenario: A record too big to hold is refused, and nothing is left behind
    When memory is written with a record larger than the limit
    Then the write is refused in words
    And the lesson still holds nothing

  Scenario: A request with no record at all is refused
    When memory is written with no record at all
    Then the write is refused in words
    And the lesson still holds nothing

  # M4 --- WHAT ALREADY HAPPENED CANNOT UN-HAPPEN
  #
  # Everything above is about BYTES: what she saved comes back, to her, after a
  # crash. These are about MEANING. A save can be perfectly well formed, arrive
  # under the right key and fit well inside the limit, and still be nonsense --
  # because it says less has happened than has already happened, or that her
  # second question came before her first, or that this work belongs to a lesson
  # she is not even in.
  #
  # A memory that accepts nonsense is worse than one that loses things. Losing
  # work is visible. Quietly replacing five steps of a lesson with three is not:
  # she comes back tomorrow, half her afternoon is missing, and every save that
  # did it was answered with a tick.
  #
  # Each of these lessons is one nobody else in this file touches, because these
  # scenarios are about what a save does to work that is ALREADY there, and
  # borrowing another scenario's lesson would mean testing against a starting
  # point that changes whenever that scenario does.

  Scenario: Her lesson remembers more of itself as she works through it
    Given "ada" has uncovered 2 steps of lesson "quadratic" in tab "tab-1"
    When she uncovers 3 more steps of that lesson
    Then the lesson remembers all 5 steps

  Scenario: A save that would forget half of what she has already done is refused
    Given "ada" has uncovered 5 steps of lesson "compound-interest" in tab "tab-1"
    When a save arrives claiming she has uncovered only 3 steps
    Then the save is refused with a sentence naming the problem
    And her earlier work is still exactly as she left it

  Scenario: Two questions she asked in the very same instant are both remembered
    Given "ada" has uncovered 2 steps of lesson "opportunity-cost" in tab "tab-1"
    When she asks two questions that land in the same millisecond
    Then both questions are remembered, in the order she asked them

  Scenario: A save saying her second question came before her first is refused
    Given "ada" has uncovered 2 steps of lesson "gdp" in tab "tab-1"
    When a save arrives with her second question dated before her first
    Then the save is refused with a sentence naming the problem
    And her earlier work is still exactly as she left it

  Scenario: Work filed under the wrong lesson never lands in the other one
    Given "ada" has uncovered 4 steps of lesson "lifo" in tab "tab-1"
    When a save arrives under that lesson carrying work that says it belongs to "civics"
    Then the save is refused with a sentence naming the problem
    And her earlier work is still exactly as she left it
    And lesson "civics" still holds nothing of hers

  Scenario: One refused save does not cost her the next one
    Given "ada" has uncovered 5 steps of lesson "photosynthesis" in tab "tab-1"
    When a save arrives claiming she has uncovered only 2 steps
    Then the save is refused with a sentence naming the problem
    And the canvas memory service is still answering
    And her very next save works and is remembered
