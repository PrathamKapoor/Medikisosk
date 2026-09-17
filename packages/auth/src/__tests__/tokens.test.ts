import { describe, expect, it } from "vitest";
import { signKioskToken, signStaffToken, verifyToken } from "../tokens";

const SECRET = "dev-only-insecure-jwt-secret-replace-me";

describe("verifyToken rejection classification", () => {
  it("classifies a staff token presented to the kiosk audience as WRONG_AUDIENCE, not EXPIRED", async () => {
    // jose's audience rejection message contains the word "unexpected", whose "exp"
    // substring must not be read as token expiry — that misclassification broke the
    // staff wipe fallback on kiosk routes.
    const staff = await signStaffToken(
      {
        sub: "u1",
        tenantId: "t1",
        username: "dr.rao",
        displayName: "Dr Rao",
        roles: ["PHYSICIAN"],
      },
      SECRET,
    );
    const result = await verifyToken(staff, SECRET, "KIOSK");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("WRONG_AUDIENCE");
  });

  it("classifies an expired token as EXPIRED", async () => {
    const kiosk = await signKioskToken(
      { sub: "s1", tenantId: "t1", kioskId: "k1", sessionId: "s1" },
      SECRET,
      { ttlMinutes: -1 },
    );
    const result = await verifyToken(kiosk, SECRET, "KIOSK");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("EXPIRED");
  });
});
