from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import time
import json

from behavior_engine import engine as behavior_engine

app = FastAPI(title="AI Surveillance Backend")

@app.get("/")
def root():
    return {"message": "Backend is running"}

@app.get("/health")
def health():
    return {"ok": True}
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "surveillance.db"
latest_frame: dict = {"frame": "", "crowd": {"count": 0, "level": "low"}, "ts": 0}
latest_crowd: dict = {"count": 0, "level": "low"}
latest_predictions: list = []


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, details TEXT, clip TEXT,
            ts REAL DEFAULT (unixepoch('now')))""")
        conn.execute("""CREATE TABLE IF NOT EXISTS zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, points TEXT NOT NULL)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS behavior_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER, event_type TEXT, threat_level TEXT,
            reasons TEXT, details TEXT, ts REAL)""")
        count = conn.execute("SELECT COUNT(*) FROM zones").fetchone()[0]
        if count == 0:
            conn.execute("INSERT INTO zones (name, points) VALUES (?, ?)",
                         ("Default Zone", json.dumps([[450,300],[640,300],[640,480],[450,480]])))
        conn.commit()


init_db()


class IncidentIn(BaseModel):
    type: str
    details: Optional[str] = ""
    clip: Optional[str] = ""

class FrameIn(BaseModel):
    frame: str
    crowd: Optional[dict] = None

class CrowdIn(BaseModel):
    count: int
    level: str

class ZoneIn(BaseModel):
    name: str
    points: List[List[int]]

class PersonIn(BaseModel):
    id: int
    bbox: List[float]

class BehaviorUpdateIn(BaseModel):
    persons: List[PersonIn]


# ── Standard routes ───────────────────────────────────────────────────────────

@app.post("/api/incidents")
def create_incident(inc: IncidentIn):
    with get_db() as conn:
        conn.execute("INSERT INTO incidents (type, details, clip, ts) VALUES (?, ?, ?, ?)",
                     (inc.type, inc.details, inc.clip, time.time()))
        conn.commit()
    return {"ok": True}

@app.get("/api/incidents")
def list_incidents(limit: int = 50):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM incidents ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/frame")
def update_frame(data: FrameIn):
    global latest_frame, latest_crowd
    latest_frame = {"frame": data.frame, "crowd": data.crowd or {}, "ts": time.time()}
    if data.crowd:
        latest_crowd = data.crowd
    return {"ok": True}

@app.get("/api/frame")
def get_frame():
    return latest_frame

@app.post("/api/crowd")
def update_crowd(data: CrowdIn):
    global latest_crowd
    latest_crowd = {"count": data.count, "level": data.level}
    return {"ok": True}

@app.get("/api/crowd")
def get_crowd():
    return latest_crowd

@app.get("/api/zones")
def list_zones():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM zones").fetchall()
    return [{"id": r["id"], "name": r["name"], "points": json.loads(r["points"])} for r in rows]

@app.post("/api/zones")
def create_zone(zone: ZoneIn):
    with get_db() as conn:
        cur = conn.execute("INSERT INTO zones (name, points) VALUES (?, ?)",
                           (zone.name, json.dumps(zone.points)))
        conn.commit()
    return {"id": cur.lastrowid, "name": zone.name, "points": zone.points}

@app.put("/api/zones/{zone_id}")
def update_zone(zone_id: int, zone: ZoneIn):
    with get_db() as conn:
        conn.execute("UPDATE zones SET name=?, points=? WHERE id=?",
                     (zone.name, json.dumps(zone.points), zone_id))
        conn.commit()
    return {"id": zone_id, "name": zone.name, "points": zone.points}

@app.delete("/api/zones/{zone_id}")
def delete_zone(zone_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM zones WHERE id=?", (zone_id,))
        conn.commit()
    return {"ok": True}

@app.get("/api/stats")
def stats():
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
        by_type = conn.execute("SELECT type, COUNT(*) as cnt FROM incidents GROUP BY type").fetchall()
        pred_total = conn.execute("SELECT COUNT(*) FROM behavior_events").fetchone()[0]
    return {
        "total": total,
        "by_type": {r["type"]: r["cnt"] for r in by_type},
        "crowd": latest_crowd,
        "predictive_alerts": pred_total,
    }

# ── Predictive Intelligence routes ────────────────────────────────────────────

@app.post("/api/behavior")
def receive_behavior(data: BehaviorUpdateIn):
    global latest_predictions
    persons_raw = [{"id": p.id, "bbox": p.bbox} for p in data.persons]
    predictions = behavior_engine.update(persons_raw)
    latest_predictions = predictions

    high = [p for p in predictions if p.get("threat_level") in ("high", "medium")]
    if high:
        with get_db() as conn:
            for pred in high:
                conn.execute(
                    "INSERT INTO behavior_events (person_id, event_type, threat_level, reasons, details, ts) VALUES (?, ?, ?, ?, ?, ?)",
                    (pred.get("person_id") or -1, pred.get("type", "unknown"),
                     pred.get("threat_level", "low"), json.dumps(pred.get("reasons", [])),
                     json.dumps({k: v for k, v in pred.items() if k not in ("reasons","type","threat_level","ts")}),
                     pred.get("ts", time.time()))
                )
            conn.commit()
    return {"predictions": len(predictions), "high_threat": len(high)}

@app.get("/api/predictions")
def get_predictions():
    return {
        "predictions": latest_predictions,
        "count": len(latest_predictions),
        "high_count": sum(1 for p in latest_predictions if p.get("threat_level") == "high"),
        "ts": time.time(),
    }

@app.get("/api/behavior/stats")
def get_behavior_stats():
    return {
        "persons": behavior_engine.get_person_stats(),
        "model_trained": behavior_engine._model_trained,
        "tracked_count": len(behavior_engine.persons),
    }

@app.get("/api/behavior/history")
def get_behavior_history(limit: int = 100):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM behavior_events ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
    result = []
    for r in rows:
        row = dict(r)
        row["reasons"] = json.loads(row["reasons"] or "[]")
        row["details"] = json.loads(row["details"] or "{}")
        result.append(row)
    return result
