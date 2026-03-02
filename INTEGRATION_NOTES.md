# Wallpaper Configurator — Shopify Integration Notes

## Where frame configuration would live in production

| Config type | Recommended location | Why |
|---|---|---|
| Frame sizes (min/max cm, step) | **Theme Settings** (`config/settings_schema.json`) | Merchant-editable via Customizer; no code deploy needed |
| Padding limits & defaults | **Theme Settings** | Same reason — safe for non-technical merchants |
| Per-product overrides (e.g. max size for a small print) | **Product Metafields** (`custom.frame_config`, type: `json`) | Scoped to a single product without touching theme code |
| Pricing rules (price-per-cm²) | **Shopify Scripts** or a **custom App** with a Storefront API proxy | Requires server-side calculation; theme alone can't securely enforce pricing |
| imgBB API key | **Theme Settings** (password field) or a private App environment variable | Never hard-code credentials in committed JS |

## How it integrates with native Shopify product configuration

1. The modal intercepts the native `product-form.js` `Add to Cart` submit via a capture-phase listener, so it works with any Dawn-based theme with zero template changes.
2. On confirm, `Width (cm)`, `Height (cm)`, `Padding (px)`, and `Cropped Image` are written as **line-item properties** — they appear on the order, are forwarded to fulfilment, and can be read by Liquid in `cart-items`.
3. For a full production build: add a `product.wallpaper` template that renders the section with `photo-wallpaper-modal` assets included, and gate the modal with a product tag check (`product.tags contains 'wallpaper'`) so it only loads for relevant products.
