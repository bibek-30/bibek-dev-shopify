# If it's a product-related 
Usually we can use schema settings to make things dynamic, so the store owner can manage everything easily without touching any code.

But for product-specific things, it’s better to use metafields or even metaobjects — especially for things like spacing, width, height, and other custom values.

For price-related changes, it’s different. We may need to build a custom app or extension using Shopify Functions, which is possible but will require some proper research and documentation work.

Right now, it’s connected to the Add to Cart button. If it needs to be product-specific, we can control it using metafields and enable/disable it per product.

If the product limit is below 50, we could also handle it using schema settings by selecting all the products 50 or below and applying a conditional check to show it on the site.




# If it's a section related, then we can just create a section, and everything can be made dynamic using the input settings.
