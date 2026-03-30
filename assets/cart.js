class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0, event);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      return this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute('value');
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = '';

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min);
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace('[max]', event.target.max);
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', event.target.step);
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity('');
      event.target.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        event,
        document.activeElement.getAttribute('name'),
        event.target.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      return fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      return fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

    getSectionsToRender() {
      if (this.tagName === 'CART-DRAWER-ITEMS') {
        return [
          {
            id: 'CartDrawer-CartItems',
            section: 'cart-drawer',
            selector: '#CartDrawer-CartItems',
          },
          {
            id: 'cart-icon-bubble',
            section: 'cart-icon-bubble',
            selector: '.shopify-section',
          },
          {
            id: 'cart-live-region-text',
            section: 'cart-live-region-text',
            selector: '.shopify-section',
          },
          {
            id: 'CartDrawer',
            section: 'cart-drawer',
            selector: '.cart-drawer__footer',
          },
        ];
      }

      const sections = [
        {
          id: 'cart-icon-bubble',
          section: 'cart-icon-bubble',
          selector: '.shopify-section',
        },
        {
          id: 'cart-live-region-text',
          section: 'cart-live-region-text',
          selector: '.shopify-section',
        },
      ];

      const mainCartItems = document.getElementById('main-cart-items');
      const mainCartFooter = document.getElementById('main-cart-footer');

      if (mainCartItems) {
        sections.unshift({
          id: 'main-cart-items',
          section: mainCartItems.dataset.id,
          selector: '.js-contents',
        });
      }

      if (mainCartFooter) {
        sections.push({
          id: 'main-cart-footer',
          section: mainCartFooter.dataset.id,
          selector: '.js-contents',
        });
      }

      return sections;
    }

  updateQuantity(line, quantity, event, name, variantId) {
    const eventTarget = event.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';
    const cartPerformanceUpdateMarker = CartPerformance.createStartingMarker(`${eventTarget}:user-action`);

    this.enableLoading(line);

      const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
      if (errors) errors.textContent = '';

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
         const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
          if (errors) errors.textContent = '';

        CartPerformance.measure(`${eventTarget}:paint-updated-sections`, () => {
          const quantityElement =
            document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
          const items = document.querySelectorAll('.cart-item');

          if (parsedState.errors) {
            quantityElement.value = quantityElement.getAttribute('value');
            this.updateLiveRegions(line, parsedState.errors);
            return;
          }

          this.classList.toggle('is-empty', parsedState.item_count === 0);
          const cartDrawerWrapper = document.querySelector('cart-drawer');
          const cartFooter = document.getElementById('main-cart-footer');

          if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
          if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

          this.getSectionsToRender().forEach((section) => {
            const container = document.getElementById(section.id);
            if (!container) return;

            const elementToReplace = container.querySelector(section.selector) || container;
            const sectionHTML = parsedState.sections[section.section];

            if (!sectionHTML) return;

            const newInnerHTML = this.getSectionInnerHTML(sectionHTML, section.selector);
            if (typeof newInnerHTML === 'undefined' || newInnerHTML === null) return;

            elementToReplace.innerHTML = newInnerHTML;
          });
          const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
          let message = '';
          if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
            if (typeof updatedValue === 'undefined') {
              message = window.cartStrings.error;
            } else {
              message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
            }
          }
          this.updateLiveRegions(line, message);

          const lineItem =
            document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
          if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
            cartDrawerWrapper
              ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
              : lineItem.querySelector(`[name="${name}"]`).focus();
          } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
          } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
          }
        });

          publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'cart-routine-upsell',
          cartData: responseData,
          variantId: Number(responseData.variant_id || 0),
        });
      })
      .catch((error) => {
        console.error(error);
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));

        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        if (errors) {
          errors.textContent = '';
        }
      })
      .finally(() => {
        this.disableLoading(line);
        CartPerformance.measureFromMarker(`${eventTarget}:user-action`, cartPerformanceUpdateMarker);
      });
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

    getSectionInnerHTML(html, selector) {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const element = parsed.querySelector(selector);
      return element ? element.innerHTML : '';
    }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } }).then(() =>
              CartPerformance.measureFromEvent('note-update:user-action', event)
            );
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}

class CartDrawerRoutineUpsells {
  constructor() {
    document.addEventListener('click', this.onClick.bind(this));
  }

  onClick(event) {
    const button = event.target.closest('.cart-routine__add-button');
    if (!button) return;

    event.preventDefault();

    if (button.classList.contains('is-loading') || button.classList.contains('is-added')) return;

    const variantId = button.dataset.variantId;
    if (!variantId) return;

    this.addItem(button, variantId);
  }

  async addItem(button, variantId) {
    try {
      button.classList.add('is-loading');

      const formData = new FormData();
      formData.append('id', variantId);
      formData.append('quantity', '1');
      formData.append('sections', 'cart-drawer,cart-icon-bubble');
      formData.append('sections_url', window.location.pathname);

      const response = await fetch(`${routes.cart_add_url}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      const responseData = await response.json();

      if (responseData.status) {
        console.error(responseData.description || responseData.message || 'Error adding item to cart');
        button.classList.remove('is-loading');
        return;
      }

      button.classList.remove('is-loading');
      button.classList.add('is-added');

      const textNode = button.querySelector('.cart-routine__add-text');
      if (textNode) {
        textNode.textContent = button.dataset.addedText || 'Añadido';
      }

      setTimeout(() => {
        this.renderCartDrawer(responseData);
      }, 450);
    } catch (error) {
      console.error(error);
      button.classList.remove('is-loading');
    }
  }

  renderCartDrawer(responseData) {
    if (responseData.sections && responseData.sections['cart-icon-bubble']) {
      const bubbleContainer = document.getElementById('cart-icon-bubble');
      if (bubbleContainer) {
        const bubbleHTML = new DOMParser().parseFromString(responseData.sections['cart-icon-bubble'], 'text/html');
        const bubbleSource =
          bubbleHTML.querySelector('.shopify-section') || bubbleHTML.querySelector('#cart-icon-bubble');
        if (bubbleSource) {
          bubbleContainer.innerHTML = bubbleSource.innerHTML;
        }
      }
    }

    fetch(`${routes.cart_url}?section_id=cart-drawer`)
      .then((res) => res.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const selectors = ['cart-drawer-items', '.cart-drawer__footer'];

        selectors.forEach((selector) => {
          const targetElement = document.querySelector(selector);
          const sourceElement = html.querySelector(selector);

          if (targetElement && sourceElement) {
            targetElement.replaceWith(sourceElement);
          }
        });

        const cartDrawerWrapper = document.querySelector('cart-drawer');
        if (cartDrawerWrapper) {
          cartDrawerWrapper.classList.remove('is-empty');
        }

        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'cart-routine-upsell',
          cartData: responseData,
          variantId: variantId,
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }
}

new CartDrawerRoutineUpsells();