mod draw;
mod finance;
mod tasks;
mod text;
use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::{
    extract::{DefaultBodyLimit, Path, Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post, put},
    Json, Router,
};
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    convert::Infallible,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::broadcast;
use uuid::Uuid;

const SESSION_SECONDS: i64 = 365 * 24 * 60 * 60;
#[derive(Clone)]
struct App {
    db: Arc<Mutex<Connection>>,
    username: String,
    hash: String,
    origins: Vec<String>,
    secure: bool,
    events: broadcast::Sender<()>,
    attempts: Arc<Mutex<HashMap<String, (u32, i64)>>>,
    password_work: Arc<tokio::sync::Semaphore>,
}
#[derive(Deserialize)]
struct Credentials {
    username: String,
    password: String,
}
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
enum NoteKind {
    #[default]
    Text,
    Draw,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Note {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rich: Option<text::Document>,
    #[serde(default)]
    kind: NoteKind,
    id: String,
    name: String,
    category: String,
    icon: String,
    body: String,
    revision: i64,
    created_at: i64,
    updated_at: i64,
}
#[derive(Deserialize)]
struct Interest {
    email: String,
    message: String,
}
#[derive(Debug)]
struct Error(StatusCode, &'static str);
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({"error":self.1}))).into_response()
    }
}
impl From<rusqlite::Error> for Error {
    fn from(_: rusqlite::Error) -> Self {
        Error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Storage operation failed",
        )
    }
}
type Result<T> = std::result::Result<T, Error>;
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
fn millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
fn digest(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
fn token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|p| p.trim().strip_prefix("zivizip_session=").map(str::to_owned))
}
fn authenticated(app: &App, headers: &HeaderMap) -> Result<String> {
    let raw = token(headers).ok_or(Error(StatusCode::UNAUTHORIZED, "Login required"))?;
    let hashed = digest(&raw);
    let db = app.db.lock().unwrap();
    let valid: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE token=? AND expires>?)",
        params![hashed, now()],
        |r| r.get(0),
    )?;
    if valid {
        Ok(hashed)
    } else {
        Err(Error(StatusCode::UNAUTHORIZED, "Session expired"))
    }
}
fn cookie(app: &App, raw: &str, age: i64) -> String {
    format!(
        "zivizip_session={raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{}",
        if app.secure { "; Secure" } else { "" }
    )
}
fn user(app: &App) -> serde_json::Value {
    serde_json::json!({"id":"owner","username":app.username})
}
async fn guard(State(app): State<App>, req: Request, next: Next) -> Response {
    if !matches!(
        *req.method(),
        axum::http::Method::GET | axum::http::Method::HEAD
    ) {
        let origin = req
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !app.origins.iter().any(|o| o == origin)
            || req.headers().get("x-zivizip").and_then(|v| v.to_str().ok()) != Some("1")
        {
            return Error(StatusCode::FORBIDDEN, "Invalid request origin").into_response();
        }
    }
    let mut response = next.run(req).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
fn limit(app: &App, key: String, max: u32) -> Result<()> {
    let mut map = app.attempts.lock().unwrap();
    let time = now();
    map.retain(|_, (_, until)| *until > time);
    if map.len() > 10000 {
        return Err(Error(StatusCode::TOO_MANY_REQUESTS, "Try again later"));
    }
    let entry = map.entry(key).or_insert((0, time + 900));
    entry.0 += 1;
    if entry.0 > max {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many attempts. Try again in 15 minutes.",
        ));
    }
    Ok(())
}
fn client(headers: &HeaderMap) -> String {
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("local")
        .to_owned()
}
async fn login(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Credentials>,
) -> Result<Response> {
    limit(&app, format!("login:{}", client(&headers)), 15)?;
    if input.password.len() > 1024 || input.username.len() > 150 {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid credentials"));
    }
    let permit = app
        .password_work
        .clone()
        .try_acquire_owned()
        .map_err(|_| Error(StatusCode::TOO_MANY_REQUESTS, "Try again shortly"))?;
    let hash = app.hash.clone();
    let valid_user = input.username == app.username;
    let valid = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        Argon2::default()
            .verify_password(
                input.password.as_bytes(),
                &PasswordHash::new(&hash).unwrap(),
            )
            .is_ok()
    })
    .await
    .unwrap();
    if !valid || !valid_user {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Incorrect username or password",
        ));
    }
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let raw = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    {
        let db = app.db.lock().unwrap();
        db.execute("DELETE FROM sessions WHERE expires<=?", [now()])?;
        if let Some(old) = token(&headers) {
            db.execute("DELETE FROM sessions WHERE token=?", [digest(&old)])?;
        }
        db.execute(
            "INSERT INTO sessions(token,expires) VALUES(?,?)",
            params![digest(&raw), now() + SESSION_SECONDS],
        )?;
    }
    Ok((
        [(header::SET_COOKIE, cookie(&app, &raw, SESSION_SECONDS))],
        Json(user(&app)),
    )
        .into_response())
}
async fn me(State(app): State<App>, headers: HeaderMap) -> Result<Response> {
    let hash = authenticated(&app, &headers)?;
    app.db.lock().unwrap().execute(
        "UPDATE sessions SET expires=? WHERE token=?",
        params![now() + SESSION_SECONDS, hash],
    )?;
    Ok((
        [(
            header::SET_COOKIE,
            cookie(&app, &token(&headers).unwrap(), SESSION_SECONDS),
        )],
        Json(user(&app)),
    )
        .into_response())
}
async fn logout(State(app): State<App>, headers: HeaderMap) -> Result<Response> {
    if let Some(raw) = token(&headers) {
        app.db
            .lock()
            .unwrap()
            .execute("DELETE FROM sessions WHERE token=?", [digest(&raw)])?;
    }
    let _ = app.events.send(());
    Ok((
        [(header::SET_COOKIE, cookie(&app, "", 0))],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}
fn row_note(row: &rusqlite::Row) -> rusqlite::Result<Note> {
    let json: String = row.get(0)?;
    serde_json::from_str(&json).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}
fn validate(n: &Note) -> Result<()> {
    if Uuid::parse_str(&n.id).is_err()
        || n.name.trim().is_empty()
        || n.name.chars().count() > 150
        || n.category.trim().is_empty()
        || n.category.chars().count() > 60
        || n.icon.len() > 30
        || n.body.len() > 2_000_000
        || (n.kind == NoteKind::Draw && !draw::valid(&n.body))
        || n.rich
            .as_ref()
            .is_some_and(|r| n.kind == NoteKind::Draw || !text::valid(r, &n.body))
        || n.revision < 1
        || n.created_at < 0
    {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid note"));
    }
    Ok(())
}
async fn list(State(app): State<App>, headers: HeaderMap) -> Result<Json<Vec<Note>>> {
    authenticated(&app, &headers)?;
    let db = app.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT data FROM notes ORDER BY created_at,id")?;
    let notes = stmt
        .query_map([], row_note)?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(Json(notes))
}
async fn create(
    State(app): State<App>,
    headers: HeaderMap,
    Json(mut n): Json<Note>,
) -> Result<Json<Note>> {
    authenticated(&app, &headers)?;
    validate(&n)?;
    n.revision = 1;
    n.updated_at = millis();
    let db = app.db.lock().unwrap();
    check_media(&db, &n)?;
    let exists: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM notes WHERE id=?)",
        [&n.id],
        |r| r.get(0),
    )?;
    if exists {
        return Err(Error(StatusCode::CONFLICT, "Note already exists"));
    }
    db.execute(
        "INSERT INTO notes(id,revision,created_at,data) VALUES(?,?,?,?)",
        params![
            n.id,
            n.revision,
            n.created_at,
            serde_json::to_string(&n).unwrap()
        ],
    )?;
    let _ = app.events.send(());
    Ok(Json(n))
}
fn check_media(db: &Connection, n: &Note) -> Result<()> {
    if let Some(rich) = &n.rich {
        for image in &rich.images {
            let exists: bool = db.query_row(
                "SELECT EXISTS(SELECT 1 FROM media WHERE id=?)",
                [&image.asset],
                |r| r.get(0),
            )?;
            if !exists {
                return Err(Error(StatusCode::BAD_REQUEST, "Missing image attachment"));
            }
        }
    }
    Ok(())
}
async fn put_media(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    bytes: axum::body::Bytes,
) -> Result<StatusCode> {
    authenticated(&app, &headers)?;
    if !text::asset_id(&id)
        || bytes.len() > 1_000_000
        || bytes.len() < 12
        || &bytes[..4] != b"RIFF"
        || &bytes[8..12] != b"WEBP"
        || format!("{:x}", Sha256::digest(&bytes)) != id
    {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid WebP attachment"));
    }
    let db = app.db.lock().unwrap();
    db.execute(
        "INSERT OR IGNORE INTO media(id,data) VALUES(?,?)",
        params![id, bytes.as_ref()],
    )?;
    Ok(StatusCode::NO_CONTENT)
}
async fn get_media(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response> {
    authenticated(&app, &headers)?;
    if !text::asset_id(&id) {
        return Err(Error(StatusCode::NOT_FOUND, "Image not found"));
    }
    let db = app.db.lock().unwrap();
    let data: Vec<u8> = db
        .query_row("SELECT data FROM media WHERE id=?", [id], |r| r.get(0))
        .map_err(|_| Error(StatusCode::NOT_FOUND, "Image not found"))?;
    Ok((
        [
            (header::CONTENT_TYPE, "image/webp"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        data,
    )
        .into_response())
}
fn write_note(db: &mut Connection, mut n: Note) -> Result<Note> {
    validate(&n)?;
    check_media(db, &n)?;
    let tx = db.transaction()?;
    let existing = tx.query_row("SELECT data FROM notes WHERE id=?", [&n.id], row_note);
    match existing {
        Ok(current) if current.kind != n.kind => {
            return Err(Error(
                StatusCode::BAD_REQUEST,
                "Note type cannot be changed",
            ));
        }
        Ok(current) if current.revision == n.revision => {
            n.revision += 1;
            n.created_at = current.created_at;
        }
        Ok(_) | Err(rusqlite::Error::QueryReturnedNoRows) => {
            n.id = Uuid::new_v4().to_string();
            n.name = format!(
                "{} (conflict copy)",
                n.name.chars().take(130).collect::<String>()
            );
            n.revision = 1;
        }
        Err(e) => return Err(e.into()),
    };
    n.updated_at = millis();
    tx.execute("INSERT INTO notes(id,revision,created_at,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data",params![n.id,n.revision,n.created_at,serde_json::to_string(&n).unwrap()])?;
    tx.commit()?;
    Ok(n)
}
async fn update(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(n): Json<Note>,
) -> Result<Json<Note>> {
    authenticated(&app, &headers)?;
    if id != n.id {
        return Err(Error(StatusCode::BAD_REQUEST, "Mismatched note"));
    }
    let saved = write_note(&mut app.db.lock().unwrap(), n)?;
    let _ = app.events.send(());
    Ok(Json(saved))
}
async fn remove(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(n): Json<Note>,
) -> Result<StatusCode> {
    authenticated(&app, &headers)?;
    let count = app.db.lock().unwrap().execute(
        "DELETE FROM notes WHERE id=? AND revision=?",
        params![id, n.revision],
    )?;
    if count == 0 {
        return Err(Error(
            StatusCode::CONFLICT,
            "Note changed. Refresh before deleting.",
        ));
    }
    let _ = app.events.send(());
    Ok(StatusCode::NO_CONTENT)
}
async fn interest(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Interest>,
) -> Result<StatusCode> {
    let email = input.email.trim();
    let message = input.message.trim();
    if email.len() > 254
        || !email.contains('@')
        || email.contains(char::is_whitespace)
        || message.is_empty()
        || message.chars().count() > 3000
    {
        return Err(Error(
            StatusCode::BAD_REQUEST,
            "Enter a valid email and a message up to 3000 characters",
        ));
    }
    limit(&app, format!("interest:{}", client(&headers)), 5)?;
    app.db.lock().unwrap().execute(
        "INSERT INTO interests(email,message,created_at) VALUES(?,?,?)",
        params![email, message, millis()],
    )?;
    Ok(StatusCode::CREATED)
}
async fn interests(
    State(app): State<App>,
    headers: HeaderMap,
) -> Result<Json<Vec<serde_json::Value>>> {
    authenticated(&app, &headers)?;
    let db = app.db.lock().unwrap();
    let mut statement =
        db.prepare("SELECT id,email,message,created_at FROM interests ORDER BY id DESC LIMIT 200")?;
    let rows=statement.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,i64>(0)?,"email":r.get::<_,String>(1)?,"message":r.get::<_,String>(2)?,"createdAt":r.get::<_,i64>(3)?})))?.collect::<std::result::Result<Vec<_>,_>>()?;
    Ok(Json(rows))
}
async fn events(State(app): State<App>, headers: HeaderMap) -> Result<Response> {
    authenticated(&app, &headers)?;
    let mut receiver = app.events.subscribe();
    let stream = async_stream::stream! {
     yield Ok::<_,Infallible>(Event::default().event("notes").data("refresh"));
     loop {
      tokio::select! { _=receiver.recv()=>{}, _=tokio::time::sleep(Duration::from_secs(20))=>{} }
      if authenticated(&app,&headers).is_err(){yield Ok(Event::default().event("session-ended").data("logout"));break;}
      yield Ok(Event::default().event("notes").data("refresh"));
     }
    };
    Ok(Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(10)))
        .into_response())
}
fn schema(db: &Connection) -> rusqlite::Result<()> {
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > 1 {
        return Err(rusqlite::Error::InvalidQuery);
    }
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL, hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, data BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS task_workspace(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS finance_workspace(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
 INSERT OR IGNORE INTO finance_workspace VALUES(1,'{\"revision\":0,\"items\":[]}');
 INSERT OR IGNORE INTO task_workspace VALUES(1,'{\"revision\":0,\"items\":[]}');
 CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,created_at INTEGER NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS interests(id INTEGER PRIMARY KEY,email TEXT NOT NULL,message TEXT NOT NULL,created_at INTEGER NOT NULL);
 PRAGMA user_version=1;")
}
#[tokio::main]
async fn main() {
    let config = std::env::var("OWNER_FILE").unwrap_or("/run/secrets/owner".into());
    let credentials: Credentials = serde_json::from_str(
        &std::fs::read_to_string(config).expect("Owner credential file is required"),
    )
    .expect("Invalid owner credential file");
    assert!(
        !credentials.username.is_empty() && credentials.password.len() >= 16,
        "Owner password must contain at least 16 characters"
    );
    let db =
        Connection::open(std::env::var("DATABASE_PATH").unwrap_or("/data/notes.sqlite".into()))
            .expect("Cannot open database");
    db.busy_timeout(Duration::from_secs(5)).unwrap();
    schema(&db).unwrap();
    let stored = db
        .query_row("SELECT username,hash FROM owner WHERE id=1", [], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .ok();
    let hash = match stored {
        Some((username, hash))
            if username == credentials.username
                && Argon2::default()
                    .verify_password(
                        credentials.password.as_bytes(),
                        &PasswordHash::new(&hash).unwrap(),
                    )
                    .is_ok() =>
        {
            hash
        }
        _ => {
            let hash = Argon2::default()
                .hash_password(
                    credentials.password.as_bytes(),
                    &SaltString::generate(&mut OsRng),
                )
                .unwrap()
                .to_string();
            db.execute("DELETE FROM sessions", []).unwrap();
            db.execute("INSERT INTO owner(id,username,hash) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,hash=excluded.hash",params![credentials.username,hash]).unwrap();
            hash
        }
    };
    let (event_bus, _) = broadcast::channel(64);
    let app = App {
        db: Arc::new(Mutex::new(db)),
        username: credentials.username,
        hash,
        origins: std::env::var("ALLOWED_ORIGINS")
            .expect("ALLOWED_ORIGINS required")
            .split(',')
            .map(str::to_owned)
            .collect(),
        secure: std::env::var("COOKIE_SECURE").unwrap_or("true".into()) != "false",
        events: event_bus,
        attempts: Arc::new(Mutex::new(HashMap::new())),
        password_work: Arc::new(tokio::sync::Semaphore::new(2)),
    };
    let router = Router::new()
        .route(
            "/api/health",
            get(|| async { Json(serde_json::json!({"status":"ok"})) }),
        )
        .route("/api/session", get(me).post(login).delete(logout))
        .route("/api/notes", get(list).post(create))
        .route("/api/tasks", get(tasks::list).put(tasks::update))
        .route("/api/finance", get(finance::list).put(finance::update))
        .route("/api/notes/{id}", put(update).delete(remove))
        .route("/api/media/{id}", get(get_media).put(put_media))
        .route("/api/events", get(events))
        .route("/api/registration-interest", post(interest).get(interests))
        .layer(DefaultBodyLimit::max(4_200_000))
        .layer(middleware::from_fn_with_state(app.clone(), guard))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("Zivizip Notes listening on :8080");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .unwrap();
}
#[cfg(test)]
mod tests {
    use super::*;
    fn note() -> Note {
        Note {
            rich: None,
            kind: NoteKind::Text,
            id: Uuid::new_v4().to_string(),
            name: "Plan".into(),
            category: "General".into(),
            icon: "note".into(),
            body: "first".into(),
            revision: 1,
            created_at: 1,
            updated_at: 1,
        }
    }
    #[test]
    fn stale_writes_preserve_both_versions() {
        let mut db = Connection::open_in_memory().unwrap();
        schema(&db).unwrap();
        let n = note();
        db.execute(
            "INSERT INTO notes VALUES(?,?,?,?)",
            params![n.id, 1, 1, serde_json::to_string(&n).unwrap()],
        )
        .unwrap();
        let mut a = n.clone();
        a.body = "device A".into();
        let saved = write_note(&mut db, a).unwrap();
        assert_eq!(saved.revision, 2);
        let mut b = n;
        b.body = "device B".into();
        let copy = write_note(&mut db, b).unwrap();
        assert_ne!(copy.id, saved.id);
        assert_eq!(
            db.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            db.query_row("SELECT data FROM notes WHERE id=?", [saved.id], row_note)
                .unwrap()
                .body,
            "device A"
        );
    }
    #[test]
    fn deleted_note_edit_recovers_as_copy() {
        let mut db = Connection::open_in_memory().unwrap();
        schema(&db).unwrap();
        let n = note();
        let result = write_note(&mut db, n.clone()).unwrap();
        assert_ne!(result.id, n.id);
        assert_eq!(result.body, n.body);
    }
    #[test]
    fn invalid_note_is_rejected() {
        let mut n = note();
        n.name = " ".into();
        assert!(validate(&n).is_err());
    }
}
