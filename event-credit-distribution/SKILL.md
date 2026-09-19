---
name: event-credit-distribution
description: Reconcile checked-in event guests with form responses and per-recipient credit inventory, then deliver approved Codex and API credits through an authorized XChat transport with duplicate-send safeguards and durable checklist tracking. Use for event-specific credit distribution workflows, not generic messaging campaigns.
---

# Event Credit Distribution

Use this skill when an event organizer wants to determine eligible credit recipients from Luma and a Google Form or equivalent sheet, map one credit pair to each recipient, send the organizer's approved message through XChat, and preserve resumable delivery state.

The skill defines a workflow and safety boundary. It does not authorize external messages by itself. Before any send, require explicit user authorization for the recipients and message.

## Inputs and outputs

Collect or locate:

- The event's Luma guest-management URL or event ID.
- The form or sheet URL, exact tab title, and the column containing the required X handle or X profile URL.
- A Codex credit inventory and an API credit inventory with a stable row or inventory identifier.
- The approved message template with placeholders such as `{{codex_url}}` and `{{api_code}}`.
- Organizer exclusions and any direct organizer-confirmed identity links.

Keep event data in the event workspace, not in this skill. A useful event workspace contains a Luma snapshot, a mapping report, source inventories, a deduplicated `distribution-list.csv` send queue, and `delivery-checklist.md`. Preserve existing filenames and local conventions when they already exist.

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

## Reconciliation and preflight

Build a manifest before sending. Each candidate must have exactly one form row, one checked-in Luma record or documented manual link, one Codex URL, and one API code.

Deduplicate before assigning inventory or creating the send queue. Group eligible form rows by normalized recipient handle, and allow at most one canonical row per normalized handle in the send manifest. Keep one row per group, preferably the earliest source row unless the organizer specifies another row, and mark every other duplicate row `HOLD` with reason `DUPLICATE_RECIPIENT`. If one row in a duplicate group is already `SENT_CONFIRMED`, all other rows in that group remain `HOLD`; never assign another credit pair or send again. The checklist may retain duplicate source rows for audit, but only the canonical row is sendable.

Write the durable send queue after reconciliation. `distribution-list.csv` must contain only canonical, not-yet-sent rows with status `READY` that pass every eligibility, exclusion, duplicate, and inventory check. Do not include `SENT_CONFIRMED`, `HOLD`, `EXCLUDED`, or `UNKNOWN` rows in the send queue; retain those states in the checklist and mapping report for audit.

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

Render the approved template from the manifest immediately before sending. Use only the pair assigned to the current form row. Check that the rendered message contains the expected Codex URL and API code and contains no unresolved placeholder.

Codex inventory values may already be a bare `chatgpt.com/codex/p/<token>` URL, an `https://chatgpt.com/codex/p/<token>` URL, or a bare token. Normalize exactly once: preserve a value that already has the canonical Codex URL prefix, and prepend `chatgpt.com/codex/p/` only to a bare token. Never prepend the prefix unconditionally. Before marking a candidate `ATTEMPTED`, require that the rendered message contains the expected canonical URL, contains no nested prefix such as `chatgpt.com/codex/p/chatgpt.com/codex/p/`, contains no unresolved `XXX`, and contains the canonical URL exactly once. A failed URL preflight is a hold and must not be sent.

Keep PINs, session tokens, passwords, and other credentials out of the message, skill, checklist, and logs. If the transport displays an `XChat PIN:` prompt, enter the PIN only into the designated terminal prompt and never into the chat composer or a saved artifact.

## Sending and confirmation

External sending is a mutation and requires explicit user authorization. Send one candidate at a time in manifest order unless the user specifies another order.

For each candidate:

1. Set the local status to `ATTEMPTED` before submitting.
2. Search the authorized XChat transport and select a result whose handle exactly equals the manifest recipient. A display-name match is not sufficient.
3. Confirm the selected conversation belongs to that exact handle before inserting the message.
4. Submit the fully rendered message once.
5. Require a positive server-side confirmation: an expected successful send response with a nonempty message or event identifier and no API errors. An HTTP 200 status alone is not sufficient.
6. Record the opaque response or message identifier, recipient handle, timestamp, and source row without recording the PIN or full secret values in logs.
7. Only after confirmation, change the status to `SENT_CONFIRMED` and update the checklist.

The composer becoming empty, a local preview changing, or a send button disappearing is not by itself confirmation. If the response, message ID, or recipient identity is uncertain, set the record to `UNKNOWN`, stop the batch, and do not retry. Do not proceed to another recipient while an attempted send is unknown unless the organizer explicitly resolves the state.

After a confirmed send, never resend the same credit pair to the same recipient because the conversation UI is stale or the message is not immediately visible. Refreshing or inspecting is allowed; retrying is not.

Do not automatically delete a message, send an apology, or send a correction after an incident. Stop, report the incident, and obtain explicit authorization for any follow-up external message.

## Checklist and recovery

Use a durable checklist with one row per form response. A confirmed entry should record the source row, exact recipient, date, and a short evidence note such as `one send confirmed`. Keep `HOLD`, `EXCLUDED`, and `UNKNOWN` visibly distinct from unsent records.

For a resumed run:

- Re-read the current checklist and do not resend `SENT_CONFIRMED` rows.
- Revalidate `UNKNOWN` rows against transport evidence before taking any action.
- Recheck live Luma state when the snapshot may be stale.
- Re-run code uniqueness checks for the remaining inventory.
- Continue only with `READY` rows explicitly authorized by the user.

At completion, report counts for confirmed sends, holds, exclusions, and unknowns, list the remaining pending rows, and link the durable artifacts. Do not claim completion from a draft, typed composer value, local optimistic preview, or unverified UI state.
