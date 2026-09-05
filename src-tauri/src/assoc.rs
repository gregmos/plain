// Per-user file association for `.md` and `.markdown` (spec §13). Everything
// is written under HKCU: the app offers itself in "open with" and appears in
// Settings → Default apps, and it never makes itself the default.

use std::io;

use winreg::enums::{HKEY_CURRENT_USER, REG_NONE};
use winreg::{RegKey, RegValue};

const PROGID: &str = "Plain.md";
const EXTENSIONS: [&str; 2] = [".md", ".markdown"];
const CLASSES: &str = r"Software\Classes";
const CAPABILITIES: &str = r"Software\Plain\Capabilities";
const REGISTERED: &str = r"Software\RegisteredApplications";

fn exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

/// What Explorer runs for a double-clicked file.
fn open_command(exe: &str) -> String {
    format!("\"{exe}\" \"%1\"")
}

fn write(exe: &str) -> io::Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // The ProgID: the name Explorer shows and the command it runs.
    let (progid, _) = hkcu.create_subkey(format!(r"{CLASSES}\{PROGID}"))?;
    progid.set_value("", &"markdown")?;
    progid.set_value("FriendlyTypeName", &"markdown")?;
    let (icon, _) = progid.create_subkey("DefaultIcon")?;
    icon.set_value("", &format!("{exe},0"))?;
    let (command, _) = progid.create_subkey(r"shell\open\command")?;
    command.set_value("", &open_command(exe))?;

    // The extensions only *offer* the ProgID. Which one wins stays the
    // user's choice: nothing is written to the `.md` default (spec §13).
    for extension in EXTENSIONS {
        let (progids, _) = hkcu.create_subkey(format!(r"{CLASSES}\{extension}\OpenWithProgids"))?;
        progids.set_raw_value(
            PROGID,
            &RegValue {
                bytes: Vec::new().into(),
                vtype: REG_NONE,
            },
        )?;
    }

    // Capabilities are what put the app in Settings → Default apps.
    let (capabilities, _) = hkcu.create_subkey(CAPABILITIES)?;
    capabilities.set_value("ApplicationName", &"Plain")?;
    capabilities.set_value("ApplicationDescription", &"a markdown reader and editor")?;
    let (associations, _) = capabilities.create_subkey("FileAssociations")?;
    for extension in EXTENSIONS {
        associations.set_value(extension, &PROGID)?;
    }
    let (registered, _) = hkcu.create_subkey(REGISTERED)?;
    registered.set_value("Plain", &CAPABILITIES)?;

    Ok(())
}

/// Undoing a registration that is already gone is not an error.
fn ignore_missing(result: io::Result<()>) -> io::Result<()> {
    match result {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

fn erase() -> io::Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    ignore_missing(hkcu.delete_subkey_all(format!(r"{CLASSES}\{PROGID}")))?;
    for extension in EXTENSIONS {
        // Only our own value goes; the key belongs to every app that offers
        // to open the extension.
        if let Ok(progids) = hkcu.open_subkey_with_flags(
            format!(r"{CLASSES}\{extension}\OpenWithProgids"),
            winreg::enums::KEY_ALL_ACCESS,
        ) {
            ignore_missing(progids.delete_value(PROGID))?;
        }
    }
    ignore_missing(hkcu.delete_subkey_all(r"Software\Plain"))?;
    if let Ok(registered) =
        hkcu.open_subkey_with_flags(REGISTERED, winreg::enums::KEY_ALL_ACCESS)
    {
        ignore_missing(registered.delete_value("Plain"))?;
    }
    Ok(())
}

/// Explorer caches associations; without this the change shows up on the
/// next logon.
fn notify_shell() {
    use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
}

#[tauri::command]
pub fn register_file_association() -> Result<(), String> {
    write(&exe_path()?).map_err(|error| error.to_string())?;
    notify_shell();
    Ok(())
}

#[tauri::command]
pub fn unregister_file_association() -> Result<(), String> {
    erase().map_err(|error| error.to_string())?;
    notify_shell();
    Ok(())
}

/// What `about` reports. True as long as `.md` still offers our ProgID.
#[tauri::command]
pub fn file_association_registered() -> bool {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(format!(r"{CLASSES}\.md\OpenWithProgids"))
        .and_then(|key| key.get_raw_value(PROGID))
        .is_ok()
}

/// Runs at every release start, so the recorded exe path follows the folder
/// when it is moved. Cheap, idempotent, and silent when it fails — a broken
/// association is not a reason to refuse to open a file.
#[cfg(not(debug_assertions))]
pub fn register_quietly() {
    if let Err(error) = register_file_association() {
        eprintln!("plain: could not register the .md association: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::open_command;

    /// Both quotes matter: Explorer passes paths with spaces.
    #[test]
    fn the_open_command_quotes_the_exe_and_the_argument() {
        assert_eq!(
            open_command(r"C:\Program Files\Plain\plain.exe"),
            "\"C:\\Program Files\\Plain\\plain.exe\" \"%1\""
        );
    }
}
