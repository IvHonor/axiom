//! Every notification Axiom sends, by extension. The ids are also the
//! `kind`s in `axiom_protocol::notify::Digest`.

use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime, Weekday};
use serde::Serialize;

#[derive(Clone, Copy, Debug)]
pub enum When {
    /// Every day at this hour.
    Daily(u32),
    /// Once a week on this day, at this hour.
    Weekly(Weekday, u32),
    /// On the first of the month, at this hour.
    Monthly(u32),
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Kind {
    pub id: &'static str,
    /// The extension's id, as in `src/extensions`.
    pub extension: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    /// Can be emailed (see `axiom_protocol::notify::EMAIL_KINDS`).
    pub email: bool,
    #[serde(skip)]
    pub when: When,
}

/// Digests come on the hour: the server wakes then to send emails.
pub const KINDS: &[Kind] = &[
    Kind {
        id: "project_board.deadlines",
        extension: "project_board",
        label: "Deadlines",
        description: "Cards that are overdue, due today or due tomorrow. Every morning at 8.",
        email: true,
        when: When::Daily(8),
    },
    Kind {
        id: "daily_plan.agenda",
        extension: "daily_plan",
        label: "Morning agenda",
        description: "Your blocks, meetings and top priorities for the day. Every morning at 7.",
        email: true,
        when: When::Daily(7),
    },
    Kind {
        id: "daily_plan.deadlines",
        extension: "daily_plan",
        label: "Deadlines",
        description: "Tasks that are overdue, due today or due tomorrow. Every morning at 8.",
        email: true,
        when: When::Daily(8),
    },
    Kind {
        id: "uni.today",
        extension: "uni",
        label: "Today's lectures",
        description: "The lectures on today, and how many you've still to catch up on. Every morning at 7.",
        email: true,
        when: When::Daily(7),
    },
    Kind {
        id: "uni.weekly",
        extension: "uni",
        label: "Weekly summary",
        description: "Each module's progress and what's left to catch up on. Sundays at 6pm.",
        email: true,
        when: When::Weekly(Weekday::Sun, 18),
    },
    Kind {
        id: "reading.streak",
        extension: "reading",
        label: "Streak reminder",
        description: "A nudge at 8pm when you've a streak going and haven't read yet today.",
        email: false,
        when: When::Daily(20),
    },
    Kind {
        id: "reading.weekly",
        extension: "reading",
        label: "Weekly recap",
        description: "Pages read, books finished and how your goal's going. Sundays at 7pm.",
        email: true,
        when: When::Weekly(Weekday::Sun, 19),
    },
    Kind {
        id: "journal.reminder",
        extension: "journal",
        label: "Evening reminder",
        description: "A nudge at 9pm if you haven't written today, with a prompt to start you off. Emails never include what you've written.",
        email: true,
        when: When::Daily(21),
    },
    Kind {
        id: "finance.bills",
        extension: "finance",
        label: "Bills to confirm",
        description: "Recurring bills and income that have come round, so you can tick them off. Every morning at 9.",
        email: false,
        when: When::Daily(9),
    },
    Kind {
        id: "finance.month",
        extension: "finance",
        label: "Monthly summary",
        description: "What you spent and earned last month, and any budgets you went over. On the 1st at 9.",
        email: false,
        when: When::Monthly(9),
    },
    Kind {
        id: "birthdays.upcoming",
        extension: "birthdays",
        label: "Birthday reminders",
        description: "On the day, and as many days ahead as you chose for each person. Every morning at 9. Emails include their names and ages.",
        email: true,
        when: When::Daily(9),
    },
    Kind {
        id: "goals.weekly",
        extension: "goals",
        label: "Weekly check-in",
        description: "How each goal's going against its pace, and which need a push. Sundays at 5pm. Emails include your goals' names.",
        email: true,
        when: When::Weekly(Weekday::Sun, 17),
    },
    Kind {
        id: "learning.review",
        extension: "learning",
        label: "Due for review",
        description: "Chapters and lessons that are due for another look today. Every morning at 9.",
        email: false,
        when: When::Daily(9),
    },
    Kind {
        id: "learning.weekly",
        extension: "learning",
        label: "Weekly summary",
        description: "Time studied, chapters and lessons done, and your streak. Sundays at 6pm.",
        email: false,
        when: When::Weekly(Weekday::Sun, 18),
    },
];

pub fn find(id: &str) -> Option<&'static Kind> {
    KINDS.iter().find(|k| k.id == id)
}

/// A notification that comes due this long after its time (the computer was
/// off, or asleep) still shows; any later and it's skipped for the day.
pub const LATE_HOURS: i64 = 6;

impl Kind {
    /// When it comes on `day`, local time, if it comes that day at all.
    pub fn at(&self, day: NaiveDate) -> Option<NaiveDateTime> {
        let hour = match self.when {
            When::Daily(hour) => hour,
            When::Weekly(weekday, hour) if day.weekday() == weekday => hour,
            When::Weekly(..) => return None,
            When::Monthly(hour) if day.day() == 1 => hour,
            When::Monthly(_) => return None,
        };
        Some(day.and_time(NaiveTime::from_hms_opt(hour, 0, 0)?))
    }
}
