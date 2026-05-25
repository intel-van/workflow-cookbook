// Sample module with intentionally seeded bugs — used as a real target for the
// Bug Hunter recipe (Chapter 15). Do NOT "fix" upstream; it exists to be hunted.

function applyDiscount(price, percent) {
  // BUG: no validation; percent > 100 yields negative price; percent as string concatenates
  return price - (price * percent / 100);
}

function cartTotal(items) {
  let total = 0;
  // BUG: off-by-one — skips the last item (i < items.length - 1)
  for (let i = 0; i < items.length - 1; i++) {
    total += items[i].price * items[i].qty;
  }
  return total;
}

async function checkout(cart, gateway) {
  // BUG: missing await — charge() returns a promise; result is always truthy
  const ok = gateway.charge(cartTotal(cart.items));
  if (ok) {
    cart.items = [];          // cart cleared even if the (un-awaited) charge later rejects
    return { success: true };
  }
  return { success: false };
}

function findItem(items, id) {
  // BUG: == vs ===, and returns undefined silently for missing id with no guard
  return items.find(it => it.id == id);
}

function mergeCarts(a, b) {
  // BUG: mutates `a` in place (shared reference) instead of returning a new array
  for (const it of b) a.push(it);
  return a;
}

module.exports = { applyDiscount, cartTotal, checkout, findItem, mergeCarts };
