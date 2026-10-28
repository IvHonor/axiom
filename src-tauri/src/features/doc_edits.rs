//! Rich text stored as Yjs edits (a CRDT), shared by the Journal and Notes.
//!
//! Each save adds that computer's new edits as their own row, so sync never
//! has to choose between two computers' versions: applied together, in any
//! order, they make the same text. A big update (a snapshot) is split into
//! parts sharing `chunk_of`, so no row outgrows what sync carries once
//! encrypted. The app works the document out; here rows are only kept, apart
//! from `append`, which lets Lemma write: it adds paragraphs the way the
//! editor would, so they merge with anything typed meanwhile.

use std::collections::HashMap;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Serialize;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, Transact, Update, XmlElementPrelim, XmlFragment, XmlTextPrelim};

use crate::db::new_id;

/// The fragment TipTap's Collaboration extension edits (`FIELD` in
/// `src/lib/richtext/doc.ts`).
const FIELD: &str = "default";

/// Paragraphs added to the end of a document with these `edits`, as one Yjs
/// update (base64) to save beside them.
pub fn append(edits: &[EditView], paragraphs: &[&str]) -> String {
    let doc = Doc::new();
    let fragment = doc.get_or_insert_xml_fragment(FIELD);
    {
        let mut txn = doc.transact_mut();
        for edit in edits {
            // A broken update is skipped, as the editor skips it.
            if let Some(update) = BASE64.decode(&edit.data).ok().and_then(|bytes| Update::decode_v1(&bytes).ok()) {
                let _ = txn.apply_update(update);
            }
        }
    }
    let before = doc.transact().state_vector();
    {
        let mut txn = doc.transact_mut();
        for text in paragraphs {
            let at = fragment.len(&txn);
            let paragraph = fragment.insert(&mut txn, at, XmlElementPrelim::empty("paragraph"));
            if !text.is_empty() {
                paragraph.insert(&mut txn, 0, XmlTextPrelim::new(*text));
            }
        }
    }
    BASE64.encode(doc.transact().encode_state_as_update_v1(&before))
}

/// The plain copy after `append`: the text `before` and the paragraphs, one
/// line each as the editor writes it, and its words (anything with a letter
/// or digit, as `countWords` counts).
pub fn plain(before: &str, added: &[&str]) -> (String, i32) {
    let text = if before.trim().is_empty() { added.join("\n") } else { format!("{before}\n{}", added.join("\n")) };
    let words = text.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).count() as i32;
    (text, words)
}

/// Writing split into paragraphs: one per line, blank lines dropped.
pub fn paragraphs(text: &str) -> Vec<&str> {
    text.lines().map(str::trim_end).filter(|l| !l.trim().is_empty()).collect()
}

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
