---

# World Cup Social Prediction MVP
## Technical Product Document

---

## 1. Overview

**World Cup Social Prediction** is a mobile-first social platform enabling users to create private prediction groups, invite friends via WhatsApp, and compete in real-time leaderboards without financial transactions or betting mechanics. The platform abstracts tournament prediction challenges into shareable, viral-growth-friendly social experiences optimized for mobile devices and WhatsApp distribution.

The MVP focuses on core social prediction flows: group creation, member approval, score predictions, automatic result synchronization, and winner notifications. All external transactions (prize pools, payments) remain the responsibility of group administrators.

---

## 2. Vision

**Become the easiest and most social way to play football prediction tournaments with friends.**

Core principles guiding product decisions:
- **Mobile-first** design prioritizing single-hand interaction
- **WhatsApp-native growth** through shareable invitation links and automatic notifications
- **Minimal friction onboarding** (guest-first, no mandatory account setup)
- **Social engagement** via real-time rankings and peer competition
- **Zero financial complexity** (no payments, wallets, or prize infrastructure)

---

## 3. Scope

The MVP includes the following production-ready features:

- **Authentication**: Guest-first experience with optional phone verification; persistent session across devices
- **Group Management**: Create open or approval-required groups; set registration deadlines; manage membership
- **Predictions**: Score-based predictions per match; prediction locking 60 minutes before kickoff; multi-group participation support
- **Leaderboards**: Dynamic group-based rankings; real-time point calculation; historical score tracking
- **Notifications**: WhatsApp winner announcements (Twilio or Meta API Phase 2); shared invitation links; reminder messages
- **Admin Controls**: Approve/reject join requests; update group settings; lock group registration; revoke memberships
- **Result Synchronization**: Automated daily sync from API-Football (100-request/day free tier); automatic point calculation; match result validation

---

## 4. Non-Goals (MVP)

**Out of scope for MVP launch:**
- Payment gateways, wallets, or financial settlement systems
- Gambling licensing compliance or regulatory reporting
- Native mobile apps (web-only, responsive design)
- In-app chat, direct messaging, or social features beyond group notifications
- Fantasy football mechanics (salary caps, player transfers, squad building)
- AI-powered predictions or recommendation engines
- Machine learning for fraud detection
- Multi-language support (MVP: English only)
- Native push notifications (Phase 2)
- Complex tournament bracket structures (phase 2+)

---

## 5. Architecture

```
┌─────────────────────┐
│   Next.js Frontend  │ (Mobile-first React, TailwindCSS)
│   (Vercel hosted)   │
└──────────┬──────────┘
           │
           ↓ HTTPS
┌─────────────────────┐
│  Supabase Backend   │ (PostgreSQL, Auth, Realtime)
│  Edge Functions     │ (Cron sync, notifications)
└──────────┬──────────┘
           │
           ↓ PostgreSQL
┌─────────────────────┐
│     Database        │ (Profiles, Groups, Predictions, Matches)
│   (Row-level RLS)   │ (Immutable audit snapshots)
└─────────────────────┘
           │
           ├─→ n8n Automation (Phase 2: WhatsApp orchestration)
           │
           └─→ API-Football (Free tier: 100 req/day for match results)
```

**Data Flow:**
1. User creates group and invites members (frontend → Supabase)
2. Join requests submitted (if approval-required)
3. Predictions locked automatically as kickoff approaches
4. Cron job (via internal token) syncs results from API-Football
5. Points recalculated; winners identified
6. WhatsApp notifications sent (Twilio/Meta API)

---

## 6. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 20+, TypeScript, TailwindCSS, shadcn/ui | Mobile-first UI; SSR; API routes |
| **Backend** | Supabase (PostgreSQL 15+, Auth, Realtime) | Database; authentication; RLS policies |
| **Authentication** | Supabase Auth | JWT session; optional phone verification |
| **Hosting** | Vercel | Edge computing; environment secrets management |
| **Cron** | Vercel Cron (or n8n) | Daily result sync; winner notifications |
| **Notifications** | Twilio WhatsApp API (Phase 2) | SMS-like WhatsApp delivery |
| **Football Data** | API-Football (free tier) | Match schedules, results, live scores |
| **Automation** | n8n (optional Phase 2) | Complex workflow orchestration |

---

## 7. User Roles

| Role | Capabilities | Scope |
|------|-------------|-------|
| **Creator** | Creates group; approves/rejects join requests; locks registration; updates group settings; views all members and predictions | Per group |
| **Admin** | All creator permissions; removes members; reassigns admin role; force-resets predictions | Per group |
| **Member** | Joins group; submits score predictions; views group leaderboard; receives notifications; cannot modify group settings | Per group |
| **Guest** | Views public group info; invited via WhatsApp link; converts to member on approval (if approval required) | Per group |
| **System** | Cron-triggered sync jobs; automated result import; notification dispatch; point calculation | Global |

---

## 8. Group Types

### Open Groups
- **Joining**: Any user can join directly; no approval required
- **Registration Deadline**: Optional (if set, no new members after deadline)
- **Use Case**: Public tournaments, casual leagues, viral challenges
- **Notification**: Auto-add to group immediately

### Approval-Required Groups
- **Joining**: Join request submitted; creator/admin reviews; accepted/rejected
- **Request Persistence**: Join request stored with immutable phone snapshot (see Section 9)
- **Registration Deadline**: Applies after deadline—no new requests accepted
- **Use Case**: Private leagues, friends-only tournaments, managed competitions
- **Notification**: Request pending notification to creators

---

## 9. Approval Flow with Immutable Requested Phone Snapshot

When a user requests to join an approval-required group:

**Database Design:**
```sql
CREATE TABLE join_requests (
  id uuid primary key,
  group_id uuid not null,
  requested_by uuid not null,
  requested_phone_snapshot text, -- Immutable snapshot at request time
  status text check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null,
  unique (group_id, requested_by)
);
```

**Process:**
1. **Submit Request**: User initiates join; system captures user's current `phone` value into `requested_phone_snapshot`
2. **Immutability**: Snapshot is never updated; reflects user's phone at request time (audit trail for notifications/contact)
3. **Creator Review**: Admin views pending request with immutable phone context
4. **Approval Decision**: 
   - **Approved**: User added to `group_members`; join request status = 'approved'
   - **Rejected**: Status = 'rejected'; reason optional; join request remains for audit
5. **Retry**: User can submit new join request after rejection (creates new request row)

**Rationale**: Immutable snapshot enables:
- Contact tracing for follow-up notifications (e.g., approval status)
- Audit compliance (snapshot phone at request time)
- Preventing approval escalation if user updates phone mid-process

---

## 10. Registration Deadlines

### Deadline Mechanics
- **Type**: UTC timestamp (e.g., `2026-06-15 18:00:00 UTC`)
- **Scope**: Per group; optional (null = no deadline)
- **Enforcement**:
  - **Open Groups**: No new members after deadline; existing members can still predict
  - **Approval-Required Groups**: No new join requests accepted after deadline; pending requests locked
  - **Predictions**: Deadline does NOT lock predictions (separate lock per match at kickoff - 60 minutes)

### User Interaction
- **Pre-deadline**: "Join before [date] to be eligible"
- **Post-deadline**: "This group is closed to new members"
- **Exception**: Admins bypass deadline to manually add members if needed

### Admin Control
- Set/update deadline when creating or editing group
- Extend deadline if tournament delays occur
- Clear deadline to reopen group for new members

---

## 11. Scoring and Locking Rules

### Prediction Scoring

**Exact Score Match (3 points)**
- User predicts final score exactly (e.g., 2-1 predicted, 2-1 actual) → 3 points

**Goal Difference Match (2 points)**
- Correct goal margin, wrong scores (e.g., 2-1 predicted vs. 3-2 actual) → 2 points

**Result Match (1 point)**
- Correct winner/draw, wrong margin (e.g., 2-0 predicted vs. 3-1 actual) → 1 point

**No Match (0 points)**
- All other outcomes → 0 points

### Prediction Locking

| State | Lock Trigger | User Action | Status |
|-------|-------------|-----------|--------|
| **Pending** | User edits predictions freely | Can update before kickoff | `pending` |
| **Locked** | Match kickoff - 60 minutes | Predictions auto-locked; no further edits | `locked` |
| **Decided** | Final whistle (match ended) | Predictions frozen; points calculated | `decided` |

**Lock Enforcement:**
- Frontend disables prediction input at T-60 min
- Backend validates `status = 'pending'` on update; rejects locked predictions
- RLS policy: `user_id = auth.uid() AND status = 'pending'` allows updates only

### Points Finalization
- Triggered when: Match result imported from API-Football (final status: `FT`, `AET`, or `PEN`)
- Calculation: Immediate point assignment; leaderboard updated in real-time
- Notification: Winner announcement sent within 5 minutes of finalization

---

## 12. Core User Flows

### Flow A: Create Group & Invite Friends
1. User taps **Create Group**
2. Enters group name; selects privacy (open or approval-required)
3. Optional: Sets registration deadline
4. System generates shareable WhatsApp link (`www.app.com/join/[GROUP_ID]?token=[INVITE_TOKEN]`)
5. User taps **Share to WhatsApp**; message pre-filled with link
6. Friends click link → auto-join (open) or request approval (approval-required)
7. **Result**: Group created; members added to `group_members`

### Flow B: Request Access (Approval-Required Group)
1. Friend clicks WhatsApp invite link
2. App shows group info; user taps **Request Access**
3. System captures user phone → `requested_phone_snapshot`
4. Create `join_requests` row (status = 'pending')
5. Notification sent to group creators
6. Creator reviews pending requests; approves or rejects
7. **Result**: User added to `group_members` (approved) or status = 'rejected'

### Flow C: Make Prediction
1. User joins group; sees list of upcoming matches
2. Selects a match; enters predicted home score and away score
3. System validates: Both scores ≥ 0; creates/updates `predictions` row
4. Prediction locked automatically at T-60 min before kickoff
5. After final whistle, points assigned; leaderboard updated
6. **Result**: Prediction visible in group leaderboard with points

### Flow D: View Leaderboard & Rankings
1. User opens group
2. System queries all group members with total points (`sum(predictions.points)`)
3. Sorts by points descending
4. Displays: Rank, member name, total points, recent matches (optional)
5. Real-time updates via Supabase Realtime subscription
6. **Result**: User sees live standings; can compare performance

---

## 13. WhatsApp Strategy

### Phase 1: Share Links Only (MVP Launch)
- **Mechanism**: Generate unique WhatsApp group-invite links with UTM parameters
- **Example**: `https://app.com/join/group-uuid?ref=whatsapp`
- **Distribution**: User taps "Share to WhatsApp"; pre-formatted message
- **Message Template**: "Join my World Cup prediction group 🏆 [link]"
- **No API Cost**: Uses web link only; zero infrastructure cost

### Phase 2: Automated Notifications (Week 2-3)
- **Provider**: Twilio WhatsApp API or Meta WhatsApp Cloud API
- **Triggers**:
  - Join request submitted → Notify creator ("New join request from [name]")
  - Request approved → Notify requester ("You've been added to [group]")
  - Winner announcement → Notify all winners ("You won this match! [points]")
  - Reminder (24h before deadline) → "Hurry, registration closes in 24 hours"

- **Opt-in**: Users enable notifications in profile settings; stored in `profiles.notification_enabled`
- **Rate Limiting**: Max 1 message per user per event type per day

### Phase 3: Broadcast Campaigns (Phase 2+)
- Group creators send custom messages to group members (e.g., "Good luck tomorrow!")
- n8n workflows trigger based on tournament milestones
- Admin dashboard to manage broadcast templates

---

## 14. Football API Strategy with Free-Tier Optimization (100 Requests/Day)

### API-Football Free Tier Limits
- **Quota**: 100 requests per day (resets at UTC midnight)
- **Endpoints Used**: Fixtures (list matches by date/league/season)
- **Rate Limits**: ~2 req/sec (burst-safe)

### Optimization Strategy

**A. Daily Batch Sync (Single Request Per Day)**
- **Schedule**: 23:00 UTC (after evening matches globally)
- **Scope**: Fetch all fixtures for configured league+season for current date only
- **Response**: ~5–20 fixtures per league
- **Cost**: 1 request per day
- **Fallback**: If sync fails, retry next day (matches remain `ended=false` until synced)

**B. Match Coverage**
- **Scope**: Only matches where `group_id` has active predictions
- **Skip**: Ignored leagues/seasons without predictions
- **Bulk Fetch**: Single API call retrieves all ~20 fixtures; parse results into local `matches` table

**C. Result Caching**
- **Store Locally**: Cache fixtures in `matches` table with `api_sync_at` timestamp
- **No Re-fetch**: Once `ended=true` and `notified_at` is set, do not re-query that match from API
- **Partial Updates**: Only update `home_goals`, `away_goals`, `status_short` if changed

**D. Request Budget**
```
Allocation per day (100 requests):
- Daily batch sync: 1 request
- Retry buffer (failures): 2 requests
- Manual admin triggers: 2 requests
- Reserved: 95 requests (future tournament phases, live updates)
```

**E. Fallback & Error Handling**
- **API Down**: Skip sync; retry next day; predictions remain pending (not penalized)
- **Network Timeout**: Log error; no penalty to user experience
- **Invalid Season**: Fall back to previous valid season; alert admin

**F. Cron Implementation**
```
GET /api/cron/sync-results?date=2026-06-01
Authorization: Bearer [INTERNAL_API_TOKEN]
```
- Called by Vercel Cron or external scheduler (n8n)
- Returns JSON: `{ requestsUsed: 1, fetchedFixtures: 15, updatedMatches: 8, finalizedMatches: 5 }`
- Includes point recalculation and winner notification in same job

### Future Expansion (Phase 2+)
- Premium tier upgrade (2000 req/day) for multi-league support
- Live score streaming (upgraded API tier)
- Historical data analysis (archived fixtures)

---

## Conclusion

This MVP provides a robust foundation for viral social prediction gameplay. The architecture prioritizes simplicity, real-time engagement, and WhatsApp-native distribution while respecting API quota constraints and financial boundaries. The immutable phone snapshot in join requests ensures auditability; automated result sync eliminates manual data entry; and tiered notification strategy scales from free-tier links to premium WhatsApp campaigns.

**Go-live readiness**: Database schema deployed; API endpoints implemented; frontend operational; Phase 1 (link-based sharing) ready for production. Phase 2 (Twilio integration) ready for activation upon WhatsApp API credentials provisioning.

---

**Document Version**: 1.0 | **Date**: May 25, 2026 | **Status**: Production MVP
