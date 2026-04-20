# AI Smart Surveillance System — v2

## Architecture

```
Your Machine (local/)          Cloud (free tier)
┌──────────────────────┐       ┌────────────────────┐       ┌─────────────────────┐
│  Webcam / CCTV       │       │  FastAPI Backend    │       │  React Dashboard    │
│  ↓                   │       │  (Render)           │       │  (Vercel/Netlify)   │
│  YOLO detection      │──────▶│  /api/frame         │◀─────│  Live Feed          │
│  Pose estimation     │  POST │  /api/incidents     │ poll │  Zone Editor        │
│  DeepSort tracking   │       │  /api/zones         │      │  Alert History      │
│  Fight / intrusion   │◀──────│  /api/crowd         │      │  Crowd Density      │
│  Crowd density       │  GET  │  SQLite DB          │      └─────────────────────┘
└──────────────────────┘  zones└────────────────────┘
```

## New Features Added

### ✅ Editable Restricted Zones
- Draw polygon zones directly on the live frame in the dashboard
- Zones saved to backend DB, pulled by local runner every 5s
- Multiple zones supported simultaneously
- Delete zones without restarting anything

### ✅ Crowd Density Estimation
- Real-time person count displayed on feed and dashboard
- Three levels: **Low** (0–2), **Medium** (3–6), **High** (7+)
- Color-coded overlay on CV window and dashboard
- Sent to backend alongside every frame

---

## Step-by-Step Setup

### Step 1 — Backend (FastAPI on Render)

**Local dev:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# API running at http://localhost:8000
# Docs at http://localhost:8000/docs
```

**Deploy to Render (free):**
1. Push `backend/` folder to a GitHub repo
2. Go to https://render.com → New Web Service
3. Connect your repo, set root directory to `backend`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Copy the URL: `https://your-app.onrender.com`

---

### Step 2 — Frontend (React on Vercel)

**Local dev:**
```bash
cd frontend
cp .env.example .env          # leave REACT_APP_API_URL empty for local
npm install
npm start
# Dashboard at http://localhost:3000
```

**Deploy to Vercel (free):**
1. Push `frontend/` to GitHub
2. Go to https://vercel.com → New Project → import repo
3. Set environment variable:
   ```
   REACT_APP_API_URL=https://your-app.onrender.com
   ```
4. Deploy — Vercel auto-builds from `npm run build`

---

### Step 3 — Local CV Runner

**Install dependencies (one time):**
```bash
cd local
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

**Configure environment:**
```bash
cp .env.example .env
# Edit .env:
#   BACKEND_URL=http://localhost:8000        ← local dev
#   BACKEND_URL=https://your-app.onrender.com  ← production
#   SENDER_EMAIL / SENDER_PASSWORD / RECEIVER_EMAIL (optional, for email alerts)
```

**Add YOLO model weights:**
```bash
# Place in local/ directory:
# yolov8n.pt      (download from https://github.com/ultralytics/assets/releases)
# yolov8n-pose.pt (same source)
```

**Run:**
```bash
python main.py
```

---

### Step 4 — Using the Dashboard

1. Open the React dashboard (localhost:3000 or Vercel URL)
2. **Live Feed tab** — see the annotated webcam stream in real time
3. **Zone Editor tab:**
   - Click "Start Drawing"
   - Click on the frame to place polygon points (≥3 points)
   - Type a zone name, click "Save Zone"
   - Zone activates in ~5 seconds (next poll cycle)
   - Delete zones with the 🗑 button
4. **Alert History tab** — browse all incidents, filter by type

---

## File Structure

```
surveillance-v2/
├── local/                      ← runs on your PC
│   ├── main.py                 ← CV pipeline (upgraded)
│   ├── config.py               ← settings + BACKEND_URL
│   ├── requirements.txt
│   ├── .env.example
│   ├── behavior/
│   │   ├── intrusion_detector.py  ← now uses dynamic zones from API
│   │   ├── crowd_density.py       ← NEW: low/medium/high classification
│   │   ├── fight_detector.py
│   │   ├── suspicious_movement_detector.py
│   │   └── facial_fight_detector.py
│   ├── detection/
│   ├── tracking/
│   ├── alerts/
│   └── buffer/
│
├── backend/                    ← deploy to Render
│   ├── main.py                 ← FastAPI with all endpoints
│   ├── requirements.txt
│   ├── Procfile
│   └── render.yaml
│
└── frontend/                   ← deploy to Vercel
    ├── src/
    │   ├── App.jsx             ← tab layout
    │   ├── index.js / index.css
    │   └── components/
    │       ├── LiveFeed.jsx    ← polls /api/frame, shows crowd badge
    │       ├── ZoneEditor.jsx  ← canvas polygon drawing
    │       ├── AlertHistory.jsx← filterable incident log
    │       └── StatsBar.jsx    ← header crowd + alert counts
    ├── package.json
    ├── .env.example
    └── vercel.json
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/frame` | Upload base64 frame + crowd info |
| GET | `/api/frame` | Get latest frame |
| POST | `/api/incidents` | Log an alert |
| GET | `/api/incidents?limit=N` | List alerts |
| GET | `/api/zones` | List restricted zones |
| POST | `/api/zones` | Create a zone |
| PUT | `/api/zones/{id}` | Update a zone |
| DELETE | `/api/zones/{id}` | Delete a zone |
| POST | `/api/crowd` | Update crowd state |
| GET | `/api/crowd` | Get current crowd state |
| GET | `/api/stats` | Totals + breakdown |
| GET | `/docs` | Swagger UI |

---

## Crowd Density Thresholds (configurable in config.py)

| Level | People | Color |
|-------|--------|-------|
| Low | 0–2 | 🟢 Green |
| Medium | 3–6 | 🟡 Amber |
| High | 7+ | 🔴 Red |

Change `CROWD_LOW_MAX` and `CROWD_HIGH_MIN` in `local/config.py`.

---

## Troubleshooting

**Webcam won't open on Linux/Mac:**
Change `cv2.VideoCapture(0, cv2.CAP_DSHOW)` → `cv2.VideoCapture(0)` in `main.py`
(already handled automatically as fallback)

**CORS errors in browser:**
Backend has `allow_origins=["*"]` — should work. If on Render, ensure the service is running (free tier sleeps after 15min).

**Zone not activating:**
The local runner polls `/api/zones` every 5 seconds. Wait ~5s after saving.

**Email alerts not sending:**
Use a Gmail App Password (not your regular password). Enable 2FA on Gmail first, then generate an App Password at myaccount.google.com/apppasswords.

**TensorFlow / FER slow on CPU:**
FER (facial emotion recognition) is the heaviest module. You can comment out `facial_fight.detect(frame)` in `main.py` if performance is poor.
