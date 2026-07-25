import { beforeEach, describe, expect, it, vi } from "vitest";
import { razorpayGateway } from "./payments.js";

/**
 * `razorpayGateway` — spec `docs/specs/2026-07-25-payments-slice.md` (P2). The
 * `razorpay` SDK is mocked wholesale: these tests assert the *shape* of what
 * the adapter sends to `orders.create`/`orders.fetch` (amount/currency/receipt/
 * notes in, a normalized `Order` out) — not Razorpay's own behaviour, which is
 * out of reach without live credentials (spec: "dummy creds now").
 *
 * `payments.ts` does `import Razorpay from "razorpay"` — a default import — so
 * the mock factory below must return `{ default: FakeRazorpay }` to match: a
 * bare `{ orders: {...} }` factory would leave the imported `Razorpay`
 * undefined and `new Razorpay(...)` would throw before any assertion ran.
 *
 * `vi.hoisted` gives the `vi.mock` factory (itself hoisted above every import,
 * including the one above) and the test bodies below a shared handle on the
 * same `vi.fn()`s — mirrors `notification-adapters.test.ts`'s
 * `createTransportMock`.
 */
const { ordersCreateMock, ordersFetchMock } = vi.hoisted(() => ({
  ordersCreateMock: vi.fn(),
  ordersFetchMock: vi.fn(),
}));

vi.mock("razorpay", () => ({
  default: class FakeRazorpay {
    orders = { create: ordersCreateMock, fetch: ordersFetchMock };
  },
}));

const CONFIG = { keyId: "rzp_test_key", keySecret: "test-key-secret" };

describe("razorpayGateway", () => {
  beforeEach(() => {
    ordersCreateMock.mockReset();
    ordersFetchMock.mockReset();
  });

  describe("createOrder", () => {
    it("calls orders.create with amount/currency/receipt/notes and returns a normalized Order", async () => {
      ordersCreateMock.mockResolvedValue({
        id: "order_abc123",
        amount: 150000,
        status: "created",
        notes: { assignmentId: "a1" },
      });

      const gateway = razorpayGateway(CONFIG);
      const order = await gateway.createOrder({
        amountPaise: 150000,
        receipt: "r1",
        notes: { assignmentId: "a1" },
      });

      expect(ordersCreateMock).toHaveBeenCalledWith({
        amount: 150000,
        currency: "INR",
        receipt: "r1",
        notes: { assignmentId: "a1" },
      });
      expect(order).toEqual({
        id: "order_abc123",
        amountPaise: 150000,
        status: "created",
        notes: { assignmentId: "a1" },
      });
    });

    it("defaults notes to {} and coerces a string amount when Razorpay returns one", async () => {
      // Razorpay's own types allow `amount` back as either number or string —
      // this is the branch that exercises the string side of `Number(amount)`.
      ordersCreateMock.mockResolvedValue({
        id: "order_def456",
        amount: "99900",
        status: "created",
      });

      const gateway = razorpayGateway(CONFIG);
      const order = await gateway.createOrder({ amountPaise: 99900, receipt: "r2", notes: {} });

      expect(order).toEqual({
        id: "order_def456",
        amountPaise: 99900,
        status: "created",
        notes: {},
      });
    });
  });

  describe("fetchOrder", () => {
    it("calls orders.fetch with the order id and returns a normalized Order", async () => {
      ordersFetchMock.mockResolvedValue({
        id: "order_xyz789",
        amount: 250000,
        status: "paid",
        notes: { assignmentId: "a2" },
      });

      const gateway = razorpayGateway(CONFIG);
      const order = await gateway.fetchOrder("order_xyz789");

      expect(ordersFetchMock).toHaveBeenCalledWith("order_xyz789");
      expect(order).toEqual({
        id: "order_xyz789",
        amountPaise: 250000,
        status: "paid",
        notes: { assignmentId: "a2" },
      });
    });
  });
});
