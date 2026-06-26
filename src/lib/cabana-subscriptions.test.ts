import { describe, expect, it } from "vitest";
import {
  TIER_NAME_MAX,
  TIER_PRICE_CENTS_MAX,
  type SubscriptionState,
  canSubscribe,
  isStateEntitled,
  mapSubscriptionState,
  mapTier,
  normalizeCurrency,
  normalizeTierDraft,
  normalizeTierName,
  normalizeTierPriceCents,
} from "./cabana-subscriptions";

describe("normalizeTierName", () => {
  it("trims a valid name", () => {
    expect(normalizeTierName("  Gold  ")).toBe("Gold");
  });
  it("rejects non-strings / empty / too long", () => {
    expect(() => normalizeTierName(1)).toThrow(/must be text/i);
    expect(() => normalizeTierName("   ")).toThrow(/empty/i);
    expect(() => normalizeTierName("x".repeat(TIER_NAME_MAX + 1))).toThrow(/or fewer/i);
  });
});

describe("normalizeTierPriceCents", () => {
  it("accepts non-negative integers", () => {
    expect(normalizeTierPriceCents(0)).toBe(0);
    expect(normalizeTierPriceCents(500)).toBe(500);
  });
  it("rejects fractional, negative, non-number, and too-large", () => {
    expect(() => normalizeTierPriceCents(1.5)).toThrow(/whole number/i);
    expect(() => normalizeTierPriceCents(-1)).toThrow(/negative/i);
    expect(() => normalizeTierPriceCents("5")).toThrow(/whole number/i);
    expect(() => normalizeTierPriceCents(TIER_PRICE_CENTS_MAX + 1)).toThrow(/too large/i);
  });
});

describe("normalizeCurrency", () => {
  it("defaults to USD and uppercases", () => {
    expect(normalizeCurrency(null)).toBe("USD");
    expect(normalizeCurrency("")).toBe("USD");
    expect(normalizeCurrency("eur")).toBe("EUR");
  });
  it("rejects malformed codes", () => {
    expect(() => normalizeCurrency("US")).toThrow(/3-letter/i);
    expect(() => normalizeCurrency(5)).toThrow(/3-letter/i);
  });
});

describe("normalizeTierDraft", () => {
  it("combines field validation", () => {
    expect(normalizeTierDraft({ name: " Fan ", priceCents: 999, currency: "usd" })).toEqual({
      name: "Fan",
      priceCents: 999,
      currency: "USD",
    });
  });
});

describe("isStateEntitled / canSubscribe", () => {
  const base: SubscriptionState = {
    username: "nova",
    subscribed: true,
    status: "active",
    tierName: "Fan",
    priceCents: 500,
    currency: "USD",
    currentPeriodEnd: "2026-07-25T00:00:00Z",
    isSelf: false,
  };
  const now = Date.parse("2026-06-25T00:00:00Z");

  it("entitled while active and within the period", () => {
    expect(isStateEntitled(base, now)).toBe(true);
  });
  it("not entitled once the period elapses", () => {
    expect(isStateEntitled({ ...base, currentPeriodEnd: "2026-06-01T00:00:00Z" }, now)).toBe(false);
  });
  it("not entitled when canceled or not subscribed", () => {
    expect(isStateEntitled({ ...base, status: "canceled" }, now)).toBe(false);
    expect(isStateEntitled({ ...base, subscribed: false, status: null }, now)).toBe(false);
  });
  it("canSubscribe only when not self and not subscribed", () => {
    expect(canSubscribe({ ...base, subscribed: false })).toBe(true);
    expect(canSubscribe(base)).toBe(false);
    expect(canSubscribe({ ...base, subscribed: false, isSelf: true })).toBe(false);
  });
});

describe("mappers", () => {
  it("mapTier", () => {
    expect(
      mapTier({
        id: "t1",
        creator_profile_id: "c1",
        name: "Fan",
        price_cents: 500,
        currency: "USD",
        is_active: true,
        created_at: "x",
        updated_at: "y",
      }),
    ).toEqual({ id: "t1", name: "Fan", priceCents: 500, currency: "USD", isActive: true });
  });

  it("mapSubscriptionState maps full and sparse rows", () => {
    expect(
      mapSubscriptionState({
        username: "nova",
        subscribed: true,
        status: "active",
        tier_name: "Fan",
        price_cents: 500,
        currency: "USD",
        current_period_end: "2026-07-25T00:00:00Z",
        is_self: false,
      }),
    ).toEqual({
      username: "nova",
      subscribed: true,
      status: "active",
      tierName: "Fan",
      priceCents: 500,
      currency: "USD",
      currentPeriodEnd: "2026-07-25T00:00:00Z",
      isSelf: false,
    });

    expect(mapSubscriptionState({ username: "nova" })).toEqual({
      username: "nova",
      subscribed: false,
      status: null,
      tierName: null,
      priceCents: null,
      currency: null,
      currentPeriodEnd: null,
      isSelf: false,
    });
  });
});
