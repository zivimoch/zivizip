use super::*;
use std::net::IpAddr;

pub fn schema(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS visitors(id TEXT PRIMARY KEY,name TEXT NOT NULL,browser TEXT NOT NULL,os TEXT NOT NULL,country TEXT,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL,visits INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS visitors_seen ON visitors(last_seen);")
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Visit {
    id: String,
    name: String,
}
fn identity(value: &str) -> bool {
    Uuid::parse_str(value).is_ok() && value.len() == 36
}
fn device(ua: &str) -> (&'static str, &'static str) {
    let browser = if ua.contains("Edg") {
        "Edge"
    } else if ua.contains("Firefox") || ua.contains("FxiOS") {
        "Firefox"
    } else if ua.contains("Chrome") || ua.contains("CriOS") {
        "Chrome"
    } else if ua.contains("Safari") {
        "Safari"
    } else {
        "Other"
    };
    let os = if ua.contains("Android") {
        "Android"
    } else if ua.contains("iPhone") || ua.contains("iPad") {
        "iOS / iPadOS"
    } else if ua.contains("Windows") {
        "Windows"
    } else if ua.contains("Macintosh") {
        "macOS / iPadOS"
    } else if ua.contains("Linux") {
        "Linux"
    } else {
        "Other"
    };
    (browser, os)
}
fn ip_key(value: &str) -> Option<String> {
    let ip: IpAddr = value.parse().ok()?;
    let key = match ip {
        IpAddr::V4(ip) => u128::from(ip.to_ipv6_mapped()),
        IpAddr::V6(ip) => u128::from(ip),
    };
    Some(format!("{key:032x}"))
}
fn country(ip: &str) -> Option<String> {
    let key = ip_key(ip)?;
    let path = std::env::var("GEOIP_DATABASE").unwrap_or("/data/geoip.sqlite".into());
    let db = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    let (end, code): (String, String) = db
        .query_row(
            "SELECT last,country FROM ranges WHERE first<=? ORDER BY first DESC LIMIT 1",
            [&key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok()?;
    (key <= end && code.len() == 2 && code != "ZZ").then_some(code)
}
pub async fn visit(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Visit>,
) -> Result<StatusCode> {
    if !identity(&input.id)
        || input.name.chars().count() > 80
        || input.name.chars().any(char::is_control)
    {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid visitor profile"));
    }
    limit(&app, format!("visit:{}", digest(&client(&headers))), 60)?;
    let ua = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let (browser, os) = device(ua);
    let country = country(&client(&headers));
    let time = millis();
    let db = app.db.lock().unwrap();
    db.execute(
        "DELETE FROM visitors WHERE last_seen < ?",
        [time - 90 * 86400000],
    )?;
    db.execute("INSERT INTO visitors VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,browser=excluded.browser,os=excluded.os,country=excluded.country,visits=visitors.visits+CASE WHEN excluded.last_seen-visitors.last_seen>=1800000 THEN 1 ELSE 0 END,last_seen=excluded.last_seen",params![digest(&input.id),input.name.trim(),browser,os,country,time,time])?;
    db.execute("DELETE FROM visitors WHERE id IN (SELECT id FROM visitors ORDER BY last_seen DESC LIMIT -1 OFFSET 20000)",[])?;
    Ok(StatusCode::NO_CONTENT)
}
pub async fn forget(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Visit>,
) -> Result<StatusCode> {
    if !identity(&input.id) {
        return Err(Error(StatusCode::BAD_REQUEST, "Invalid visitor profile"));
    }
    limit(&app, format!("visit:{}", digest(&client(&headers))), 60)?;
    app.db
        .lock()
        .unwrap()
        .execute("DELETE FROM visitors WHERE id=?", [digest(&input.id)])?;
    Ok(StatusCode::NO_CONTENT)
}
pub async fn overview(
    State(app): State<App>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>> {
    authenticated(&app, &headers)?;
    let db = app.db.lock().unwrap();
    db.execute(
        "DELETE FROM visitors WHERE last_seen < ?",
        [millis() - 90 * 86400000],
    )?;
    let sessions: i64 = db.query_row(
        "SELECT COUNT(*) FROM sessions WHERE expires>?",
        [now()],
        |r| r.get(0),
    )?;
    let total: i64 = db.query_row("SELECT COUNT(*) FROM visitors", [], |r| r.get(0))?;
    let mut stmt=db.prepare("SELECT id,name,browser,os,country,first_seen,last_seen,visits FROM visitors ORDER BY last_seen DESC LIMIT 500")?;
    let visitors=stmt.query_map([],|r| Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"browser":r.get::<_,String>(2)?,"os":r.get::<_,String>(3)?,"country":r.get::<_,Option<String>>(4)?,"firstSeen":r.get::<_,i64>(5)?,"lastSeen":r.get::<_,i64>(6)?,"visits":r.get::<_,i64>(7)?})))?.collect::<std::result::Result<Vec<_>,_>>()?;
    Ok(Json(
        serde_json::json!({"username":app.username,"sessions":sessions,"total":total,"visitors":visitors}),
    ))
}
pub async fn revoke_others(State(app): State<App>, headers: HeaderMap) -> Result<StatusCode> {
    let current = authenticated(&app, &headers)?;
    app.db
        .lock()
        .unwrap()
        .execute("DELETE FROM sessions WHERE token!=?", [current])?;
    let _ = app.events.send(());
    Ok(StatusCode::NO_CONTENT)
}
pub async fn remove_visitor(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    authenticated(&app, &headers)?;
    app.db
        .lock()
        .unwrap()
        .execute("DELETE FROM visitors WHERE id=?", [id])?;
    Ok(StatusCode::NO_CONTENT)
}
pub async fn remove_interest(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode> {
    authenticated(&app, &headers)?;
    app.db
        .lock()
        .unwrap()
        .execute("DELETE FROM interests WHERE id=?", [id])?;
    Ok(StatusCode::NO_CONTENT)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_identity_and_coarse_device() {
        assert!(identity(&Uuid::new_v4().to_string()));
        assert!(!identity("device"));
        assert_eq!(device("Mozilla Android Chrome/123"), ("Chrome", "Android"));
        assert_eq!(ip_key("1.2.3.4"), ip_key("::ffff:1.2.3.4"));
        assert_eq!(ip_key("invalid"), None);
        let db = Connection::open_in_memory().unwrap();
        schema(&db).unwrap();
        schema(&db).unwrap();
    }
}
