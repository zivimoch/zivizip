use super::*;

fn shared(db: &Connection, token: &str) -> Result<(Note, bool)> {
    if token.len() != 64 {
        return Err(Error(StatusCode::NOT_FOUND, "Shared note not found"));
    }
    db.query_row("SELECT n.data,s.editable FROM note_shares s JOIN notes n ON n.id=s.note_id WHERE s.token=?", [token], |r| Ok((row_note(r)?, r.get::<_,bool>(1)?)))
        .map_err(|_| Error(StatusCode::NOT_FOUND, "Shared note not found"))
}
pub async fn settings(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    authenticated(&app, &headers)?;
    let db = app.db.lock().unwrap();
    match db.query_row(
        "SELECT token,editable FROM note_shares WHERE note_id=?",
        [id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)),
    ) {
        Ok((token, editable)) => Ok(Json(serde_json::json!({"token":token,"editable":editable}))),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Ok(Json(serde_json::json!({"token":null,"editable":false})))
        }
        Err(e) => Err(e.into()),
    }
}
#[derive(Deserialize)]
pub struct Permission {
    editable: bool,
}
pub async fn configure(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(p): Json<Permission>,
) -> Result<Json<serde_json::Value>> {
    authenticated(&app, &headers)?;
    let db = app.db.lock().unwrap();
    db.query_row("SELECT data FROM notes WHERE id=?", [&id], row_note)
        .map_err(|_| Error(StatusCode::NOT_FOUND, "Note not found"))?;
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let token = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    db.execute("INSERT INTO note_shares(note_id,token,editable) VALUES(?,?,?) ON CONFLICT(note_id) DO UPDATE SET editable=excluded.editable", params![id,token,p.editable])?;
    let token: String =
        db.query_row("SELECT token FROM note_shares WHERE note_id=?", [id], |r| {
            r.get(0)
        })?;
    Ok(Json(
        serde_json::json!({"token":token,"editable":p.editable}),
    ))
}
pub async fn revoke(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    authenticated(&app, &headers)?;
    let db = app.db.lock().unwrap();
    db.execute(
        "DELETE FROM shared_uploads WHERE token IN (SELECT token FROM note_shares WHERE note_id=?)",
        [&id],
    )?;
    db.execute("DELETE FROM note_shares WHERE note_id=?", [id])?;
    Ok(StatusCode::NO_CONTENT)
}
pub async fn read(
    State(app): State<App>,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> Result<Json<serde_json::Value>> {
    limit(&app, format!("shared-read:{}", client(&headers)), 3000)?;
    let (note, editable) = shared(&app.db.lock().unwrap(), &token)?;
    Ok(Json(serde_json::json!({"note":note,"editable":editable})))
}
pub async fn edit(
    State(app): State<App>,
    headers: HeaderMap,
    Path(token): Path<String>,
    Json(incoming): Json<Note>,
) -> Result<Json<Note>> {
    limit(&app, format!("shared-write:{}", client(&headers)), 600)?;
    let mut db = app.db.lock().unwrap();
    let (mut note, editable) = shared(&db, &token)?;
    if !editable {
        return Err(Error(StatusCode::FORBIDDEN, "This link is read-only"));
    }
    if incoming.id != note.id || incoming.revision != note.revision || incoming.kind != note.kind {
        return Err(Error(
            StatusCode::CONFLICT,
            "This note changed. Keep a copy of your changes before reloading.",
        ));
    }
    let existing_assets = note_assets(&note);
    for asset in note_assets(&incoming) {
        let uploaded: bool = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM shared_uploads WHERE token=? AND asset=?)",
            params![token, asset],
            |r| r.get(0),
        )?;
        if !existing_assets.contains(&asset) && !uploaded {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "Image is not available to this note",
            ));
        }
    }
    note.body = incoming.body;
    note.rich = incoming.rich;
    let saved = write_note(&mut db, note)?;
    let _ = app.events.send(());
    Ok(Json(saved))
}
pub async fn media(
    State(app): State<App>,
    Path((token, id)): Path<(String, String)>,
) -> Result<Response> {
    let db = app.db.lock().unwrap();
    let (note, _) = shared(&db, &token)?;
    let uploaded: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM shared_uploads WHERE token=? AND asset=?)",
        params![token, id],
        |r| r.get(0),
    )?;
    if !note_assets(&note).contains(&id) && !uploaded {
        return Err(Error(StatusCode::NOT_FOUND, "Image not found"));
    }
    let bytes: Vec<u8> = db.query_row("SELECT data FROM media WHERE id=?", [id], |r| r.get(0))?;
    Ok((
        [
            (header::CONTENT_TYPE, "image/webp"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        bytes,
    )
        .into_response())
}
pub async fn upload(
    State(app): State<App>,
    headers: HeaderMap,
    Path((token, id)): Path<(String, String)>,
    bytes: axum::body::Bytes,
) -> Result<StatusCode> {
    limit(&app, format!("shared-upload:{}", client(&headers)), 100)?;
    let db = app.db.lock().unwrap();
    let (_, editable) = shared(&db, &token)?;
    if !editable {
        return Err(Error(StatusCode::FORBIDDEN, "This link is read-only"));
    }
    let count: i64 = db.query_row(
        "SELECT COUNT(*) FROM shared_uploads WHERE token=?",
        [&token],
        |r| r.get(0),
    )?;
    if count >= 100 {
        return Err(Error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Shared upload limit reached",
        ));
    }
    if !text::asset_id(&id)
        || bytes.len() > 1_000_000
        || bytes.len() < 12
        || &bytes[..4] != b"RIFF"
        || &bytes[8..12] != b"WEBP"
        || format!("{:x}", Sha256::digest(&bytes)) != id
    {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid WebP attachment"));
    }
    db.execute(
        "INSERT OR IGNORE INTO media(id,data) VALUES(?,?)",
        params![id, bytes.as_ref()],
    )?;
    db.execute(
        "INSERT OR IGNORE INTO shared_uploads(token,asset) VALUES(?,?)",
        params![token, id],
    )?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn capability_permissions_conflicts_and_revocation() {
        let db = Connection::open_in_memory().unwrap();
        schema(&db).unwrap();
        let note = Note {
            id: Uuid::new_v4().to_string(),
            name: "Private title".into(),
            category: "General".into(),
            icon: "note".into(),
            body: "Original".into(),
            rich: None,
            kind: NoteKind::Text,
            revision: 1,
            created_at: 1,
            updated_at: 1,
        };
        db.execute(
            "INSERT INTO notes VALUES(?,?,?,?)",
            params![note.id, 1, 1, serde_json::to_string(&note).unwrap()],
        )
        .unwrap();
        db.execute(
            "INSERT INTO sessions VALUES(?,?)",
            params![digest("owner-session"), now() + 60],
        )
        .unwrap();
        let app = App {
            db: Arc::new(Mutex::new(db)),
            username: "owner".into(),
            hash: String::new(),
            origins: vec![],
            secure: false,
            events: broadcast::channel(16).0,
            attempts: Arc::new(Mutex::new(HashMap::new())),
            password_work: Arc::new(tokio::sync::Semaphore::new(1)),
        };
        let mut owner = HeaderMap::new();
        owner.insert(
            header::COOKIE,
            "zivizip_session=owner-session".parse().unwrap(),
        );
        assert!(configure(
            State(app.clone()),
            HeaderMap::new(),
            Path(note.id.clone()),
            Json(Permission { editable: true })
        )
        .await
        .is_err());
        let result = configure(
            State(app.clone()),
            owner.clone(),
            Path(note.id.clone()),
            Json(Permission { editable: false }),
        )
        .await
        .unwrap();
        let token = result.0["token"].as_str().unwrap().to_owned();
        assert_eq!(
            edit(
                State(app.clone()),
                HeaderMap::new(),
                Path(token.clone()),
                Json(note.clone())
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );
        configure(
            State(app.clone()),
            owner.clone(),
            Path(note.id.clone()),
            Json(Permission { editable: true }),
        )
        .await
        .unwrap();
        let mut changed = note.clone();
        changed.body = "Guest edit".into();
        changed.name = "Unexpected rename".into();
        let saved = edit(
            State(app.clone()),
            HeaderMap::new(),
            Path(token.clone()),
            Json(changed),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(saved.body, "Guest edit");
        assert_eq!(saved.name, note.name);
        assert_eq!(
            edit(
                State(app.clone()),
                HeaderMap::new(),
                Path(token.clone()),
                Json(note.clone())
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::CONFLICT
        );
        assert!(
            media(State(app.clone()), Path((token.clone(), "a".repeat(64))))
                .await
                .is_err()
        );
        revoke(State(app.clone()), owner, Path(note.id))
            .await
            .unwrap();
        assert!(read(State(app), HeaderMap::new(), Path(token))
            .await
            .is_err());
    }
}
