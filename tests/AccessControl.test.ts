import { describe, it, expect, beforeEach, vi } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PLAN_NOT_FOUND = 101;
const ERR_PAYMENT_NOT_FOUND = 102;
const ERR_ACCESS_DENIED = 103;
const ERR_ACCESS_ALREADY_GRANTED = 108;
const ERR_ACCESS_NOT_FOUND = 109;
const ERR_AUTHORITY_NOT_VERIFIED = 105;
const ERR_INVALID_DURATION = 111;
const ERR_MAX_ACCESSES_EXCEEDED = 112;

interface Plan {
  creator: string;
}

interface Payment {
  planId: number;
  buyer: string;
}

interface Access {
  planId: number;
  user: string;
  paymentId: number;
  timestamp: number;
  duration: number;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class WorkoutPlanRegistryMock {
  getPlan = vi.fn((id: number) =>
    id === 0
      ? { ok: true, value: { creator: "ST2CREATOR" } }
      : { ok: false, value: null }
  );
}

class PaymentProcessorMock {
  getPaymentByPlanBuyer = vi.fn((planId: number, buyer: string) =>
    planId === 0 && buyer === "ST1USER"
      ? { ok: true, value: 0 }
      : { ok: false, value: null }
  );
}

class AccessControlMock {
  state: {
    authorityContract: string | null;
    maxAccesses: number;
    nextAccessId: number;
    accessRecords: Map<number, Access>;
    accessByPlanUser: Map<string, number>;
  } = {
    authorityContract: null,
    maxAccesses: 100000,
    nextAccessId: 0,
    accessRecords: new Map(),
    accessByPlanUser: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1USER";
  registry: WorkoutPlanRegistryMock = new WorkoutPlanRegistryMock();
  paymentProcessor: PaymentProcessorMock = new PaymentProcessorMock();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      authorityContract: null,
      maxAccesses: 100000,
      nextAccessId: 0,
      accessRecords: new Map(),
      accessByPlanUser: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1USER";
    this.registry.getPlan.mockReset();
    this.registry.getPlan.mockImplementation((id: number) =>
      id === 0
        ? { ok: true, value: { creator: "ST2CREATOR" } }
        : { ok: false, value: null }
    );
    this.paymentProcessor.getPaymentByPlanBuyer.mockReset();
    this.paymentProcessor.getPaymentByPlanBuyer.mockImplementation(
      (planId: number, buyer: string) =>
        planId === 0 && buyer === "ST1USER"
          ? { ok: true, value: 0 }
          : { ok: false, value: null }
    );
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: false };
    if (this.state.authorityContract !== null)
      return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  grantAccess(planId: number, user: string, duration: number): Result<number> {
    if (this.state.nextAccessId >= this.state.maxAccesses)
      return { ok: false, value: ERR_MAX_ACCESSES_EXCEEDED };
    if (duration <= 0 || duration > 365)
      return { ok: false, value: ERR_INVALID_DURATION };
    if (user === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    const planResult = this.registry.getPlan(planId);
    if (!planResult.ok || !planResult.value)
      return { ok: false, value: ERR_PLAN_NOT_FOUND };
    const paymentResult = this.paymentProcessor.getPaymentByPlanBuyer(
      planId,
      user
    );
    if (!paymentResult.ok || paymentResult.value === null)
      return { ok: false, value: ERR_PAYMENT_NOT_FOUND };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    const key = `${planId}-${user}`;
    if (this.state.accessByPlanUser.has(key))
      return { ok: false, value: ERR_ACCESS_ALREADY_GRANTED };
    const accessId = this.state.nextAccessId;
    const access: Access = {
      planId,
      user,
      paymentId: paymentResult.value,
      timestamp: this.blockHeight,
      duration,
      status: true,
    };
    this.state.accessRecords.set(accessId, access);
    this.state.accessByPlanUser.set(key, accessId);
    this.state.nextAccessId++;
    return { ok: true, value: accessId };
  }

  revokeAccess(planId: number, user: string): Result<boolean> {
    const planResult = this.registry.getPlan(planId);
    if (!planResult.ok || !planResult.value)
      return { ok: false, value: ERR_PLAN_NOT_FOUND };
    if (this.caller !== planResult.value.creator)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    const key = `${planId}-${user}`;
    const accessId = this.state.accessByPlanUser.get(key);
    if (!accessId && accessId !== 0)
      return { ok: false, value: ERR_ACCESS_NOT_FOUND };
    const access = this.state.accessRecords.get(accessId);
    if (!access) return { ok: false, value: ERR_ACCESS_NOT_FOUND };
    this.state.accessRecords.set(accessId, { ...access, status: false });
    this.state.accessByPlanUser.delete(key);
    return { ok: true, value: true };
  }

  verifyAccess(planId: number, user: string): Result<boolean> {
    const planResult = this.registry.getPlan(planId);
    if (!planResult.ok || !planResult.value)
      return { ok: false, value: ERR_PLAN_NOT_FOUND };
    const key = `${planId}-${user}`;
    const accessId = this.state.accessByPlanUser.get(key);
    if (!accessId && accessId !== 0)
      return { ok: false, value: ERR_ACCESS_NOT_FOUND };
    const access = this.state.accessRecords.get(accessId);
    if (!access) return { ok: false, value: ERR_ACCESS_NOT_FOUND };
    if (!access.status || this.blockHeight > access.timestamp + access.duration)
      return { ok: false, value: ERR_ACCESS_DENIED };
    return { ok: true, value: true };
  }

  getAccess(accessId: number): Access | null {
    return this.state.accessRecords.get(accessId) || null;
  }

  getAccessByPlanUser(planId: number, user: string): number | null {
    return this.state.accessByPlanUser.get(`${planId}-${user}`) || null;
  }

  getAccessCount(): Result<number> {
    return { ok: true, value: this.state.nextAccessId };
  }
}

describe("AccessControl", () => {
  let contract: AccessControlMock;

  beforeEach(() => {
    contract = new AccessControlMock();
    contract.reset();
  });

  it("grants access successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.grantAccess(0, "ST1USER", 30);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const access = contract.getAccess(0);
    expect(access?.planId).toBe(0);
    expect(access?.user).toBe("ST1USER");
    expect(access?.paymentId).toBe(0);
    expect(access?.duration).toBe(30);
    expect(access?.status).toBe(true);
  });

  it("rejects access for non-existent plan", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.grantAccess(1, "ST1USER", 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PLAN_NOT_FOUND);
  });

  it("rejects access without payment", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.paymentProcessor.getPaymentByPlanBuyer.mockImplementation(() => ({
      ok: false,
      value: null,
    }));
    const result = contract.grantAccess(0, "ST1USER", 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAYMENT_NOT_FOUND);
  });

  it("rejects duplicate access grant", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.grantAccess(0, "ST1USER", 30);
    const result = contract.grantAccess(0, "ST1USER", 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ACCESS_ALREADY_GRANTED);
  });

  it("rejects access without authority contract", () => {
    const result = contract.grantAccess(0, "ST1USER", 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid duration", () => {
    contract.setAuthorityContract("ST3AUTH");
    const result = contract.grantAccess(0, "ST1USER", 400);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DURATION);
  });

  it("revokes access successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.caller = "ST2CREATOR";
    contract.grantAccess(0, "ST1USER", 30);
    const result = contract.revokeAccess(0, "ST1USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const access = contract.getAccess(0);
    expect(access?.status).toBe(false);
    expect(contract.getAccessByPlanUser(0, "ST1USER")).toBe(null);
  });

  it("rejects revoke by non-creator", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.grantAccess(0, "ST1USER", 30);
    contract.caller = "ST3FAKE";
    const result = contract.revokeAccess(0, "ST1USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("verifies access successfully", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.grantAccess(0, "ST1USER", 30);
    const result = contract.verifyAccess(0, "ST1USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects access verification for expired duration", () => {
    contract.setAuthorityContract("ST3AUTH");
    contract.grantAccess(0, "ST1USER", 30);
    contract.blockHeight = 31;
    const result = contract.verifyAccess(0, "ST1USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ACCESS_DENIED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST3AUTH");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST3AUTH");
  });
});
