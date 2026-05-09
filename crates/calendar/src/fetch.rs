use hypr_calendar_interface::EventFilter;
use hypr_google_calendar::{CalendarListEntry as GoogleCalendar, Event as GoogleEvent};
use hypr_outlook_calendar::{Calendar as OutlookCalendar, Event as OutlookEvent};

use crate::error::Error;

pub async fn list_all_connection_ids(
    api_base_url: &str,
    access_token: &str,
) -> Result<Vec<(String, Vec<String>)>, Error> {
    let client = make_client(api_base_url, access_token)?;

    let response = client
        .list_connections()
        .await
        .map_err(|e| Error::Api(e.to_string()))?;

    let connections = response.into_inner().connections;
    let mut map = std::collections::HashMap::<String, Vec<String>>::new();
    for c in &connections {
        map.entry(c.integration_id.clone())
            .or_default()
            .push(c.connection_id.clone());
    }

    Ok(map.into_iter().collect())
}

fn make_client(api_base_url: &str, access_token: &str) -> Result<hypr_api_client::Client, Error> {
    let auth_value = format!("Bearer {access_token}").parse()?;
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    let http = reqwest::Client::builder()
        .default_headers(headers)
        .build()?;
    Ok(hypr_api_client::Client::new_with_client(api_base_url, http))
}

struct BearerHttpClient {
    client: reqwest::Client,
    base_url: &'static str,
}

impl BearerHttpClient {
    fn new(base_url: &'static str, access_token: &str) -> Result<Self, Error> {
        let auth_value = format!("Bearer {access_token}").parse()?;
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(reqwest::header::AUTHORIZATION, auth_value);
        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()?;
        Ok(Self { client, base_url })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }
}

impl hypr_http::HttpClient for BearerHttpClient {
    async fn get(&self, path: &str) -> Result<Vec<u8>, hypr_http::Error> {
        let response = self.client.get(self.url(path)).send().await?;
        let response = response.error_for_status()?;
        Ok(response.bytes().await?.to_vec())
    }

    async fn post(
        &self,
        path: &str,
        body: Vec<u8>,
        content_type: &str,
    ) -> Result<Vec<u8>, hypr_http::Error> {
        let response = self
            .client
            .post(self.url(path))
            .header(reqwest::header::CONTENT_TYPE, content_type)
            .body(body)
            .send()
            .await?;
        let response = response.error_for_status()?;
        Ok(response.bytes().await?.to_vec())
    }

    async fn put(&self, path: &str, body: Vec<u8>) -> Result<Vec<u8>, hypr_http::Error> {
        let response = self.client.put(self.url(path)).body(body).send().await?;
        let response = response.error_for_status()?;
        Ok(response.bytes().await?.to_vec())
    }

    async fn patch(&self, path: &str, body: Vec<u8>) -> Result<Vec<u8>, hypr_http::Error> {
        let response = self.client.patch(self.url(path)).body(body).send().await?;
        let response = response.error_for_status()?;
        Ok(response.bytes().await?.to_vec())
    }

    async fn delete(&self, path: &str) -> Result<Vec<u8>, hypr_http::Error> {
        let response = self.client.delete(self.url(path)).send().await?;
        let response = response.error_for_status()?;
        Ok(response.bytes().await?.to_vec())
    }
}

pub async fn list_google_calendars(
    api_base_url: &str,
    access_token: &str,
    connection_id: &str,
) -> Result<Vec<GoogleCalendar>, Error> {
    let client = make_client(api_base_url, access_token)?;

    let body = hypr_api_client::types::GoogleListCalendarsRequest {
        connection_id: connection_id.to_string(),
    };

    let response = client
        .google_list_calendars(&body)
        .await
        .map_err(|e| Error::Api(e.to_string()))?;

    Ok(response.into_inner().items)
}

pub async fn list_google_calendars_direct(
    provider_access_token: &str,
) -> Result<Vec<GoogleCalendar>, Error> {
    let http = BearerHttpClient::new("https://www.googleapis.com", provider_access_token)?;
    let client = hypr_google_calendar::GoogleCalendarClient::new(http);
    let response = client
        .list_calendars()
        .await
        .map_err(|e| Error::ProviderApi(e.to_string()))?;
    Ok(response.items)
}

pub async fn list_google_events(
    api_base_url: &str,
    access_token: &str,
    connection_id: &str,
    filter: EventFilter,
) -> Result<Vec<GoogleEvent>, Error> {
    let client = make_client(api_base_url, access_token)?;

    let body = hypr_api_client::types::GoogleListEventsRequest {
        connection_id: connection_id.to_string(),
        calendar_id: filter.calendar_tracking_id,
        time_min: Some(filter.from.to_rfc3339()),
        time_max: Some(filter.to.to_rfc3339()),
        max_results: None,
        page_token: None,
        single_events: Some(true),
        order_by: Some("startTime".to_string()),
    };

    let response = client
        .google_list_events(&body)
        .await
        .map_err(|e| Error::Api(e.to_string()))?;

    Ok(response.into_inner().items)
}

pub async fn list_google_events_direct(
    provider_access_token: &str,
    filter: EventFilter,
) -> Result<Vec<GoogleEvent>, Error> {
    let http = BearerHttpClient::new("https://www.googleapis.com", provider_access_token)?;
    let client = hypr_google_calendar::GoogleCalendarClient::new(http);
    let response = client
        .list_events(hypr_google_calendar::ListEventsRequest {
            calendar_id: filter.calendar_tracking_id,
            time_min: Some(filter.from),
            time_max: Some(filter.to),
            max_results: None,
            page_token: None,
            single_events: Some(true),
            order_by: Some(hypr_google_calendar::EventOrderBy::StartTime),
            show_deleted: None,
            show_hidden_invitations: None,
            updated_min: None,
            i_cal_uid: None,
            q: None,
            sync_token: None,
            time_zone: None,
            event_types: None,
        })
        .await
        .map_err(|e| Error::ProviderApi(e.to_string()))?;
    Ok(response.items)
}

pub async fn list_outlook_calendars(
    api_base_url: &str,
    access_token: &str,
    connection_id: &str,
) -> Result<Vec<OutlookCalendar>, Error> {
    let client = make_client(api_base_url, access_token)?;

    let body = hypr_api_client::types::OutlookListCalendarsRequest {
        connection_id: connection_id.to_string(),
    };

    let response = client
        .outlook_list_calendars(&body)
        .await
        .map_err(|e| Error::Api(e.to_string()))?;

    Ok(response.into_inner().value)
}

pub async fn list_outlook_calendars_direct(
    provider_access_token: &str,
) -> Result<Vec<OutlookCalendar>, Error> {
    let http = BearerHttpClient::new("https://graph.microsoft.com/v1.0", provider_access_token)?;
    let client = hypr_outlook_calendar::OutlookCalendarClient::new(http);
    let response = client
        .list_calendars()
        .await
        .map_err(|e| Error::ProviderApi(e.to_string()))?;
    Ok(response.value)
}

pub async fn list_outlook_events(
    api_base_url: &str,
    access_token: &str,
    connection_id: &str,
    filter: EventFilter,
) -> Result<Vec<OutlookEvent>, Error> {
    let client = make_client(api_base_url, access_token)?;

    let body = hypr_api_client::types::OutlookListEventsRequest {
        connection_id: connection_id.to_string(),
        calendar_id: filter.calendar_tracking_id,
        time_min: Some(filter.from.to_rfc3339()),
        time_max: Some(filter.to.to_rfc3339()),
        max_results: None,
        order_by: Some("startTime".to_string()),
    };

    let response = client
        .outlook_list_events(&body)
        .await
        .map_err(|e| Error::Api(e.to_string()))?;

    Ok(response.into_inner().value)
}

pub async fn list_outlook_events_direct(
    provider_access_token: &str,
    filter: EventFilter,
) -> Result<Vec<OutlookEvent>, Error> {
    let http = BearerHttpClient::new("https://graph.microsoft.com/v1.0", provider_access_token)?;
    let client = hypr_outlook_calendar::OutlookCalendarClient::new(http);
    let response = client
        .list_events(hypr_outlook_calendar::ListEventsRequest {
            calendar_id: filter.calendar_tracking_id,
            start_date_time: Some(filter.from),
            end_date_time: Some(filter.to),
            top: None,
            skip: None,
            filter: None,
            select: None,
            order_by: Some("start/dateTime".to_string()),
        })
        .await
        .map_err(|e| Error::ProviderApi(e.to_string()))?;
    Ok(response.value)
}
