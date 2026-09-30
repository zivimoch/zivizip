use serde::{Deserialize, Serialize};
use std::collections::HashSet;
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Document {
    pub version: u8,
    pub blocks: Vec<Block>,
    pub images: Vec<Image>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Block {
    Paragraph { text: String },
    Image { id: String },
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Image {
    pub id: String,
    pub asset: String,
    pub w: f64,
    pub h: f64,
    pub dx: f64,
    pub dy: f64,
    pub angle: f64,
}
pub fn asset_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn valid(doc: &Document, body: &str) -> bool {
    if doc.version != 1
        || doc.blocks.len() > 20000
        || doc.images.len() > 100
        || serde_json::to_vec(doc).map_or(true, |v| v.len() > 2_000_000)
    {
        return false;
    }
    let mut ids = HashSet::new();
    for im in &doc.images {
        if im.id.is_empty()
            || im.id.len() > 64
            || !im
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
            || !ids.insert(&im.id)
            || !asset_id(&im.asset)
            || ![im.w, im.h, im.dx, im.dy, im.angle]
                .iter()
                .all(|n| n.is_finite())
            || im.w < 20.
            || im.w > 10000.
            || im.h < 10.
            || im.h > 10000.
            || im.dx.abs() > 100000.
            || im.dy.abs() > 100000.
            || im.angle.abs() > 360000.
        {
            return false;
        }
    }
    let mut anchors = HashSet::new();
    let mut paragraphs = Vec::new();
    for block in &doc.blocks {
        match block {
            Block::Paragraph { text } => paragraphs.push(text.as_str()),
            Block::Image { id } => {
                if !ids.contains(id) || !anchors.insert(id) {
                    return false;
                }
            }
        }
    }
    anchors.len() == ids.len() && paragraphs.join("\n") == body
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_inconsistent_anchors_and_text() {
        let mut doc = Document {
            version: 1,
            blocks: vec![Block::Paragraph {
                text: "Hello".into(),
            }],
            images: vec![],
        };
        assert!(valid(&doc, "Hello"));
        assert!(!valid(&doc, "Other"));
        doc.blocks.push(Block::Image {
            id: "missing".into(),
        });
        assert!(!valid(&doc, "Hello"));
    }
}
