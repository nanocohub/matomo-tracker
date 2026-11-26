import { describe, expect, it } from 'vitest';
import { PAGE_ORIGIN, commandsAfterInit, createTracker } from './helpers';

describe('ecommerce.productView', () => {
  it('queues nothing by itself', () => {
    createTracker().ecommerce.productView({ sku: 'SKU-1', name: 'Router', category: 'Network', price: 99 });

    expect(commandsAfterInit()).toEqual([]);
  });

  it('is applied to the next page view, after the title and before the hit', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1', name: 'Router', category: 'Network', price: 99 });

    tracker.trackPageView({ url: '/products/1', title: 'Router' });

    expect(commandsAfterInit()).toEqual([
      ['setCustomUrl', `${PAGE_ORIGIN}/products/1`],
      ['setDocumentTitle', 'Router'],
      ['setEcommerceView', 'SKU-1', 'Router', 'Network', 99],
      ['trackPageView'],
    ]);
  });

  it('is applied once, not to the page views after that', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1' });

    tracker.trackPageView({ url: '/products/1' });
    tracker.trackPageView({ url: '/cart' });

    const views = commandsAfterInit().filter(([name]) => name === 'setEcommerceView');
    expect(views).toHaveLength(1);
  });

  it('uses empty values for what is absent', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1' });

    tracker.trackPageView({ url: '/products/1' });

    expect(commandsAfterInit()[2]).toEqual(['setEcommerceView', 'SKU-1', '', '', '']);
  });

  it('keeps a price of zero', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1', price: 0 });

    tracker.trackPageView({ url: '/products/1' });

    expect(commandsAfterInit()[2]).toEqual(['setEcommerceView', 'SKU-1', '', '', 0]);
  });

  it('passes up to five categories as an array', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: 'SKU-1', category: ['a', ' b ', '', 'c', 'd', 'e', 'f'] });

    tracker.trackPageView({ url: '/products/1' });

    expect(commandsAfterInit()[2]).toEqual(['setEcommerceView', 'SKU-1', '', ['a', 'b', 'c', 'd', 'e'], '']);
  });

  it('waits for the next view that is actually sent when a page view is skipped as a repeat', () => {
    const tracker = createTracker();
    tracker.trackPageView({ url: '/products/1' });
    tracker.ecommerce.productView({ sku: 'SKU-1' });

    tracker.trackPageView({ url: '/products/1' });
    expect(commandsAfterInit().some(([name]) => name === 'setEcommerceView')).toBe(false);

    tracker.trackPageView({ url: '/products/1', force: true });
    expect(commandsAfterInit().some(([name]) => name === 'setEcommerceView')).toBe(true);
  });

  it('ignores a product without a sku', () => {
    const tracker = createTracker();
    tracker.ecommerce.productView({ sku: '  ' });

    tracker.trackPageView({ url: '/products/1' });

    expect(commandsAfterInit().some(([name]) => name === 'setEcommerceView')).toBe(false);
  });
});

describe('ecommerce.cartUpdate', () => {
  it('clears the cart, adds each item, then sends the update', () => {
    createTracker().ecommerce.cartUpdate(
      [
        { sku: 'SKU-1', name: 'Router', category: 'Network', price: 99, quantity: 2 },
        { sku: 'SKU-2', name: 'Cable', price: 5 },
      ],
      208,
    );

    expect(commandsAfterInit()).toEqual([
      ['clearEcommerceCart'],
      ['addEcommerceItem', 'SKU-1', 'Router', 'Network', 99, 2],
      ['addEcommerceItem', 'SKU-2', 'Cable', '', 5, 1],
      ['trackEcommerceCartUpdate', 208],
    ]);
  });

  it('defaults an item price to 0 and its quantity to 1', () => {
    createTracker().ecommerce.cartUpdate([{ sku: 'SKU-1' }], 0);

    expect(commandsAfterInit()[1]).toEqual(['addEcommerceItem', 'SKU-1', '', '', 0, 1]);
  });

  it('sends an update for an emptied cart', () => {
    createTracker().ecommerce.cartUpdate([], 0);

    expect(commandsAfterInit()).toEqual([['clearEcommerceCart'], ['trackEcommerceCartUpdate', 0]]);
  });

  it('skips an item without a sku', () => {
    createTracker().ecommerce.cartUpdate([{ sku: '' }, { sku: 'SKU-2' }], 5);

    expect(commandsAfterInit().filter(([name]) => name === 'addEcommerceItem')).toHaveLength(1);
  });

  it('ignores a grand total that is not a number', () => {
    createTracker().ecommerce.cartUpdate([{ sku: 'SKU-1' }], Number.NaN);

    expect(commandsAfterInit()).toEqual([]);
  });
});

describe('ecommerce.order', () => {
  const order = {
    orderId: 'ORD-1',
    grandTotal: 208,
    subTotal: 190,
    tax: 18,
    shipping: 10,
    discount: 10,
    items: [{ sku: 'SKU-1', name: 'Router', category: 'Network', price: 99, quantity: 2 }],
  };

  it('clears the cart, adds each item, then sends the order', () => {
    createTracker().ecommerce.order(order);

    expect(commandsAfterInit()).toEqual([
      ['clearEcommerceCart'],
      ['addEcommerceItem', 'SKU-1', 'Router', 'Network', 99, 2],
      ['trackEcommerceOrder', 'ORD-1', 208, 190, 18, 10, 10],
    ]);
  });

  it('uses empty strings, which matomo.js omits, for the amounts that are absent', () => {
    createTracker().ecommerce.order({ orderId: 'ORD-1', grandTotal: 50, items: [] });

    expect(commandsAfterInit()[1]).toEqual(['trackEcommerceOrder', 'ORD-1', 50, '', '', '', '']);
  });

  it('sends an amount of zero rather than omitting it', () => {
    createTracker().ecommerce.order({ orderId: 'ORD-1', grandTotal: 50, discount: 0, items: [] });

    expect(commandsAfterInit()[1]).toEqual(['trackEcommerceOrder', 'ORD-1', 50, '', '', '', 0]);
  });

  it('ignores the same order id the second time in a page session', () => {
    const tracker = createTracker();
    tracker.ecommerce.order(order);
    const queuedBefore = commandsAfterInit().length;

    tracker.ecommerce.order(order);

    expect(commandsAfterInit()).toHaveLength(queuedBefore);
  });

  it('tracks a different order id', () => {
    const tracker = createTracker();
    tracker.ecommerce.order(order);

    tracker.ecommerce.order({ ...order, orderId: 'ORD-2' });

    expect(commandsAfterInit().filter(([name]) => name === 'trackEcommerceOrder')).toHaveLength(2);
  });

  it.each([
    ['a blank order id', { ...order, orderId: '  ' }],
    ['a grand total that is not a number', { ...order, grandTotal: Number.NaN }],
  ])('ignores an order with %s', (_label, invalid) => {
    createTracker().ecommerce.order(invalid);

    expect(commandsAfterInit()).toEqual([]);
  });
});
