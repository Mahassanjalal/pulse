import Stripe from 'stripe';
import 'dotenv/config';

const secretKey = process.env.STRIPE_SECRET_KEY;
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

// Stripe is optional in development. When no secret key is configured the app
// runs in "dev mode" and checkout falls back to a direct (unpaid) grant so the
// premium flow can still be exercised without live keys.
export const stripe = secretKey ? new Stripe(secretKey) : null;

export const isStripeConfigured = !!stripe;

export const STRIPE_PUBLISHABLE_KEY = publishableKey || '';
