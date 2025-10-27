import { describe, it, expect, beforeEach } from "vitest";
import { bufferCV, stringUtf8CV, uintCV, listCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_TITLE = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_CATEGORY = 104;
const ERR_INVALID_PRICE = 105;
const ERR_PLAN_ALREADY_EXISTS = 106;
const ERR_PLAN_NOT_FOUND = 107;
const ERR_INVALID_PLAN_TYPE = 115;
const ERR_INVALID_DURATION = 116;
const ERR_INVALID_LEVEL = 117;
const ERR_INVALID_EQUIPMENT = 118;
const ERR_INVALID_TAGS = 119;
const ERR_INVALID_MIN_PRICE = 110;
const ERR_INVALID_MAX_PRICE = 111;
const ERR_MAX_PLANS_EXCEEDED = 114;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_AUTHORITY_NOT_VERIFIED = 109;

interface Plan {
  hash: Uint8Array;
  title: string;
  description: string;
  category: string;
  price: number;
  timestamp: number;
  creator: string;
  planType: string;
  duration: number;
  level: string;
  equipment: string;
  tags: string[];
  status: boolean;
  minPrice: number;
  maxPrice: number;
}

interface PlanUpdate {
  updateTitle: string;
  updateDescription: string;
  updatePrice: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class WorkoutPlanRegistryMock {
  state: {
    nextPlanId: number;
    maxPlans: number;
    registrationFee: number;
    authorityContract: string | null;
    plans: Map<number, Plan>;
    planUpdates: Map<number, PlanUpdate>;
    plansByHash: Map<string, number>;
  } = {
    nextPlanId: 0,
    maxPlans: 1000,
    registrationFee: 1000,
    authorityContract: null,
    plans: new Map(),
    planUpdates: new Map(),
    plansByHash: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextPlanId: 0,
      maxPlans: 1000,
      registrationFee: 1000,
      authorityContract: null,
      plans: new Map(),
      planUpdates: new Map(),
      plansByHash: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isVerifiedAuthority(principal: string): Result<boolean> {
    return { ok: true, value: this.authorities.has(principal) };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerPlan(
    hash: Uint8Array,
    title: string,
    description: string,
    category: string,
    price: number,
    planType: string,
    duration: number,
    level: string,
    equipment: string,
    tags: string[],
    minPrice: number,
    maxPrice: number
  ): Result<number> {
    if (this.state.nextPlanId >= this.state.maxPlans) return { ok: false, value: ERR_MAX_PLANS_EXCEEDED };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (!title || title.length > 100) return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!category || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (price <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (!["strength", "cardio", "yoga"].includes(planType)) return { ok: false, value: ERR_INVALID_PLAN_TYPE };
    if (duration <= 0 || duration > 365) return { ok: false, value: ERR_INVALID_DURATION };
    if (!["beginner", "intermediate", "advanced"].includes(level)) return { ok: false, value: ERR_INVALID_LEVEL };
    if (equipment.length > 100) return { ok: false, value: ERR_INVALID_EQUIPMENT };
    if (tags.length > 10) return { ok: false, value: ERR_INVALID_TAGS };
    if (minPrice < 0) return { ok: false, value: ERR_INVALID_MIN_PRICE };
    if (maxPrice <= 0) return { ok: false, value: ERR_INVALID_MAX_PRICE };
    if (!this.isVerifiedAuthority(this.caller).value) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const hashStr = hash.toString();
    if (this.state.plansByHash.has(hashStr)) return { ok: false, value: ERR_PLAN_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextPlanId;
    const plan: Plan = {
      hash,
      title,
      description,
      category,
      price,
      timestamp: this.blockHeight,
      creator: this.caller,
      planType,
      duration,
      level,
      equipment,
      tags,
      status: true,
      minPrice,
      maxPrice,
    };
    this.state.plans.set(id, plan);
    this.state.plansByHash.set(hashStr, id);
    this.state.nextPlanId++;
    return { ok: true, value: id };
  }

  getPlan(id: number): Plan | null {
    return this.state.plans.get(id) || null;
  }

  updatePlan(id: number, updateTitle: string, updateDescription: string, updatePrice: number): Result<boolean> {
    const plan = this.state.plans.get(id);
    if (!plan) return { ok: false, value: false };
    if (plan.creator !== this.caller) return { ok: false, value: false };
    if (!updateTitle || updateTitle.length > 100) return { ok: false, value: false };
    if (updateDescription.length > 500) return { ok: false, value: false };
    if (updatePrice <= 0) return { ok: false, value: false };

    const updated: Plan = {
      ...plan,
      title: updateTitle,
      description: updateDescription,
      price: updatePrice,
      timestamp: this.blockHeight,
    };
    this.state.plans.set(id, updated);
    this.state.planUpdates.set(id, {
      updateTitle,
      updateDescription,
      updatePrice,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getPlanCount(): Result<number> {
    return { ok: true, value: this.state.nextPlanId };
  }

  checkPlanExistence(hash: Uint8Array): Result<boolean> {
    return { ok: true, value: this.state.plansByHash.has(hash.toString()) };
  }
}

describe("WorkoutPlanRegistry", () => {
  let contract: WorkoutPlanRegistryMock;

  beforeEach(() => {
    contract = new WorkoutPlanRegistryMock();
    contract.reset();
  });

  it("registers a plan successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerPlan(
      hash,
      "Plan A",
      "Description A",
      "Category A",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1", "tag2"],
      50,
      200
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const plan = contract.getPlan(0);
    expect(plan?.title).toBe("Plan A");
    expect(plan?.description).toBe("Description A");
    expect(plan?.category).toBe("Category A");
    expect(plan?.price).toBe(100);
    expect(plan?.planType).toBe("strength");
    expect(plan?.duration).toBe(30);
    expect(plan?.level).toBe("beginner");
    expect(plan?.equipment).toBe("Dumbbells");
    expect(plan?.tags).toEqual(["tag1", "tag2"]);
    expect(plan?.minPrice).toBe(50);
    expect(plan?.maxPrice).toBe(200);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate plan hashes", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerPlan(
      hash,
      "Plan A",
      "Description A",
      "Category A",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    const result = contract.registerPlan(
      hash,
      "Plan B",
      "Description B",
      "Category B",
      200,
      "cardio",
      60,
      "intermediate",
      "Treadmill",
      ["tag3"],
      100,
      400
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PLAN_ALREADY_EXISTS);
  });

  it("rejects non-authorized caller", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2FAKE";
    contract.authorities = new Set();
    const hash = new Uint8Array(32).fill(2);
    const result = contract.registerPlan(
      hash,
      "Plan C",
      "Description C",
      "Category C",
      150,
      "yoga",
      45,
      "advanced",
      "Mat",
      ["tag4"],
      75,
      300
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("parses plan title with Clarity", () => {
    const cv = stringUtf8CV("Plan D");
    expect(cv.value).toBe("Plan D");
  });

  it("rejects plan registration without authority contract", () => {
    const hash = new Uint8Array(32).fill(3);
    const result = contract.registerPlan(
      hash,
      "NoAuth Plan",
      "NoAuth Desc",
      "NoAuth Cat",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(31).fill(4);
    const result = contract.registerPlan(
      hash,
      "Invalid Hash",
      "Desc",
      "Cat",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid price", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(5);
    const result = contract.registerPlan(
      hash,
      "Invalid Price",
      "Desc",
      "Cat",
      0,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRICE);
  });

  it("rejects invalid plan type", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(6);
    const result = contract.registerPlan(
      hash,
      "Invalid Type",
      "Desc",
      "Cat",
      100,
      "invalid",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PLAN_TYPE);
  });

  it("updates a plan successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(7);
    contract.registerPlan(
      hash,
      "Old Plan",
      "Old Desc",
      "Old Cat",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    const result = contract.updatePlan(0, "New Plan", "New Desc", 150);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const plan = contract.getPlan(0);
    expect(plan?.title).toBe("New Plan");
    expect(plan?.description).toBe("New Desc");
    expect(plan?.price).toBe(150);
    const update = contract.state.planUpdates.get(0);
    expect(update?.updateTitle).toBe("New Plan");
    expect(update?.updateDescription).toBe("New Desc");
    expect(update?.updatePrice).toBe(150);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent plan", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updatePlan(99, "New Plan", "New Desc", 150);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(8);
    contract.registerPlan(
      hash,
      "Test Plan",
      "Test Desc",
      "Test Cat",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    contract.caller = "ST3FAKE";
    const result = contract.updatePlan(0, "New Plan", "New Desc", 150);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets registration fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRegistrationFee(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(2000);
    const hash = new Uint8Array(32).fill(9);
    contract.registerPlan(
      hash,
      "Test Plan",
      "Test Desc",
      "Test Cat",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    expect(contract.stxTransfers).toEqual([{ amount: 2000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects registration fee change without authority contract", () => {
    const result = contract.setRegistrationFee(2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct plan count", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash1 = new Uint8Array(32).fill(10);
    contract.registerPlan(
      hash1,
      "Plan 1",
      "Desc 1",
      "Cat 1",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    const hash2 = new Uint8Array(32).fill(11);
    contract.registerPlan(
      hash2,
      "Plan 2",
      "Desc 2",
      "Cat 2",
      200,
      "cardio",
      60,
      "intermediate",
      "Treadmill",
      ["tag2"],
      100,
      400
    );
    const result = contract.getPlanCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks plan existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(12);
    contract.registerPlan(
      hash,
      "Test Plan",
      "Test Desc",
      "Test Cat",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    const result = contract.checkPlanExistence(hash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const hash2 = new Uint8Array(32).fill(13);
    const result2 = contract.checkPlanExistence(hash2);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects plan registration with empty title", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(14);
    const result = contract.registerPlan(
      hash,
      "",
      "Desc",
      "Cat",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects plan registration with max plans exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxPlans = 1;
    const hash1 = new Uint8Array(32).fill(15);
    contract.registerPlan(
      hash1,
      "Plan 1",
      "Desc 1",
      "Cat 1",
      100,
      "strength",
      30,
      "beginner",
      "Dumbbells",
      ["tag1"],
      50,
      200
    );
    const hash2 = new Uint8Array(32).fill(16);
    const result = contract.registerPlan(
      hash2,
      "Plan 2",
      "Desc 2",
      "Cat 2",
      200,
      "cardio",
      60,
      "intermediate",
      "Treadmill",
      ["tag2"],
      100,
      400
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PLANS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});