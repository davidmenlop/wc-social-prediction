# ⚽ World Cup Social Prediction Platform
## Technical Product Document (MVP)

---

# 1. Product Overview

A mobile-first social prediction platform for football tournaments focused on:
- viral growth
- WhatsApp sharing
- private groups
- social competition
- low friction onboarding

Users can:
- create prediction groups
- invite friends
- request access to private groups
- predict match scores
- compete in rankings
- receive reminders and notifications

The platform is NOT:
- a betting platform
- a payment processor
- a gambling system

The platform only:
- manages groups
- manages predictions
- manages rankings
- manages approvals

Any payments or prize pools are handled externally by group admins.

---

# 2. Product Vision

Build the easiest and most social way to play football prediction tournaments with friends.

Core principles:
- mobile first
- WhatsApp-first growth
- simple onboarding
- social engagement
- fast interactions
- minimal friction

---

# 3. MVP Scope

## Core Features

### Authentication
- guest-first experience
- minimal onboarding
- persistent session
- optional phone verification later

### Groups
- create groups
- join groups
- open groups
- approval-required groups
- registration deadlines

### Predictions
- score predictions
- prediction locking
- multi-group support

### Rankings
- dynamic leaderboards
- real-time updates
- group-based rankings

### Notifications
- WhatsApp share links
- reminder notifications
- ranking updates

### Admin Controls
- approve/reject users
- manage group settings
- control invitations
- lock registrations

---

# 4. Non Goals (MVP)

Do NOT build:
- payment gateways
- wallets
- gambling systems
- prize payouts
- fantasy football
- AI predictions
- native mobile apps
- social chat system

---

# 5. Product Architecture

Frontend (Next.js)
↓
Supabase Backend
↓
PostgreSQL Database
↓
n8n Automations
↓
WhatsApp Notifications

---

# 6. Suggested Tech Stack

## Frontend
- Next.js
- TypeScript
- TailwindCSS
- shadcn/ui

## Backend
- Supabase
- PostgreSQL
- Edge Functions
- Realtime

## Hosting
- Vercel

## Automation
- n8n

## Notifications
Phase 1:
- WhatsApp share links only

Phase 2:
- Twilio WhatsApp API
or
- Meta WhatsApp Cloud API
