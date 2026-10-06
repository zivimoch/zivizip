use super::*;
use std::collections::HashSet;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Budget {
    id: String,
    month: String,
    category: String,
    group: String,
    amount: i64,
    note: String,
    enabled: bool,
    automatic: bool,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PlanMonth {
    month: String,
    opening: i64,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PlanningState {
    revision: i64,
    months: Vec<PlanMonth>,
    items: Vec<Budget>,
}
fn valid_month(month: &str) -> bool {
    month.len() == 7 && tasks::valid_date(&format!("{month}-01"))
}
fn validate(state: &PlanningState) -> Result<()> {
    let mut months = HashSet::new();
    let mut ids = HashSet::new();
    let mut categories = HashSet::new();
    let mut total = 0i64;
    let invalid = state.revision < 0
        || state.revision >= 9_007_199_254_740_991
        || state.months.len() > 2400
        || state.items.len() > 10000
        || serde_json::to_vec(state).unwrap().len() > 2_000_000
        || state.months.iter().any(|entry| {
            !valid_month(&entry.month)
                || !months.insert(&entry.month)
                || !(-1_000_000_000_000..=1_000_000_000_000).contains(&entry.opening)
        })
        || state.items.iter().any(|plan| {
            total = total.saturating_add(plan.amount);
            let kind = if plan.group == "income" {
                "income"
            } else {
                "expense"
            };
            let key = format!(
                "{}:{}:{}",
                plan.month,
                kind,
                plan.category.trim().to_lowercase()
            );
            plan.id.is_empty()
                || plan.id.len() > 64
                || !plan
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || !ids.insert(&plan.id)
                || !months.contains(&plan.month)
                || !["income", "recurring", "monthly"].contains(&plan.group.as_str())
                || plan.category.trim().is_empty()
                || plan.category.encode_utf16().count() > 60
                || !(0..=1_000_000_000_000).contains(&plan.amount)
                || plan.note.encode_utf16().count() > 2000
                || (plan.automatic && (plan.group != "monthly" || plan.amount != 0))
                || !categories.insert(key)
                || total > 9_007_199_254_740_991
        });
    if invalid {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "Invalid or duplicate financial plans",
        ));
    }
    Ok(())
}
fn read(db: &Connection) -> Result<PlanningState> {
    let data: String = db.query_row("SELECT data FROM finance_planning WHERE id=1", [], |r| {
        r.get(0)
    })?;
    serde_json::from_str(&data).map_err(|_| {
        Error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Invalid stored financial plans",
        )
    })
}
pub async fn list(State(app): State<App>, headers: HeaderMap) -> Result<Json<PlanningState>> {
    authenticated(&app, &headers)?;
    Ok(Json(read(&app.db.lock().unwrap())?))
}
fn write(db: &mut Connection, mut state: PlanningState) -> Result<PlanningState> {
    validate(&state)?;
    let tx = db.transaction()?;
    if read(&tx)?.revision != state.revision {
        return Err(Error(
            StatusCode::CONFLICT,
            "Plans changed on another device. Reload and try again.",
        ));
    }
    state.revision += 1;
    tx.execute(
        "UPDATE finance_planning SET data=? WHERE id=1",
        [serde_json::to_string(&state).unwrap()],
    )?;
    tx.commit()?;
    Ok(state)
}
pub async fn update(
    State(app): State<App>,
    headers: HeaderMap,
    Json(state): Json<PlanningState>,
) -> Result<Json<PlanningState>> {
    authenticated(&app, &headers)?;
    let saved = write(&mut app.db.lock().unwrap(), state)?;
    let _ = app.events.send(());
    Ok(Json(saved))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plans_validate_unique_categories_months_and_revisions() {
        let mut db = Connection::open_in_memory().unwrap();
        super::super::schema(&db).unwrap();
        let mut state = read(&db).unwrap();
        state.months.push(PlanMonth {
            month: "2026-10".into(),
            opening: -500,
        });
        state.items.push(Budget {
            id: "food".into(),
            month: "2026-10".into(),
            category: "Food".into(),
            group: "recurring".into(),
            amount: 500000,
            note: "Weekly groceries".into(),
            enabled: true,
            automatic: false,
        });
        let mut saved = write(&mut db, state.clone()).unwrap();
        assert_eq!(write(&mut db, state).unwrap_err().0, StatusCode::CONFLICT);
        let mut duplicate = saved.items[0].clone();
        duplicate.id = "duplicate".into();
        duplicate.category = " food ".into();
        duplicate.group = "monthly".into();
        saved.items.push(duplicate);
        assert!(write(&mut db, saved.clone()).is_err());
        saved.items.pop();
        saved.months[0].month = "2026-13".into();
        assert!(write(&mut db, saved).is_err());
        assert_eq!(read(&db).unwrap().items.len(), 1);
        assert_eq!(read(&db).unwrap().revision, 1);
    }
}
