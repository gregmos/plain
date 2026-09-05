// Everything that touches the user's files (spec §8). A read reports the
// encoding, the BOM and the line endings so a later save can put the bytes
// back the way they were; a write goes to a temp file in the same folder and
// replaces the original in one step.

use std::fs;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};
use serde::{Deserialize, Serialize};
use windows::core::PCWSTR;
use windows::Win32::Storage::FileSystem::{ReplaceFileW, REPLACEFILE_IGNORE_MERGE_ERRORS};

/// The three cases the front end tells apart: `conflict` stops the save and
/// raises a banner, `missing` may be recreated on purpose, `io` is reported.
#[derive(Debug, Serialize)]
pub struct FsError {
    kind: &'static str,
    message: String,
}

impl FsError {
    fn io(message: impl Into<String>) -> Self {
        Self {
            kind: "io",
            message: message.into(),
        }
    }

    fn conflict() -> Self {
        Self {
            kind: "conflict",
            message: "file changed on disk".into(),
        }
    }

    fn missing(path: &Path) -> Self {
        Self {
            kind: "missing",
            message: format!("{} is gone", path.display()),
        }
    }
}

impl From<std::io::Error> for FsError {
    fn from(error: std::io::Error) -> Self {
        Self::io(error.to_string())
    }
}

pub type FsResult<T> = Result<T, FsError>;

/* --------------------------------------------------------------- reading */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    text: String,
    /// encoding_rs label, lowercase: `utf-8`, `utf-16le`, `windows-1251`…
    encoding: String,
    bom: bool,
    /// What the file has: `crlf` `lf` `cr` `mixed` `none`.
    eol: String,
    /// What a save writes back; `crlf` when the file has no line break yet.
    dominant_eol: String,
    final_newline: bool,
    hash: String,
    mtime_ms: f64,
    size: u64,
    read_only: bool,
}

/// A byte-order mark and how many bytes of it to skip.
fn bom_of(bytes: &[u8]) -> Option<(&'static Encoding, usize)> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        Some((UTF_8, 3))
    } else if bytes.starts_with(&[0xFF, 0xFE]) {
        Some((UTF_16LE, 2))
    } else if bytes.starts_with(&[0xFE, 0xFF]) {
        Some((UTF_16BE, 2))
    } else {
        None
    }
}

/// BOM, then valid UTF-8, then chardetng (spec §8). `forced` comes from
/// `reopen as…` and wins over all of it.
fn detect(bytes: &[u8], forced: Option<&str>) -> (&'static Encoding, usize) {
    if let Some(label) = forced {
        let encoding = Encoding::for_label(label.as_bytes()).unwrap_or(UTF_8);
        let skip = match bom_of(bytes) {
            Some((found, len)) if found == encoding => len,
            _ => 0,
        };
        return (encoding, skip);
    }
    if let Some(found) = bom_of(bytes) {
        return found;
    }
    if std::str::from_utf8(bytes).is_ok() {
        return (UTF_8, 0);
    }
    // UTF-8 was already ruled out above, so the detector only has to choose
    // between the legacy encodings.
    let mut detector = EncodingDetector::new(Iso2022JpDetection::Deny);
    detector.feed(bytes, true);
    (detector.guess(None, Utf8Detection::Deny), 0)
}

/// `(what the file has, what a save writes back)`.
fn line_endings(text: &str) -> (&'static str, &'static str) {
    let (mut crlf, mut lf, mut cr) = (0usize, 0usize, 0usize);
    let bytes = text.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' => {
                if bytes.get(index + 1) == Some(&b'\n') {
                    crlf += 1;
                    index += 1;
                } else {
                    cr += 1;
                }
            }
            b'\n' => lf += 1,
            _ => {}
        }
        index += 1;
    }

    let kinds = u8::from(crlf > 0) + u8::from(lf > 0) + u8::from(cr > 0);
    let dominant = if crlf > 0 && crlf >= lf && crlf >= cr {
        "crlf"
    } else if lf > 0 && lf >= cr {
        "lf"
    } else if cr > 0 {
        "cr"
    } else {
        // Nothing to go by: the Windows default (§8, files.newFileEol).
        "crlf"
    };
    let eol = match kinds {
        0 => "none",
        1 => dominant,
        _ => "mixed",
    };
    (eol, dominant)
}

fn mtime_ms(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as f64)
        .unwrap_or(0.0)
}

/// The text comes back exactly as it is on disk, CRLF and all: CodeMirror
/// normalizes it, and the front end keeps `eol` to put it back.
pub fn read_info(path: &Path, forced: Option<&str>) -> FsResult<FileInfo> {
    let bytes = fs::read(path)?;
    let meta = fs::metadata(path)?;
    let (encoding, skip) = detect(&bytes, forced);
    let (text, _) = encoding.decode_without_bom_handling(&bytes[skip..]);
    let (eol, dominant) = line_endings(&text);
    Ok(FileInfo {
        final_newline: text.ends_with('\n') || text.ends_with('\r'),
        eol: eol.into(),
        dominant_eol: dominant.into(),
        encoding: encoding.name().to_ascii_lowercase(),
        bom: skip > 0,
        hash: blake3::hash(&bytes).to_hex().to_string(),
        mtime_ms: mtime_ms(&meta),
        size: meta.len(),
        read_only: meta.permissions().readonly(),
        text: text.into_owned(),
    })
}

#[tauri::command]
pub fn read_file(path: String, encoding: Option<String>) -> FsResult<FileInfo> {
    read_info(Path::new(&path), encoding.as_deref())
}

#[tauri::command]
pub fn hash_file(path: String) -> Option<String> {
    fs::read(path)
        .ok()
        .map(|bytes| blake3::hash(&bytes).to_hex().to_string())
}

/* --------------------------------------------------------------- writing */

/// encoding_rs turns the two UTF-16 encodings into UTF-8 on the way out, so
/// they are done by hand.
fn encode(text: &str, label: &str) -> Vec<u8> {
    match label {
        "utf-16le" => text.encode_utf16().flat_map(u16::to_le_bytes).collect(),
        "utf-16be" => text.encode_utf16().flat_map(u16::to_be_bytes).collect(),
        _ => Encoding::for_label(label.as_bytes())
            .unwrap_or(UTF_8)
            .encode(text)
            .0
            .into_owned(),
    }
}

fn bom_bytes(label: &str) -> &'static [u8] {
    match label {
        "utf-16le" => &[0xFF, 0xFE],
        "utf-16be" => &[0xFE, 0xFF],
        _ => &[0xEF, 0xBB, 0xBF],
    }
}

/// The front end already did this; doing it again keeps a pasted `\n` out of
/// a CRLF file. `keep` is for our own files in %APPDATA%.
fn apply_eol(text: &str, eol: &str) -> String {
    if eol == "keep" {
        return text.to_string();
    }
    let lf = if text.contains('\r') {
        text.replace("\r\n", "\n").replace('\r', "\n")
    } else {
        text.to_string()
    };
    match eol {
        "crlf" => lf.replace('\n', "\r\n"),
        "cr" => lf.replace('\n', "\r"),
        _ => lf,
    }
}

fn wide(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain(Some(0)).collect()
}

/// temp file in the same folder -> FlushFileBuffers -> ReplaceFileW, which
/// keeps the creation time and the attributes of the original (spec §8).
fn replace_with(target: &Path, bytes: &[u8]) -> FsResult<()> {
    let dir = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| FsError::io("no parent folder"))?;
    fs::create_dir_all(dir)?;

    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    temp.write_all(bytes)?;
    temp.flush()?;
    temp.as_file().sync_all()?;

    if target.exists() {
        let (file, temp_path) = temp.keep().map_err(|error| FsError::io(error.to_string()))?;
        drop(file);
        let replaced = wide(target);
        let replacement = wide(&temp_path);
        let outcome = unsafe {
            ReplaceFileW(
                PCWSTR(replaced.as_ptr()),
                PCWSTR(replacement.as_ptr()),
                PCWSTR::null(),
                REPLACEFILE_IGNORE_MERGE_ERRORS,
                None,
                None,
            )
        };
        if let Err(error) = outcome {
            let _ = fs::remove_file(&temp_path);
            return Err(FsError::io(error.message()));
        }
    } else {
        temp.persist(target)
            .map_err(|error| FsError::io(error.error.to_string()))?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
    pub path: String,
    pub text: String,
    pub encoding: String,
    pub bom: bool,
    pub eol: String,
    /// Hash of the bytes the buffer was loaded from; `null` for Save As.
    pub base_hash: Option<String>,
    /// The file was deleted from under us and the user wants it back (§8).
    #[serde(default)]
    pub allow_missing: bool,
}

#[derive(Debug, Serialize)]
pub struct WriteResult {
    hash: String,
}

/// One lock for every write. A personal editor with one window does not need
/// per-path locks, and this also keeps two documents in the same folder from
/// racing over their temp files.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn write_checked(request: &WriteRequest) -> FsResult<String> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let path = PathBuf::from(&request.path);

    let mut bytes = Vec::new();
    if request.bom {
        bytes.extend_from_slice(bom_bytes(&request.encoding));
    }
    bytes.extend_from_slice(&encode(
        &apply_eol(&request.text, &request.eol),
        &request.encoding,
    ));

    if path.exists() {
        if let Some(base) = request.base_hash.as_deref() {
            let current = blake3::hash(&fs::read(&path)?).to_hex().to_string();
            if current != base {
                return Err(FsError::conflict());
            }
        }
    } else if request.base_hash.is_some() && !request.allow_missing {
        return Err(FsError::missing(&path));
    }

    replace_with(&path, &bytes)?;
    Ok(blake3::hash(&bytes).to_hex().to_string())
}

#[tauri::command]
pub fn write_file_atomic(request: WriteRequest) -> FsResult<WriteResult> {
    write_checked(&request).map(|hash| WriteResult { hash })
}

/// Drafts and state.json: same temp-and-replace, always UTF-8, never
/// touching the line endings of the JSON we produced ourselves.
#[tauri::command]
pub fn write_text_atomic(path: String, text: String) -> FsResult<()> {
    write_checked(&WriteRequest {
        path,
        text,
        encoding: "utf-8".into(),
        bom: false,
        eol: "keep".into(),
        base_hash: None,
        allow_missing: true,
    })
    .map(|_| ())
}

/// Recycle Bin, not deletion (spec §6).
#[tauri::command]
pub fn trash_path(path: String) -> FsResult<()> {
    trash::delete(&path).map_err(|error| FsError::io(error.to_string()))
}

/* ----------------------------------------------------------------- tests */

#[cfg(test)]
mod tests {
    use super::*;
    use encoding_rs::WINDOWS_1251;

    fn request(path: &Path, text: &str) -> WriteRequest {
        WriteRequest {
            path: path.to_string_lossy().into_owned(),
            text: text.into(),
            encoding: "utf-8".into(),
            bom: false,
            eol: "lf".into(),
            base_hash: None,
            allow_missing: false,
        }
    }

    #[test]
    fn writes_a_new_file_and_replaces_it() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.md");

        write_checked(&request(&file, "one\n")).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"one\n");

        let hash = write_checked(&request(&file, "two\n")).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"two\n");
        assert_eq!(hash, blake3::hash(b"two\n").to_hex().to_string());
        // The temp file is gone; the folder holds the note and nothing else.
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_stale_base_hash_is_a_conflict_and_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.md");
        fs::write(&file, b"on disk\n").unwrap();

        let mut ask = request(&file, "mine\n");
        ask.base_hash = Some(blake3::hash(b"something else").to_hex().to_string());
        let error = write_checked(&ask).unwrap_err();

        assert_eq!(error.kind, "conflict");
        assert_eq!(fs::read(&file).unwrap(), b"on disk\n");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_matching_base_hash_goes_through() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.md");
        fs::write(&file, b"on disk\n").unwrap();

        let mut ask = request(&file, "mine\n");
        ask.base_hash = Some(blake3::hash(b"on disk\n").to_hex().to_string());
        write_checked(&ask).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"mine\n");
    }

    #[test]
    fn a_deleted_file_is_recreated_only_when_asked() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("gone.md");

        let mut ask = request(&file, "back\n");
        ask.base_hash = Some(blake3::hash(b"whatever").to_hex().to_string());
        assert_eq!(write_checked(&ask).unwrap_err().kind, "missing");
        assert!(!file.exists());

        ask.allow_missing = true;
        write_checked(&ask).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"back\n");
    }

    #[test]
    fn writes_to_one_file_do_not_interleave() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("busy.md");
        let bodies: Vec<String> = (0..8).map(|n| format!("{}\n", "x".repeat(50_000 + n))).collect();

        std::thread::scope(|scope| {
            for body in &bodies {
                let file = file.clone();
                scope.spawn(move || {
                    write_checked(&request(&file, body)).unwrap();
                });
            }
        });

        let written = fs::read_to_string(&file).unwrap();
        assert!(bodies.contains(&written), "a write was torn");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn detects_encodings() {
        let dir = tempfile::tempdir().unwrap();

        let plain = dir.path().join("utf8.md");
        fs::write(&plain, "привет\n").unwrap();
        let info = read_info(&plain, None).unwrap();
        assert_eq!(info.encoding, "utf-8");
        assert!(!info.bom);
        assert_eq!(info.text, "привет\n");

        let with_bom = dir.path().join("utf8-bom.md");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("привет\n".as_bytes());
        fs::write(&with_bom, &bytes).unwrap();
        let info = read_info(&with_bom, None).unwrap();
        assert_eq!(info.encoding, "utf-8");
        assert!(info.bom);
        assert_eq!(info.text, "привет\n");

        let utf16 = dir.path().join("utf16le.md");
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend("привет\n".encode_utf16().flat_map(u16::to_le_bytes));
        fs::write(&utf16, &bytes).unwrap();
        let info = read_info(&utf16, None).unwrap();
        assert_eq!(info.encoding, "utf-16le");
        assert!(info.bom);
        assert_eq!(info.text, "привет\n");

        let legacy = dir.path().join("cp1251.md");
        let russian = "Это заметка на русском языке, довольно длинная строка.\n";
        let (bytes, _, had_errors) = WINDOWS_1251.encode(russian);
        assert!(!had_errors);
        fs::write(&legacy, &bytes).unwrap();
        let info = read_info(&legacy, None).unwrap();
        assert_eq!(info.encoding, "windows-1251");
        assert!(!info.bom);
        assert_eq!(info.text, russian);
    }

    #[test]
    fn a_forced_encoding_wins_over_detection() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("cp1251.md");
        let (bytes, _, _) = WINDOWS_1251.encode("привет\n");
        fs::write(&file, &bytes).unwrap();

        let info = read_info(&file, Some("utf-8")).unwrap();
        assert_eq!(info.encoding, "utf-8");
        assert!(info.text.contains('\u{FFFD}'));
    }

    #[test]
    fn detects_line_endings() {
        assert_eq!(line_endings("a\r\nb\r\n"), ("crlf", "crlf"));
        assert_eq!(line_endings("a\nb\n"), ("lf", "lf"));
        assert_eq!(line_endings("a\rb\r"), ("cr", "cr"));
        assert_eq!(line_endings("no line breaks"), ("none", "crlf"));
        // Mixed: the style that occurs most is what a save writes back.
        assert_eq!(line_endings("a\r\nb\r\nc\n"), ("mixed", "crlf"));
        assert_eq!(line_endings("a\nb\nc\r\n"), ("mixed", "lf"));
    }

    /// The point of the whole wave: nothing the user did not touch changes.
    #[test]
    fn a_read_and_a_write_with_no_edit_are_byte_for_byte_the_same() {
        let dir = tempfile::tempdir().unwrap();
        let body = "# заголовок  \n\nline with trailing spaces   \n\n- item";

        let cases: Vec<(&str, Vec<u8>)> = vec![
            ("utf8-lf", format!("{body}\n").into_bytes()),
            ("utf8-crlf", format!("{body}\n").replace('\n', "\r\n").into_bytes()),
            ("utf8-no-final", body.as_bytes().to_vec()),
            ("utf8-bom-crlf", {
                let mut bytes = vec![0xEF, 0xBB, 0xBF];
                bytes.extend_from_slice(format!("{body}\n").replace('\n', "\r\n").as_bytes());
                bytes
            }),
            ("utf16le-crlf", {
                let mut bytes = vec![0xFF, 0xFE];
                bytes.extend(
                    format!("{body}\n")
                        .replace('\n', "\r\n")
                        .encode_utf16()
                        .flat_map(u16::to_le_bytes),
                );
                bytes
            }),
            ("utf16be-lf", {
                let mut bytes = vec![0xFE, 0xFF];
                bytes.extend(format!("{body}\n").encode_utf16().flat_map(u16::to_be_bytes));
                bytes
            }),
        ];

        for (name, original) in cases {
            let file = dir.path().join(format!("{name}.md"));
            fs::write(&file, &original).unwrap();
            let info = read_info(&file, None).unwrap();

            let hash = write_checked(&WriteRequest {
                path: file.to_string_lossy().into_owned(),
                text: info.text.clone(),
                encoding: info.encoding.clone(),
                bom: info.bom,
                eol: info.dominant_eol.clone(),
                base_hash: Some(info.hash.clone()),
                allow_missing: false,
            })
            .unwrap();

            assert_eq!(fs::read(&file).unwrap(), original, "{name} changed on disk");
            assert_eq!(hash, info.hash, "{name} hash moved");
        }
    }

    #[test]
    fn a_one_line_edit_only_moves_that_line() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("edit.md");
        let original = "# title\r\n\r\nold line   \r\n\r\n- item\r\n";
        fs::write(&file, original.as_bytes()).unwrap();

        let info = read_info(&file, None).unwrap();
        let edited = info.text.replace("old line", "new line");
        write_checked(&WriteRequest {
            path: file.to_string_lossy().into_owned(),
            text: edited,
            encoding: info.encoding.clone(),
            bom: info.bom,
            eol: info.dominant_eol.clone(),
            base_hash: Some(info.hash.clone()),
            allow_missing: false,
        })
        .unwrap();

        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "# title\r\n\r\nnew line   \r\n\r\n- item\r\n"
        );
    }

    #[test]
    fn mixed_line_endings_become_the_dominant_one() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mixed.md");
        fs::write(&file, b"a\r\nb\r\nc\nd\r\n").unwrap();

        let info = read_info(&file, None).unwrap();
        assert_eq!(info.eol, "mixed");
        assert_eq!(info.dominant_eol, "crlf");

        write_checked(&WriteRequest {
            path: file.to_string_lossy().into_owned(),
            text: info.text.clone(),
            encoding: info.encoding.clone(),
            bom: info.bom,
            eol: info.dominant_eol.clone(),
            base_hash: Some(info.hash.clone()),
            allow_missing: false,
        })
        .unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"a\r\nb\r\nc\r\nd\r\n");
    }

    #[test]
    fn a_legacy_file_becomes_utf8_when_the_user_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("cp1251.md");
        let russian = "Это заметка на русском языке, довольно длинная строка.\r\n";
        let (bytes, _, _) = WINDOWS_1251.encode(russian);
        fs::write(&file, &bytes).unwrap();

        let info = read_info(&file, None).unwrap();
        write_checked(&WriteRequest {
            path: file.to_string_lossy().into_owned(),
            text: info.text.clone(),
            encoding: "utf-8".into(),
            bom: false,
            eol: info.dominant_eol.clone(),
            base_hash: Some(info.hash.clone()),
            allow_missing: false,
        })
        .unwrap();

        assert_eq!(fs::read(&file).unwrap(), russian.as_bytes());
        assert_eq!(read_info(&file, None).unwrap().text, russian);
    }

    #[test]
    fn plain_text_is_written_through_a_temp_file_too() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("drafts").join("a.json");

        write_text_atomic(file.to_string_lossy().into_owned(), "{\"a\":1}".into()).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "{\"a\":1}");

        write_text_atomic(file.to_string_lossy().into_owned(), "{\"a\":2}".into()).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "{\"a\":2}");
        assert_eq!(fs::read_dir(file.parent().unwrap()).unwrap().count(), 1);
    }
}
