import cv2
import numpy as np


class IntrusionDetector:
    def __init__(self, overlap_threshold=0.35):
        self.zones = []
        self.overlap_threshold = overlap_threshold

    def update_zones(self, zones_data):
        """zones_data: list of {"name": str, "points": [[x,y], ...]}"""
        self.zones = []
        for z in zones_data:
            pts = np.array(z["points"], dtype=np.int32)
            if len(pts) >= 3:
                self.zones.append({"name": z.get("name", "Zone"), "pts": pts})

    def draw_zones(self, frame):
        for zone in self.zones:
            pts = zone["pts"]
            cv2.polylines(frame, [pts], isClosed=True, color=(0, 0, 255), thickness=2)
            x, y = pts[0]
            cv2.putText(frame, zone["name"], (int(x), int(y) - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    def check(self, person):
        if not self.zones:
            person["overlap_ratio"] = 0.0
            return False

        x1, y1, x2, y2 = map(int, person["bbox"])
        person_w = max(1, x2 - x1)
        person_h = max(1, y2 - y1)
        person_area = person_w * person_h

        for zone in self.zones:
            pts = zone["pts"]
            max_x = max(x2, int(np.max(pts[:, 0]))) + 5
            max_y = max(y2, int(np.max(pts[:, 1]))) + 5
            if max_x <= 0 or max_y <= 0:
                continue
            zone_mask = np.zeros((max_y, max_x), dtype=np.uint8)
            cv2.fillPoly(zone_mask, [pts], 255)
            person_mask = np.zeros((max_y, max_x), dtype=np.uint8)
            cv2.rectangle(person_mask, (x1, y1), (x2, y2), 255, -1)
            intersection = cv2.bitwise_and(zone_mask, person_mask)
            overlap_area = cv2.countNonZero(intersection)
            overlap_ratio = overlap_area / person_area
            if overlap_ratio >= self.overlap_threshold:
                person["overlap_ratio"] = overlap_ratio
                return True

        person["overlap_ratio"] = 0.0
        return False
