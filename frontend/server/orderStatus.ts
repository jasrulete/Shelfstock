// Type-only: this module must stay free of runtime imports so the admin UI
// can pull the matrix into the client bundle without dragging in server code.
import type { OrderStatus } from './types';

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'shipped', 'completed', 'cancelled'];

/**
 * The order lifecycle, as a matrix of the statuses each status may move INTO.
 *
 * Stock is decremented when an order is created and restored when it enters
 * 'cancelled', so which edges exist is an inventory-correctness question, not
 * a UI one:
 *
 * - 'pending' and 'shipped' may be cancelled. For cash-on-delivery that means
 *   the customer refused the parcel; the goods really do come back.
 * - 'completed' means delivered and cash collected. Cancelling it would put
 *   goods that are in the customer's hands back on the shelf. There is no
 *   returns flow in this codebase, so 'completed' is terminal.
 * - 'cancelled' is terminal too: stock has already been restored, and leaving
 *   'cancelled' would let the same units be counted twice.
 * - No status may move to itself, and nothing may move backwards to 'pending'.
 *
 * This is the enforcement layer. The admin UI imports the same map so the
 * dropdown can only offer transitions the API will actually accept.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['shipped', 'completed', 'cancelled'],
  shipped: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
