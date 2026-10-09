use super::*;
use std::collections::HashSet;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transaction {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    title: String,
    category: String,
    date: String,
    amount: i64,
    created_at: i64,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FinanceState {
    revision: i64,
    items: Vec<Transaction>,
}
fn validate(state: &FinanceState) -> Result<()> {
    let mut ids = HashSet::new();
    let mut total = 0i64;
    if state.revision < 0
        || state.revision >= 9_007_199_254_740_991
        || state.items.len() > 10000
        || serde_json::to_vec(&state.items).unwrap().len() > 2_000_000
        || state.items.iter().any(|item| {
            total = total.saturating_add(item.amount);
            item.id.is_empty()
                || item.id.len() > 64
                || !item
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || !ids.insert(&item.id)
                || !["income", "expense"].contains(&item.kind.as_str())
                || item.title.encode_utf16().count() > 150
                || item.category.trim().is_empty()
                || item.category.encode_utf16().count() > 60
                || item.date.is_empty()
                || !tasks::valid_date(&item.date)
                || !(1..=1_000_000_000_000).contains(&item.amount)
                || !(0..=9_007_199_254_740_991).contains(&item.created_at)
                || total > 9_007_199_254_740_991
        })
    {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid transaction list"));
    }
    Ok(())
}
fn read(db: &Connection) -> Result<FinanceState> {
    let json: String = db.query_row("SELECT data FROM finance_workspace WHERE id=1", [], |r| {
        r.get(0)
    })?;
    serde_json::from_str(&json).map_err(|_| {
        Error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Invalid stored transactions",
        )
    })
}
pub async fn list(State(app): State<App>, headers: HeaderMap) -> Result<Json<FinanceState>> {
    authenticated(&app, &headers)?;
    Ok(Json(read(&app.db.lock().unwrap())?))
}
fn write(db: &mut Connection, mut state: FinanceState) -> Result<FinanceState> {
    validate(&state)?;
    let tx = db.transaction()?;
    if read(&tx)?.revision != state.revision {
        return Err(Error(
            StatusCode::CONFLICT,
            "Transactions changed on another device. Reload the list and try again.",
        ));
    }
    state.revision += 1;
    tx.execute(
        "UPDATE finance_workspace SET data=? WHERE id=1",
        [serde_json::to_string(&state).unwrap()],
    )?;
    tx.commit()?;
    Ok(state)
}
pub async fn update(
    State(app): State<App>,
    headers: HeaderMap,
    Json(state): Json<FinanceState>,
) -> Result<Json<FinanceState>> {
    authenticated(&app, &headers)?;
    let saved = write(&mut app.db.lock().unwrap(), state)?;
    let _ = app.events.send(());
    Ok(Json(saved))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn item() -> Transaction {
        Transaction {
            id: "sample".into(),
            kind: "expense".into(),
            title: "Lunch".into(),
            category: "Food".into(),
            date: "2026-10-01".into(),
            amount: 35000,
            created_at: 1,
        }
    }
    #[test]
    fn description_is_optional() {
        let mut db = Connection::open_in_memory().unwrap();
        super::super::schema(&db).unwrap();
        let mut state = read(&db).unwrap();
        let mut transaction = item();
        transaction.title.clear();
        state.items.push(transaction);
        assert!(write(&mut db, state).is_ok());
    }
    #[test]
    fn validates_transactions_and_keeps_rejected_updates_atomic() {
        let mut db = Connection::open_in_memory().unwrap();
        super::super::schema(&db).unwrap();
        let mut state = read(&db).unwrap();
        state.items.push(item());
        let mut saved = write(&mut db, state.clone()).unwrap();
        assert_eq!(saved.revision, 1);
        assert_eq!(write(&mut db, state).unwrap_err().0, StatusCode::CONFLICT);
        saved.items[0].date = "2026-02-29".into();
        assert_eq!(
            write(&mut db, saved.clone()).unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
        saved.items[0].date = "2028-02-29".into();
        saved.items[0].amount = -1;
        assert!(write(&mut db, saved.clone()).is_err());
        saved.items[0].amount = 1;
        saved.items.push(item());
        assert!(write(&mut db, saved.clone()).is_err());
        saved.items.pop();
        saved.items[0].category = "  ".into();
        assert!(write(&mut db, saved).is_err());
        assert_eq!(read(&db).unwrap().items[0].amount, 35000);
        assert_eq!(read(&db).unwrap().revision, 1);
    }
}
