from config import CROWD_LOW_MAX, CROWD_HIGH_MIN


class CrowdDensityEstimator:
    def __init__(self):
        self.count = 0
        self.level = "low"

    def update(self, person_count: int) -> dict:
        self.count = person_count
        if person_count <= CROWD_LOW_MAX:
            self.level = "low"
        elif person_count < CROWD_HIGH_MIN:
            self.level = "medium"
        else:
            self.level = "high"

        return {"count": self.count, "level": self.level}
