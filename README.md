# Ilissiot Messenger

A full-stack real-time messenger with audio/video calls, built with React, Express, and WebRTC.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Radix UI (shadcn/ui), Framer Motion
- **Backend:** Express 5, TypeScript, WebSocket (ws)
- **Database:** PostgreSQL (Neon.tech), Drizzle ORM
- **Auth:** express-session, bcryptjs, connect-pg-simple
- **Calls:** WebRTC peer-to-peer with STUN servers

## Features

- Real-time messaging via WebSockets
- Direct and group chats
- Audio and video calls (WebRTC)
- Call history entries in chat timeline
- File, image, video, and audio attachments
- Typing indicators and online/offline status
- User search and profile settings
- Message selection and batch deletion
- User blocking

## Setup

### Prerequisites

- Node.js v18+
- PostgreSQL database (e.g. Neon.tech)

### Install

```bash
git clone https://github.com/Lloydwqe23/Ilissiot.git
cd Ilissiot
npm install
```

### Configure

Create a `.env` file in the root:

```
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

### Database

Push the schema to your database:

```bash
npx drizzle-kit push
```

### Run

```bash
npm run dev
```

The app starts at `http://localhost:5000`.

## Project Structure

```
server/           Express backend, WebSocket, auth, file uploads
  routes.ts       API routes and WebSocket signaling
  storage.ts      Database queries (Drizzle)
  auth/local.ts   Session-based authentication
client/src/       React frontend
  components/     Chat UI, call overlay, profile settings
  hooks/          Auth, chats, messages, WebSocket, call state
  pages/          Auth page, chat layout
shared/           Shared schema and API contract
  schema.ts       Drizzle table definitions, WS event types
  routes.ts       Zod-validated API route definitions
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Sync schema to database |
