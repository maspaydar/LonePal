import { getUncachableStripeClient } from "../server/stripeClient";

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log("Connecting to Stripe...");

    const existingProducts = await stripe.products.search({
      query: "name:'HeyGrand Pro' AND active:'true'",
    });

    if (existingProducts.data.length > 0) {
      console.log("HeyGrand Pro already exists:", existingProducts.data[0].id);
      const prices = await stripe.prices.list({ product: existingProducts.data[0].id, active: true });
      prices.data.forEach(p => {
        console.log(`  Price: ${p.id} - ${p.unit_amount! / 100} ${p.currency.toUpperCase()}/${(p.recurring?.interval || "")}`);
      });
      return;
    }

    const product = await stripe.products.create({
      name: "HeyGrand Pro",
      description: "Full access to HeyGrand AI safety monitoring — unlimited residents, sensors, and AI check-ins.",
    });
    console.log("Created product:", product.id);

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 29900,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log("Created monthly price:", monthlyPrice.id, "($299/month)");

    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 299900,
      currency: "usd",
      recurring: { interval: "year" },
    });
    console.log("Created yearly price:", yearlyPrice.id, "($2,999/year)");

    console.log("\nAll done! Webhooks will sync these to your database.");
  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

createProducts();
