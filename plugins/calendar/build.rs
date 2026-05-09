const COMMANDS: &[&str] = &[
    "available_providers",
    "is_provider_enabled",
    "list_connection_ids",
    "list_calendars",
    "list_events",
    "open_calendar",
    "create_event",
    "parse_meeting_link",
    "begin_oauth",
    "begin_loopback_oauth",
    "complete_oauth",
    "list_oauth_accounts",
    "disconnect_oauth_account",
];

fn main() {
    println!("cargo:rerun-if-env-changed=GOOGLE_CALENDAR_OAUTH_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET");
    println!("cargo:rerun-if-env-changed=OUTLOOK_CALENDAR_OAUTH_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=OUTLOOK_CALENDAR_OAUTH_CLIENT_SECRET");
    tauri_plugin::Builder::new(COMMANDS).build();
}
