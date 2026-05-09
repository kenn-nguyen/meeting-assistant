use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use hypr_calendar_interface::CalendarProviderType;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum OAuthError {
    #[error("local calendar OAuth is not supported for provider {0:?}")]
    UnsupportedProvider(CalendarProviderType),
    #[error("missing OAuth client id for provider {0:?}")]
    MissingClientId(CalendarProviderType),
    #[error("unknown OAuth state")]
    UnknownState,
    #[error("OAuth callback provider does not match the pending request")]
    ProviderMismatch,
    #[error("OAuth token response did not include an access token")]
    MissingAccessToken,
    #[error("OAuth token response did not include a refresh token")]
    MissingRefreshToken,
    #[error("calendar account is not connected")]
    MissingAccount,
    #[error("failed to read local calendar OAuth store: {0}")]
    Read(std::io::Error),
    #[error("failed to write local calendar OAuth store: {0}")]
    Write(std::io::Error),
    #[error("failed to serialize local calendar OAuth store: {0}")]
    Serde(serde_json::Error),
    #[error("OAuth request failed: {0}")]
    Http(reqwest::Error),
    #[error("OAuth provider returned an error: {0}")]
    Provider(String),
    #[error("invalid OAuth URL: {0}")]
    Url(url::ParseError),
}

impl From<OAuthError> for crate::Error {
    fn from(value: OAuthError) -> Self {
        crate::Error::Auth(value.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LocalCalendarAccount {
    pub provider: CalendarProviderType,
    pub connection_id: String,
    pub account_label: Option<String>,
    pub status: LocalCalendarAccountStatus,
    pub last_error_description: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum LocalCalendarAccountStatus {
    Connected,
    ReconnectRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenRecord {
    pub provider: CalendarProviderType,
    pub connection_id: String,
    pub account_label: Option<String>,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: DateTime<Utc>,
    pub scopes: Vec<String>,
    pub last_error_description: Option<String>,
    pub updated_at: DateTime<Utc>,
}

impl TokenRecord {
    fn public_account(&self) -> LocalCalendarAccount {
        LocalCalendarAccount {
            provider: self.provider,
            connection_id: self.connection_id.clone(),
            account_label: self.account_label.clone(),
            status: if self.last_error_description.is_some() {
                LocalCalendarAccountStatus::ReconnectRequired
            } else {
                LocalCalendarAccountStatus::Connected
            },
            last_error_description: self.last_error_description.clone(),
            updated_at: Some(self.updated_at.to_rfc3339()),
        }
    }
}

#[derive(Debug, Clone)]
struct PendingOAuth {
    provider: CalendarProviderType,
    code_verifier: String,
    redirect_uri: String,
}

#[derive(Default, Serialize, Deserialize)]
struct PersistedStore {
    #[serde(default)]
    tokens: Vec<TokenRecord>,
}

pub struct LocalCalendarOAuthStore {
    path: PathBuf,
    tokens: Mutex<HashMap<String, TokenRecord>>,
    pending: Mutex<HashMap<String, PendingOAuth>>,
    client: reqwest::Client,
}

impl LocalCalendarOAuthStore {
    pub fn load(path: PathBuf) -> Self {
        let tokens = load_tokens(&path);
        Self {
            path,
            tokens: Mutex::new(tokens),
            pending: Mutex::new(HashMap::new()),
            client: reqwest::Client::new(),
        }
    }

    pub fn begin_auth(
        &self,
        provider: CalendarProviderType,
        redirect_uri: String,
    ) -> Result<String, OAuthError> {
        let client_id = client_id(provider)?;
        let state = uuid::Uuid::new_v4().to_string();
        let code_verifier = code_verifier();
        let code_challenge = code_challenge(&code_verifier);

        self.pending.lock().unwrap().insert(
            state.clone(),
            PendingOAuth {
                provider,
                code_verifier,
                redirect_uri: redirect_uri.clone(),
            },
        );

        let mut url = url::Url::parse(auth_url(provider)).map_err(OAuthError::Url)?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("client_id", client_id);
            query.append_pair("response_type", "code");
            query.append_pair("redirect_uri", &redirect_uri);
            query.append_pair("scope", scopes(provider));
            query.append_pair("state", &state);
            query.append_pair("code_challenge", &code_challenge);
            query.append_pair("code_challenge_method", "S256");
            match provider {
                CalendarProviderType::Google => {
                    query.append_pair("access_type", "offline");
                    query.append_pair("prompt", "consent");
                }
                CalendarProviderType::Outlook => {
                    query.append_pair("response_mode", "query");
                }
                CalendarProviderType::Apple => {}
            }
        }

        Ok(url.to_string())
    }

    pub async fn complete_auth(
        &self,
        provider: CalendarProviderType,
        code: String,
        state: String,
        redirect_uri: String,
    ) -> Result<LocalCalendarAccount, OAuthError> {
        let pending = self
            .pending
            .lock()
            .unwrap()
            .remove(&state)
            .ok_or(OAuthError::UnknownState)?;

        if pending.provider != provider {
            return Err(OAuthError::ProviderMismatch);
        }

        if pending.redirect_uri != redirect_uri {
            return Err(OAuthError::Provider(
                "OAuth redirect URI did not match the pending request".to_string(),
            ));
        }

        let token = self
            .exchange_code(provider, &code, &pending.code_verifier, &redirect_uri)
            .await?;
        let record = token_record_from_response(provider, token)?;
        self.upsert(record.clone())?;
        Ok(record.public_account())
    }

    pub fn list_accounts(&self) -> Vec<LocalCalendarAccount> {
        self.tokens
            .lock()
            .unwrap()
            .values()
            .map(TokenRecord::public_account)
            .collect()
    }

    pub fn list_connection_ids(&self, provider: CalendarProviderType) -> Vec<String> {
        self.tokens
            .lock()
            .unwrap()
            .values()
            .filter(|record| record.provider == provider)
            .map(|record| record.connection_id.clone())
            .collect()
    }

    pub fn remove(
        &self,
        provider: CalendarProviderType,
        connection_id: &str,
    ) -> Result<(), OAuthError> {
        self.tokens.lock().unwrap().retain(|_, record| {
            !(record.provider == provider && record.connection_id == connection_id)
        });
        self.save()
    }

    pub async fn access_token(
        &self,
        provider: CalendarProviderType,
        connection_id: &str,
    ) -> Result<String, OAuthError> {
        let record = {
            let tokens = self.tokens.lock().unwrap();
            tokens
                .get(connection_id)
                .filter(|record| record.provider == provider)
                .cloned()
                .ok_or(OAuthError::MissingAccount)?
        };

        if record.expires_at > Utc::now() + Duration::seconds(60) {
            return Ok(record.access_token);
        }

        let refreshed = self.refresh(provider, &record.refresh_token).await;
        match refreshed {
            Ok(response) => {
                let mut next = record;
                next.access_token = response
                    .access_token
                    .ok_or(OAuthError::MissingAccessToken)?;
                if let Some(refresh_token) = response.refresh_token {
                    next.refresh_token = refresh_token;
                }
                next.expires_at = expires_at(response.expires_in);
                next.scopes = response
                    .scope
                    .map(split_scopes)
                    .unwrap_or_else(|| next.scopes.clone());
                next.last_error_description = None;
                next.updated_at = Utc::now();
                self.upsert(next.clone())?;
                Ok(next.access_token)
            }
            Err(error) => {
                self.mark_reconnect_required(provider, connection_id, error.to_string())?;
                Err(error)
            }
        }
    }

    async fn exchange_code(
        &self,
        provider: CalendarProviderType,
        code: &str,
        code_verifier: &str,
        redirect_uri: &str,
    ) -> Result<TokenResponse, OAuthError> {
        let client_id = client_id(provider)?;
        let mut params = vec![
            ("client_id", client_id.to_string()),
            ("code", code.to_string()),
            ("code_verifier", code_verifier.to_string()),
            ("grant_type", "authorization_code".to_string()),
            ("redirect_uri", redirect_uri.to_string()),
        ];
        if let Some(secret) = client_secret(provider) {
            params.push(("client_secret", secret.to_string()));
        }

        self.request_token(provider, params).await
    }

    async fn refresh(
        &self,
        provider: CalendarProviderType,
        refresh_token: &str,
    ) -> Result<TokenResponse, OAuthError> {
        let client_id = client_id(provider)?;
        let mut params = vec![
            ("client_id", client_id.to_string()),
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh_token.to_string()),
        ];
        if let Some(scope) = refresh_scope(provider) {
            params.push(("scope", scope.to_string()));
        }
        if let Some(secret) = client_secret(provider) {
            params.push(("client_secret", secret.to_string()));
        }

        self.request_token(provider, params).await
    }

    async fn request_token(
        &self,
        provider: CalendarProviderType,
        params: Vec<(&str, String)>,
    ) -> Result<TokenResponse, OAuthError> {
        let body = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(params.iter().map(|(key, value)| (*key, value.as_str())))
            .finish();
        let response = self
            .client
            .post(token_url(provider))
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .body(body)
            .send()
            .await
            .map_err(OAuthError::Http)?;

        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(OAuthError::Provider(body));
        }

        response.json().await.map_err(OAuthError::Http)
    }

    fn upsert(&self, record: TokenRecord) -> Result<(), OAuthError> {
        self.tokens
            .lock()
            .unwrap()
            .insert(record.connection_id.clone(), record);
        self.save()
    }

    fn mark_reconnect_required(
        &self,
        provider: CalendarProviderType,
        connection_id: &str,
        message: String,
    ) -> Result<(), OAuthError> {
        if let Some(record) = self.tokens.lock().unwrap().get_mut(connection_id) {
            if record.provider == provider {
                record.last_error_description = Some(message);
                record.updated_at = Utc::now();
            }
        }
        self.save()
    }

    fn save(&self) -> Result<(), OAuthError> {
        let tokens = self.tokens.lock().unwrap().values().cloned().collect();
        let content =
            serde_json::to_string(&PersistedStore { tokens }).map_err(OAuthError::Serde)?;
        hypr_storage::fs::atomic_write(&self.path, &content).map_err(OAuthError::Write)
    }
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    scope: Option<String>,
}

fn load_tokens(path: &Path) -> HashMap<String, TokenRecord> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<PersistedStore>(&content).ok())
        .map(|store| {
            store
                .tokens
                .into_iter()
                .map(|record| (record.connection_id.clone(), record))
                .collect()
        })
        .unwrap_or_default()
}

fn token_record_from_response(
    provider: CalendarProviderType,
    response: TokenResponse,
) -> Result<TokenRecord, OAuthError> {
    Ok(TokenRecord {
        provider,
        connection_id: format!("local-{}-{}", provider_slug(provider), uuid::Uuid::new_v4()),
        account_label: None,
        access_token: response
            .access_token
            .ok_or(OAuthError::MissingAccessToken)?,
        refresh_token: response
            .refresh_token
            .ok_or(OAuthError::MissingRefreshToken)?,
        expires_at: expires_at(response.expires_in),
        scopes: response.scope.map(split_scopes).unwrap_or_default(),
        last_error_description: None,
        updated_at: Utc::now(),
    })
}

fn expires_at(expires_in: Option<i64>) -> DateTime<Utc> {
    Utc::now() + Duration::seconds(expires_in.unwrap_or(3600))
}

fn split_scopes(scopes: String) -> Vec<String> {
    scopes.split_whitespace().map(ToString::to_string).collect()
}

fn code_verifier() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn client_id(provider: CalendarProviderType) -> Result<&'static str, OAuthError> {
    let value = match provider {
        CalendarProviderType::Google => option_env!("GOOGLE_CALENDAR_OAUTH_CLIENT_ID"),
        CalendarProviderType::Outlook => option_env!("OUTLOOK_CALENDAR_OAUTH_CLIENT_ID"),
        CalendarProviderType::Apple => return Err(OAuthError::UnsupportedProvider(provider)),
    };

    value
        .filter(|v| !v.is_empty())
        .ok_or(OAuthError::MissingClientId(provider))
}

fn client_secret(provider: CalendarProviderType) -> Option<&'static str> {
    match provider {
        CalendarProviderType::Google => option_env!("GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"),
        CalendarProviderType::Outlook => option_env!("OUTLOOK_CALENDAR_OAUTH_CLIENT_SECRET"),
        CalendarProviderType::Apple => None,
    }
    .filter(|v| !v.is_empty())
}

fn auth_url(provider: CalendarProviderType) -> &'static str {
    match provider {
        CalendarProviderType::Google => "https://accounts.google.com/o/oauth2/v2/auth",
        CalendarProviderType::Outlook => {
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        }
        CalendarProviderType::Apple => "",
    }
}

fn token_url(provider: CalendarProviderType) -> &'static str {
    match provider {
        CalendarProviderType::Google => "https://oauth2.googleapis.com/token",
        CalendarProviderType::Outlook => {
            "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        }
        CalendarProviderType::Apple => "",
    }
}

fn scopes(provider: CalendarProviderType) -> &'static str {
    match provider {
        CalendarProviderType::Google => "https://www.googleapis.com/auth/calendar.readonly",
        CalendarProviderType::Outlook => "offline_access Calendars.Read User.Read",
        CalendarProviderType::Apple => "",
    }
}

fn refresh_scope(provider: CalendarProviderType) -> Option<&'static str> {
    match provider {
        CalendarProviderType::Google => None,
        CalendarProviderType::Outlook => Some("offline_access Calendars.Read User.Read"),
        CalendarProviderType::Apple => None,
    }
}

fn provider_slug(provider: CalendarProviderType) -> &'static str {
    match provider {
        CalendarProviderType::Apple => "apple",
        CalendarProviderType::Google => "google",
        CalendarProviderType::Outlook => "outlook",
    }
}
