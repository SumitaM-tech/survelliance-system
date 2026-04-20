# DEPLOYMENT GUIDE — AI Smart Surveillance v2

---

## TOOLS TO INSTALL (one-time)

### On your machine (local CV runner)
| Tool | Download | Purpose |
|------|----------|---------|
| Python 3.10+ | https://www.python.org/downloads/ | Run main.py |
| Git | https://git-scm.com/downloads | Push code to GitHub |
| Node.js 18+ | https://nodejs.org | Run React (dev only) |
| VS Code (optional) | https://code.visualstudio.com | Editor |

### Cloud accounts (all free tier)
| Service | URL | What for |
|---------|-----|----------|
| GitHub | https://github.com | Host your code |
| Render | https://render.com | Backend FastAPI |
| Vercel | https://vercel.com | Frontend React |

---

## PHASE 1 — Push to GitHub

```bash
# From surveillance-v2/ root
git init
git add .
git commit -m "Initial commit"

# Create two repos on github.com:
#   1. surveillance-backend
#   2. surveillance-frontend
# Then:

# Push backend
cd backend
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/surveillance-backend.git
git push -u origin main

# Push frontend
cd ../frontend
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/surveillance-frontend.git
git push -u origin main
```

---

## PHASE 2 — Deploy Backend to Render

1. Go to **https://render.com** → Sign up (free)
2. Click **New → Web Service**
3. Connect GitHub → select `surveillance-backend`
4. Fill in:
   - **Name:** `surveillance-backend`
   - **Branch:** `main`
   - **Root Directory:** *(leave blank — backend/ is the repo root)*
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Click **Create Web Service**
6. Wait ~2 min → copy your URL: `https://surveillance-backend.onrender.com`
7. Test: open `https://surveillance-backend.onrender.com/docs` — you should see Swagger UI

> ⚠️ Free Render tier sleeps after 15min of inactivity. First request after sleep takes ~30s.

---

## PHASE 3 — Deploy Frontend to Vercel

1. Go to **https://vercel.com** → Sign up (free)
2. Click **Add New → Project**
3. Import `surveillance-frontend` from GitHub
4. In **Environment Variables** section, add:
   ```
   REACT_APP_API_URL = https://surveillance-backend.onrender.com
   ```
5. Click **Deploy**
6. Wait ~1 min → your dashboard URL: `https://surveillance-frontend.vercel.app`

---

## PHASE 4 — Configure Local Runner

```bash
cd local
cp .env.example .env
```

Edit `.env`:
```
BACKEND_URL=https://surveillance-backend.onrender.com
SENDER_EMAIL=your@gmail.com
SENDER_PASSWORD=your_gmail_app_password
RECEIVER_EMAIL=alerts@youremail.com
```

**Gmail App Password setup** (for email alerts):
1. Go to https://myaccount.google.com → Security → 2-Step Verification → Enable
2. Then: https://myaccount.google.com/apppasswords
3. Generate password for "Mail" → copy 16-char password → paste as `SENDER_PASSWORD`

---

## PHASE 5 — Install Python Dependencies & Run

```bash
cd local

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install
pip install -r requirements.txt
# Note: TensorFlow + ultralytics are large (~2GB). Takes 5-10 min first time.

# Download YOLO weights (if not already in local/)
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt'); YOLO('yolov8n-pose.pt')"
# This auto-downloads both .pt files

# Run
python main.py
```

---

## PHASE 6 — Run Frontend Locally (optional)

```bash
cd frontend
npm install     # installs React + cross-env
npm start       # opens at http://localhost:3001
```

---

## FULL SYSTEM VERIFICATION CHECKLIST

```
□ Backend /docs page loads at Render URL
□ python main.py opens webcam window
□ Dashboard at vercel URL shows live feed (green dot)
□ Crowd badge updates in top-right of feed
□ Zone Editor: draw polygon → save → wait 5s → zone appears on CV window
□ Walk into zone → "ALERT: INTRUSION" appears on CV window
□ Alert History tab shows the incident
□ Email received (if configured)
```

---

## COMMON ERRORS & FIXES

| Error | Fix |
|-------|-----|
| `Could not open webcam` | Try `cv2.VideoCapture(1)` instead of `0` in main.py |
| `Module not found: fer` | `pip install fer tensorflow` |
| `CORS error in browser` | Check backend is running, REACT_APP_API_URL is correct |
| `Render URL 502` | Service still starting — wait 60s, refresh |
| `npm start fails` | Run `npm install` first, ensure Node.js ≥18 |
| `Zone not activating` | Wait 5s (poll interval), check backend is reachable |
| `TF warning spam` | Normal — TensorFlow CPU warnings, doesn't affect function |
| `deep_sort_realtime error` | `pip install deep-sort-realtime` separately |

---

## PORTS SUMMARY

| Service | Port |
|---------|------|
| FastAPI backend (local) | 8000 |
| React frontend (local) | **3001** |
| Render backend (cloud) | 443 (HTTPS auto) |
| Vercel frontend (cloud) | 443 (HTTPS auto) |
