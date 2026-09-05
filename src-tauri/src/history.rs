// Snapshots: a copy of what was written, kept for thirty days (spec §2a).
// One folder per document, named by the same id the drafts use, so the two
// always point at the same file.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use crate::fs::{FsError, FsResult, WriteRequest};

/// A save every few seconds must not fill the folder, so a new snapshot only
/// after this long (spec §2a).
pub const EVERY: Duration = Duration::from_secs(5 * 60);
/// Anything older than this goes at startup.
pub const KEEP: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// The id comes from the front end; it is a hash, but the folder name is
/// built from it, so nothing that could climb out of the folder survives.
fn safe_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(64)
        .collect()
}

pub fn root<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    crate::data_dir(app).join("history")
}

fn folder<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<PathBuf> {
    let name = safe_id(id);
    (!name.is_empty()).then(|| root(app).join(name))
}

/* ------------------------------------------------------------- the clock */

/// Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm). Only
/// here so a timestamp does not drag a date library in.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

/// `2026-09-05T15-04-09` — ISO 8601 in UTC with the colons Windows refuses.
/// Sorting the file names sorts the snapshots.
pub fn stamp(time: SystemTime) -> String {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0);
    let (year, month, day) = civil_from_days((seconds / 86_400) as i64);
    let rest = seconds % 86_400;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}-{:02}-{:02}",
        rest / 3600,
        (rest / 60) % 60,
        rest % 60,
    )
}

/* ------------------------------------------------------------- the files */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    path: String,
    taken_at: f64,
    size: u64,
}

fn modified(entry: &fs::DirEntry) -> Option<SystemTime> {
    entry.metadata().ok()?.modified().ok()
}

/// When the newest snapshot in the folder was taken, or `None` when there is
/// none to speak of.
pub fn newest(dir: &Path) -> Option<SystemTime> {
    fs::read_dir(dir).ok()?.flatten().filter_map(|e| modified(&e)).max()
}

/// Whether a new snapshot is due: nothing there yet, or the last one is at
/// least five minutes old. A clock that went backwards reads as "not due",
/// which errs towards writing less rather than more.
pub fn due(dir: &Path, now: SystemTime) -> bool {
    match newest(dir) {
        Some(last) => now.duration_since(last).map(|gap| gap >= EVERY).unwrap_or(false),
        None => true,
    }
}

/// Through the same temp-and-rename a document write uses. A half-written
/// snapshot would look like a version in the history and, with its fresh
/// mtime, block the next attempt for five minutes (review #5).
fn write_snapshot(dir: &Path, bytes: &[u8], now: SystemTime) -> FsResult<PathBuf> {
    let mut target = dir.join(format!("{}.md", stamp(now)));
    // A second save inside the same second only happens on a forced snapshot.
    for extra in 1..100 {
        if !target.exists() {
            break;
        }
        target = dir.join(format!("{}-{extra}.md", stamp(now)));
    }
    let temp = crate::fs::stage(dir, bytes)?;
    if let Err(error) = crate::fs::commit(&target, &temp, target.exists()) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    Ok(target)
}

/// Called straight after a successful write, with the bytes that were
/// written. Failing to keep a copy must never fail the save, so the caller
/// throws the result away.
pub fn keep<R: Runtime>(app: &AppHandle<R>, id: &str, bytes: &[u8]) -> FsResult<Option<String>> {
    let Some(dir) = folder(app, id) else {
        return Ok(None);
    };
    let now = SystemTime::now();
    if dir.is_dir() && !due(&dir, now) {
        return Ok(None);
    }
    Ok(Some(
        write_snapshot(&dir, bytes, now)?.to_string_lossy().into_owned(),
    ))
}

/* ----------------------------------------------------------- the commands */

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRequest {
    pub id: String,
    pub text: String,
    pub encoding: String,
    pub bom: bool,
    pub eol: String,
}

/// A snapshot of text that is not on disk — what the buffer holds before a
/// restore replaces it (spec §2a). No five-minute rule: it is asked for.
#[tauri::command]
pub fn snapshot_text(app: AppHandle, request: SnapshotRequest) -> FsResult<Option<String>> {
    let Some(dir) = folder(&app, &request.id) else {
        return Ok(None);
    };
    let bytes = crate::fs::encoded_bytes(&WriteRequest {
        path: String::new(),
        text: request.text,
        encoding: request.encoding,
        bom: request.bom,
        eol: request.eol,
        base_hash: None,
        allow_missing: true,
        snapshot_id: None,
    })?;
    Ok(Some(
        write_snapshot(&dir, &bytes, SystemTime::now())?
            .to_string_lossy()
            .into_owned(),
    ))
}

/// Newest first, which is the order the history screen wants.
pub fn snapshots_in(dir: &Path) -> Vec<Snapshot> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<Snapshot> = entries
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let taken = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
            Some(Snapshot {
                path: entry.path().to_string_lossy().into_owned(),
                taken_at: taken.as_millis() as f64,
                size: meta.len(),
            })
        })
        .collect();
    found.sort_by(|a, b| b.taken_at.total_cmp(&a.taken_at));
    found
}

#[tauri::command]
pub fn list_snapshots(app: AppHandle, id: String) -> FsResult<Vec<Snapshot>> {
    Ok(folder(&app, &id).map(|dir| snapshots_in(&dir)).unwrap_or_default())
}

/// Plain deletion, not the Recycle Bin: a snapshot is already a copy.
/// Only inside our own history folder, whatever path the front end sends.
/// `history/../settings.json` has the history folder among its components
/// but is not inside it; both sides are resolved before they are compared
/// (review #18).
fn inside(root: &Path, target: &Path) -> bool {
    let resolved_root = crate::fs::canonical(root);
    let resolved = crate::fs::canonical(target);
    resolved != resolved_root && resolved.starts_with(&resolved_root)
}

#[tauri::command]
pub fn delete_snapshot(app: AppHandle, path: String) -> FsResult<()> {
    let target = PathBuf::from(&path);
    if !inside(&root(&app), &target) {
        return Err(FsError::io("not a snapshot"));
    }
    fs::remove_file(&target)?;
    Ok(())
}

/// Thirty days, swept once at startup. An empty folder goes with the last of
/// its snapshots.
pub fn clean<R: Runtime>(app: &AppHandle<R>) {
    sweep(&root(app), SystemTime::now());
}

fn sweep(history: &Path, now: SystemTime) {
    let Ok(folders) = fs::read_dir(history) else {
        return;
    };
    for folder in folders.flatten() {
        let dir = folder.path();
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let old = modified(&entry)
                .and_then(|at| now.duration_since(at).ok())
                .is_some_and(|age| age > KEEP);
            if old {
                let _ = fs::remove_file(entry.path());
            }
        }
        if fs::read_dir(&dir).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = fs::remove_dir(&dir);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn a_stamp_is_sortable_iso_without_colons() {
        let epoch = UNIX_EPOCH + Duration::from_secs(1_788_000_000);
        let text = stamp(epoch);
        assert!(!text.contains(':'), "{text}");
        assert_eq!(text.len(), 19);
        assert_eq!(&text[4..5], "-");
        assert_eq!(&text[10..11], "T");
        // A later moment sorts after an earlier one, as plain strings.
        assert!(stamp(epoch + Duration::from_secs(3600)) > text);
    }

    #[test]
    fn a_known_moment_formats_the_way_iso_says() {
        // 2026-09-05T12:34:56Z
        assert_eq!(
            stamp(UNIX_EPOCH + Duration::from_secs(1_788_611_696)),
            "2026-09-05T12-34-56"
        );
        assert_eq!(stamp(UNIX_EPOCH), "1970-01-01T00-00-00");
        // A leap day, which is where a hand-written calendar goes wrong.
        assert_eq!(
            stamp(UNIX_EPOCH + Duration::from_secs(1_709_208_000)),
            "2024-02-29T12-00-00"
        );
    }

    /// §2a: at most one snapshot per document per five minutes.
    #[test]
    fn a_snapshot_waits_five_minutes_for_the_next_one() {
        let dir = tempfile::tempdir().unwrap();
        let history = dir.path().join("id");
        let now = SystemTime::now();

        assert!(due(&history, now), "an empty folder is always due");
        write_snapshot(&history, b"one\n", now).unwrap();

        // Measured from the file's own mtime, which is what `due` reads.
        let taken = newest(&history).expect("the snapshot should be there");
        assert!(!due(&history, taken), "a fresh snapshot blocks the next");
        assert!(!due(&history, taken + Duration::from_secs(4 * 60)));
        assert!(due(&history, taken + EVERY));
        assert!(due(&history, taken + Duration::from_secs(10 * 60)));
    }

    #[test]
    fn two_snapshots_in_one_second_do_not_collide() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        let first = write_snapshot(dir.path(), b"one\n", now).unwrap();
        let second = write_snapshot(dir.path(), b"two\n", now).unwrap();

        assert_ne!(first, second);
        assert_eq!(fs::read(&first).unwrap(), b"one\n");
        assert_eq!(fs::read(&second).unwrap(), b"two\n");
    }

    /// Gives a file an mtime in the past, which is the only thing `due` and
    /// `sweep` look at.
    fn age(path: &Path, by: Duration) {
        let when = SystemTime::now() - by;
        let file = fs::OpenOptions::new().write(true).open(path).unwrap();
        file.set_times(fs::FileTimes::new().set_modified(when)).unwrap();
    }

    #[test]
    fn the_list_comes_back_newest_first_with_sizes() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        let older = write_snapshot(dir.path(), b"older\n", now - Duration::from_secs(600)).unwrap();
        let newer = write_snapshot(dir.path(), b"the newer one\n", now).unwrap();
        age(&older, Duration::from_secs(600));

        let listed = snapshots_in(dir.path());
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].path, newer.to_string_lossy());
        assert_eq!(listed[1].path, older.to_string_lossy());
        assert_eq!(listed[0].size, 14);
        assert!(listed[0].taken_at > listed[1].taken_at);

        // A folder nobody has written to yet is not an error, just empty.
        assert!(snapshots_in(&dir.path().join("nothing")).is_empty());
    }

    /// §2a: thirty days, swept at startup.
    #[test]
    fn the_sweep_keeps_thirty_days_and_no_more() {
        let history = tempfile::tempdir().unwrap();
        let doc = history.path().join("66e039ef");
        let now = SystemTime::now();
        let fresh = write_snapshot(&doc, b"keep me\n", now).unwrap();
        let stale = write_snapshot(&doc, b"drop me\n", now - Duration::from_secs(60)).unwrap();
        age(&stale, KEEP + Duration::from_secs(60 * 60));

        sweep(history.path(), now);
        assert!(fresh.exists(), "a fresh snapshot must survive");
        assert!(!stale.exists(), "an old one must not");
        assert!(doc.is_dir(), "the folder stays while it holds something");

        // Sweeping the last one out takes the empty folder with it.
        age(&fresh, KEEP + Duration::from_secs(60 * 60));
        sweep(history.path(), now);
        assert!(!doc.exists());
    }

    /// §2a keeps versions; a half-written one is not a version, and with its
    /// fresh mtime it would block the next attempt for five minutes.
    #[test]
    fn a_snapshot_appears_whole_or_not_at_all() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        let body = "x".repeat(200_000);

        let written = write_snapshot(dir.path(), body.as_bytes(), now).unwrap();
        assert_eq!(fs::read(&written).unwrap().len(), body.len());
        // Nothing but the finished snapshot: no temp file left over.
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);

        // A folder that cannot be written to leaves nothing behind either.
        let blocked = dir.path().join("file-not-a-folder");
        fs::write(&blocked, b"in the way").unwrap();
        assert!(write_snapshot(&blocked.join("inside"), b"x", now).is_err());
    }

    /// The command's own boundary: `history/../settings.json` has the folder
    /// among its components but is not inside it (review #18).
    #[test]
    fn the_history_boundary_is_not_fooled_by_dot_dot() {
        let dir = tempfile::tempdir().unwrap();
        let history = dir.path().join("history");
        let doc = history.join("66e039ef");
        fs::create_dir_all(&doc).unwrap();
        let snapshot = doc.join("2026-09-05T12-00-00.md");
        fs::write(&snapshot, b"a version").unwrap();
        let outside = dir.path().join("settings.json");
        fs::write(&outside, b"not a snapshot").unwrap();

        assert!(inside(&history, &snapshot));
        assert!(!inside(&history, &outside));
        assert!(!inside(&history, &history.join("..").join("settings.json")));
        // The folder itself is not something to delete.
        assert!(!inside(&history, &history));
    }

    #[test]
    fn an_id_cannot_climb_out_of_the_history_folder() {
        assert_eq!(safe_id("66e039ef"), "66e039ef");
        assert_eq!(safe_id("../../windows/system32"), "windowssystem32");
        assert_eq!(safe_id("a/b\\c:d"), "abcd");
        assert!(safe_id("../..").is_empty());
    }
}
