//! Talks to the Axiom server over HTTPS.

use std::time::Duration;

use axiom_protocol::{
    Adopt, Adopted, ApiError, ChangePassword, ChangeRole, CreateSpace, Credentials, DeleteAccount, Device, ForgotPassword, Invite, Members,
    MyInvite, NewInvite, PullResponse, PushRequest, PushResponse, RefreshRequest, ResetPassword, Role, Session, Space, route, routes,
};
use serde::Serialize;
use serde::de::DeserializeOwned;

/// Long enough for a free-tier host that sleeps when idle to wake up (~1 minute).
const TIMEOUT: Duration = Duration::from_secs(90);

pub struct Client {
    base: String,
    http: reqwest::Client,
}

#[derive(Debug)]
pub enum ClientError {
    /// No answer: no internet, or the server is down.
    Offline,
    /// The server said no. `message` is ready to show.
    Rejected { status: u16, message: String },
}

impl ClientError {
    pub fn message(&self) -> String {
        match self {
            ClientError::Offline => "Can't reach the Axiom server. Check your internet connection and try again.".into(),
            ClientError::Rejected { message, .. } => message.clone(),
        }
    }

    /// The server no longer accepts this sign-in.
    pub fn is_unauthorized(&self) -> bool {
        matches!(self, ClientError::Rejected { status: 401, .. })
    }

    pub fn status(&self) -> Option<u16> {
        match self {
            ClientError::Rejected { status, .. } => Some(*status),
            ClientError::Offline => None,
        }
    }
}

impl Client {
    pub fn new(base: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .user_agent(concat!("Axiom/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("HTTP client settings are valid");
        Self { base: base.trim_end_matches('/').to_owned(), http }
    }

    /// False in a release build made without `AXIOM_SERVER_URL`.
    pub fn has_server(&self) -> bool {
        !self.base.is_empty()
    }

    pub async fn sign_up(&self, credentials: &Credentials) -> Result<Session, ClientError> {
        self.post(routes::SIGN_UP, credentials).await
    }

    pub async fn sign_in(&self, credentials: &Credentials) -> Result<Session, ClientError> {
        self.post(routes::SIGN_IN, credentials).await
    }

    pub async fn refresh(&self, refresh_token: &str) -> Result<Session, ClientError> {
        self.post(routes::REFRESH, &RefreshRequest { refresh_token: refresh_token.into() }).await
    }

    /// Ends this device's session on the server. Gives up quickly: signing out
    /// locally shouldn't wait on the network.
    pub async fn sign_out(&self, refresh_token: &str) -> Result<(), ClientError> {
        let body = RefreshRequest { refresh_token: refresh_token.into() };
        let request = self.http.post(self.url(routes::SIGN_OUT)).json(&body).timeout(Duration::from_secs(5));
        check(request.send().await.map_err(|_| ClientError::Offline)?).await.map(drop)
    }

    pub async fn push(&self, token: &str, request: &PushRequest) -> Result<PushResponse, ClientError> {
        let response = self.http.post(self.url(routes::SYNC_PUSH)).bearer_auth(token).json(request).send().await;
        read(response).await
    }

    pub async fn pull(&self, token: &str, since: i64) -> Result<PullResponse, ClientError> {
        let url = format!("{}?since={since}", self.url(routes::SYNC_PULL));
        read(self.http.get(url).bearer_auth(token).send().await).await
    }

    pub async fn forgot_password(&self, email: &str) -> Result<(), ClientError> {
        let body = ForgotPassword { email: email.into() };
        empty(self.http.post(self.url(routes::FORGOT_PASSWORD)).json(&body).send().await).await
    }

    pub async fn reset_password(&self, request: &ResetPassword) -> Result<Session, ClientError> {
        self.post(routes::RESET_PASSWORD, request).await
    }

    pub async fn change_password(&self, token: &str, request: &ChangePassword) -> Result<(), ClientError> {
        empty(self.http.post(self.url(routes::CHANGE_PASSWORD)).bearer_auth(token).json(request).send().await).await
    }

    pub async fn devices(&self, token: &str) -> Result<Vec<Device>, ClientError> {
        read(self.http.get(self.url(routes::DEVICES)).bearer_auth(token).send().await).await
    }

    pub async fn sign_out_device(&self, token: &str, id: &str) -> Result<(), ClientError> {
        let url = self.url(&routes::DEVICE.replace("{id}", id));
        empty(self.http.delete(url).bearer_auth(token).send().await).await
    }

    pub async fn delete_account(&self, token: &str, request: &DeleteAccount) -> Result<(), ClientError> {
        empty(self.http.delete(self.url(routes::ACCOUNT)).bearer_auth(token).json(request).send().await).await
    }

    // ---------- Shared boards ----------

    pub async fn spaces(&self, token: &str) -> Result<Vec<Space>, ClientError> {
        read(self.http.get(self.url(routes::SPACES)).bearer_auth(token).send().await).await
    }

    pub async fn create_space(&self, token: &str, id: &str) -> Result<Space, ClientError> {
        read(self.http.post(self.url(routes::SPACES)).bearer_auth(token).json(&CreateSpace { id: id.into() }).send().await).await
    }

    pub async fn adopt(&self, token: &str, id: &str, request: &Adopt) -> Result<Adopted, ClientError> {
        let url = self.url(&route(routes::SPACE_ADOPT, &[("id", id)]));
        read(self.http.post(url).bearer_auth(token).json(request).send().await).await
    }

    pub async fn delete_space(&self, token: &str, id: &str) -> Result<(), ClientError> {
        empty(self.http.delete(self.url(&route(routes::SPACE, &[("id", id)]))).bearer_auth(token).send().await).await
    }

    pub async fn space_push(&self, token: &str, id: &str, request: &PushRequest) -> Result<PushResponse, ClientError> {
        let url = self.url(&route(routes::SPACE_PUSH, &[("id", id)]));
        read(self.http.post(url).bearer_auth(token).json(request).send().await).await
    }

    pub async fn space_pull(&self, token: &str, id: &str, since: i64) -> Result<PullResponse, ClientError> {
        let url = format!("{}?since={since}", self.url(&route(routes::SPACE_PULL, &[("id", id)])));
        read(self.http.get(url).bearer_auth(token).send().await).await
    }

    pub async fn members(&self, token: &str, id: &str) -> Result<Members, ClientError> {
        read(self.http.get(self.url(&route(routes::SPACE_MEMBERS, &[("id", id)]))).bearer_auth(token).send().await).await
    }

    pub async fn invite(&self, token: &str, id: &str, request: &NewInvite) -> Result<Invite, ClientError> {
        let url = self.url(&route(routes::SPACE_INVITES, &[("id", id)]));
        read(self.http.post(url).bearer_auth(token).json(request).send().await).await
    }

    pub async fn withdraw_invite(&self, token: &str, id: &str, invite_id: &str) -> Result<(), ClientError> {
        let url = self.url(&route(routes::SPACE_INVITE, &[("id", id), ("invite_id", invite_id)]));
        empty(self.http.delete(url).bearer_auth(token).send().await).await
    }

    pub async fn change_role(&self, token: &str, id: &str, user_id: &str, role: Role) -> Result<(), ClientError> {
        let url = self.url(&route(routes::SPACE_MEMBER, &[("id", id), ("user_id", user_id)]));
        empty(self.http.patch(url).bearer_auth(token).json(&ChangeRole { role }).send().await).await
    }

    pub async fn remove_member(&self, token: &str, id: &str, user_id: &str) -> Result<(), ClientError> {
        let url = self.url(&route(routes::SPACE_MEMBER, &[("id", id), ("user_id", user_id)]));
        empty(self.http.delete(url).bearer_auth(token).send().await).await
    }

    pub async fn my_invites(&self, token: &str) -> Result<Vec<MyInvite>, ClientError> {
        read(self.http.get(self.url(routes::INVITES)).bearer_auth(token).send().await).await
    }

    pub async fn accept_invite(&self, token: &str, id: &str) -> Result<Space, ClientError> {
        read(self.http.post(self.url(&route(routes::INVITE_ACCEPT, &[("id", id)]))).bearer_auth(token).send().await).await
    }

    pub async fn decline_invite(&self, token: &str, id: &str) -> Result<(), ClientError> {
        empty(self.http.post(self.url(&route(routes::INVITE_DECLINE, &[("id", id)]))).bearer_auth(token).send().await).await
    }

    async fn post<B: Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> Result<T, ClientError> {
        read(self.http.post(self.url(path)).json(body).send().await).await
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base)
    }
}

/// Checks the status and reads the JSON body.
async fn read<T: DeserializeOwned>(sent: reqwest::Result<reqwest::Response>) -> Result<T, ClientError> {
    let response = check(sent.map_err(|_| ClientError::Offline)?).await?;
    response.json().await.map_err(|_| ClientError::Rejected {
        status: 502,
        message: "The server sent an answer Axiom doesn't understand. Try updating Axiom.".into(),
    })
}

/// Checks the status of a request that returns no body.
async fn empty(sent: reqwest::Result<reqwest::Response>) -> Result<(), ClientError> {
    check(sent.map_err(|_| ClientError::Offline)?).await.map(drop)
}

/// Turns an error status into a `ClientError` carrying the server's message.
async fn check(response: reqwest::Response) -> Result<reqwest::Response, ClientError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let message = match response.json::<ApiError>().await {
        Ok(error) => error.message,
        Err(_) => format!("The server returned an error ({status}). Try again shortly."),
    };
    Err(ClientError::Rejected { status: status.as_u16(), message })
}
