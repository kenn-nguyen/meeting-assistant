use hypr_calendar_interface::{
    CalendarEvent, CalendarListItem, CalendarProviderType, CreateEventInput, EventFilter,
};
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_auth::AuthPluginExt;
use tauri_plugin_permissions::PermissionsPluginExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::{Duration, timeout};

use crate::error::Error;

#[tauri::command]
#[specta::specta]
pub fn available_providers() -> Vec<CalendarProviderType> {
    hypr_calendar::available_providers()
}

#[tauri::command]
#[specta::specta]
pub async fn is_provider_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
) -> Result<bool, Error> {
    let config = app.state::<crate::PluginConfig>();
    let token = access_token(&app);
    let apple = is_apple_authorized(&app).await?;
    hypr_calendar::is_provider_enabled(&config.api_base_url, token.as_deref(), apple, provider)
        .await
        .map(|enabled| {
            enabled
                || app
                    .state::<crate::oauth::LocalCalendarOAuthStore>()
                    .list_connection_ids(provider)
                    .into_iter()
                    .next()
                    .is_some()
        })
        .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub async fn list_connection_ids<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<hypr_calendar::ProviderConnectionIds>, Error> {
    let config = app.state::<crate::PluginConfig>();
    let token = access_token(&app);
    let apple = is_apple_authorized(&app).await?;
    let mut all = hypr_calendar::list_connection_ids(&config.api_base_url, token.as_deref(), apple)
        .await
        .map_err(Error::from)?;

    let oauth = app.state::<crate::oauth::LocalCalendarOAuthStore>();
    for provider in [CalendarProviderType::Google, CalendarProviderType::Outlook] {
        let local_connection_ids = oauth.list_connection_ids(provider);
        if let Some(entry) = all.iter_mut().find(|entry| entry.provider == provider) {
            if !local_connection_ids.is_empty() {
                entry.connection_ids = local_connection_ids;
            }
        } else {
            all.push(hypr_calendar::ProviderConnectionIds {
                provider,
                connection_ids: local_connection_ids,
            });
        }
    }

    Ok(all)
}

#[tauri::command]
#[specta::specta]
pub async fn list_calendars<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    connection_id: String,
) -> Result<Vec<CalendarListItem>, Error> {
    let config = app.state::<crate::PluginConfig>();
    if matches!(
        provider,
        CalendarProviderType::Google | CalendarProviderType::Outlook
    ) {
        if let Some(token) = local_provider_access_token(&app, provider, &connection_id).await? {
            return hypr_calendar::list_calendars_direct(&token, provider)
                .await
                .map_err(Into::into);
        }
    }

    let token = match provider {
        CalendarProviderType::Apple => access_token(&app).unwrap_or_default(),
        _ => require_access_token(&app)?,
    };
    hypr_calendar::list_calendars(&config.api_base_url, &token, provider, &connection_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub async fn list_events<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    connection_id: String,
    filter: EventFilter,
) -> Result<Vec<CalendarEvent>, Error> {
    let config = app.state::<crate::PluginConfig>();
    if matches!(
        provider,
        CalendarProviderType::Google | CalendarProviderType::Outlook
    ) {
        if let Some(token) = local_provider_access_token(&app, provider, &connection_id).await? {
            return hypr_calendar::list_events_direct(&token, provider, filter)
                .await
                .map_err(Into::into);
        }
    }

    let token = match provider {
        CalendarProviderType::Apple => access_token(&app).unwrap_or_default(),
        _ => require_access_token(&app)?,
    };
    hypr_calendar::list_events(
        &config.api_base_url,
        &token,
        provider,
        &connection_id,
        filter,
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub fn open_calendar<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
) -> Result<(), Error> {
    hypr_calendar::open_calendar(provider).map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub fn create_event<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    input: CreateEventInput,
) -> Result<String, Error> {
    hypr_calendar::create_event(provider, input).map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub fn parse_meeting_link(text: String) -> Option<String> {
    hypr_calendar::parse_meeting_link(&text)
}

#[tauri::command]
#[specta::specta]
pub fn begin_oauth<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    redirect_uri: String,
) -> Result<String, Error> {
    app.state::<crate::oauth::LocalCalendarOAuthStore>()
        .begin_auth(provider, redirect_uri)
        .map_err(Into::into)
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct LoopbackOAuthStart {
    pub auth_url: String,
    pub redirect_uri: String,
}

#[tauri::command]
#[specta::specta]
pub async fn begin_loopback_oauth<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
) -> Result<LoopbackOAuthStart, Error> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| Error::Auth(format!("failed to start OAuth callback server: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| Error::Auth(format!("failed to read OAuth callback address: {e}")))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/calendar/oauth/callback");
    let auth_url = app
        .state::<crate::oauth::LocalCalendarOAuthStore>()
        .begin_auth(provider, redirect_uri.clone())?;

    tauri::async_runtime::spawn(handle_loopback_callback(
        app.clone(),
        listener,
        provider,
        redirect_uri.clone(),
    ));

    Ok(LoopbackOAuthStart {
        auth_url,
        redirect_uri,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn complete_oauth<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    code: String,
    state: String,
    redirect_uri: String,
) -> Result<crate::oauth::LocalCalendarAccount, Error> {
    app.state::<crate::oauth::LocalCalendarOAuthStore>()
        .complete_auth(provider, code, state, redirect_uri)
        .await
        .map_err(Into::into)
}

async fn handle_loopback_callback<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    listener: TcpListener,
    provider: CalendarProviderType,
    redirect_uri: String,
) {
    let result = handle_loopback_callback_inner(app, listener, provider, redirect_uri).await;
    if let Err(error) = result {
        eprintln!("[calendar-oauth] loopback callback failed: {error}");
    }
}

async fn handle_loopback_callback_inner<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    listener: TcpListener,
    provider: CalendarProviderType,
    redirect_uri: String,
) -> Result<(), String> {
    let (mut stream, _) = timeout(Duration::from_secs(300), listener.accept())
        .await
        .map_err(|_| "OAuth callback timed out".to_string())?
        .map_err(|e| format!("failed to accept OAuth callback: {e}"))?;

    let mut buffer = vec![0_u8; 8192];
    let read = stream
        .read(&mut buffer)
        .await
        .map_err(|e| format!("failed to read OAuth callback: {e}"))?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "invalid OAuth callback request".to_string())?;
    let callback_url = url::Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|e| format!("invalid OAuth callback URL: {e}"))?;
    let params: std::collections::HashMap<_, _> = callback_url.query_pairs().collect();

    let (status, title, body) = if let Some(error) = params.get("error") {
        (
            "400 Bad Request",
            "Calendar connection failed",
            format!("Google returned an OAuth error: {error}"),
        )
    } else {
        let code = params
            .get("code")
            .ok_or_else(|| "OAuth callback did not include a code".to_string())?
            .to_string();
        let state = params
            .get("state")
            .ok_or_else(|| "OAuth callback did not include state".to_string())?
            .to_string();

        match app
            .state::<crate::oauth::LocalCalendarOAuthStore>()
            .complete_auth(provider, code, state, redirect_uri)
            .await
        {
            Ok(_) => (
                "200 OK",
                "Calendar connected",
                "You can close this window and return to Char.".to_string(),
            ),
            Err(error) => (
                "400 Bad Request",
                "Calendar connection failed",
                error.to_string(),
            ),
        }
    };

    let title = escape_html(title);
    let body = escape_html(&body);
    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title>\
         <style>body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:48px;line-height:1.5;color:#1f2937}}\
         .card{{max-width:520px}}</style></head><body><main class=\"card\"><h1>{title}</h1><p>{body}</p></main></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{html}",
        html.len()
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("failed to write OAuth callback response: {e}"))?;

    Ok(())
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[tauri::command]
#[specta::specta]
pub fn list_oauth_accounts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Vec<crate::oauth::LocalCalendarAccount> {
    app.state::<crate::oauth::LocalCalendarOAuthStore>()
        .list_accounts()
}

#[tauri::command]
#[specta::specta]
pub fn disconnect_oauth_account<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    connection_id: String,
) -> Result<(), Error> {
    app.state::<crate::oauth::LocalCalendarOAuthStore>()
        .remove(provider, &connection_id)
        .map_err(Into::into)
}

fn access_token<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    app.access_token().ok().flatten().filter(|t| !t.is_empty())
}

fn require_access_token<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<String, Error> {
    let token = app.access_token().map_err(|e| Error::Auth(e.to_string()))?;
    match token {
        Some(t) if !t.is_empty() => Ok(t),
        _ => Err(hypr_calendar::Error::NotAuthenticated.into()),
    }
}

async fn local_provider_access_token<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    provider: CalendarProviderType,
    connection_id: &str,
) -> Result<Option<String>, Error> {
    if !connection_id.starts_with("local-") {
        return Ok(None);
    }

    app.state::<crate::oauth::LocalCalendarOAuthStore>()
        .access_token(provider, connection_id)
        .await
        .map(Some)
        .map_err(Into::into)
}

async fn is_apple_authorized<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, Error> {
    #[cfg(target_os = "macos")]
    {
        let status = app
            .permissions()
            .check(tauri_plugin_permissions::Permission::Calendar)
            .await
            .map_err(|e| hypr_calendar::Error::Api(e.to_string()))?;
        Ok(matches!(
            status,
            tauri_plugin_permissions::PermissionStatus::Authorized
        ))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(false)
    }
}
