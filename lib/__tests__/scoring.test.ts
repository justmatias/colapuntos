import { describe, it, expect } from "vitest";
import { calculateScore } from "../scoring";

const VER = "ver";
const NOR = "nor";
const LEC = "lec";
const HAM = "ham";
const RUS = "rus";

describe("calculateScore", () => {
  it("returns 22 pts when all three positions are exact", () => {
    const result = calculateScore(
      { p1: VER, p2: NOR, p3: LEC },
      { p1: VER, p2: NOR, p3: LEC }
    );
    expect(result.points).toBe(22);
    expect(result.breakdown).toEqual({ p1: 10, p2: 7, p3: 5 });
  });

  it("returns 0 pts when no driver matches", () => {
    const result = calculateScore(
      { p1: HAM, p2: RUS, p3: HAM },
      { p1: VER, p2: NOR, p3: LEC }
    );
    expect(result.points).toBe(0);
    expect(result.breakdown).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it("gives 3 pts per driver in podium but wrong position", () => {
    const result = calculateScore(
      { p1: NOR, p2: VER, p3: LEC },
      { p1: VER, p2: NOR, p3: LEC }
    );
    // p1(NOR) in real podium but wrong → 3; p2(VER) in real podium but wrong → 3; p3(LEC) exact → 5
    expect(result.points).toBe(11);
    expect(result.breakdown).toEqual({ p1: 3, p2: 3, p3: 5 });
  });

  it("gives exact points only for matching positions", () => {
    const result = calculateScore(
      { p1: VER, p2: HAM, p3: LEC },
      { p1: VER, p2: NOR, p3: LEC }
    );
    // p1 exact → 10; p2 miss → 0; p3 exact → 5
    expect(result.points).toBe(15);
    expect(result.breakdown).toEqual({ p1: 10, p2: 0, p3: 5 });
  });

  it("counts a driver in wrong position when prediction has them elsewhere", () => {
    const result = calculateScore(
      { p1: LEC, p2: NOR, p3: VER },
      { p1: VER, p2: NOR, p3: LEC }
    );
    // p1(LEC) in real podium wrong → 3; p2(NOR) exact → 7; p3(VER) in real podium wrong → 3
    expect(result.points).toBe(13);
    expect(result.breakdown).toEqual({ p1: 3, p2: 7, p3: 3 });
  });

  it("does not award wrong-position points for drivers outside the real podium", () => {
    const result = calculateScore(
      { p1: HAM, p2: NOR, p3: RUS },
      { p1: VER, p2: NOR, p3: LEC }
    );
    // p1(HAM) not in podium → 0; p2(NOR) exact → 7; p3(RUS) not in podium → 0
    expect(result.points).toBe(7);
    expect(result.breakdown).toEqual({ p1: 0, p2: 7, p3: 0 });
  });
});
