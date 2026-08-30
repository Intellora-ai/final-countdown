"""Steps for a student's day. Every one drives the running app over HTTP."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from behave import given, then, when

from environment import get, post


def _student(context, name: str) -> str:
    """A stable, per-scenario identity, so scenarios cannot contaminate one another."""
    return context.students.setdefault(name, f"stu_{name}_{context.suffix}")


def _open_day(context, name: str, date: str) -> dict:
    student = _student(context, name)
    status, body = post(context, "/api/day", {
        "studentId": student,
        "date": date,
        "schoolClass": context.school_class[name],
        "dailyMinutes": context.minutes[name],
        "subjectIds": ["mathematics", "science"],
    })
    assert status == 200, f"opening the app returned {status}: {body}"
    day = body["day"]
    context.day[name] = day
    return day


@given("the app is running")
def step_app_running(context) -> None:
    status, _, _ = get(context, "/api/health")
    assert status == 200, f"the app is not answering: {status}"
    context.school_class = {}
    context.minutes = {}


@given('{name} is in class {klass:d} and has {minutes:d} minutes to study today')
def step_a_student(context, name: str, klass: int, minutes: int) -> None:
    context.school_class[name] = klass
    context.minutes[name] = minutes
    _student(context, name)


@when('she opens the app on "{date}"')
@given('she opened the app on "{date}"')
def step_opens(context, date: str) -> None:
    context.today = date
    _open_day(context, "Arya", date)


@then("she is given topics to study")
def step_given_topics(context) -> None:
    items = context.day["Arya"]["items"]
    assert len(items) > 0, "the day came back with nothing to study"
    for item in items:
        assert item["conceptId"], f"a topic with no concept: {item}"


@then("the time planned does not exceed the {minutes:d} minutes she has")
def step_within_capacity(context, minutes: int) -> None:
    day = context.day["Arya"]
    assert day["allocated"] <= minutes, (
        f"planned {day['allocated']} minutes for a student who has {minutes}"
    )


@then("every topic tells her which subject it belongs to")
def step_topics_have_subjects(context) -> None:
    for item in context.day["Arya"]["items"]:
        assert item.get("subjectId"), f"a topic with no subject: {item}"


@when("she reloads the page twice")
def step_reloads(context) -> None:
    context.reloads = [_open_day(context, "Arya", context.today) for _ in range(2)]


@then("she sees the same topics every time")
def step_same_topics(context) -> None:
    first = [i["conceptId"] for i in context.day["Arya"]["items"]]
    for reload_number, day in enumerate(context.reloads, start=1):
        again = [i["conceptId"] for i in day["items"]]
        assert again == first, (
            f"reload {reload_number} changed her day.\n  before: {first}\n  after:  {again}"
        )


@when("she finishes her first topic and marks it done")
@given("she finishes her first topic and marks it done")
@when("Arya finishes her first topic and marks it done")
def step_marks_done(context) -> None:
    context.finished = context.day["Arya"]["items"][0]["conceptId"]
    status, body = post(context, "/api/done", {
        "studentId": _student(context, "Arya"),
        "conceptId": context.finished,
    })
    assert status == 200, f"marking done returned {status}: {body}"


@when("the next day arrives")
def step_next_day(context) -> None:
    context.tomorrow = "2026-09-02"
    _open_day(context, "Arya", context.tomorrow)


@then("that topic is not in tomorrow's plan")
def step_not_tomorrow(context) -> None:
    again = [i["conceptId"] for i in context.day["Arya"]["items"]]
    assert context.finished not in again, (
        f"a topic she already finished came back the next day: {context.finished}"
    )


@when('she returns on "{date}"')
def step_returns(context, date: str) -> None:
    _open_day(context, "Arya", date)


@then("that topic is still not given back to her")
def step_still_not_given(context) -> None:
    again = [i["conceptId"] for i in context.day["Arya"]["items"]]
    assert context.finished not in again, (
        f"a week later the app forgot she had finished {context.finished}"
    )


@given('Ben is in class {klass:d} and has {minutes:d} minutes to study today')
def step_ben(context, klass: int, minutes: int) -> None:
    context.school_class["Ben"] = klass
    context.minutes["Ben"] = minutes
    _student(context, "Ben")


@then("Ben has not been marked as finishing anything")
def step_ben_untouched(context) -> None:
    ben_day = _open_day(context, "Ben", context.today)
    topics = [i["conceptId"] for i in ben_day["items"]]
    assert context.finished in topics, (
        "Arya finishing a topic removed it from Ben's plan too -- their progress is shared"
    )


@when('a friend opens the link "{path}"')
@when('she refreshes on "{path}"')
def step_opens_path(context, path: str) -> None:
    context.page = get(context, path)


@then("they get the app, not an error page")
@then("she gets the app, not an error page")
def step_gets_the_app(context) -> None:
    status, content_type, body = context.page
    assert status == 200, f"the link returned {status}, so it is broken for whoever opens it"
    assert "text/html" in content_type, f"expected a page, got {content_type}"
    assert "<div id=\"root\"" in body or "<html" in body, "that is not the app's page"


@given("a class of {count:d} students on one school connection")
def step_a_class(context, count: int) -> None:
    context.classroom = [f"stu_class_{i}_{context.suffix}" for i in range(count)]


@when("every one of them opens the app at the same time")
def step_classroom_opens(context) -> None:
    def open_for(student: str) -> tuple[int, dict]:
        return post(context, "/api/day", {
            "studentId": student,
            "date": "2026-09-01",
            "schoolClass": 10,
            "dailyMinutes": 60,
            "subjectIds": ["mathematics", "science"],
        })

    with ThreadPoolExecutor(max_workers=30) as pool:
        context.classroom_results = list(pool.map(open_for, context.classroom))


@then("every student gets their day")
def step_every_student_served(context) -> None:
    failed = [(s, b) for s, b in context.classroom_results if s != 200]
    assert not failed, f"{len(failed)} of {len(context.classroom_results)} students got nothing: {failed[:3]}"
    for _, body in context.classroom_results:
        assert body["day"]["items"], "a student got an empty day"


@then("no student is turned away")
def step_none_turned_away(context) -> None:
    refused = [s for s, _ in context.classroom_results if s == 429]
    assert not refused, f"{len(refused)} students in one classroom were rate-limited"


@when("Arya asks for a lesson while the model is unreachable")
def step_asks_with_model_down(context) -> None:
    context.lesson = post(context, "/api/lesson", {"concept": "Fundamental Theorem of Arithmetic"})


@then("she is told the lesson could not be written")
def step_told_it_failed(context) -> None:
    status, body = context.lesson
    assert status >= 400, f"a lesson came back {status} while the model was unreachable: {body}"
    assert body.get("error"), f"a failure with no explanation in it: {body}"


@then("she is not shown an empty page that looks like it worked")
def step_not_silently_empty(context) -> None:
    status, body = context.lesson
    assert status != 200, "the app reported success while the model was unreachable"
    assert "lesson" not in body, f"an empty lesson was returned as if it were one: {body}"


@when("someone sends {count:d} lesson requests as fast as they can")
def step_flood(context, count: int) -> None:
    def one(_: int) -> int:
        status, _body = post(context, "/api/lesson", {"concept": "anything"})
        return status

    with ThreadPoolExecutor(max_workers=16) as pool:
        context.flood = list(pool.map(one, range(count)))


@then("they start being refused")
def step_refused(context) -> None:
    refused = [s for s in context.flood if s == 429]
    assert refused, (
        f"{len(context.flood)} requests, none refused. Status codes seen: "
        f"{sorted(set(context.flood))}. Nothing caps the spend."
    )


@then("the app still answers other students")
def step_still_answers(context) -> None:
    status, _, _ = get(context, "/api/health")
    assert status == 200, "the flood took the app down for everyone"


@given("the app is also running on a second server sharing the same storage")
def step_second_server(context) -> None:
    from environment import start_replica

    context.second = start_replica(context)


@when("she marks {count:d} topics done, her requests landing on either server")
def step_marks_across_replicas(context, count: int) -> None:
    """A load balancer does not care which copy answers, and neither does she."""
    student = _student(context, "Arya")
    context.marked = [f"topic-{i}" for i in range(count)]

    def mark(index_and_topic: tuple[int, str]) -> int:
        index, topic = index_and_topic
        base = context.base if index % 2 == 0 else context.second
        status, _body = post(context, "/api/done", {
            "studentId": student, "conceptId": topic,
        }, base=base)
        return status

    with ThreadPoolExecutor(max_workers=10) as pool:
        context.mark_results = list(pool.map(mark, list(enumerate(context.marked))))


@then("all {count:d} are still recorded")
def step_all_recorded(context, count: int) -> None:
    failed = [s for s in context.mark_results if s != 200]
    assert not failed, f"{len(failed)} marks were refused outright: {failed[:5]}"

    # Ask for a day far enough ahead that every marked topic would be offered
    # again if it had been forgotten, then read what the server still believes.
    from environment import read_done

    recorded = read_done(context, _student(context, "Arya"))
    lost = [t for t in context.marked if t not in recorded]
    assert not lost, (
        f"{len(lost)} of {count} topics she finished were forgotten: {lost[:8]}. "
        "A second server erased what the first one recorded."
    )
