# Written from the student's day, not from the code's shape.
#
# Every scenario below is a thing that happens to a real person using this to
# study. None of them mention a function, a type, or a status code in the title,
# because none of those are what goes wrong for a learner. What goes wrong is:
# they lose a day's work, the page breaks when they share it, their friend's
# progress shows up as theirs, or the whole class gets locked out at once.

Feature: Studying with the Learning Canvas
  As a student preparing for my CBSE exams
  I want the app to plan my day, remember what I finished, and keep working
  So that I can trust it with a year of revision

  Background:
    Given the app is running

  Scenario: Arya opens the app on a school morning
    Given Arya is in class 10 and has 60 minutes to study today
    When she opens the app on "2026-09-01"
    Then she is given topics to study
    And the time planned does not exceed the 60 minutes she has
    And every topic tells her which subject it belongs to

  Scenario: The day does not reshuffle while she is looking at it
    Given Arya is in class 10 and has 60 minutes to study today
    When she opens the app on "2026-09-01"
    And she reloads the page twice
    Then she sees the same topics every time

  Scenario: A topic she finished does not come back tomorrow
    Given Arya is in class 10 and has 60 minutes to study today
    And she opened the app on "2026-09-01"
    When she finishes her first topic and marks it done
    And the next day arrives
    Then that topic is not in tomorrow's plan

  Scenario: Coming back after a week, her progress is still there
    Given Arya is in class 10 and has 60 minutes to study today
    And she opened the app on "2026-09-01"
    And she finishes her first topic and marks it done
    When she returns on "2026-09-08"
    Then that topic is still not given back to her

  Scenario: Two students on the same school wifi do not share progress
    Given Arya is in class 10 and has 60 minutes to study today
    And Ben is in class 10 and has 60 minutes to study today
    And she opened the app on "2026-09-01"
    When Arya finishes her first topic and marks it done
    Then Ben has not been marked as finishing anything

  Scenario: Sharing a link to a lesson works when a friend opens it
    When a friend opens the link "/learn/real-numbers"
    Then they get the app, not an error page

  Scenario: Refreshing in the middle of a lesson does not break it
    When she refreshes on "/canvas/gas"
    Then she gets the app, not an error page

  Scenario: A whole class of 30 studying at once
    Given a class of 30 students on one school connection
    When every one of them opens the app at the same time
    Then every student gets their day
    And no student is turned away

  Scenario: The teaching model being down is explained, not hidden
    When Arya asks for a lesson while the model is unreachable
    Then she is told the lesson could not be written
    And she is not shown an empty page that looks like it worked

  Scenario: Nobody can spend the project's budget by asking in a loop
    When someone sends 400 lesson requests as fast as they can
    Then they start being refused
    And the app still answers other students

  # THE SCENARIO THAT FAILS TODAY.
  #
  # A cloud deployment runs more than one copy of the server behind a load
  # balancer -- that is what "scales" means. Each copy keeps the ledger in its
  # own memory and writes the whole file back, so whichever copy saves last
  # erases what the other one recorded. Measured before this was written: 60
  # marks split across two replicas, 28 of them gone.
  #
  # A student does not experience this as a race condition. They experience it
  # as the app forgetting a day of work.
  Scenario: Progress survives the app running on more than one server
    Given the app is also running on a second server sharing the same storage
    And Arya is in class 10 and has 60 minutes to study today
    When she marks 20 topics done, her requests landing on either server
    Then all 20 are still recorded
