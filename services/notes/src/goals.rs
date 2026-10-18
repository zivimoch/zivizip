use super::*;
use std::collections::HashSet;
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Goal {
    id: String,
    title: String,
    description: String,
    cover: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    seed: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    theme: Option<String>,
    #[serde(
        default,
        rename = "generatorVersion",
        skip_serializing_if = "Option::is_none"
    )]
    generator_version: Option<u8>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    order: Vec<String>,
    #[serde(default)]
    completed: bool,
    tasks: Vec<String>,
    expenses: Vec<String>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GoalState {
    revision: i64,
    items: Vec<Goal>,
    #[serde(default, rename = "setAside", skip_serializing_if = "Option::is_none")]
    set_aside: Option<Vec<String>>,
}
fn validate(state: &GoalState) -> Result<()> {
    let mut ids = HashSet::new();
    let valid_id = |id: &String| {
        !id.is_empty()
            && id.len() <= 64
            && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    };
    let mut hidden = HashSet::new();
    let invalid_hidden = state.set_aside.as_ref().is_some_and(|keys| {
        keys.len() > 20000
            || keys.iter().any(|key| {
                let Some((kind, id)) = key.split_once(':') else {
                    return true;
                };
                !["task", "expense"].contains(&kind)
                    || !valid_id(&id.to_string())
                    || !hidden.insert(key)
            })
    });
    if invalid_hidden
        || state.revision < 0
        || state.revision >= 9_007_199_254_740_991
        || state.items.len() > 1000
        || serde_json::to_vec(state).unwrap().len() > 2_000_000
        || state.items.iter().any(|g| {
            let mut order = HashSet::new();
            let keys: HashSet<String> = g
                .tasks
                .iter()
                .map(|id| format!("task:{id}"))
                .chain(g.expenses.iter().map(|id| format!("expense:{id}")))
                .collect();
            let mut tasks = HashSet::new();
            let mut expenses = HashSet::new();
            g.theme
                .as_ref()
                .is_some_and(|theme| !["island", "garden", "space"].contains(&theme.as_str()))
                || g.generator_version
                    .is_some_and(|version| ![1, 2].contains(&version))
                || g.order.len() > 20000
                || g.order
                    .iter()
                    .any(|key| !keys.contains(key) || !order.insert(key))
                || !valid_id(&g.id)
                || g.seed.as_ref().is_some_and(|seed| !valid_id(seed))
                || !ids.insert(&g.id)
                || g.title.trim().is_empty()
                || g.title.encode_utf16().count() > 150
                || g.description.encode_utf16().count() > 2000
                || !["", "forest", "lake", "sunrise"].contains(&g.cover.as_str())
                || g.tasks.len() > 10000
                || g.expenses.len() > 10000
                || g.tasks.iter().any(|id| !valid_id(id) || !tasks.insert(id))
                || g.expenses
                    .iter()
                    .any(|id| !valid_id(id) || !expenses.insert(id))
        })
    {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid goals"));
    }
    Ok(())
}
fn read(db: &Connection) -> Result<GoalState> {
    let json: String = db.query_row("SELECT data FROM goal_workspace WHERE id=1", [], |r| {
        r.get(0)
    })?;
    serde_json::from_str(&json)
        .map_err(|_| Error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid stored goals"))
}
pub async fn list(State(app): State<App>, headers: HeaderMap) -> Result<Json<GoalState>> {
    authenticated(&app, &headers)?;
    Ok(Json(read(&app.db.lock().unwrap())?))
}
fn write(db: &mut Connection, mut state: GoalState) -> Result<GoalState> {
    let tx = db.transaction()?;
    let current = read(&tx)?;
    if state.set_aside.is_none() {
        state.set_aside = current.set_aside;
    }
    validate(&state)?;
    if current.revision != state.revision {
        return Err(Error(
            StatusCode::CONFLICT,
            "Goals changed on another device. Reload the list and try again.",
        ));
    }
    state.revision += 1;
    tx.execute(
        "UPDATE goal_workspace SET data=? WHERE id=1",
        [serde_json::to_string(&state).unwrap()],
    )?;
    tx.commit()?;
    Ok(state)
}
pub async fn update(
    State(app): State<App>,
    headers: HeaderMap,
    Json(state): Json<GoalState>,
) -> Result<Json<GoalState>> {
    authenticated(&app, &headers)?;
    let saved = write(&mut app.db.lock().unwrap(), state)?;
    let _ = app.events.send(());
    Ok(Json(saved))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_legacy_goals_and_persists_world_settings() {
        let legacy = r#"{"id":"legacy","title":"Explore","description":"","cover":"","tasks":[],"expenses":[]}"#;
        let mut goal: Goal = serde_json::from_str(legacy).unwrap();
        assert!(!goal.completed);
        assert!(goal.seed.is_none());
        goal.completed = true;
        goal.theme = Some("garden".into());
        goal.generator_version = Some(2);
        goal.tasks = vec!["first".into()];
        goal.expenses = vec!["second".into()];
        goal.order = vec!["expense:second".into(), "task:first".into()];
        goal.seed = Some("world-seed".into());
        let mut db = Connection::open_in_memory().unwrap();
        super::super::schema(&db).unwrap();
        write(
            &mut db,
            GoalState {
                revision: 0,
                items: vec![goal],
                set_aside: None,
            },
        )
        .unwrap();
        let saved = read(&db).unwrap();
        assert!(saved.items[0].completed);
        assert_eq!(saved.items[0].theme.as_deref(), Some("garden"));
        assert_eq!(saved.items[0].generator_version, Some(2));
        assert_eq!(saved.items[0].order[0], "expense:second");
        assert_eq!(saved.items[0].seed.as_deref(), Some("world-seed"));
    }
    #[test]
    fn rejects_stale_writes_and_duplicate_assignments() {
        let mut db = Connection::open_in_memory().unwrap();
        super::super::schema(&db).unwrap();
        let state = read(&db).unwrap();
        assert_eq!(write(&mut db, state.clone()).unwrap().revision, 1);
        assert_eq!(write(&mut db, state).unwrap_err().0, StatusCode::CONFLICT);
        let goal = Goal {
            id: "goal".into(),
            title: "Explore".into(),
            description: String::new(),
            cover: "lake".into(),
            seed: None,
            theme: None,
            generator_version: None,
            order: vec![],
            completed: false,
            tasks: vec!["task".into()],
            expenses: vec![],
        };
        let mut second = goal.clone();
        second.id = "other".into();
        assert!(validate(&GoalState {
            revision: 1,
            items: vec![goal.clone(), second],
            set_aside: None,
        })
        .is_ok());
        let mut duplicate = goal;
        duplicate.tasks.push("task".into());
        assert!(validate(&GoalState {
            revision: 1,
            items: vec![duplicate],
            set_aside: None,
        })
        .is_err());
    }
    #[test]
    fn set_aside_is_validated_persisted_and_preserved_for_older_clients() {
        let mut db = Connection::open_in_memory().unwrap();
        super::super::schema(&db).unwrap();
        let mut state = read(&db).unwrap();
        state.set_aside = Some(vec!["task:archived".into(), "expense:receipt".into()]);
        let saved = write(&mut db, state).unwrap();
        assert_eq!(read(&db).unwrap().set_aside, saved.set_aside);
        let mut older = saved.clone();
        older.set_aside = None;
        let kept = write(&mut db, older).unwrap();
        assert_eq!(kept.set_aside, saved.set_aside);
        for keys in [vec!["task:a", "task:a"], vec!["note:a"], vec!["expense:"]] {
            let mut invalid = kept.clone();
            invalid.set_aside = Some(keys.into_iter().map(String::from).collect());
            assert!(validate(&invalid).is_err());
        }
        let mut restored = kept;
        restored.set_aside = Some(vec![]);
        assert_eq!(write(&mut db, restored).unwrap().set_aside, Some(vec![]));
    }
}
