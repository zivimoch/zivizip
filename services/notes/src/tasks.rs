use super::*;
use std::collections::HashSet;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Task {
    id: String,
    title: String,
    date: String,
    amount: i64,
    done: bool,
    archived: bool,
    created_at: i64,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct TaskState {
    revision: i64,
    items: Vec<Task>,
}
pub(super) fn valid_date(date: &str) -> bool {
    if date.is_empty() {
        return true;
    }
    if date.len() != 10 {
        return false;
    }
    let parts: Vec<_> = date.split('-').collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return false;
    }
    let nums: Option<Vec<u32>> = parts
        .iter()
        .map(|s| {
            if s.bytes().all(|b| b.is_ascii_digit()) {
                s.parse().ok()
            } else {
                None
            }
        })
        .collect();
    let Some(n) = nums else {
        return false;
    };
    let days = match n[1] {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if n[0] % 400 == 0 || n[0] % 4 == 0 && n[0] % 100 != 0 => 29,
        2 => 28,
        _ => 0,
    };
    n[2] >= 1 && n[2] <= days
}
fn validate(state: &TaskState) -> Result<()> {
    let mut ids = HashSet::new();
    if state.revision < 0
        || state.revision >= 9_007_199_254_740_991
        || state.items.len() > 10000
        || serde_json::to_vec(&state.items).unwrap().len() > 2_000_000
        || state.items.iter().any(|t| {
            t.id.is_empty()
                || t.id.len() > 64
                || !t.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || !ids.insert(&t.id)
                || t.title.trim().is_empty()
                || t.title.encode_utf16().count() > 150
                || !valid_date(&t.date)
                || !(0..=1_000_000_000_000).contains(&t.amount)
                || !(0..=9_007_199_254_740_991).contains(&t.created_at)
        })
    {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid task list"));
    }
    Ok(())
}
fn read(db: &Connection) -> Result<TaskState> {
    let json: String = db.query_row("SELECT data FROM task_workspace WHERE id=1", [], |r| {
        r.get(0)
    })?;
    serde_json::from_str(&json)
        .map_err(|_| Error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid stored tasks"))
}
pub async fn list(State(app): State<App>, headers: HeaderMap) -> Result<Json<TaskState>> {
    authenticated(&app, &headers)?;
    Ok(Json(read(&app.db.lock().unwrap())?))
}
fn write(db: &mut Connection, mut state: TaskState) -> Result<TaskState> {
    validate(&state)?;
    let tx = db.transaction()?;
    if read(&tx)?.revision != state.revision {
        return Err(Error(
            StatusCode::CONFLICT,
            "Tasks changed on another device. Reload the list and try again.",
        ));
    }
    state.revision += 1;
    tx.execute(
        "UPDATE task_workspace SET data=? WHERE id=1",
        [serde_json::to_string(&state).unwrap()],
    )?;
    tx.commit()?;
    Ok(state)
}
pub async fn update(
    State(app): State<App>,
    headers: HeaderMap,
    Json(state): Json<TaskState>,
) -> Result<Json<TaskState>> {
    authenticated(&app, &headers)?;
    let saved = write(&mut app.db.lock().unwrap(), state)?;
    let _ = app.events.send(());
    Ok(Json(saved))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_dates_and_rejects_stale_writes() {
        assert!(valid_date("2028-02-29"));
        assert!(!valid_date("2026-02-29"));
        assert!(!valid_date("2026-13-01"));
        let mut db = Connection::open_in_memory().unwrap();
        super::super::schema(&db).unwrap();
        let state = read(&db).unwrap();
        assert_eq!(write(&mut db, state.clone()).unwrap().revision, 1);
        assert_eq!(write(&mut db, state).unwrap_err().0, StatusCode::CONFLICT);
    }
}
