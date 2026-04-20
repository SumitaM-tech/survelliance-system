"""
Predictive Threat Intelligence Engine
--------------------------------------
Algorithms used:
  1. Sliding-window time series per person (deque, O(1) append)
  2. Position variance  → loitering detection
  3. Velocity + acceleration Z-score → anomaly scoring
  4. Inter-person distance rate-of-change → pre-fight prediction
  5. Isolation Forest on [velocity, dwell, variance, visits] → unsupervised anomaly
  6. Visit-frequency tracking → repeated suspicious presence
"""

import time
import math
import numpy as np
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional

# ── Config ────────────────────────────────────────────────────────────────────
WINDOW_SECONDS       = 60        # how far back we keep history
LOITER_MIN_SECS      = 10        # seconds in small area → loitering
LOITER_VAR_THRESHOLD = 2500      # px² — small variance = not moving much
CONVERGE_RATE        = -15       # px/s — distance shrinking this fast = pre-fight
MIN_HISTORY          = 5         # minimum frames before we score
ANOMALY_Z_THRESHOLD  = 2.5       # Z-score above this = anomalous
VISIT_SUSPICIOUS     = 3         # visits within session → repeated presence flag
PREFIGHT_DIST_MAX    = 250       # px — only flag convergence if people this close

# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class Frame:
    x: float
    y: float
    ts: float


@dataclass
class PersonState:
    pid: int
    history: deque = field(default_factory=lambda: deque(maxlen=300))
    first_seen: float = field(default_factory=time.time)
    visit_count: int = 1
    last_alert_ts: float = 0.0
    threat_scores: deque = field(default_factory=lambda: deque(maxlen=50))


# ── Engine ────────────────────────────────────────────────────────────────────

class BehaviorEngine:
    def __init__(self):
        self.persons: Dict[int, PersonState] = {}
        self._iso_forest = None
        self._training_buffer: List[List[float]] = []
        self._model_trained = False
        self._last_train_ts = 0.0

    # ── Public API ────────────────────────────────────────────────────────────

    def update(self, persons: List[dict]) -> List[dict]:
        """
        Call every frame with list of:
          {"id": int, "bbox": [x1,y1,x2,y2]}
        Returns list of threat predictions.
        """
        now = time.time()
        self._prune_stale(now)

        for p in persons:
            pid = int(p["id"])
            cx = (p["bbox"][0] + p["bbox"][2]) / 2
            cy = (p["bbox"][1] + p["bbox"][3]) / 2

            if pid not in self.persons:
                self.persons[pid] = PersonState(pid=pid)
            else:
                self.persons[pid].visit_count += 1

            self.persons[pid].history.append(Frame(cx, cy, now))

        predictions = self._run_predictions(persons, now)
        self._maybe_train(now)
        return predictions

    def get_person_stats(self) -> List[dict]:
        out = []
        for pid, state in self.persons.items():
            feats = self._features(state)
            if feats is None:
                continue
            out.append({
                "pid": pid,
                "dwell_secs": round(feats["dwell"], 1),
                "velocity": round(feats["velocity"], 1),
                "position_variance": round(feats["variance"], 1),
                "visit_count": state.visit_count,
                "anomaly_score": round(feats["z_score"], 2),
                "threat_level": self._threat_level(feats),
            })
        return out

    # ── Internal ──────────────────────────────────────────────────────────────

    def _prune_stale(self, now: float):
        cutoff = now - WINDOW_SECONDS * 2
        stale = [pid for pid, s in self.persons.items()
                 if s.history and s.history[-1].ts < cutoff]
        for pid in stale:
            del self.persons[pid]

    def _features(self, state: PersonState) -> Optional[dict]:
        h = list(state.history)
        if len(h) < MIN_HISTORY:
            return None
        now = time.time()

        # Time window
        cutoff = now - WINDOW_SECONDS
        recent = [f for f in h if f.ts >= cutoff] or h[-MIN_HISTORY:]

        xs = np.array([f.x for f in recent])
        ys = np.array([f.y for f in recent])
        ts = np.array([f.ts for f in recent])

        # Dwell time
        dwell = recent[-1].ts - recent[0].ts

        # Position variance (spread of positions)
        variance = float(np.var(xs) + np.var(ys))

        # Velocity (px/s) — mean of frame-to-frame distances
        if len(recent) > 1:
            dists = np.sqrt(np.diff(xs)**2 + np.diff(ys)**2)
            dt = np.diff(ts)
            dt[dt == 0] = 0.001
            speeds = dists / dt
            velocity = float(np.mean(speeds))
            accel = float(np.std(speeds))  # variance in speed = erratic movement
        else:
            velocity = 0.0
            accel = 0.0

        # Z-score anomaly on velocity using this person's history
        all_speeds = list(state.threat_scores) + [velocity]
        if len(all_speeds) > 5:
            mu, sigma = np.mean(all_speeds[:-1]), np.std(all_speeds[:-1])
            z = abs(velocity - mu) / (sigma + 1e-6)
        else:
            z = 0.0

        state.threat_scores.append(velocity)

        return {
            "dwell": dwell,
            "variance": variance,
            "velocity": velocity,
            "accel": accel,
            "z_score": z,
            "visits": state.visit_count,
            "cx": float(np.mean(xs)),
            "cy": float(np.mean(ys)),
        }

    def _threat_level(self, feats: dict) -> str:
        score = 0
        if feats["dwell"] > LOITER_MIN_SECS and feats["variance"] < LOITER_VAR_THRESHOLD:
            score += 2   # loitering
        if feats["z_score"] > ANOMALY_Z_THRESHOLD:
            score += 2   # movement anomaly
        if feats["visits"] >= VISIT_SUSPICIOUS:
            score += 1   # repeated presence
        if feats["accel"] > 30:
            score += 1   # erratic movement
        if score >= 4:
            return "high"
        if score >= 2:
            return "medium"
        return "low"

    def _run_predictions(self, persons: List[dict], now: float) -> List[dict]:
        preds = []

        # Per-person loitering + anomaly
        for p in persons:
            pid = int(p["id"])
            state = self.persons.get(pid)
            if not state:
                continue
            feats = self._features(state)
            if feats is None:
                continue

            level = self._threat_level(feats)
            if level == "low":
                continue

            reasons = []
            if feats["dwell"] > LOITER_MIN_SECS and feats["variance"] < LOITER_VAR_THRESHOLD:
                reasons.append(f"Loitering {feats['dwell']:.0f}s in small area")
            if feats["z_score"] > ANOMALY_Z_THRESHOLD:
                reasons.append(f"Abnormal movement speed (z={feats['z_score']:.1f})")
            if feats["visits"] >= VISIT_SUSPICIOUS:
                reasons.append(f"Repeated presence ({feats['visits']} visits)")
            if feats["accel"] > 30:
                reasons.append("Erratic/sudden movement")

            # Isolation Forest score (if trained)
            iso_score = self._iso_score([feats["velocity"], feats["dwell"], feats["variance"], feats["visits"]])

            preds.append({
                "type": "predictive",
                "person_id": pid,
                "threat_level": level,
                "reasons": reasons,
                "dwell_secs": round(feats["dwell"], 1),
                "anomaly_score": round(feats["z_score"], 2),
                "iso_score": round(iso_score, 3),
                "position": {"x": round(feats["cx"]), "y": round(feats["cy"])},
                "ts": now,
            })

        # Pre-fight: inter-person convergence
        if len(persons) >= 2:
            conv = self._check_convergence(persons, now)
            if conv:
                preds.append(conv)

        return preds

    def _check_convergence(self, persons: List[dict], now: float) -> Optional[dict]:
        """Detect when 2+ people rapidly approach each other."""
        centers = []
        for p in persons:
            pid = int(p["id"])
            state = self.persons.get(pid)
            if not state or len(state.history) < 8:
                continue
            h = list(state.history)
            cx = (p["bbox"][0] + p["bbox"][2]) / 2
            cy = (p["bbox"][1] + p["bbox"][3]) / 2
            # older center (2s ago)
            old = next((f for f in reversed(h) if now - f.ts >= 2.0), None)
            if old:
                centers.append({"pid": pid, "cx": cx, "cy": cy, "ox": old.x, "oy": old.y, "dt": now - old.ts})

        if len(centers) < 2:
            return None

        # Check all pairs
        for i in range(len(centers)):
            for j in range(i + 1, len(centers)):
                a, b = centers[i], centers[j]
                cur_dist = math.hypot(a["cx"] - b["cx"], a["cy"] - b["cy"])
                old_dist = math.hypot(a["ox"] - b["ox"], a["oy"] - b["oy"])
                if cur_dist > PREFIGHT_DIST_MAX:
                    continue
                dt = max(a["dt"], b["dt"], 0.1)
                rate = (cur_dist - old_dist) / dt  # negative = converging
                if rate < CONVERGE_RATE:
                    return {
                        "type": "pre_fight",
                        "person_ids": [a["pid"], b["pid"]],
                        "threat_level": "high",
                        "reasons": [
                            f"Persons {a['pid']} & {b['pid']} rapidly converging",
                            f"Distance: {cur_dist:.0f}px, Rate: {rate:.1f}px/s"
                        ],
                        "convergence_rate": round(rate, 2),
                        "current_distance": round(cur_dist, 1),
                        "ts": now,
                    }
        return None

    def _iso_score(self, feature_vec: List[float]) -> float:
        """Isolation Forest anomaly score. Returns 0.5 if model not trained."""
        if not self._model_trained or self._iso_forest is None:
            return 0.5
        try:
            arr = np.array(feature_vec).reshape(1, -1)
            # score_samples returns negative values; more negative = more anomalous
            raw = self._iso_forest.score_samples(arr)[0]
            # Normalize to 0-1 (1 = most anomalous)
            return float(np.clip(1 - (raw + 0.5), 0, 1))
        except Exception:
            return 0.5

    def _maybe_train(self, now: float):
        """Retrain Isolation Forest every 60s if we have enough data."""
        if now - self._last_train_ts < 60:
            return
        vectors = []
        for state in self.persons.values():
            feats = self._features(state)
            if feats:
                vectors.append([feats["velocity"], feats["dwell"], feats["variance"], feats["visits"]])
        self._training_buffer.extend(vectors)
        if len(self._training_buffer) >= 20:
            try:
                from sklearn.ensemble import IsolationForest
                X = np.array(self._training_buffer[-200:])  # keep last 200 samples
                self._iso_forest = IsolationForest(contamination=0.1, random_state=42, n_estimators=50)
                self._iso_forest.fit(X)
                self._model_trained = True
            except ImportError:
                pass  # sklearn not installed, degrade gracefully
        self._last_train_ts = now


# Singleton
engine = BehaviorEngine()
