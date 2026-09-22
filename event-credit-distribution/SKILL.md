---
name: event-credit-distribution
description: Reconcile checked-in event guests with form responses and per-recipient credit inventory, then deliver approved Codex and API credits through an authorized XChat transport with duplicate-send safeguards and durable checklist tracking. Use for event-specific credit distribution workflows, not generic messaging campaigns.
---

# Event Credit Distribution

Use this skill when an event organizer wants to determine eligible credit recipients from Luma and a Google Form or equivalent sheet, map one credit pair to each recipient, send the organizer's approved message through XChat, and preserve resumable delivery state.

The skill defines a workflow and safety boundary. It does not authorize external messages by itself. Before any send, require explicit user authorization for the recipients and message.

Use the authorized transport already established for the event before selecting a fallback:

- If a resident XChat app or authenticated XChat web session is available, prefer that existing route and verify its underlying send response. A resumed run must preserve the transport used by prior confirmed sends unless the organizer explicitly authorizes a change.
- Do not launch a standalone XChat CLI merely because it is installed. The CLI is not the default transport for this workflow.
- Treat an interactive `XChat PIN:` prompt as a CLI fallback condition, not as a required step. Only use the CLI PIN flow when the organizer explicitly chooses the CLI or the established transport is unavailable and the fallback is authorized. A PIN prompt alone is never evidence of a send.

## Inputs and outputs

Collect or locate:

- The event's Luma guest-management URL or event ID.
- The form or sheet URL, exact tab title, and the column containing the required X handle or X profile URL.
- A Codex credit inventory and an API credit inventory with a stable row or inventory identifier.
- The approved message template with placeholders such as `{{codex_url}}` and `{{api_code}}`.
- Organizer exclusions and any direct organizer-confirmed identity links.

Keep event data in the event workspace, not in this skill. A useful event workspace contains a Luma snapshot, a mapping report, source inventories, a `distribution-review.csv` organizer-review queue, a deduplicated `distribution-list.csv` send queue, and `delivery-checklist.md`. Preserve existing filenames and local conventions when they already exist.

The final report must distinguish eligible, held, excluded, attempted, confirmed-sent, and unknown records. Link the checklist and mapping report when they are created or updated.

## Eligibility and identity rules

1. Treat current Luma `checked_in` status as the participant authority. Read the full paginated guest set and save the source timestamp.
2. Use the required X-handle answer from the Luma registration answer as the identity key. The dedicated `twitter_handle` field may be empty even when the required answer is present, so inspect the registration answers as well.
3. Normalize handles case-insensitively, trim whitespace, remove a leading `@`, and extract the path handle from an X profile URL. Preserve the raw values for audit.
4. A form row is eligible when the normalized form handle exactly matches the normalized required Luma answer for a checked-in guest.
5. A direct organizer confirmation may create a documented manual link or manual recipient selection. Record the reason, source record ID, and organizer decision separately from an exact match.
6. An email-only overlap, display-name match, near-match, or separate Luma record is not enough. Hold it for organizer confirmation.
7. Record `api_id`, raw and normalized X answers, email, approval status, and check-in timestamp for each matched Luma record. Do not merge records by email or display name alone.
8. A participant who entered the organizer's handle, an explicitly excluded row, or another organizer exclusion must remain `EXCLUDED` and unsent.

Never approve, decline, check in, or otherwise mutate Luma while performing this reconciliation.

## Source extraction and filter order

Use this order so a send queue cannot be built from a partial or mismatched source:

1. Read spreadsheet metadata first, then use the exact localized tab title and the configured X-handle column. For the Astra Commons workflow this was the tab `フォームの回答 1` and the X-handle column D. Read the full bounded populated response range, not a sample, preserve source row numbers and raw values, and do not guess `Sheet1` or include empty rows outside the response range.
2. Read the complete paginated Luma guest set through the read-only guest endpoint. Follow every cursor or `has_more` page, retain the source timestamp, and filter to records whose approval status is approved and whose current `checked_in` status is true.
3. Inspect the required Luma registration answer for the X-handle question, such as the registration answer identified by `question_type-twitter`. Do not substitute the dedicated `twitter_handle` field when the required answer is populated elsewhere.
4. Normalize the form handle and the required Luma answer by trimming whitespace, removing a leading `@`, extracting an X profile path handle when present, and comparing case-insensitively. Keep raw values, normalized values, Luma `api_id`, approval status, and check-in timestamp in the mapping.
5. Use exact normalized matches for automatic eligibility. Every typo, near-match, display-name match, email-only overlap, separate Luma record, or other non-exact candidate must first be written to `distribution-review.csv` with the raw values, Luma `api_id`, reason, suggested recipient, and decision status. Surface that review queue to the organizer and ask for an explicit identity and intended-recipient decision; never silently omit a candidate before asking. A documented manual link is an allowed exception after that decision, but it must retain the conflicting raw records and the organizer's reason. An unresolved review row remains `HOLD` and cannot enter the send queue.
6. Apply organizer exclusions before inventory assignment. A participant-entered organizer handle, an excluded form row, or any other explicit exclusion is `EXCLUDED` and must never enter the send queue.
7. Deduplicate the remaining candidates by normalized recipient handle before assigning credits. Keep one canonical source row, preferably the earliest row, and mark every other row `HOLD`; if one duplicate was already sent, all other rows remain held.
8. Resolve every `distribution-review.csv` row before finalizing the queue. Promote only organizer-approved identity and recipient decisions into the eligible set; keep rejected or unresolved rows out of the send queue with their decision visible in the review queue and checklist.
9. Remove candidates already marked `SENT_CONFIRMED` from the send queue while retaining them in the checklist for audit. Only then assign one unused Codex URL and one unused API code to each remaining candidate and write the `READY`-only `distribution-list.csv`.

Re-run the full source and inventory checks when the sheet, Luma state, or delivery checklist may have changed. Do not continue from a stale queue after a source update.

## Reconciliation and preflight

Build a manifest before sending. Each candidate must have exactly one form row, one checked-in Luma record or documented manual link, one Codex URL, and one API code.

Deduplicate before assigning inventory or creating the send queue. Group eligible form rows by normalized recipient handle, and allow at most one canonical row per normalized handle in the send manifest. Keep one row per group, preferably the earliest source row unless the organizer specifies another row, and mark every other duplicate row `HOLD` with reason `DUPLICATE_RECIPIENT`. If one row in a duplicate group is already `SENT_CONFIRMED`, all other rows in that group remain `HOLD`; never assign another credit pair or send again. The checklist may retain duplicate source rows for audit, but only the canonical row is sendable.

Write the durable review queue and send queue after reconciliation. `distribution-review.csv` must contain every non-exact or ambiguous candidate and its organizer decision, including resolved exceptions. `distribution-list.csv` must contain only canonical, not-yet-sent rows with status `READY` that pass every eligibility, exclusion, duplicate, review, and inventory check. Do not include `SENT_CONFIRMED`, `HOLD`, `EXCLUDED`, or `UNKNOWN` rows in the send queue; retain those states in the review queue, checklist, and mapping report for audit.

The manifest should include:

| Field | Required meaning |
| --- | --- |
| form row | Stable source row or response ID |
| form handle | Raw form value and normalized handle |
| luma record | Luma `api_id`, raw answer, normalized answer, and check-in evidence |
| recipient | Exact handle authorized for XChat selection |
| codex inventory ID | Stable inventory row or source line |
| API inventory ID | Stable inventory row or source line |
| status | `UNREVIEWED`, `READY`, `HOLD`, `EXCLUDED`, `ATTEMPTED`, `SENT_CONFIRMED`, or `UNKNOWN` |
| reason | Match, exclusion, manual decision, or failure evidence |

Before the first send, validate all of the following:

- Every `READY` candidate is checked in and has an exact or documented organizer-confirmed identity.
- Every eligible row has exactly one Codex URL and one API code.
- No Codex URL or API code is assigned to two candidates in the same run.
- The source row, recipient handle, and credit pair are stable after the dry run.
- All holds and exclusions are visible in the report and are not silently skipped.

Do not infer an inventory mapping from line position unless the source format explicitly guarantees that relationship and the row count and headers have been validated. Never invent a missing code or substitute a nearby code.

## Message construction

Render the approved template from the manifest immediately before sending with the bundled [render-credit-message.js](scripts/render-credit-message.js) helper. Pass JSON containing the raw `codex_url`, raw `api_code`, and a template with exactly one `{{codex_url}}` and one `{{api_code}}` placeholder. Use the helper's rendered `message` byte-for-byte. Do not concatenate a Codex prefix in ad-hoc send code, and do not edit the rendered message after the helper returns.

The helper normalizes a bare `chatgpt.com/codex/p/<token>` URL, an `https://chatgpt.com/codex/p/<token>` URL, or a bare token exactly once, and fails closed for nested prefixes, unresolved `XXX`, malformed URLs, duplicate placeholders, duplicate rendered values, or unresolved template markers. Run this preflight before marking a candidate `ATTEMPTED`; a failure is a hold and must not be sent. Never proceed using a manually constructed fallback message.

Keep PINs, session tokens, passwords, and other credentials out of the message, skill, checklist, and logs. If the transport displays an `XChat PIN:` prompt, enter the PIN only into the designated terminal prompt and never into the chat composer or a saved artifact.

Do not tell the organizer to enter a PIN just because the CLI is available. If the established app or web route does not require a PIN, there is no terminal PIN step. If an unexpected CLI prompt appears, stop the batch, preserve the unconfirmed state, and report the transport mismatch instead of switching routes or retrying.

## Sending and confirmation

External sending is a mutation and requires explicit user authorization. Send one candidate at a time in manifest order unless the user specifies another order.

For each candidate:

1. Set the local status to `ATTEMPTED` before submitting.
2. Use the established authorized XChat transport and select a result whose handle exactly equals the manifest recipient. A display-name match is not sufficient. For a resident app or web session, use its existing conversation-selection path; do not replace it with the standalone CLI.
3. Confirm the selected conversation belongs to that exact handle before inserting the message.
4. Submit the fully rendered message once.
5. Require a positive server-side confirmation from the selected transport. For the established XChat web or resident-app route, require the expected successful send response, HTTP 200, an encoded message event, no API errors, and nonempty conversation/message identifiers that match the exact target. For the CLI route, require its successful JSON response with nonempty conversation/message identifiers. An HTTP 200 status, an empty composer, or a changed local preview alone is not sufficient.
6. Record the opaque response or message identifier, recipient handle, timestamp, and source row without recording the PIN or full secret values in logs.
7. Only after confirmation, change the status to `SENT_CONFIRMED` and update the checklist.

The composer becoming empty, a local preview changing, or a send button disappearing is not by itself confirmation. If the response, message ID, or recipient identity is uncertain, set the record to `UNKNOWN`, stop the batch, and do not retry. If the route stops before submission at an unexpected CLI PIN prompt, do not mark the row sent and do not proceed to another recipient. Do not proceed to another recipient while an attempted send is unknown unless the organizer explicitly resolves the state.

After a confirmed send, never resend the same credit pair to the same recipient because the conversation UI is stale or the message is not immediately visible. Refreshing or inspecting is allowed; retrying is not.

Do not automatically delete a message, send an apology, or send a correction after an incident. Stop, report the incident, and obtain explicit authorization for any follow-up external message.

## Checklist and recovery

Use a durable checklist with one row per form response. A confirmed entry should record the source row, exact recipient, date, and a short evidence note such as `one send confirmed`. Keep `HOLD`, `EXCLUDED`, and `UNKNOWN` visibly distinct from unsent records.

For a resumed run:

- Re-read the current checklist and do not resend `SENT_CONFIRMED` rows.
- Re-read `distribution-review.csv` and do not hide or bypass unresolved organizer-review rows.
- Revalidate `UNKNOWN` rows against transport evidence before taking any action.
- Reuse the transport and confirmation method recorded for prior confirmed sends; do not silently switch between the resident app/web route and the standalone CLI.
- Recheck live Luma state when the snapshot may be stale.
- Re-run code uniqueness checks for the remaining inventory.
- Continue only with `READY` rows explicitly authorized by the user.

At completion, report counts for confirmed sends, holds, exclusions, and unknowns, list the remaining pending rows, and link the durable artifacts. Do not claim completion from a draft, typed composer value, local optimistic preview, or unverified UI state.
