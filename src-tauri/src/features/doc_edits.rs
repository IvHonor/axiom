//! Rich text stored as Yjs edits (a CRDT), shared by the Journal and Notes.
//!
//! Each save adds that computer's new edits as their own row, so sync never
//! has to choose between two computers' versions: applied together, in any
//! order, they make the same text. A big update (a snapshot) is split into
//! parts sharing `chunk_of`, so no row outgrows what sync carries once
//! encrypted. The app works the document out; here rows are only kept.

use std::collections::HashMap;

use serde::Serialize;

use crate::db::new_id;

/// The most of an update one row holds.
pub const CHUNK: usize = 16_000;

/// One update (put back together if it was split), with the row ids it came
/// from, so a snapshot can replace them.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditView {
    pub ids: Vec<String>,
    /// A Yjs update, base64.
    pub data: String,
}

/// A row as stored, or about to be.
pub struct Row {
    pub id: String,
    pub chunk_of: Option<String>,
    pub part: i32,
    pub parts: i32,
    pub data: String,
}

/// An update as the rows to store it in.
pub fn split(data: &str) -> Vec<Row> {
    let pieces: Vec<&str> = if data.len() <= CHUNK {
        vec![data]
    } else {
        // Base64 is ASCII, so byte offsets are character boundaries.
        data.as_bytes().chunks(CHUNK).map(|c| std::str::from_utf8(c).expect("base64 is ASCII")).collect()
    };
    let group = (pieces.len() > 1).then(new_id);
    pieces
        .iter()
        .enumerate()
        .map(|(i, piece)| Row {
            id: match (&group, i) {
                (Some(g), 0) => g.clone(),
                _ => new_id(),
            },
            chunk_of: group.clone(),
            part: i as i32,
            parts: pieces.len() as i32,
            data: (*piece).to_owned(),
        })
        .collect()
}

/// Rows (oldest first) back as updates. A split update is left out until all
/// its parts have arrived.
pub fn assemble(rows: impl IntoIterator<Item = Row>) -> Vec<EditView> {
    let mut whole = Vec::new();
    let mut groups: HashMap<String, Vec<Row>> = HashMap::new();
    for row in rows {
        match row.chunk_of.clone() {
            Some(group) => groups.entry(group).or_default().push(row),
            None => whole.push(EditView { ids: vec![row.id], data: row.data }),
        }
    }
    for (_, mut parts) in groups {
        parts.sort_by_key(|p| p.part);
        let expected = parts.first().map_or(0, |p| p.parts) as usize;
        if parts.len() == expected {
            whole.push(EditView { ids: parts.iter().map(|p| p.id.clone()).collect(), data: parts.iter().map(|p| p.data.as_str()).collect() });
        }
    }
    whole
}
