use serde::Deserialize;
use std::collections::HashSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Scene {
    version: u8,
    shapes: Vec<Shape>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Shape {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    points: Vec<[f64; 2]>,
    color: String,
    width: f64,
    angle: f64,
    text: String,
    font_size: f64,
    erased: Vec<[f64; 3]>,
}
fn bounded(n: f64, max: f64) -> bool {
    n.is_finite() && n.abs() <= max
}
pub fn valid(body: &str) -> bool {
    let Ok(scene) = serde_json::from_str::<Scene>(body) else {
        return false;
    };
    if scene.version != 1 || scene.shapes.len() > 2000 {
        return false;
    }
    let mut ids = HashSet::new();
    let mut count = 0;
    for s in scene.shapes {
        count += s.points.len() + s.erased.len();
        if count > 100_000
            || s.id.is_empty()
            || s.id.len() > 64
            || !s.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            || !ids.insert(s.id)
            || ![
                "pen",
                "text",
                "rect",
                "ellipse",
                "parallelogram",
                "diamond",
                "triangle",
                "arrow",
            ]
            .contains(&s.kind.as_str())
            || s.color.len() != 7
            || !s.color.starts_with('#')
            || !s.color[1..].bytes().all(|b| b.is_ascii_hexdigit())
            || !bounded(s.width, 32.)
            || s.width < 1.
            || !bounded(s.angle, 360_000.)
            || !bounded(s.font_size, 1000.)
            || s.font_size < 8.
            || s.text.encode_utf16().count() > 10000
            || s.points.is_empty()
            || (s.kind != "pen" && s.points.len() != if s.kind == "text" { 1 } else { 2 })
            || !s.points.iter().flatten().all(|n| bounded(*n, 1_000_000.))
            || !s.erased.iter().all(|p| {
                bounded(p[0], 1_000_000.)
                    && bounded(p[1], 1_000_000.)
                    && bounded(p[2], 10000.)
                    && p[2] > 0.
            })
        {
            return false;
        }
    }
    true
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_version_and_safe_geometry() {
        let mut scene = serde_json::json!({"version":1,"shapes":[{"id":"shape-1","type":"rect","points":[[0,0],[100,80]],"color":"#17c5d5","width":4,"angle":45,"text":"A < B","fontSize":24,"erased":[[0,20,5]]}]});
        assert!(valid(&scene.to_string()));
        scene["shapes"][0]["color"] = "url(https://example.com)".into();
        assert!(!valid(&scene.to_string()));
        assert!(!valid(r#"{"version":2,"shapes":[]}"#));
    }
}
