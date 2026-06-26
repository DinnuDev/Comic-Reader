# Comic Reader

A full-featured comic reader application inspired by Google Play Books.

## Features
- 📚 Library management with grid/list views
- 📁 Local file support (CBZ, CBR, PDF, image folders)
- ☁️ Google Drive integration
- 🔍 Smart panel zoom on click/tap (Google Play Books style)
- 👆 Swipe navigation, pinch-to-zoom, double-tap zoom
- 📖 Reading progress tracking
- 🔖 Bookmarks and favorites
- 🌙 Dark/Light mode

## Tech Stack
- **Frontend**: React 18 + Vite + Ant Design 5 + Zustand
- **Backend**: Node.js + Express + SQLite (swappable DB)
- **Comic formats**: CBZ, CBR, PDF, image folders

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Google Drive Setup
1. Go to Google Cloud Console
2. Create a project, enable Google Drive API
3. Create OAuth2 credentials
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to backend `.env`

## Project Structure
```
comic-reader/
├── backend/          # Express API server
│   ├── src/
│   │   ├── routes/   # API routes
│   │   ├── services/ # Business logic
│   │   └── models/   # Database models
│   └── data/         # SQLite DB + comic cache
└── frontend/         # React app
    └── src/
        ├── pages/    # Route pages
        ├── components/
        └── services/ # API client
```
