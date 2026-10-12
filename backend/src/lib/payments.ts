import { prisma } from './prisma';

export type PaymentPurpose = 'COINS' | 'PREMIUM' | 'UNLOCK';

/**
 * Idempotency guard for payment-driven grants (audit finding C4).
 *
 * A grant may happen at most once per Stripe checkout session (status-poll
 * path) or per Stripe webhook event id (webhook path). Insert-and-check inside
 * a transaction: the PaymentEvent.id primary key makes concurrent/duplicate
 * calls race-safe — the second insert loses and is treated as "already
 * granted". Without this, repeatedly hitting /checkout-status re-granted coins
 * or re-extended premium every call.
 */
export async function claimPaymentEvent(
  id: string,
  userId: string,
  purpose: PaymentPurpose,
  refId?: string,
): Promise<boolean> {
  if (!id) return false;
  try {
    await prisma.paymentEvent.create({
      data: { id, userId, purpose, refId: refId ?? null },
    });
    return true;
  } catch (err: any) {
    // Unique violation (P2002) => this session/event was already processed.
    if (err?.code === 'P2002') return false;
    throw err;
  }
}
