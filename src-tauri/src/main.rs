// Keeps the console window away from release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    plain_lib::run()
}
