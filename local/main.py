import cv2
import time
import os
import base64
import threading
import requests

from alerts.voice_alert import speak_warning
from alerts.email_alert import send_email_alert
from detection.detector import Detector
from detection.pose_model import PoseEstimator
from tracking.tracker import Tracker
from behavior.intrusion_detector import IntrusionDetector
from behavior.fight_detector import FightDetector
from behavior.suspicious_movement_detector import SuspiciousMovementDetector
from behavior.facial_fight_detector import FacialFightDetector
from behavior.crowd_density import CrowdDensityEstimator
from buffer.rolling_buffer import RollingBuffer
from alerts.clip_saver import save_clip
from config import FPS, SENDER_EMAIL, SENDER_PASSWORD, RECEIVER_EMAIL, BACKEND_URL


def iou(box_a, box_b):
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def post(endpoint, payload, timeout=2):
    try:
        requests.post(f"{BACKEND_URL}{endpoint}", json=payload, timeout=timeout)
    except Exception:
        pass


def get_json(endpoint, timeout=2):
    try:
        r = requests.get(f"{BACKEND_URL}{endpoint}", timeout=timeout)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


# Zone polling thread
current_zones = []
zones_lock = threading.Lock()


def zone_poll_loop():
    while True:
        data = get_json("/api/zones")
        if data and isinstance(data, list):
            with zones_lock:
                current_zones.clear()
                current_zones.extend(data)
        time.sleep(5)


threading.Thread(target=zone_poll_loop, daemon=True).start()

# Init models
detector = Detector()
pose_estimator = PoseEstimator()
tracker = Tracker()
intrusion = IntrusionDetector(overlap_threshold=0.35)
fight = FightDetector()
suspicious_detector = SuspiciousMovementDetector()
facial_fight = FacialFightDetector()
crowd_estimator = CrowdDensityEstimator()
rolling_buffer = RollingBuffer()

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
if not cap.isOpened():
    cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("Could not open webcam.")
    raise SystemExit

fight_cooldown = intrusion_cooldown = suspicious_cooldown = 0
last_saved_time = last_voice_time = last_frame_post = 0
save_gap_seconds = 8
voice_gap_seconds = 5
frame_post_interval = 0.4


def send_incident(alert_type, details, rolling_buf_frames, ts):
    global last_saved_time
    clip_path = None
    if ts - last_saved_time > save_gap_seconds:
        clip_path = save_clip(rolling_buf_frames, alert_type=alert_type, fps=FPS)
        last_saved_time = ts
    post("/api/incidents", {"type": alert_type, "details": details, "clip": clip_path or ""})
    send_email_alert(
        subject=f"ALERT: {alert_type.title()} Detected",
        body=f"{alert_type.title()} detected.\n{details}\nClip: {clip_path}",
        sender_email=SENDER_EMAIL,
        sender_password=SENDER_PASSWORD,
        receiver_email=RECEIVER_EMAIL,
    )


while True:
    ret, frame = cap.read()
    if not ret:
        print("Could not read frame.")
        break

    rolling_buffer.add(frame)

    with zones_lock:
        intrusion.update_zones(list(current_zones))

    detections = detector.detect(frame)
    persons = tracker.update(detections, frame)
    poses = pose_estimator.infer(frame)
    angry_faces = facial_fight.detect(frame)
    crowd_info = crowd_estimator.update(len(persons))

    intrusion.draw_zones(frame)

    persons_with_pose = []
    for p in persons:
        best_pose, best_iou_val = None, 0.0
        for pose in poses:
            score = iou(p["bbox"], pose["bbox"])
            if score > best_iou_val:
                best_iou_val, best_pose = score, pose
        item = dict(p)
        if best_pose and best_iou_val > 0.2:
            item["keypoints"] = best_pose["keypoints"]
            item["kp_conf"] = best_pose["kp_conf"]
        else:
            item["keypoints"] = item["kp_conf"] = None
        persons_with_pose.append(item)

    fight_alerts = fight.detect(persons_with_pose)
    suspicious_ids = suspicious_detector.detect(persons)
    fight_ids = {pid for alert in fight_alerts for pid in alert["pair"]}
    angry_face_present = len(angry_faces) > 0
    if angry_face_present:
        for p in persons:
            fight_ids.add(p["id"])

    if fight_cooldown > 0: fight_cooldown -= 1
    if intrusion_cooldown > 0: intrusion_cooldown -= 1
    if suspicious_cooldown > 0: suspicious_cooldown -= 1

    any_intrusion = False
    any_fight = len(fight_alerts) > 0 or angry_face_present
    any_suspicious = len(suspicious_ids) > 0

    for p in persons_with_pose:
        x1, y1, x2, y2 = map(int, p["bbox"])
        pid = p["id"]
        is_intrusion = intrusion.check(p)
        is_fight = pid in fight_ids
        is_suspicious = pid in suspicious_ids
        overlap_ratio = p.get("overlap_ratio", 0.0)
        any_intrusion = any_intrusion or is_intrusion
        color = (0, 0, 255) if is_fight else (0, 165, 255) if is_intrusion else (255, 0, 255) if is_suspicious else (0, 255, 0)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, f"ID {pid}", (x1, y1 - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        cv2.putText(frame, f"Overlap:{overlap_ratio:.2f}", (x1, y2 + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
        if p.get("keypoints"):
            for kp in p["keypoints"]:
                kx, ky = map(int, kp)
                if kx > 0 or ky > 0:
                    cv2.circle(frame, (kx, ky), 3, (255, 255, 0), -1)

    for face in angry_faces:
        x1, y1, x2, y2 = map(int, face["bbox"])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame, f"ANGRY {face['score']:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    # Crowd density overlay (top-right)
    h, w = frame.shape[:2]
    cc = {"low": (0, 255, 0), "medium": (0, 165, 255), "high": (0, 0, 255)}[crowd_info["level"]]
    cv2.rectangle(frame, (w - 230, 10), (w - 5, 60), (0, 0, 0), -1)
    cv2.putText(frame, f"Crowd: {crowd_info['level'].upper()} ({crowd_info['count']})",
                (w - 225, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.65, cc, 2)

    if any_intrusion:
        cv2.rectangle(frame, (20, 10), (420, 70), (0, 0, 0), -1)
        cv2.putText(frame, "ALERT: INTRUSION", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 165, 255), 4)
    if any_fight:
        cv2.rectangle(frame, (20, 80), (520, 140), (0, 0, 0), -1)
        cv2.putText(frame, "ALERT: FIGHT / ANGER", (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 4)
    if any_suspicious:
        cv2.rectangle(frame, (20, 150), (560, 210), (0, 0, 0), -1)
        cv2.putText(frame, "ALERT: SUSPICIOUS MOVEMENT", (30, 190), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 0, 255), 4)

    now = time.time()

    # Send frame to backend
    # Send behavior data for predictive intelligence
    if persons_with_pose:
        behavior_payload = {"persons": [{"id": p["id"], "bbox": list(map(float, p["bbox"]))} for p in persons_with_pose]}
        threading.Thread(target=post, args=("/api/behavior", behavior_payload), daemon=True).start()

    if now - last_frame_post > frame_post_interval:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
        b64 = base64.b64encode(buf).decode()
        threading.Thread(target=post, args=("/api/frame", {"frame": b64, "crowd": crowd_info}), daemon=True).start()
        last_frame_post = now

    buf_snapshot = rolling_buffer.get()

    if any_intrusion and intrusion_cooldown == 0:
        if now - last_voice_time > voice_gap_seconds:
            speak_warning("Warning! Restricted area entered.")
            last_voice_time = now
        threading.Thread(target=send_incident, args=("intrusion", "Restricted zone breached", buf_snapshot, now), daemon=True).start()
        intrusion_cooldown = FPS * 3

    if any_fight and fight_cooldown == 0:
        if now - last_voice_time > voice_gap_seconds:
            speak_warning("Warning! Possible fight detected.")
            last_voice_time = now
        details = f"Fight alerts: {len(fight_alerts)}, Angry faces: {len(angry_faces)}"
        threading.Thread(target=send_incident, args=("fight", details, buf_snapshot, now), daemon=True).start()
        fight_cooldown = FPS * 3

    if any_suspicious and suspicious_cooldown == 0:
        if now - last_voice_time > voice_gap_seconds:
            speak_warning("Warning! Suspicious movement detected.")
            last_voice_time = now
        threading.Thread(target=send_incident, args=("suspicious", f"IDs: {list(suspicious_ids)}", buf_snapshot, now), daemon=True).start()
        suspicious_cooldown = FPS * 3

    cv2.imshow("AI Smart Surveillance", frame)
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
