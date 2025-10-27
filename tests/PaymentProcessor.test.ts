import { describe, it, expect, beforeEach, vi } from "vitest";
import { uintCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PLAN_NOT_FOUND = 101;
const ERR_INSUFFICIENT_PAYMENT = 102;
const ERR_INVALID_PLAN_ID = 103;
const ERR_PAYMENT_ALREADY_MADE = 104;
const ERR_AUTHORITY_NOT_VERIFIED = 105;
const ERR_INVALID_AMOUNT = 106;
const ERR_INVALID_CURRENCY = 108;
const ERR_INVALID_FEE_RATE = 113;
const ERR_MAX_PAYMENTS_EXCEEDED = 114;

interface Plan {
  price: number;
  creator: string;
}

interface Payment {
  planId: number;
  buyer: string;
  creator: string;
  amount: number;
  timestamp: number;
  currency: string;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class WorkoutPlanRegistryMock {
  getPlan = vi.fn((id: number) => id === 0 ? { ok: true, value: { price: 100, creator: "ST2CREATOR" } } : { ok: false, value: null });
}

class PaymentProcessorMock {
  state: {
    authorityContract: string | null;
    platformFeeRate: number;
    maxPayments: number;
    nextPaymentId: number;
    payments: Map<number, Payment>;
    paymentByPlanBuyer: Map<string, number>;
  } = {
    authorityContract: null,
    platformFeeRate: 5,
    maxPayments: 100000,
    nextPaymentId: 0,
    payments: new Map(),
    paymentByPlanBuyer: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1BUYER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  registry: WorkoutPlanRegistryMock = new WorkoutPlanRegistryMock();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      authorityContract: null,
      platformFeeRate: 5,
      maxPayments: 100000,
      nextPaymentId: 0,
      payments: new Map(),
      paymentByPlanBuyer: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1BUYER";
    this.stxTransfers = [];
    this.registry.getPlan.mockReset();
    this.registry.getPlan.mockImplementation((id: number) => id === 0 ? { ok: true, value: { price: 100, creator: "ST2CREATOR" } } : { ok: false, value: null });
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setPlatformFeeRate(newRate: number): Result<boolean> {
    if (newRate > 100) return { ok: false, value: ERR_INVALID_FEE_RATE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.platformFeeRate = newRate;
    return { ok: true, value: true };
  }

  processPayment(planId: number, amount: number, currency: string): Result<number> {
    if (this.state.nextPaymentId >= this.state.maxPayments) return { ok: false, value: ERR_MAX_PAYMENTS_EXCEEDED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    const planResult = this.registry.getPlan(planId);
    if (!planResult.ok || !planResult.value) return { ok: false, value: ERR_PLAN_NOT_FOUND };
    if (amount < planResult.value.price) return { ok: false, value: ERR_INSUFFICIENT_PAYMENT };
    const key = `${planId}-${this.caller}`;
    if (this.state.paymentByPlanBuyer.has(key)) return { ok: false, value: ERR_PAYMENT_ALREADY_MADE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    const feeAmount = Math.floor((amount * this.state.platformFeeRate) / 100);
    const creatorAmount = amount - feeAmount;
    this.stxTransfers.push({ amount: creatorAmount, from: this.caller, to: planResult.value.creator });
    this.stxTransfers.push({ amount: feeAmount, from: this.caller, to: this.state.authorityContract });
    const paymentId = this.state.nextPaymentId;
    const payment: Payment = {
      planId,
      buyer: this.caller,
      creator: planResult.value.creator,
      amount,
      timestamp: this.blockHeight,
      currency,
      status: true,
    };
    this.state.payments.set(paymentId, payment);
    this.state.paymentByPlanBuyer.set(key, paymentId);
    this.state.nextPaymentId++;
    return { ok: true, value: paymentId };
  }

  getPayment(paymentId: number): Payment | null {
    return this.state.payments.get(paymentId) || null;
  }

  getPaymentByPlanBuyer(planId: number, buyer: string): number | null {
    return this.state.paymentByPlanBuyer.get(`${planId}-${buyer}`) || null;
  }

  getPlatformFeeRate(): Result<number> {
    return { ok: true, value: this.state.platformFeeRate };
  }

  getPaymentCount(): Result<number> {
    return { ok: true, value: this.state.nextPaymentId };
  }
}

describe("PaymentProcessor", () => {
  let contract: PaymentProcessorMock;

  beforeEach(() => {
    contract = new PaymentProcessorMock();
    contract.reset();
  });

  it("rejects payment for non-existent plan", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.processPayment(1, 150, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PLAN_NOT_FOUND);
  });

  it("rejects insufficient payment", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.processPayment(0, 50, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_PAYMENT);
  });

  it("rejects duplicate payment for same plan and buyer", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.processPayment(0, 150, "STX");
    const result = contract.processPayment(0, 150, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAYMENT_ALREADY_MADE);
  });

  it("rejects payment without authority contract", () => {
    const result = contract.processPayment(0, 150, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid amount", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.processPayment(0, 0, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("rejects invalid currency", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.processPayment(0, 150, "EUR");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("sets platform fee rate successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.setPlatformFeeRate(10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.platformFeeRate).toBe(10);
    const paymentResult = contract.processPayment(0, 200, "STX");
    expect(paymentResult.ok).toBe(true);
    expect(contract.stxTransfers).toEqual([
      { amount: 180, from: "ST1BUYER", to: "ST2CREATOR" },
      { amount: 20, from: "ST1BUYER", to: "ST3AUTH" },
    ]);
  });

  it("rejects invalid platform fee rate", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.setPlatformFeeRate(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FEE_RATE);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST3AUTH");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST3AUTH");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct payment count", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.processPayment(0, 150, "STX");
    contract.processPayment(0, 200, "STX");
    const result = contract.getPaymentCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });
});