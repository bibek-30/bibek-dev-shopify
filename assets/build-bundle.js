class BundleBuilder {
  constructor() {
    this.selectedProducts = new Map();
    this.maxSlots = 3;
    this.domElements = {};
    this.products = [];
    this.isLoading = false;
    this.init();
  }

  init() {
    this.cacheDOMElements();
    this.loadProductsFromHTML();
    this.setupEventListeners();
  }

  cacheDOMElements() {
    this.domElements = {
      productList: document.querySelector(".product-list"),
      bundleOpen: document.querySelector(".your_bundle"),
      bundleSlots: document.querySelector(".bundle-slots"),
      addToCartBtn: document.querySelector(".add-bundle-to-cart"),
      slots: Array.from(document.querySelectorAll(".slot")),
      subscriptionOptions: document.querySelector(".subscription-options"),
      purchaseTypeInputs: document.querySelectorAll(
        'input[name="purchase-type"]'
      ),
      frequencySelect: document.querySelector(
        'select[name="delivery-frequency"]'
      ),
    };
  }

  loadProductsFromHTML() {
    this.products = Array.from(
      this.domElements.productList.querySelectorAll(".product-card")
    ).map((card) => ({
      id: parseInt(card.dataset.productId),
      variant_id: card.dataset.variantId,
      title: card.dataset.title,
      price: parseFloat(card.dataset.price),
      image: card.querySelector(".product-image").src,
      currency: card.dataset.currency,
      sellingPlans: {
        weekly: card.dataset.sellingPlanWeekly,
        fourWeekly: card.dataset.sellingPlanFourWeekly,
      },
    }));

    console.log("Updated products:", this.products);
  }

  setupEventListeners() {
    // Product list events
    this.domElements.productList.addEventListener("click", (e) => {
      const addBtn = e.target.closest(".add-to-bundle");
      const removeBtn = e.target.closest(".remove-from-bundle");

      if (addBtn) {
        const productId = addBtn.dataset.productId;
        this.addToBundle(productId);
      } else if (removeBtn) {
        const productId = removeBtn.dataset.productId;
        this.removeFromBundle(productId);
      }
    });

    // Slot removal events
    this.domElements.bundleSlots.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".remove-from-slot");
      if (removeBtn) {
        const slot = removeBtn.dataset.slot;
        this.removeFromSlot(slot);
      }
    });

    // Add the bundle modal toggle (mobile only)
    this.domElements.bundleOpen.addEventListener("click", () => {
      this.handleBundleModalToggle();
    });

    // Add to cart event
    this.domElements.addToCartBtn.addEventListener("click", () => {
      this.addBundleToCart();
    });

    // Subscription event listeners
    this.domElements.purchaseTypeInputs.forEach((input) => {
      input.addEventListener("change", () => {
        this.updateAddToCartButton();
      });
    });

    this.domElements.frequencySelect.addEventListener("change", () => {
      this.updateAddToCartButton();
    });
  }

  // Update the updateState method to trigger price updates
  updateState(productId, action) {
    const product = this.products.find((p) => p.id === parseInt(productId));
    if (!product) return;

    if (action === "add") {
      const availableSlot = this.getFirstEmptySlot();
      if (!availableSlot) return;

      this.selectedProducts.set(availableSlot, product);
    } else if (action === "remove") {
      for (const [slot, slotProduct] of this.selectedProducts.entries()) {
        if (slotProduct.id === parseInt(productId)) {
          this.selectedProducts.delete(slot);
          break;
        }
      }
    }

    this.updateUI();
  }

  updateUI() {
    this.updateProductListUI();
    this.renderSlots();
    this.updateAddToCartButton();
    this.updatePurchaseTypeLabels();
  }

  updateProductListUI() {
    const selectedProductIds = Array.from(this.selectedProducts.values()).map(
      (p) => p.id
    );

    this.products.forEach((product) => {
      const card = this.domElements.productList.querySelector(
        `[data-product-id="${product.id}"]`
      );
      if (!card) return;

      const isSelected = selectedProductIds.includes(product.id);
      const isBundleFull = this.selectedProducts.size >= this.maxSlots;

      card
        .querySelector(".add-to-bundle")
        .classList.toggle("in-bundle", isSelected);
      card
        .querySelector(".add-to-bundle")
        .classList.toggle("disabled", !isSelected && isBundleFull);

      const addBtn = card.querySelector(".add-to-bundle");
      const removeBtn = card.querySelector(".remove-from-bundle");

      addBtn.classList.toggle("hidden", isSelected);
      removeBtn.classList.toggle("hidden", !isSelected);
    });

    console.log("update products", selectedProductIds);
    document.querySelector(".count-total").textContent =
      selectedProductIds.length;
  }

  renderSlots() {
    this.domElements.slots.forEach((slot, index) => {
      const slotNumber = index + 1;
      const product = this.selectedProducts.get(slotNumber.toString());
      console.log("render slot", product);

      slot.innerHTML = `
        <div class="slot-content ${product ? "filled" : ""}">
          ${
            product
              ? `
            <div class="slot-product">
              <button class="remove-from-slot" data-slot="${slotNumber}">×</button>
              <img src="${product.image}" alt="${product.title}" class="slot-product-image">
            </div>
          `
              : `
            <div class="empty-slot">
            </div>
          `
          }
        </div>
         <div class="title-container">
          ${product ? `<h3 class="slot-card-title">${product.title}</div>` : ""}
        </div>
      `;
    });
  }

  addToBundle(productId) {
    this.updateState(productId, "add");
  }

  removeFromBundle(productId) {
    this.updateState(productId, "remove");
  }

  removeFromSlot(slot) {
    const product = this.selectedProducts.get(slot);
    if (product) {
      this.updateState(product.id.toString(), "remove");
    }
  }

  getFirstEmptySlot() {
    for (let i = 1; i <= this.maxSlots; i++) {
      if (!this.selectedProducts.has(i.toString())) return i.toString();
    }
    return null;
  }

  updateAddToCartButton() {
    const isSubscription = this.isSubscriptionSelected();
    const frequencySelect = this.domElements.frequencySelect;

    if (isSubscription) {
      frequencySelect.disabled = false;
      this.domElements.addToCartBtn.disabled = false;
    } else {
      frequencySelect.disabled = true;
      this.domElements.addToCartBtn.disabled =
        this.selectedProducts.size < this.maxSlots;
    }

    if (this.isLoading) {
      this.domElements.addToCartBtn.innerHTML = `
                <span class="loading-spinner"></span>
                Adding to cart...
            `;
      this.domElements.addToCartBtn.disabled = true;
    } else {
      this.domElements.addToCartBtn.innerHTML = `Add to cart`;
    }

    if (this.selectedProducts.size >= this.maxSlots) {
      this.domElements.bundleOpen.click();
    }
  }

  isSubscriptionSelected() {
    return document.querySelector(
      'input[name="purchase-type"][value="subscription"]'
    ).checked;
  }

  getSelectedFrequency() {
    if (!this.isSubscriptionSelected()) return null;
    return this.domElements.frequencySelect.value;
  }

  getSellingPlanId(product) {
    if (!this.isSubscriptionSelected()) return null;

    const frequency = this.getSelectedFrequency();
    if (!frequency) return null;

    return frequency === "weekly"
      ? product.sellingPlans.weekly
      : product.sellingPlans.fourWeekly;
  }

  async addBundleToCart() {
    if (
      this.selectedProducts.size < this.maxSlots &&
      !this.isSubscriptionSelected()
    ) {
      return;
    }

    this.isLoading = true;
    this.updateAddToCartButton();

    try {
      const items = Array.from(this.selectedProducts.values()).map(
        (product) => {
          const sellingPlanId = this.getSellingPlanId(product);
          return {
            id: product.variant_id,
            quantity: 1,
            ...(sellingPlanId ? { selling_plan: sellingPlanId } : {}),
          };
        }
      );

      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items,
          sections: document
            .querySelector("cart-drawer")
            .getSectionsToRender()
            .map((section) => section.id),
          sections_url: window.location.pathname,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.description || "Failed to add to cart");
      }

      const responseData = await response.json();
      setTimeout(() => {
        this.handleSuccessfulAdd(responseData);
      });
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isLoading = false;
      this.updateAddToCartButton();
    }
  }

  handleSuccessfulAdd(response) {
    // alert("Bundle successfully added to cart!");
    // this.resetBundle();
    window.location.href = "/cart";
  }

  handleError(error) {
    this.isLoading = false;
    this.updateAddToCartButton();
    alert(error.message || "Failed to add bundle to cart. Please try again.");
    console.error("Cart error:", error);
  }

  resetBundle() {
    this.selectedProducts.clear();
    this.updateUI();
  }

  handleBundleModalToggle() {
    if (window.innerWidth <= 751) {
      document.body.classList.toggle("overflow-hidden");
      document
        .querySelector(".bundle-slots_wrapper")
        .classList.toggle("opened-model");
    }
  }

  formatPrice(amount, currencyFormat) {
    const numericAmount =
      typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(numericAmount))
      return currencyFormat.replace("{{amount}}", "0.00");
    const formattedAmount = Number.isInteger(numericAmount)
      ? numericAmount.toString()
      : numericAmount.toFixed(2);
    return currencyFormat.replace("{{amount}}", formattedAmount);
  }

  calculateTotalPrice() {
    return Array.from(this.selectedProducts.values()).reduce(
      (total, product) => total + product.price,
      0
    );
  }

  updatePurchaseTypeLabels() {
    const oneTimePriceLabel = document
      .querySelector('input[value="one-time"]')
      .parentElement.parentElement.querySelector(".price-label");

    const subscriptionPriceLabel = document
      .querySelector('input[value="subscription"]')
      .parentElement.parentElement.querySelector(".price-label");

    // Clear labels if bundle is not complete
    if (this.selectedProducts.size < this.maxSlots) {
      if (oneTimePriceLabel) oneTimePriceLabel.textContent = "";
      if (subscriptionPriceLabel) subscriptionPriceLabel.textContent = "";
      return;
    }

    const totalPrice = Number(this.calculateTotalPrice());
    const currency = this.products[0]?.currency || "Rs{{amount}}";

    const oneTimePrice = totalPrice;
    const discountedPrice = totalPrice * 0.3;
    const subscriptionPrice = oneTimePrice - discountedPrice;

    if (oneTimePriceLabel) {
      oneTimePriceLabel.innerHTML = `<span style="color:#000">${this.formatPrice(oneTimePrice, currency)}`;
    }

    if (subscriptionPriceLabel) {
      subscriptionPriceLabel.innerHTML = `<span class="discounted-price" style="color:#3b31ce">${this.formatPrice(
        subscriptionPrice,
        currency
      )} </span> <s style="color:#000">${this.formatPrice(oneTimePrice, currency)}</s>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new BundleBuilder();
});
