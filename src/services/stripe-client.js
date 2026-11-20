import Stripe from "stripe";

export function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
}

export function isStripeCheckoutConfigured(stripe) {
  return Boolean(stripe && process.env.STRIPE_WEBHOOK_SECRET?.trim());
}
