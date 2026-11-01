# Chatly — Connect. Chat. Share.

A WhatsApp-style real-time messaging web app built with React 19, TypeScript, Vite and Firebase.

## Features

- Direct chats and groups with real-time messages, replies, reactions, edits and deletion
- Read receipts, typing indicators, presence, pin / mute / archive / block
- Image, video, document and recorded voice-note sharing
- 24-hour status updates with viewer tracking and replies
- Broadcast channels with followers and posts
- Voice and video calls over WebRTC
- Light / dark themes with WhatsApp wallpapers

## Live

https://chatly-rho-seven.vercel.app

## Run locally

```bash
bun install
bun run dev
```

The app opens on http://localhost:3000.

## Build

```bash
bun run build
```

## Firebase setup

The client configuration lives in `firebase-applet-config.json`. In the Firebase Console:

1. Enable **Email/Password** (and optionally **Google**) under Authentication → Sign-in method.
2. Add your deployment domain under Authentication → Settings → Authorized domains.
3. Deploy `firestore.rules` and enable Storage for media uploads.
