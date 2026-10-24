//! Messages to support from the app. Each is saved for the admin panel and
//! emailed to the support inbox with the sender as Reply-To, so answering is
//! just replying. Signing in is optional: people using Axiom without an
//! account can write too, giving an address to reply to.

use axiom_protocol::{
    MAX_TICKET_MESSAGE, MAX_TICKET_SUBJECT, NewTicket, TICKET_KINDS, Ticket, TicketChange, TicketSent, check_email, normalize_email,
    ticket_reference,
};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set};

use crate::AppState;
use crate::admin::AdminUser;
use crate::auth::signed_in;
use crate::entities::{new_id, support_ticket, user};
use crate::error::ApiError;
use crate::limit::ClientIp;
use crate::mail;

/// Solved tickets shown in the admin panel, newest first. Open ones are all shown.
const SOLVED_SHOWN: u64 = 100;

pub async fn create(State(s): State<AppState>, ip: ClientIp, headers: HeaderMap, Json(body): Json<NewTicket>) -> Result<Json<TicketSent>, ApiError> {
    s.limits.check_ip(&ip)?;
    let account = match signed_in(&s, &headers).await? {
        Some(auth) => user::Entity::find_by_id(&auth.user_id).one(&s.db).await?,
        None => None,
    };
    let email = match &account {
        Some(account) => account.email.clone(),
        None => {
            let email = normalize_email(body.email.as_deref().unwrap_or_default());
            check_email(&email).map_err(|_| ApiError::bad_request("Enter the email address we should reply to."))?;
            email
        }
    };
    let (kind, label) = *TICKET_KINDS.iter().find(|(id, _)| *id == body.kind).ok_or_else(|| ApiError::bad_request("Choose what your message is about."))?;
    let subject = body.subject.replace(['\r', '\n'], " ").trim().to_owned();
    let message = body.message.trim().to_owned();
    if subject.is_empty() || message.is_empty() {
        return Err(ApiError::bad_request("Add a subject and a message."));
    }
    if subject.chars().count() > MAX_TICKET_SUBJECT || message.chars().count() > MAX_TICKET_MESSAGE {
        return Err(ApiError::bad_request(format!("Keep the subject to {MAX_TICKET_SUBJECT} characters and the message to {MAX_TICKET_MESSAGE}.")));
    }
    // Per account, or per network without one: support shouldn't be a way to flood the inbox.
    let sender = account.as_ref().map_or_else(|| format!("ip:{}", ip.0), |a| a.id.clone());
    if !s.limits.tickets.hit(&sender) {
        return Err(ApiError::too_many("You've sent several messages in the last hour. We'll reply as soon as we can."));
    }

    let ticket = support_ticket::ActiveModel {
        id: Set(new_id()),
        user_id: Set(account.as_ref().map(|a| a.id.clone())),
        email: Set(email),
        kind: Set(kind.into()),
        subject: Set(subject),
        message: Set(message),
        app_version: Set(body.app_version.trim().chars().take(40).collect()),
        created_at: Set(Utc::now()),
        solved_at: Set(None),
    }
    .insert(&s.db)
    .await?;
    let reference = ticket_reference(&ticket.id);

    let inboxes: Vec<String> = match &s.contact_email {
        Some(contact) => vec![contact.clone()],
        None => s.admins.iter().cloned().collect(),
    };
    if inboxes.is_empty() {
        tracing::warn!("Support ticket {reference} saved, but neither CONTACT_EMAIL nor ADMIN_EMAILS is set to email it to");
    }
    let mut emails: Vec<mail::Email> = inboxes.iter().map(|to| mail::support_ticket(to, &reference, label, &ticket, account.is_some())).collect();
    // Only a confirmed address gets a receipt, so this can't send mail to strangers.
    if account.is_some() {
        emails.push(mail::support_received(&ticket.email, &reference, &ticket.subject, s.contact_email.as_deref()));
    }
    let state = s.clone();
    tokio::spawn(async move {
        for email in emails {
            if let Err(err) = state.mailer.send(email).await {
                tracing::error!("Couldn't send a support email: {err}");
            }
        }
    });
    Ok(Json(TicketSent { reference }))
}

/// Every open ticket, then the most recently solved; newest first in each.
pub async fn list(State(s): State<AppState>, _admin: AdminUser) -> Result<Json<Vec<Ticket>>, ApiError> {
    let newest = |solved: bool| {
        let column = support_ticket::Column::SolvedAt;
        support_ticket::Entity::find().filter(if solved { column.is_not_null() } else { column.is_null() }).order_by_desc(support_ticket::Column::CreatedAt)
    };
    let open = newest(false).all(&s.db).await?;
    let solved = newest(true).limit(SOLVED_SHOWN).all(&s.db).await?;
    Ok(Json(open.into_iter().chain(solved).map(view).collect()))
}

pub async fn update(State(s): State<AppState>, _admin: AdminUser, Path(id): Path<String>, Json(body): Json<TicketChange>) -> Result<Json<Ticket>, ApiError> {
    let found = support_ticket::Entity::find_by_id(&id)
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "That ticket no longer exists."))?;
    let mut active: support_ticket::ActiveModel = found.into();
    active.solved_at = Set(body.solved.then(Utc::now));
    Ok(Json(view(active.update(&s.db).await?)))
}

fn view(t: support_ticket::Model) -> Ticket {
    Ticket {
        reference: ticket_reference(&t.id),
        signed_in: t.user_id.is_some(),
        id: t.id,
        email: t.email,
        kind: t.kind,
        subject: t.subject,
        message: t.message,
        app_version: t.app_version,
        created_at: t.created_at,
        solved_at: t.solved_at,
    }
}
