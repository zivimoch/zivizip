//! Canonical note snapshots backed by idempotent Yjs-compatible updates.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::collections::HashSet;
use yrs::{
    updates::decoder::Decode, updates::encoder::Encode, Any, Doc, Map, OffsetKind, Options, Out,
    ReadTxn, StateVector, Text, Transact, Update,
};

fn invalid() -> Error {
    Error(StatusCode::BAD_REQUEST, "Invalid collaborative document")
}
fn document() -> Doc {
    Doc::with_options(Options {
        offset_kind: OffsetKind::Utf16,
        ..Options::default()
    })
}
fn any(value: &Value) -> Any {
    Any::from_json(&value.to_string()).unwrap()
}
fn value(v: &Any) -> Value {
    let mut s = String::new();
    v.to_json(&mut s);
    serde_json::from_str(&s).unwrap_or(Value::Null)
}
fn unpack(s: &str) -> Result<Vec<u8>> {
    if s.len() > 12_000_000 {
        return Err(invalid());
    }
    STANDARD.decode(s).map_err(|_| invalid())
}
fn apply(doc: &Doc, bytes: &[u8]) -> Result<()> {
    let update = Update::decode_v1(bytes).map_err(|_| invalid())?;
    doc.transact_mut()
        .apply_update(update)
        .map_err(|_| invalid())
}
fn seed(note: &Note) -> Result<Doc> {
    let doc = document();
    if note.kind == NoteKind::Draw {
        let shapes = doc.get_or_insert_map("shapes");
        let order = doc.get_or_insert_map("order");
        let scene: Value = serde_json::from_str(&note.body).map_err(|_| invalid())?;
        let mut tx = doc.transact_mut();
        for (i, s) in scene["shapes"]
            .as_array()
            .ok_or_else(invalid)?
            .iter()
            .enumerate()
        {
            let id = s["id"].as_str().ok_or_else(invalid)?;
            shapes.insert(&mut tx, id, s.to_string());
            order.insert(&mut tx, id, i as f64);
        }
    } else {
        let text = doc.get_or_insert_text("text");
        let images = doc.get_or_insert_map("images");
        let rich = note.rich.as_ref().map(|r| serde_json::to_value(r).unwrap()).unwrap_or_else(|| json!({"blocks":note.body.split('\n').map(|t|json!({"type":"paragraph","text":t})).collect::<Vec<_>>(),"images":[]}));
        let mut tx = doc.transact_mut();
        for image in rich["images"].as_array().ok_or_else(invalid)? {
            images.insert(
                &mut tx,
                image["id"].as_str().ok_or_else(invalid)?,
                image.to_string(),
            );
        }
        for b in rich["blocks"].as_array().ok_or_else(invalid)? {
            if b["type"] == "image" {
                let index = text.len(&tx);
                text.insert_embed(&mut tx, index, any(&json!({"image":b["id"]})));
            } else {
                let fallback = vec![json!({"text":b["text"]})];
                for run in b["runs"].as_array().unwrap_or(&fallback) {
                    let attrs = run
                        .as_object()
                        .ok_or_else(invalid)?
                        .iter()
                        .filter(|(k, _)| *k != "text")
                        .map(|(k, v)| (k.clone().into(), any(v)))
                        .collect();
                    let index = text.len(&tx);
                    text.insert_with_attributes(
                        &mut tx,
                        index,
                        run["text"].as_str().ok_or_else(invalid)?,
                        attrs,
                    );
                }
                let mut end = json!({"paragraph":true});
                for key in ["height", "rule"] {
                    if let Some(v) = b.get(key) {
                        end[key] = v.clone();
                    }
                }
                let index = text.len(&tx);
                text.insert_embed(&mut tx, index, any(&end));
            }
        }
    }
    Ok(doc)
}
fn project(doc: &Doc, note: &Note) -> Result<Note> {
    let mut result = note.clone();
    let text = doc.get_or_insert_text("text");
    let images = doc.get_or_insert_map("images");
    let shapes = doc.get_or_insert_map("shapes");
    let order = doc.get_or_insert_map("order");
    let tx = doc.transact();
    if tx
        .root_refs()
        .any(|(key, _)| !["text", "images", "shapes", "order"].contains(&key))
    {
        return Err(invalid());
    }
    if note.kind == NoteKind::Draw {
        let mut entries = Vec::new();
        for (id, val) in shapes.iter(&tx) {
            let Out::Any(Any::String(s)) = val else {
                return Err(invalid());
            };
            let shape: Value = serde_json::from_str(&s).map_err(|_| invalid())?;
            if shape["id"] != id {
                return Err(invalid());
            }
            let index = order
                .get(&tx, id)
                .and_then(|v| {
                    if let Out::Any(a) = v {
                        value(&a).as_f64()
                    } else {
                        None
                    }
                })
                .unwrap_or(0.);
            if !index.is_finite() {
                return Err(invalid());
            }
            entries.push((index, id.to_string(), shape));
        }
        entries.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        result.body =
            json!({"version":1,"shapes":entries.into_iter().map(|v|v.2).collect::<Vec<_>>()})
                .to_string();
        result.rich = None;
    } else {
        let mut blocks = Vec::new();
        let mut runs: Vec<Value> = Vec::new();
        let mut used = HashSet::new();
        let mut placements = Vec::new();
        fn paragraph(blocks: &mut Vec<Value>, runs: &mut Vec<Value>, end: &Value) {
            let content = runs
                .iter()
                .filter_map(|r| r["text"].as_str())
                .collect::<String>();
            let mut b = json!({"type":"paragraph","text":content});
            if runs.iter().any(|r| r.as_object().unwrap().len() > 1) {
                b["runs"] = json!(runs);
            }
            for key in ["height", "rule"] {
                if let Some(v) = end.get(key) {
                    b[key] = v.clone();
                }
            }
            blocks.push(b);
            runs.clear();
        }
        for op in text.diff(&tx, |_| ()) {
            match op.insert {
                Out::Any(Any::String(s)) => {
                    let mut run = json!({"text":s.as_ref()});
                    if let Some(attrs) = op.attributes {
                        for (k, v) in attrs.iter() {
                            if !["bold", "italic", "underline", "color", "size"]
                                .contains(&k.as_ref())
                            {
                                return Err(invalid());
                            }
                            run[k.as_ref()] = value(v);
                        }
                    }
                    runs.push(run);
                }
                Out::Any(a) => {
                    let embed = value(&a);
                    if embed["paragraph"] == true {
                        paragraph(&mut blocks, &mut runs, &embed);
                    } else if let Some(id) = embed["image"].as_str() {
                        if let Some(Out::Any(Any::String(s))) = images.get(&tx, id) {
                            if used.insert(id.to_string()) {
                                if !runs.is_empty() {
                                    paragraph(&mut blocks, &mut runs, &Value::Null);
                                }
                                let im: Value = serde_json::from_str(&s).map_err(|_| invalid())?;
                                if im["id"] != id {
                                    return Err(invalid());
                                }
                                placements.push(im);
                                blocks.push(json!({"type":"image","id":id}));
                            }
                        }
                    } else {
                        return Err(invalid());
                    }
                }
                _ => return Err(invalid()),
            }
        }
        if !runs.is_empty() || blocks.is_empty() {
            paragraph(&mut blocks, &mut runs, &Value::Null);
        }
        result.body = blocks
            .iter()
            .filter(|b| b["type"] == "paragraph")
            .filter_map(|b| b["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        result.rich = Some(
            serde_json::from_value(json!({"version":1,"blocks":blocks,"images":placements}))
                .map_err(|_| invalid())?,
        );
    }
    validate(&result)?;
    Ok(result)
}
#[derive(Deserialize)]
pub struct Sync {
    vector: String,
    #[serde(default)]
    update: Option<String>,
}
fn exchange(
    db: &mut Connection,
    note: Note,
    input: Sync,
    editable: bool,
    token: Option<&str>,
) -> Result<Value> {
    let vector = StateVector::decode_v1(&unpack(&input.vector)?).map_err(|_| invalid())?;
    if input.update.is_some() && !editable {
        return Err(Error(StatusCode::FORBIDDEN, "This link is read-only"));
    }
    let tx = db.transaction()?;
    let stored = tx.query_row(
        "SELECT state FROM note_collaboration WHERE note_id=?",
        [&note.id],
        |r| r.get::<_, Vec<u8>>(0),
    );
    let initialized = stored.is_ok();
    let doc = match stored {
        Ok(bytes) => {
            let d = document();
            apply(&d, &bytes)?;
            d
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => seed(&note)?,
        Err(e) => return Err(e.into()),
    };
    let before = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    if let Some(update) = input.update {
        apply(&doc, &unpack(&update)?)?;
    }
    let state = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    if state.len() > 8_000_000 {
        return Err(Error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Collaborative document limit reached",
        ));
    }
    if initialized && before == state {
        tx.commit()?;
        return Ok(reply(&doc, &note, editable, &vector));
    }
    let mut saved = project(&doc, &note)?;
    check_media(&tx, &saved)?;
    if let Some(token) = token {
        let existing = note_assets(&note);
        for asset in note_assets(&saved) {
            let uploaded: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM shared_uploads WHERE token=? AND asset=?)",
                params![token, asset],
                |r| r.get(0),
            )?;
            if !existing.contains(&asset) && !uploaded {
                return Err(Error(
                    StatusCode::FORBIDDEN,
                    "Image is not available to this note",
                ));
            }
        }
    }
    if before != state {
        saved.revision += 1;
        saved.updated_at = millis();
    }
    tx.execute("INSERT INTO note_collaboration(note_id,state) VALUES(?,?) ON CONFLICT(note_id) DO UPDATE SET state=excluded.state",params![saved.id,state])?;
    tx.execute(
        "UPDATE notes SET revision=?,data=? WHERE id=?",
        params![
            saved.revision,
            serde_json::to_string(&saved).unwrap(),
            saved.id
        ],
    )?;
    tx.commit()?;
    Ok(reply(&doc, &saved, editable, &vector))
}
fn reply(doc: &Doc, note: &Note, editable: bool, vector: &StateVector) -> Value {
    let mut metadata = serde_json::to_value(note).unwrap();
    metadata.as_object_mut().unwrap().remove("body");
    metadata.as_object_mut().unwrap().remove("rich");
    json!({"metadata":metadata,"editable":editable,"state":STANDARD.encode(doc.transact().encode_state_as_update_v1(vector)),"vector":STANDARD.encode(doc.transact().state_vector().encode_v1())})
}

pub async fn owner(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Sync>,
) -> Result<Json<Value>> {
    authenticated(&app, &headers)?;
    let changed = input.update.is_some();
    let mut db = app.db.lock().unwrap();
    let note = db
        .query_row("SELECT data FROM notes WHERE id=?", [id], row_note)
        .map_err(|_| Error(StatusCode::NOT_FOUND, "Note not found"))?;
    let result = exchange(&mut db, note, input, true, None)?;
    if changed {
        let _ = app.events.send(());
    }
    Ok(Json(result))
}
pub async fn shared(
    State(app): State<App>,
    headers: HeaderMap,
    Path(token): Path<String>,
    Json(input): Json<Sync>,
) -> Result<Json<Value>> {
    limit(&app, format!("collab:{}", client(&headers)), 4000)?;
    let changed = input.update.is_some();
    let mut db = app.db.lock().unwrap();
    let (note, editable) = sharing::shared(&db, &token)?;
    let result = exchange(&mut db, note, input, editable, Some(&token))?;
    if changed {
        let _ = app.events.send(());
    }
    Ok(Json(result))
}
#[derive(Deserialize)]
pub struct Metadata {
    name: String,
    category: String,
    icon: String,
}
pub async fn metadata(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Metadata>,
) -> Result<Json<Note>> {
    authenticated(&app, &headers)?;
    let db = app.db.lock().unwrap();
    let mut n = db
        .query_row("SELECT data FROM notes WHERE id=?", [id], row_note)
        .map_err(|_| Error(StatusCode::NOT_FOUND, "Note not found"))?;
    n.name = input.name;
    n.category = input.category;
    n.icon = input.icon;
    validate(&n)?;
    n.revision += 1;
    n.updated_at = millis();
    db.execute(
        "UPDATE notes SET revision=?,data=? WHERE id=?",
        params![n.revision, serde_json::to_string(&n).unwrap(), n.id],
    )?;
    let _ = app.events.send(());
    Ok(Json(n))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Connection, Note) {
        let db = Connection::open_in_memory().unwrap();
        schema(&db).unwrap();
        let n = Note {
            id: Uuid::new_v4().to_string(),
            name: "Note".into(),
            category: "General".into(),
            icon: "note".into(),
            body: "Hello 🌏".into(),
            rich: None,
            kind: NoteKind::Text,
            revision: 1,
            created_at: 1,
            updated_at: 1,
        };
        db.execute(
            "INSERT INTO notes VALUES(?,?,?,?)",
            params![
                n.id,
                n.revision,
                n.created_at,
                serde_json::to_string(&n).unwrap()
            ],
        )
        .unwrap();
        (db, n)
    }
    fn request(doc: &Doc, update: bool) -> Sync {
        Sync {
            vector: STANDARD.encode(doc.transact().state_vector().encode_v1()),
            update: update.then(|| {
                STANDARD.encode(
                    doc.transact()
                        .encode_state_as_update_v1(&StateVector::default()),
                )
            }),
        }
    }
    fn load(db: &Connection, id: &str) -> Note {
        db.query_row("SELECT data FROM notes WHERE id=?", [id], row_note)
            .unwrap()
    }
    #[test]
    fn simultaneous_updates_converge_and_retries_are_idempotent() {
        let (mut db, n) = fixture();
        let a = document();
        let b = document();
        let response = exchange(&mut db, n.clone(), request(&a, false), true, None).unwrap();
        let state = unpack(response["state"].as_str().unwrap()).unwrap();
        apply(&a, &state).unwrap();
        apply(&b, &state).unwrap();
        let at = a.get_or_insert_text("text");
        let bt = b.get_or_insert_text("text");
        at.insert(&mut a.transact_mut(), 0, "A ");
        bt.insert(&mut b.transact_mut(), 0, "B ");
        let n = load(&db, &n.id);
        exchange(&mut db, n.clone(), request(&a, true), true, None).unwrap();
        let n = load(&db, &n.id);
        let reply = exchange(&mut db, n.clone(), request(&b, true), true, None).unwrap();
        apply(&b, &unpack(reply["state"].as_str().unwrap()).unwrap()).unwrap();
        let n = load(&db, &n.id);
        let revision = n.revision;
        assert!(n.body.contains("A ") && n.body.contains("B ") && n.body.contains("🌏"));
        exchange(&mut db, n.clone(), request(&b, true), true, None).unwrap();
        assert_eq!(load(&db, &n.id).revision, revision);
        assert_eq!(
            db.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn rejects_read_only_and_invalid_updates_atomically() {
        let (mut db, n) = fixture();
        let doc = seed(&n).unwrap();
        assert_eq!(
            exchange(&mut db, n.clone(), request(&doc, true), false, None)
                .unwrap_err()
                .0,
            StatusCode::FORBIDDEN
        );
        let text = doc.get_or_insert_text("text");
        text.insert_embed(&mut doc.transact_mut(), 0, any(&json!({"unknown":true})));
        assert!(exchange(&mut db, n.clone(), request(&doc, true), true, None).is_err());
        assert_eq!(load(&db, &n.id).body, n.body);
        assert_eq!(
            db.query_row("SELECT count(*) FROM note_collaboration", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn prevents_legacy_overwrites_and_cascades_deleted_state() {
        let (mut db, n) = fixture();
        let doc = document();
        exchange(&mut db, n.clone(), request(&doc, false), true, None).unwrap();
        assert_eq!(
            write_note(&mut db, n.clone()).unwrap_err().0,
            StatusCode::CONFLICT
        );
        db.execute("DELETE FROM notes WHERE id=?", [n.id]).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM note_collaboration", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
